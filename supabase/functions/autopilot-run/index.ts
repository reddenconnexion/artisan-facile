// autopilot-run
// ─────────────────────────────────────────────────────────────────────────────
// Pilote automatique du plan Pro : ce que l'appli fait toute seule pour
// l'artisan pendant qu'il est sur le chantier.
//
//   • Du lundi au vendredi, 9 h – 18 h (Paris) : relance des devis non signés,
//     rappel des factures en retard (amiable puis 2e rappel ; la mise en
//     demeure reste à l'artisan), rattrapage des demandes d'avis Google
//     (chantier terminé depuis 3 h à 7 jours, téléphone resté sans réseau).
//   • À 18 h : résumé de la journée en notification.
//
// Les règles (qui, quand, quel texte) vivent dans _shared/lib/autopilot.js,
// partagées avec l'appli. Ici : lecture des données, envoi, journal.
//
// Appel : pg_cron chaque heure, header `x-cron-secret` : le secret
// `autopilot_cron_secret` du Vault (vérifié par la RPC
// autopilot_cron_secret_matches) ou, à défaut, CRON_SECRET. verify_jwt est
// désactivé dans config.toml. Corps optionnel :
//   { "dry_run": true }  → renvoie ce qui partirait, sans rien envoyer
//   { "force": true }    → ignore la plage horaire (tests)
//   { "user_id": "…" }   → un seul artisan
//
// L'appli l'appelle aussi avec le JWT de l'artisan, sans x-cron-secret :
//   { "action": "review_now", "quote_id": 123 } → demande d'avis Google au
//   moment où l'artisan termine le chantier et quitte les lieux.
//
// Envoi : depuis l'adresse pro de l'artisan quand son SMTP est configuré,
// sinon via Resend au nom de son entreprise, réponses dirigées vers lui.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import webpush from 'npm:web-push@3';
import { readSecret } from '../_shared/vault.ts';
import { corsHeadersWith, corsPreflight, json as jsonResponse, requireUser } from '../_shared/http.ts';
import { buildHtmlSignature, injectTrackingPixel, splitBodyAndSignature, textToHtml, toAsciiSubject } from '../_shared/email.ts';
import {
    planAutopilotRun, planReviewNow, buildEveningSummary, readAutopilotSettings, parisClock,
    isSendingWindow, isSummaryHour, isValidEmail,
} from '../_shared/lib/autopilot.js';

const corsHeaders = corsHeadersWith('x-cron-secret');
const json = (body: unknown, status = 200) => jsonResponse(body, status, corsHeaders);

const PROFILE_COLUMNS = 'id, plan, autopilot_settings, follow_up_settings, smtp_config, full_name, company_name, phone, professional_email, website, logo_url, google_review_url, email_signature_html, iban';
const CLIENT_COLUMNS = 'id, name, email, civility, autopilot_paused, siren, tva_intracom';
const DOC_COLUMNS = 'id, type, status, date, created_at, valid_until, total_ttc, title, client_id, archived_at, signed_at, paid_at, parent_id, relance_snoozed_until, follow_up_count, last_followup_at, public_token, invoice_number, quote_number, work_stage, work_completed_at';
const KIND_LABELS: Record<string, string> = {
    quote_followup: 'Relance automatique du devis',
    invoice_reminder: 'Rappel automatique de facture',
    review_request: "Demande d'avis automatique",
};

async function secretsMatch(a: string, b: string): Promise<boolean> {
    const digest = async (v: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)));
    const [da, db] = await Promise.all([digest(a), digest(b)]);
    let diff = 0;
    for (let i = 0; i < da.length; i++) diff |= da[i] ^ db[i];
    return diff === 0;
}

type Profile = Record<string, any>;
type Action = {
    kind: string; key: string; quote_id: number; client_id: number; step: number;
    to: string; subject: string; body: string; amount: number; label: string;
};

// ── Envoi d'un e-mail au nom de l'artisan ────────────────────────────────────

type Sender = {
    channel: 'smtp' | 'platform';
    send: (msg: { to: string; subject: string; text: string; html: string }) => Promise<void>;
    close: () => Promise<void>;
};

