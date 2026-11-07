// Edge Function `send-document-email`
//
// Envoie un email via le SMTP perso de l'artisan (config stockée dans
// `profiles.smtp_config`). Permet d'envoyer devis/factures/rapports
// directement depuis l'adresse pro de l'artisan, sans passer par mailto.
//
// Sans SMTP configuré (cas de la plupart des artisans), le mail part par la
// plateforme (Resend, domaine vérifié) au nom de l'entreprise, et les
// réponses du client arrivent dans la boîte de l'artisan (Reply-To). Le
// repli `mailto:` côté appli ne marchait pas sur un appareil sans application
// de messagerie, et rien n'était suivi.
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
import { buildHtmlSignature, injectTrackingPixel, sendViaPlatform, splitBodyAndSignature, textToHtml, toAsciiSubject } from '../_shared/email.ts';
import { isValidEmail } from '../_shared/lib/autopilot.js';

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

const PLATFORM_MAX_RECIPIENTS = 3;
const PLATFORM_DAILY_LIMIT = 40;

// deno-lint-ignore no-explicit-any
async function checkPlatformGuards(admin: any, userId: string, { quoteId, clientId, recipients }: { quoteId?: unknown; clientId?: unknown; recipients: number }): Promise<string | null> {
    if (recipients > PLATFORM_MAX_RECIPIENTS) {
        return `${PLATFORM_MAX_RECIPIENTS} destinataires au maximum.`;
    }
    if (!quoteId && !clientId) {
        return "Envoi direct réservé à vos devis, factures et clients.";
    }
    const table = quoteId ? 'quotes' : 'clients';
    const { data: owned } = await admin.from(table).select('id').eq('id', quoteId ?? clientId).eq('user_id', userId).maybeSingle();
    if (!owned) return 'Document introuvable.';
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await admin.from('email_sends').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('sent_at', since);
    if ((count ?? 0) >= PLATFORM_DAILY_LIMIT) {
        return `Limite de ${PLATFORM_DAILY_LIMIT} mails par jour atteinte. Configurez votre adresse mail dans votre profil pour envoyer davantage.`;
    }
    return null;
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
        const smtpComplete = !!(cfg?.host && cfg?.port && cfg?.username && cfg?.password_secret_id && cfg?.from_email);
        const smtpPassword = smtpComplete ? await readSecret(cfg.password_secret_id) : null;
        const useSmtp = smtpComplete && !!smtpPassword;

        // Le test de connexion vérifie le SMTP de l'artisan : pas de repli.
        if (test && !useSmtp) {
            return json({ error: 'Configuration SMTP incomplète. Renseignez-la dans votre profil.' }, 400);
        }

        // Repli plateforme : il faut une adresse où le client pourra répondre.
        const replyTo = reply_to || (isValidEmail(profile?.professional_email) ? profile.professional_email : user.email) || null;
        const resendKey = Deno.env.get('RESEND_API_KEY');
        if (!useSmtp && (!resendKey || !replyTo)) {
            return json({ error: "Envoi direct indisponible pour le moment. Configurez votre adresse mail dans votre profil." }, 400);
        }

        const toList = test ? [cfg.from_email] : normalizeRecipients(to);
        if (toList.length === 0) return json({ error: 'Destinataire requis' }, 400);

        // Garde-fous de l'envoi par la plateforme : il engage la réputation du
        // domaine commun à tous les artisans. Uniquement pour un document ou
        // un client de l'artisan, peu de destinataires, volume quotidien borné.
        if (!useSmtp) {
            const guardError = await checkPlatformGuards(supabaseAdmin, user.id, {
                quoteId: quote_id, clientId: client_id,
                recipients: toList.length + normalizeRecipients(cc).length + normalizeRecipients(bcc).length,
            });
            if (guardError) return json({ error: guardError }, 400);
        }

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

        if (!useSmtp) {
            const platformStartedAt = Date.now();
            await sendViaPlatform({
                apiKey: resendKey!,
                displayName: String(profile?.company_name || profile?.full_name || 'Votre artisan'),
                replyTo: replyTo!,
                to: toList,
                cc: normalizeRecipients(cc),
                bcc: normalizeRecipients(bcc),
                subject,
                text: finalText,
                html: finalHtml,
                attachments: resolvedAttachments.map(({ filename, content }) => ({ filename, content })),
            });
            console.log(`send-document-email: accepté par la plateforme en ${Date.now() - platformStartedAt} ms`);
            return json({ success: true, sent_to: toList, email_send_id: emailSendId, channel: 'platform', reply_to: replyTo });
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

        return json({ success: true, sent_to: toList, email_send_id: emailSendId, channel: 'smtp' });
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
