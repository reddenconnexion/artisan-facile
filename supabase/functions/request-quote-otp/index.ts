import { createClient } from 'npm:@supabase/supabase-js@2';
import { enforceRateLimit, rateLimitResponse } from '../_shared/rate-limit.ts';
import { corsHeaders, corsPreflight, json } from '../_shared/http.ts';

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return corsPreflight();

    try {
        // Anti-brute-force par IP, en plus du throttle par devis plus bas :
        // sans ça, un token de devis qui fuite (capture d'écran, transfert,
        // historique partagé) permet de renvoyer des demandes de code depuis
        // des devis différents sans jamais être limité globalement.
        const ip =
            req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
            req.headers.get('cf-connecting-ip') ||
            req.headers.get('x-real-ip') ||
            'unknown';
        const rl = await enforceRateLimit('request-quote-otp', ip, 10, 300);
        if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

        const { token, portalToken, quoteId, email } = await req.json();

        if ((!token && !(portalToken && quoteId)) || !email) {
            return json({ error: 'Devis et email requis' }, 400);
        }

        // Normaliser l'email
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail.includes('@')) {
            return json({ error: 'Adresse email invalide' }, 400);
        }

        // Connexion avec service_role pour bypasser RLS
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );

        // Récupérer le devis et l'email du client — par lien public (token)
        // ou par le portail client (portalToken + quoteId), les deux points
        // d'entrée qui permettent de signer un devis et donc les deux qui
        // doivent pouvoir demander un code.
        let quote: {
            id: number;
            status: string;
            token_revoked: boolean | null;
            token_expires_at: string | null;
            signed_at: string | null;
            require_otp: boolean;
            clients: { email: string | null } | null;
        } | null = null;

        if (token) {
            const { data, error } = await supabase
                .from('quotes')
                .select(`
                    id, status, token_revoked, token_expires_at, signed_at, require_otp,
                    clients ( email )
                `)
                .eq('public_token', token)
                .single();
            if (error || !data) return json({ error: 'Devis introuvable ou lien invalide' }, 404);
            quote = data as unknown as typeof quote;
        } else {
            const { data: client, error: clientError } = await supabase
                .from('clients')
                .select('id')
                .eq('portal_token', portalToken)
                .single();
            if (clientError || !client) return json({ error: 'Lien de portail invalide' }, 404);

            const { data, error } = await supabase
                .from('quotes')
                .select(`
                    id, status, token_revoked, token_expires_at, signed_at, require_otp,
                    clients ( email )
                `)
                .eq('id', quoteId)
                .eq('client_id', client.id)
                .single();
            if (error || !data) return json({ error: 'Devis introuvable' }, 404);
            quote = data as unknown as typeof quote;
        }

        // Vérifications de validité du token — seulement pertinentes pour le
        // lien public : le portail a son propre cycle de vie (portal_token_*),
        // vérifié par ailleurs (get_portal_data), pas par ces colonnes-là.
        if (token) {
            if (quote.token_revoked) {
                return json({ error: 'Ce lien a été révoqué' }, 403);
            }
            if (quote.token_expires_at && new Date(quote.token_expires_at) < new Date()) {
                return json({ error: 'Ce lien a expiré. Contactez votre artisan.' }, 403);
            }
        }
        if (quote.signed_at) {
            return json({ error: 'Ce devis a déjà été signé' }, 409);
        }

        // Vérifier que l'OTP est activé pour ce devis
        if (!quote.require_otp) {
            return json({ error: 'La vérification par code n\'est pas activée pour ce devis.' }, 403);
        }

        // Vérifier que l'email correspond au destinataire
        const clientEmail = quote.clients?.email?.trim().toLowerCase();
        if (!clientEmail) {
            return json({ error: 'Aucun email enregistré pour ce client. Contactez votre artisan.' }, 422);
        }
        if (normalizedEmail !== clientEmail) {
            return json({ error: "L'adresse email ne correspond pas au destinataire de ce devis." }, 403);
        }

        // Anti-spam : max 1 demande par minute par devis
        const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
        const { count } = await supabase
            .from('quote_otps')
            .select('*', { count: 'exact', head: true })
            .eq('quote_id', quote.id)
            .gt('created_at', oneMinuteAgo);

        if ((count ?? 0) > 0) {
            return json(
                { error: 'Veuillez attendre 1 minute avant de demander un nouveau code.' },
                429
            );
        }

        // Générer un OTP à 6 chiffres
        const otp = String(Math.floor(100000 + Math.random() * 900000));

        // Hasher l'OTP en SHA-256
        const otpHash = await sha256hex(otp);

        // Stocker l'OTP haché (expire dans 15 min)
        const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
        const { error: insertError } = await supabase
            .from('quote_otps')
            .insert({ quote_id: quote.id, otp_hash: otpHash, expires_at: expiresAt });

        if (insertError) {
            console.error('quote_otps insert error:', JSON.stringify(insertError));
            throw insertError;
        }

        // Envoyer l'OTP par email via Resend
        const resendApiKey = Deno.env.get('RESEND_API_KEY');
        if (!resendApiKey) {
            // En développement sans Resend : loguer l'OTP (à supprimer en prod)
            console.log(`[DEV] OTP pour devis ${quote.id} : ${otp}`);
            return json({ success: true, dev_otp: otp });
        }

        const emailFrom = Deno.env.get('EMAIL_FROM') ?? 'Artisan Facile <signature@artisanfacile.fr>';
        const replyTo = Deno.env.get('EMAIL_REPLY_TO');
        const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: emailFrom,
                to: normalizedEmail,
                ...(replyTo ? { reply_to: replyTo } : {}),
                subject: 'Votre code de signature – Artisan Facile',
                text: buildEmailText(otp),
                html: buildEmailHtml(otp),
            }),
        });

        if (!emailRes.ok) {
            const detail = await emailRes.text();
            console.error('Resend error:', emailRes.status, detail);
            throw new Error(`Resend ${emailRes.status}: ${detail}`);
        }

        return json({ success: true });
    } catch (err) {
        console.error('request-quote-otp error:', err);
        return json({ error: (err as Error).message || 'Erreur interne' }, 500);
    }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function sha256hex(input: string): Promise<string> {
    const data = new TextEncoder().encode(input);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

function buildEmailText(otp: string): string {
    return [
        'Code de vérification – Artisan Facile',
        '',
        'Utilisez ce code pour signer votre devis :',
        '',
        `    ${otp}`,
        '',
        'Ce code est valable 15 minutes.',
        'Ne le partagez avec personne. Artisan Facile ne vous demandera jamais ce code par téléphone.',
    ].join('\n');
}

function buildEmailHtml(otp: string): string {
    return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>Code de signature</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <h2 style="margin:0 0 8px;color:#1d4ed8;font-size:20px;">Code de vérification</h2>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;">
      Utilisez ce code pour signer votre devis sur Artisan Facile :
    </p>
    <div style="background:#f3f4f6;border-radius:10px;padding:24px;text-align:center;margin:0 0 24px;">
      <span style="font-size:44px;font-weight:700;letter-spacing:10px;color:#111827;font-variant-numeric:tabular-nums;">
        ${otp}
      </span>
    </div>
    <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">
      Ce code est valable <strong>15 minutes</strong>.<br>
      Ne le partagez avec personne. Artisan Facile ne vous demandera jamais ce code par téléphone.
    </p>
  </div>
</body>
</html>`;
}