async function makeSender(profile: Profile, replyTo: string | null): Promise<Sender | null> {
    const cfg = profile.smtp_config;
    if (cfg?.host && cfg?.port && cfg?.username && cfg?.password_secret_id && cfg?.from_email) {
        const password = await readSecret(cfg.password_secret_id);
        if (password) {
            const client = new SMTPClient({
                connection: { hostname: cfg.host, port: cfg.port, tls: !!cfg.secure, auth: { username: cfg.username, password } },
            });
            const from = cfg.from_name ? `${cfg.from_name} <${cfg.from_email}>` : cfg.from_email;
            return {
                channel: 'smtp',
                send: async ({ to, subject, text, html }) => {
                    await client.send({ from, to: [to], subject: toAsciiSubject(subject), content: text, html });
                },
                close: async () => { try { await client.close(); } catch { /* ignore */ } },
            };
        }
    }

    // Repli : envoi par la plateforme, au nom de l'entreprise, réponses vers
    // l'artisan. Sans adresse de réponse, on n'envoie rien : le client doit
    // pouvoir répondre à son artisan.
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey || !replyTo) return null;
    const platformAddress = Deno.env.get('AUTOPILOT_EMAIL_FROM')
        || (Deno.env.get('EMAIL_FROM') ?? '').match(/<([^>]+)>/)?.[1]
        || 'relances@artisanfacile.fr';
    const displayName = String(profile.company_name || profile.full_name || 'Votre artisan').replace(/[<>"]/g, '');
    return {
        channel: 'platform',
        send: async ({ to, subject, text, html }) => {
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: `${displayName} <${platformAddress}>`, to: [to], reply_to: replyTo, subject, text, html }),
            });
            if (!res.ok) throw new Error(`Resend ${res.status} : ${(await res.text()).slice(0, 300)}`);
        },
        close: async () => { /* rien à fermer */ },
    };
}

// ── Notification push ────────────────────────────────────────────────────────

async function sendPush(admin: SupabaseClient, userId: string, payload: Record<string, unknown>): Promise<number> {
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
    if (!vapidPublic || !vapidPrivate) return 0;
    const { data: subs } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', userId);
    if (!subs?.length) return 0;
    webpush.setVapidDetails('mailto:admin@artisanfacile.fr', vapidPublic, vapidPrivate);
    let delivered = 0;
    for (const sub of subs) {
        try {
            await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload));
            delivered++;
        } catch (err: any) {
            if (err?.statusCode === 410 || err?.statusCode === 404) {
                await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
            } else {
                console.error('autopilot push error:', err?.statusCode, err?.message);
            }
        }
    }
    return delivered;
}

// ── Envoi d'une liste d'e-mails, avec verrou et suivi ───────────────────────

async function sendActions(admin: SupabaseClient, profile: Profile, actions: Action[], today: string) {
    const out = { sent: 0, failed: 0, skipped: '', sentNow: [] as { kind: string; amount: number }[] };
    const replyTo = isValidEmail(profile.professional_email) ? profile.professional_email
        : (await admin.auth.admin.getUserById(profile.id)).data?.user?.email ?? null;
    const sender = await makeSender(profile, replyTo);
    if (!sender) {
        out.skipped = "aucun moyen d'envoi (SMTP ou Resend + adresse de réponse)";
        return out;
    }
    const htmlSig = buildHtmlSignature(profile);
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    try {
        for (const a of actions) {
            // Verrou : l'index unique empêche un doublon si deux exécutions se chevauchent.
            const { data: claim, error: claimErr } = await admin.from('autopilot_actions').insert({
                user_id: profile.id, kind: a.kind, action_key: a.key, quote_id: a.quote_id, client_id: a.client_id,
                step: a.step, label: a.label, recipient: a.to, subject: a.subject, body: a.body, amount: a.amount,
                channel: sender.channel, status: 'sent', day: today,
            }).select('id').single();
            if (claimErr || !claim) continue; // déjà envoyé par une autre exécution

            try {
                const { data: sendRow } = await admin.from('email_sends').insert({
                    user_id: profile.id, quote_id: a.quote_id, client_id: a.client_id, recipient_email: a.to, subject: a.subject,
                }).select('tracking_token').single();
                const { body: bodyWithoutSig } = splitBodyAndSignature(a.body);
                let html = textToHtml(bodyWithoutSig) + htmlSig;
                if (sendRow?.tracking_token) {
                    html = injectTrackingPixel(html, `${supabaseUrl}/functions/v1/track-email-open?t=${sendRow.tracking_token}`);
                }
                await sender.send({ to: a.to, subject: a.subject, text: a.body, html });
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(`autopilot ${profile.id} ${a.key} :`, message);
                await admin.from('autopilot_actions').update({ status: 'failed', error: message.slice(0, 500) }).eq('id', claim.id);
                out.failed++;
                continue;
            }

            out.sent++;
            out.sentNow.push({ kind: a.kind, amount: a.amount });
            const at = new Date().toISOString();
            // Même suivi qu'une relance manuelle : compteur du devis,
            // historique des relances, fil du client.
            if (a.kind !== 'review_request') {
                await admin.from('quote_follow_ups').insert({
                    quote_id: a.quote_id, user_id: profile.id, follow_up_number: a.step, content: a.body, method: 'email',
                });
                await admin.from('quotes').update({ last_followup_at: at, follow_up_count: a.step }).eq('id', a.quote_id).eq('user_id', profile.id);
            }
            if (a.client_id) {
                await admin.from('client_interactions').insert({
                    user_id: profile.id, client_id: a.client_id, type: 'email', date: at,
                    details: `${KIND_LABELS[a.kind] ?? 'Envoi automatique'} : ${a.label}`,
                });
            }
        }
    } finally {
        await sender.close();
    }
    return out;
}

