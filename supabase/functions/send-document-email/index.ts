// Edge Function `send-document-email`
//
// Envoie un email via le SMTP perso de l'artisan (config stockée dans
// `profiles.smtp_config`). Permet d'envoyer devis/factures/rapports
// directement depuis l'adresse pro de l'artisan, sans passer par mailto.
//
// Tracking d'ouverture : à chaque envoi (sauf mode `test`), on crée une
// ligne `email_sends` avec un token UUID unique et on injecte un pixel
// transparent dans le HTML qui pointe vers `track-email-open`. Le pixel
// est invisible pour le destinataire mais permet d'enregistrer chaque
// ouverture du mail.
//
// Body attendu :
//   {
//     to: string | string[],          // destinataire(s)
//     subject: string,
//     text: string,                   // corps texte brut
//     html?: string,                  // corps HTML optionnel
//     cc?: string | string[],
//     bcc?: string | string[],
//     reply_to?: string,
//     quote_id?: number,              // pour lier le tracking à un devis/facture
//     client_id?: number,
//     test?: boolean                  // si true, envoie à l'expéditeur (test connexion)
//   }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

function normalizeRecipients(v: unknown): string[] {
    if (!v) return [];
    if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
    return String(v).split(',').map(s => s.trim()).filter(Boolean);
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Convertit un texte brut en HTML minimal en préservant les sauts de ligne
// et en convertissant les URLs en liens cliquables.
function textToHtml(text: string): string {
    const urlRe = /(https?:\/\/[^\s<>"]+)/g;
    const escaped = escapeHtml(text);
    const linked = escaped.replace(urlRe, (url) => `<a href="${url}">${url}</a>`);
    const withBreaks = linked.replace(/\n/g, '<br>');
    return `<div style="font-family: -apple-system, system-ui, sans-serif; font-size: 14px; line-height: 1.5; color: #1f2937; white-space: pre-wrap;">${withBreaks}</div>`;
}

function injectTrackingPixel(html: string, pixelUrl: string): string {
    const pixel = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />`;
    // Insère juste avant </body> si possible, sinon à la fin
    if (/<\/body>/i.test(html)) {
        return html.replace(/<\/body>/i, `${pixel}</body>`);
    }
    return html + pixel;
}

// ── Signature email ──
// Sépare le corps du mail de la signature texte (qui suit le marqueur
// standard RFC 3676 `\n\n-- \n`). Permet à l'edge function de remplacer
// la signature texte par une signature HTML riche dans la version HTML
// sans la dupliquer.
function splitBodyAndSignature(text: string): { body: string; sig: string } {
    const idx = text.indexOf('\n\n-- \n');
    if (idx < 0) return { body: text, sig: '' };
    return { body: text.slice(0, idx), sig: text.slice(idx + 2) };
}

// Signature HTML : utilise la version perso si renseignée, sinon génère
// automatiquement à partir des champs profil (logo, nom, contact, liens).
function buildHtmlSignature(profile: Record<string, unknown>): string {
    const custom = (profile.email_signature_html || '') as string;
    if (custom.trim()) {
        return `<div style="margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;">${custom}</div>`;
    }

    const companyName = (profile.company_name || profile.full_name || '') as string;
    const fullName = (profile.full_name || '') as string;
    const phone = (profile.phone || '') as string;
    const email = (profile.professional_email || '') as string;
    const website = (profile.website || '') as string;
    const logoUrl = (profile.logo_url || '') as string;
    const googleReview = (profile.google_review_url || '') as string;

    if (!companyName && !email && !phone) return '';

    const escapeHtml = (s: string) => s
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const websiteHref = website && !/^https?:\/\//i.test(website) ? `https://${website}` : website;

    const logoCell = logoUrl
        ? `<td style="padding-right:16px;vertical-align:top;"><img src="${escapeHtml(logoUrl)}" alt="" style="max-width:80px;max-height:80px;display:block;" /></td>`
        : '';

    const lines: string[] = [];
    if (companyName) lines.push(`<strong style="color:#111827;font-size:14px;">${escapeHtml(companyName)}</strong>`);
    if (fullName && fullName !== companyName) lines.push(`<span style="color:#374151;">${escapeHtml(fullName)}</span>`);
    if (phone) lines.push(`<a href="tel:${escapeHtml(phone.replace(/\s/g, ''))}" style="color:#374151;text-decoration:none;">${escapeHtml(phone)}</a>`);
    if (email) lines.push(`<a href="mailto:${escapeHtml(email)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(email)}</a>`);
    if (website) lines.push(`<a href="${escapeHtml(websiteHref)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(website.replace(/^https?:\/\//i, ''))}</a>`);
    if (googleReview) lines.push(`<a href="${escapeHtml(googleReview)}" style="color:#f59e0b;text-decoration:none;font-size:12px;">⭐ Laisser un avis Google</a>`);

    return `
<table style="margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;font-family:-apple-system,system-ui,sans-serif;font-size:13px;line-height:1.5;">
  <tr>
    ${logoCell}
    <td style="vertical-align:top;color:#374151;">
      ${lines.join('<br>')}
    </td>
  </tr>
</table>`;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

    let client: SMTPClient | null = null;

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) return json({ error: 'Non autorisé' }, 401);

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        );

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return json({ error: 'Non autorisé' }, 401);

        const body = await req.json();
        const { to, subject, text, html, cc, bcc, reply_to, test, quote_id, client_id } = body;

        if (!subject || typeof subject !== 'string') return json({ error: 'Sujet requis' }, 400);
        if (!text && !html) return json({ error: 'Contenu requis' }, 400);

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );

        const { data: profile, error: profileErr } = await supabaseAdmin
            .from('profiles')
            .select('smtp_config, company_name, full_name, phone, professional_email, website, logo_url, google_review_url, email_signature_html')
            .eq('id', user.id)
            .single();

        if (profileErr) return json({ error: 'Profil introuvable' }, 404);

        const cfg = profile?.smtp_config;
        if (!cfg?.host || !cfg?.port || !cfg?.username || !cfg?.password || !cfg?.from_email) {
            return json({ error: 'Configuration SMTP incomplète. Renseignez-la dans votre profil.' }, 400);
        }

        const toList = test ? [cfg.from_email] : normalizeRecipients(to);
        if (toList.length === 0) return json({ error: 'Destinataire requis' }, 400);

        // ── Création de l'entrée de tracking + token (sauf mode test) ──
        let trackingToken: string | null = null;
        let emailSendId: string | null = null;
        if (!test) {
            const { data: sendRow, error: sendErr } = await supabaseAdmin
                .from('email_sends')
                .insert({
                    user_id: user.id,
                    quote_id: quote_id ?? null,
                    client_id: client_id ?? null,
                    recipient_email: toList[0],
                    subject,
                })
                .select('id, tracking_token')
                .single();

            if (sendErr) {
                console.error('email_sends insert failed:', sendErr);
                // On continue quand même — pas de tracking mais l'envoi doit aboutir
            } else {
                trackingToken = sendRow.tracking_token;
                emailSendId = sendRow.id;
            }
        }

        // ── Signature : on garde la signature texte telle quelle dans la
        // version texte, mais on la remplace par une signature HTML riche
        // dans la version HTML (logo, liens cliquables, etc.). ──
        const finalText = text || '';
        const { body: bodyWithoutSig } = splitBodyAndSignature(finalText);
        const htmlSig = buildHtmlSignature(profile);

        let finalHtml = html || textToHtml(bodyWithoutSig);
        finalHtml = finalHtml + htmlSig;
        if (trackingToken) {
            const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
            const pixelUrl = `${supabaseUrl}/functions/v1/track-email-open?t=${trackingToken}`;
            finalHtml = injectTrackingPixel(finalHtml, pixelUrl);
        }

        client = new SMTPClient({
            connection: {
                hostname: cfg.host,
                port: cfg.port,
                tls: !!cfg.secure,
                auth: {
                    username: cfg.username,
                    password: cfg.password,
                },
            },
        });

        const fromHeader = cfg.from_name
            ? `${cfg.from_name} <${cfg.from_email}>`
            : cfg.from_email;

        await client.send({
            from: fromHeader,
            to: toList,
            cc: normalizeRecipients(cc),
            bcc: normalizeRecipients(bcc),
            replyTo: reply_to || undefined,
            subject: test ? `[Test] ${subject}` : subject,
            content: finalText,
            html: finalHtml,
        });

        return json({ success: true, sent_to: toList, email_send_id: emailSendId });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('send-document-email error:', message);
        return json({ error: `Échec de l'envoi : ${message}` }, 500);
    } finally {
        if (client) {
            try { await client.close(); } catch { /* ignore */ }
        }
    }
});
