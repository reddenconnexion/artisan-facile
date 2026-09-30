import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';
import { enforceRateLimit, rateLimitResponse } from '../_shared/rate-limit.ts';
import { corsHeaders, corsPreflight, json, requireUser } from '../_shared/http.ts';

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return corsPreflight();

    try {
        const auth = await requireUser(req, { message: 'Non authentifié' });
        if (auth.response) return auth.response;
        const { user } = auth;

        // Rate limit : 3 tests / minute / utilisateur (anti-spam du bouton)
        const rl = await enforceRateLimit('send-test-push', user.id, 3, 60);
        if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

        const vapidPublic  = Deno.env.get('VAPID_PUBLIC_KEY');
        const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
        if (!vapidPublic || !vapidPrivate) {
            return json({ error: 'Notifications push non configurées côté serveur (VAPID keys manquantes)' }, 503);
        }

        // Service-role pour lire les abonnements
        const admin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );

        const { data: subs, error: subsErr } = await admin
            .from('push_subscriptions')
            .select('endpoint, p256dh, auth')
            .eq('user_id', user.id);

        if (subsErr) return json({ error: subsErr.message }, 500);
        if (!subs || subs.length === 0) {
            return json({ error: 'Aucun abonnement push trouvé pour cet utilisateur' }, 404);
        }

        webpush.setVapidDetails('mailto:admin@artisanfacile.fr', vapidPublic, vapidPrivate);

        const payload = JSON.stringify({
            title: '🔔 Notification de test',
            body:  'Tout fonctionne ! Vous recevrez une notification dès qu\'un client signera un devis.',
            url:   '/app/settings',
            tag:   'test-push',
        });

        let delivered = 0;
        let cleaned   = 0;

        for (const sub of subs) {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    payload,
                );
                delivered++;
            } catch (err: any) {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
                    cleaned++;
                } else {
                    console.error('Test push error:', err.statusCode, err.message);
                }
            }
        }

        if (delivered === 0) {
            return json({
                success: false,
                error: 'Aucune notification livrée. Vos abonnements ont peut-être expiré — réactivez-les depuis ce navigateur.',
                cleaned,
            }, 500);
        }

        return json({ success: true, delivered, cleaned, total: subs.length });
    } catch (err) {
        console.error('send-test-push error:', err);
        return json({ error: (err as Error).message }, 500);
    }
});
