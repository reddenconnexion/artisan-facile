import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

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
        const { portal_token, sender_name, message_preview } = await req.json();

        if (!portal_token) return json({ error: 'portal_token requis' }, 400);

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );

        // Récupérer le client et l'artisan
        const { data: client, error: clientErr } = await supabase
            .from('clients')
            .select('id, name, user_id')
            .eq('portal_token', portal_token)
            .single();

        if (clientErr || !client) return json({ error: 'Client introuvable' }, 404);

        const { data: profile } = await supabase
            .from('profiles')
            .select('email, full_name, company_name')
            .eq('id', client.user_id)
            .single();

        const { data: authUser } = await supabase.auth.admin.getUserById(client.user_id);
        const artisanEmail = profile?.email || authUser?.user?.email;
        const artisanName = profile?.company_name || profile?.full_name || 'Artisan';
        const clientDisplayName = sender_name || client.name;
        const preview = message_preview
            ? message_preview.substring(0, 120) + (message_preview.length > 120 ? '…' : '')
            : 'Nouveau message dans votre portail client';

        const notifications: Array<{ channel: string; ok: boolean }> = [];

        // ── 1. Web Push ───────────────────────────────────────────────────────
        const vapidPublic  = Deno.env.get('VAPID_PUBLIC_KEY');
        const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
        if (vapidPublic && vapidPrivate) {
            webpush.setVapidDetails('mailto:admin@artisanfacile.fr', vapidPublic, vapidPrivate);

            const { data: pushSubs } = await supabase
                .from('push_subscriptions')
                .select('endpoint, p256dh, auth')
                .eq('user_id', client.user_id);

            for (const sub of pushSubs ?? []) {
                try {
                    await webpush.sendNotification(
                        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                        JSON.stringify({
                            title: `💬 ${clientDisplayName}`,
                            body: preview,
                            url: '/app/portal-messages',
                            tag: `portal-msg-${client.id}`,
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

        // ── 2. ntfy.sh ────────────────────────────────────────────────────────
        const ntfyTopic = `artisan-facile-${client.user_id}`;
        try {
            const ntfyRes = await fetch(`https://ntfy.sh/${ntfyTopic}`, {
                method: 'POST',
                body: preview,
                headers: {
                    Title: `💬 Message de ${clientDisplayName}`,
                    Priority: 'default',
                    Tags: 'speech_balloon',
                },
            });
            notifications.push({ channel: 'ntfy', ok: ntfyRes.ok });
        } catch { /* ntfy optionnel */ }

        // ── 3. Email via Resend ───────────────────────────────────────────────
        const resendApiKey = Deno.env.get('RESEND_API_KEY');
        if (!resendApiKey) {
            console.log(`[DEV] Message portail : ${artisanEmail} – de ${clientDisplayName} : ${preview}`);
            return json({ success: true, dev: true, notifications });
        }

        if (!artisanEmail) return json({ success: true, email: false, reason: 'no_email', notifications });

        const emailFrom = Deno.env.get('EMAIL_FROM') ?? 'Artisan Facile <noreply@artisanfacile.fr>';

        const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: emailFrom,
                to: artisanEmail,
                subject: `💬 Nouveau message de ${clientDisplayName}`,
                text: [
                    `Bonjour ${artisanName},`,
                    '',
                    `${clientDisplayName} vous a envoyé un message via son portail client.`,
                    '',
                    `"${preview}"`,
                    '',
                    'Connectez-vous pour répondre : votre espace Artisan Facile > Messages portail.',
                ].join('\n'),
                html: `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align:center;margin-bottom:24px;font-size:48px;">💬</div>
    <h2 style="margin:0 0 8px;color:#1d4ed8;font-size:20px;">Nouveau message client</h2>
    <p style="margin:0 0 20px;color:#374151;font-size:15px;">
      Bonjour ${artisanName},<br><br>
      <strong>${clientDisplayName}</strong> vous a envoyé un message via son portail client.
    </p>
    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:16px;margin:0 0 24px;">
      <p style="margin:0;color:#374151;font-size:14px;font-style:italic;">"${preview}"</p>
    </div>
    <a href="https://app.artisanfacile.fr/app/portal-messages"
       style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
      Répondre →
    </a>
    <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;">
      Artisan Facile · Espace client sécurisé
    </p>
  </div>
</body>
</html>`,
            }),
        });

        notifications.push({ channel: 'email', ok: emailRes.ok });
        if (!emailRes.ok) console.error('Resend error:', await emailRes.text());

        return json({ success: true, notifications });
    } catch (err) {
        console.error('send-portal-message error:', err);
        return json({ error: (err as Error).message }, 500);
    }
});