// ── Demande d'avis au départ du chantier (appelée par l'appli) ──────────────

async function reviewNow(admin: SupabaseClient, userId: string, quoteId: unknown, now: Date) {
    if (quoteId == null) return json({ error: 'quote_id requis' }, 400);
    const [profileRes, docRes, reviewsRes, draftsRes] = await Promise.all([
        admin.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).single(),
        admin.from('quotes').select(`${DOC_COLUMNS}, clients (${CLIENT_COLUMNS})`).eq('id', quoteId).eq('user_id', userId).maybeSingle(),
        admin.from('autopilot_actions').select('client_id').eq('user_id', userId).eq('kind', 'review_request').eq('status', 'sent'),
        admin.from('autopilot_drafts').select('action_key, subject, body, skipped').eq('user_id', userId),
    ]);
    const profile = profileRes.data;
    if (!profile || !['pro', 'owner'].includes(profile.plan)) return json({ status: 'skipped', reason: 'not_pro' });
    if (!docRes.data) return json({ error: 'Chantier introuvable' }, 404);

    const plan = planReviewNow({
        settings: profile.autopilot_settings, profile, doc: docRes.data,
        reviewedClients: new Set((reviewsRes.data ?? []).map((r) => r.client_id)), now, drafts: draftsRes.data ?? [],
    }) as { action?: Action; skipped?: string };
    if (!plan.action) return json({ status: 'skipped', reason: plan.skipped });

    const out = await sendActions(admin, profile, [plan.action], parisClock(now).dateKey);
    if (out.sent) return json({ status: 'sent', to: plan.action.to });
    if (out.failed) return json({ status: 'failed' }, 502);
    return json({ status: 'skipped', reason: out.skipped || 'already_sent' });
}

// ── Un artisan ───────────────────────────────────────────────────────────────

