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
//     test?: boolean,                 // si true, envoie à l'expéditeur (test connexion)
//     attachments?: {                 // documents joints en plus du lien du devis/facture
//       filename: string,
//       contentType?: string,
//       content_base64: string,       // contenu brut encodé en base64
//     }[]
//   }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { readSecret } from '../_shared/vault.ts';
import { corsHeaders, corsPreflight, json, requireUser } from '../_shared/http.ts';
import { enforceRateLimit, rateLimitResponse } from '../_shared/rate-limit.ts';
import { buildHtmlSignature, injectTrackingPixel, splitBodyAndSignature, textToHtml, toAsciiSubject } from '../_shared/email.ts';

function normalizeRecipients(v: unknown): string[] {
    if (!v) return [];
    if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
    return String(v).split(',').map(s => s.trim()).filter(Boolean);
}

// ── Pièces jointes ──
// Limites alignées sur celles imposées côté client (voir DevisEmailModal) :
// filet de sécurité si l'appel ne passe pas par l'UI.
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENTS_TOTAL_BYTES = 8 * 1024 * 1024; // 8 Mo (poids réel, pas encodé)

type IncomingAttachment = { filename?: unknown; contentType?: unknown; content_base64?: unknown };

function normalizeAttachments(v: unknown): { filename: string; contentType: string; encoding: 'base64'; content: string }[] {
    if (!Array.isArray(v) || v.length === 0) return [];
    if (v.length > MAX_ATTACHMENTS) {
        throw new Error(`Maximum ${MAX_ATTACHMENTS} pièces jointes`);
    }
    let totalBytes = 0;
    const result = (v as IncomingAttachment[]).map((a) => {
        const filename = String(a?.filename || 'document').slice(0, 200);
        const contentType = String(a?.contentType || 'application/octet-stream');
        const content = String(a?.content_base64 || '').replace(/\s/g, '');
        if (!content) throw new Error(`Pièce jointe "${filename}" vide`);
        // Estimation du poids réel décodé à partir de la longueur base64.
        totalBytes += Math.floor((content.length * 3) / 4);
        return { filename, contentType, encoding: 'base64' as const, content };
    });
    if (totalBytes > MAX_ATTACHMENTS_TOTAL_BYTES) {
        throw new Error('Pièces jointes trop volumineuses (8 Mo maximum au total)');
    }
    return result;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return corsPreflight();
    if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

    let client: SMTPClient | null = null;

    try {
        const auth = await requireUser(req);
        if (auth.response) return auth.response;
        const { user } = auth;

        const rl = await enforceRateLimit('send-document-email', user.id, 60, 3600);
        if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

        const body = await req.json();
        const { to, subject, text, html, cc, bcc, reply_to, test, quote_id, client_id, attachments } = body;

        if (!subject || typeof subject !== 'string') return json({ error: 'Sujet requis' }, 400);
        if (!text && !html) return json({ error: 'Contenu requis' }, 400);

        let resolvedAttachments: ReturnType<typeof normalizeAttachments>;
        try {
            resolvedAttachments = normalizeAttachments(attachments);
        } catch (attachErr) {
            const message = attachErr instanceof Error ? attachErr.message : String(attachErr);
            return json({ error: message }, 400);
        }

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
        if (!cfg?.host || !cfg?.port || !cfg?.username || !cfg?.password_secret_id || !cfg?.from_email) {
            return json({ error: 'Configuration SMTP incomplète. Renseignez-la dans votre profil.' }, 400);
        }

        const smtpPassword = await readSecret(cfg.password_secret_id);
        if (!smtpPassword) {
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
                    password: smtpPassword,
                },
            },
        });

        const fromHeader = cfg.from_name
            ? `${cfg.from_name} <${cfg.from_email}>`
            : cfg.from_email;

        const smtpStartedAt = Date.now();
        await client.send({
            from: fromHeader,
            to: toList,
            cc: normalizeRecipients(cc),
            bcc: normalizeRecipients(bcc),
            replyTo: reply_to || undefined,
            subject: toAsciiSubject(test ? `[Test] ${subject}` : subject),
            content: finalText,
            html: finalHtml,
            attachments: resolvedAttachments,
        });

        console.log(`send-document-email: accepté par le SMTP en ${Date.now() - smtpStartedAt} ms`);

        // Le mail est parti : on répond tout de suite. Fermer la connexion
        // SMTP (QUIT) peut prendre une dizaine de secondes chez certains
        // hébergeurs ; l'attendre retardait la réponse d'autant, et une
        // réponse coupée en route faisait croire à un échec alors que le
        // client avait bien reçu le mail. La fermeture se fait en arrière-plan.
        // `close()` de denomailer ne renvoie pas toujours une promesse (il
        // renvoie undefined) : on l'enveloppe pour qu'un `.catch` direct ne
        // fasse plus planter un envoi pourtant réussi.
        const sentClient = client;
        client = null;
        const closing = Promise.resolve()
            .then(() => sentClient.close())
            .catch(() => { /* ignore */ });
        // deno-lint-ignore no-explicit-any
        (globalThis as any).EdgeRuntime?.waitUntil?.(closing);

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
