import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

// Doit rester synchronisé avec src/constants/admin.js et les fonctions SQL
// get_all_feedback / set_feedback_status (allowlist admin).
const ADMIN_EMAILS = ['rotvener97@gmail.com', 'reddenconnexion@gmail.com'];

const CATEGORY_LABELS: Record<string, string> = {
    bug: 'Bug',
    ux: 'Ergonomie',
    feature: 'Idée',
    other: 'Autre',
};

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

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const { category, message, rating, page, author_user_id } = await req.json();

        if (!message) return json({ error: 'message requis' }, 400);

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );

        // Nom de l'artisan à l'origine du retour (pour l'affichage uniquement).
        let authorLabel = 'Un artisan';
        if (author_user_id) {
            const { data: authorProfile } = await supabase
                .from('profiles')
                .select('company_name, full_name')
                .eq('id', author_user_id)
                .single();
            authorLabel = authorProfile?.company_name || authorProfile?.full_name || authorLabel;
        }

        const categoryLabel = CATEGORY_LABELS[category] || 'Retour';
        const preview = message.length > 200 ? `${message.slice(0, 200)}…` : message;

        // Comptes administrateurs à notifier (Denis).
        const { data: usersList } = await supabase.auth.admin.listUsers({ perPage: 200 });
        const adminUsers = (usersList?.users || []).filter(
            (u) => u.email && ADMIN_EMAILS.includes(u.email.toLowerCase()),
        );

        const notifications: Array<{ channel: string; ok: boolean }> = [];

        // ── 1. Web Push ───────────────────────────────────────────────────────
        const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
        const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
        if (vapidPublic && vapidPrivate && adminUsers.length) {
            webpush.setVapidDetails('mailto:admin@artisanfacile.fr', vapidPublic, vapidPrivate);

            for (const admin of adminUsers) {
                const { data: pushSubs } = await supabase
                    .from('push_subscriptions')
                    .select('endpoint, p256dh, auth')
                    .eq('user_id', admin.id);

                for (const sub of pushSubs ?? []) {
                    try {
                        await webpush.sendNotification(
                            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                            JSON.stringify({
                                title: `🔔 Nouveau retour · ${categoryLabel}`,
                                body: `${authorLabel} : ${preview}`,
                                url: '/app/admin/feedback',
                                tag: 'new-feedback',
                            }),
                        );
                        notifications.push({ channel: 'push', ok: true });
                    } catch (err: any) {
                        if (err.statusCode === 410 || err.statusCode === 404) {
                            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
                        }
                    }
                }
            }
        }

        // ── 2. ntfy.sh ────────────────────────────────────────────────────────
        for (const admin of adminUsers) {
            try {
                const ntfyRes = await fetch(`https://ntfy.sh/artisan-facile-${admin.id}`, {
                    method: 'POST',
                    body: `${authorLabel} : ${preview}`,
                    headers: {
                        Title: `🔔 Nouveau retour · ${categoryLabel}`,
                        Priority: 'default',
                        Tags: 'bell',
                    },
                });
                notifications.push({ channel: 'ntfy', ok: ntfyRes.ok });
            } catch { /* ntfy optionnel */ }
        }

        // ── 3. Email via Resend ───────────────────────────────────────────────
        const resendApiKey = Deno.env.get('RESEND_API_KEY');
        if (!resendApiKey) {
            console.log(`[DEV] Nouveau retour (${categoryLabel}) de ${authorLabel} : ${preview}`);
            return json({ success: true, dev: true, notifications });
        }

        const emailFrom = Deno.env.get('EMAIL_FROM') ?? 'Artisan Facile <noreply@artisanfacile.fr>';
        const ratingLine = rating ? `Satisfaction : ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}` : null;

        const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: emailFrom,
                to: ADMIN_EMAILS,
                subject: `🔔 Nouveau retour · ${categoryLabel} · ${authorLabel}`,
                text: [
                    `${authorLabel} vient d'envoyer un retour (${categoryLabel}).`,
                    '',
                    `"${message}"`,
                    '',
                    ...(ratingLine ? [ratingLine, ''] : []),
                    ...(page ? [`Écran : ${page}`, ''] : []),
                    'Répondre : https://app.artisanfacile.fr/app/admin/feedback',
                ].join('\n'),
                html: `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align:center;margin-bottom:24px;font-size:48px;">🔔</div>
    <h2 style="margin:0 0 8px;color:#059669;font-size:20px;">Nouveau retour · ${categoryLabel}</h2>
    <p style="margin:0 0 20px;color:#374151;font-size:15px;">
      <strong>${authorLabel}</strong> vient d'envoyer un retour via l'application.
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin:0 0 16px;">
      <p style="margin:0;color:#374151;font-size:14px;font-style:italic;white-space:pre-line;">"${message}"</p>
    </div>
    ${ratingLine ? `<p style="margin:0 0 16px;color:#b45309;font-size:14px;">${ratingLine}</p>` : ''}
    <a href="https://app.artisanfacile.fr/app/admin/feedback"
       style="display:inline-block;padding:12px 24px;background:#059669;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
      Répondre →
    </a>
  </div>
</body>
</html>`,
            }),
        });

        notifications.push({ channel: 'email', ok: emailRes.ok });
        if (!emailRes.ok) console.error('Resend error:', await emailRes.text());

        return json({ success: true, notifications });
    } catch (err) {
        console.error('notify-new-feedback error:', err);
        return json({ error: (err as Error).message }, 500);
    }
});