async function runForUser(admin: SupabaseClient, profile: Profile, opts: {
    now: Date; sendNow: boolean; summaryNow: boolean; dryRun: boolean; appUrl: string;
}) {
    const { now, sendNow, summaryNow, dryRun, appUrl } = opts;
    const settings = readAutopilotSettings(profile.autopilot_settings);
    const today = parisClock(now).dateKey;
    const result = { user_id: profile.id, sent: 0, failed: 0, planned: [] as unknown[], needsArtisan: 0, summary: false, skipped: '' };

    const since = new Date(now.getTime() - 400 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const [docsRes, logRes, reviewsRes, draftsRes] = await Promise.all([
        admin.from('quotes')
            .select(`${DOC_COLUMNS}, clients (${CLIENT_COLUMNS})`)
            .eq('user_id', profile.id)
            .not('status', 'in', '(draft,cancelled)')
            .gte('date', since),
        admin.from('autopilot_actions')
            .select('kind, action_key, client_id, status, day, amount')
            .eq('user_id', profile.id)
            .gte('day', since),
        admin.from('autopilot_actions')
            .select('client_id')
            .eq('user_id', profile.id)
            .eq('kind', 'review_request')
            .eq('status', 'sent'),
        admin.from('autopilot_drafts').select('action_key, subject, body, skipped').eq('user_id', profile.id),
    ]);
    if (docsRes.error) throw new Error(`lecture des devis : ${docsRes.error.message}`);
    if (logRes.error) throw new Error(`lecture du journal : ${logRes.error.message}`);

    const log = logRes.data ?? [];
    const todayRows = log.filter((r) => r.day === today && r.kind !== 'summary');
    const doneKeys = new Set(log
        .filter((r) => r.action_key && (r.status === 'sent' || r.day === today))
        .map((r) => r.action_key as string));
    const contactedToday = new Set(todayRows.filter((r) => r.status === 'sent').map((r) => r.client_id));
    const reviewedClients = new Set((reviewsRes.data ?? []).map((r) => r.client_id));

    const { actions, needsArtisan } = planAutopilotRun({
        settings, profile, docs: docsRes.data ?? [], steps: profile.follow_up_settings?.steps,
        doneKeys, contactedToday, reviewedClients, drafts: draftsRes.data ?? [],
        sentToday: todayRows.filter((r) => r.status === 'sent').length, appUrl, now,
    }) as { actions: Action[]; needsArtisan: object[] };
    result.needsArtisan = needsArtisan.length;

    if (dryRun) {
        result.planned = actions.map(({ kind, quote_id, to, subject, label, edited }) => ({ kind, quote_id, to, subject, label, edited: !!edited }));
        return result;
    }

    let sentNow: { kind: string; amount: number }[] = [];
    if (sendNow && actions.length > 0) {
        const out = await sendActions(admin, profile, actions, today);
        result.sent = out.sent;
        result.failed = out.failed;
        result.skipped = out.skipped;
        sentNow = out.sentNow;
    }

    if (summaryNow && settings.summary) {
        const dayStart = new Date(now.getTime() - 26 * 3600 * 1000).toISOString();
        const [signedRes, paidRes] = await Promise.all([
            admin.from('quotes').select('total_ttc, signed_at').eq('user_id', profile.id).gte('signed_at', dayStart),
            admin.from('quotes').select('total_ttc, paid_at').eq('user_id', profile.id).eq('type', 'invoice').gte('paid_at', dayStart),
        ]);
        const isToday = (v: string | null) => !!v && parisClock(new Date(v)).dateKey === today;
        const summary = buildEveningSummary({
            sent: [...todayRows.filter((r) => r.status === 'sent'), ...sentNow],
            signed: (signedRes.data ?? []).filter((q) => isToday(q.signed_at)),
            paid: (paidRes.data ?? []).filter((q) => isToday(q.paid_at)),
            needsArtisan,
        });
        if (summary) {
            const { error: dupErr } = await admin.from('autopilot_actions').insert({
                user_id: profile.id, kind: 'summary', subject: summary.title, body: summary.body, channel: 'push', status: 'sent', day: today,
            });
            if (!dupErr) {
                await sendPush(admin, profile.id, { title: summary.title, body: summary.body, url: '/app', tag: `autopilot-${today}` });
                result.summary = true;
            }
        }
    }

    return result;
}

// ── Point d'entrée ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return corsPreflight(corsHeaders);
    if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const cronSecret = Deno.env.get('CRON_SECRET');
    const provided = req.headers.get('x-cron-secret') ?? '';

    // Appli : demande d'avis au moment où l'artisan termine le chantier.
    if (!provided) {
        const auth = await requireUser(req, { headers: corsHeaders });
        if (auth.response) return auth.response;
        const payload = await req.json().catch(() => ({}));
        if (payload?.action !== 'review_now') return json({ error: 'Action inconnue' }, 400);
        try {
            return await reviewNow(admin, auth.user.id, payload.quote_id, new Date());
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('autopilot review_now :', message);
            return json({ error: message }, 500);
        }
    }

    let authorized = false;
    if (provided && cronSecret) authorized = await secretsMatch(provided, cronSecret);
    if (provided && !authorized) {
        const { data } = await admin.rpc('autopilot_cron_secret_matches', { p_secret: provided });
        authorized = data === true;
    }
    if (!authorized) return json({ error: 'Non autorisé' }, 401);

    const body = await req.json().catch(() => ({}));
    const now = new Date();
    const dryRun = body?.dry_run === true;
    const force = body?.force === true;
    const sendNow = force || isSendingWindow(now);
    const summaryNow = force || isSummaryHour(now);
    if (!sendNow && !summaryNow && !dryRun) {
        return json({ skipped: 'hors plage horaire', paris: parisClock(now) });
    }

    // Domaine de production de l'appli (Vercel) : les liens de signature des
    // relances pointent ici.
    const appUrl = Deno.env.get('APP_URL') || 'https://artisanfacile.fr';

    let query = admin.from('profiles').select(PROFILE_COLUMNS)
        .in('plan', ['pro', 'owner'])
        .eq('autopilot_settings->>enabled', 'true');
    if (typeof body?.user_id === 'string') query = query.eq('id', body.user_id);
    const { data: profiles, error } = await query;
    if (error) return json({ error: error.message }, 500);

    const results = [];
    for (const profile of profiles ?? []) {
        try {
            results.push(await runForUser(admin, profile, { now, sendNow, summaryNow, dryRun, appUrl }));
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`autopilot ${profile.id} :`, message);
            results.push({ user_id: profile.id, error: message });
        }
    }

    return json({ paris: parisClock(now), sendNow, summaryNow, dryRun, users: results.length, results });
});
