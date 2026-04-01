import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { lookup_token, quote_id } = await req.json();

        if (!lookup_token && !quote_id) {
            return json({ error: 'lookup_token ou quote_id requis' }, 400);
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );

        // Récupérer le devis via son public_token ou son id
        const query = supabase
            .from('quotes')
            .select('id, title, total_ttc, quote_number, user_id, client_id');
        const { data: quote, error: quoteError } = await (
            lookup_token
                ? query.eq('public_token', lookup_token)
                : query.eq('id', quote_id)
        ).single();

        if (quoteError || !quote) {
            return json({ error: 'Devis introuvable' }, 404);
        }

        // Récupérer le nom du client
        const { data: client } = await supabase
            .from('clients')
            .select('name')
            .eq('id', quote.client_id)
            .single();

        const clientName = client?.name || 'Votre client';

        // Récupérer le profil artisan
        const { data: profile } = await supabase
            .from('profiles')
            .select('email, full_name, company_name')
            .eq('id', quote.user_id)
            .single();

        if (!profile) {
            return json({ error: 'Profil artisan introuvable' }, 404);
        }

        const quoteLabel = quote.title || `Devis #${quote.quote_number || quote.id}`;
        const amount = quote.total_ttc
            ? `${Number(quote.total_ttc).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`
            : null;
        const notifBody = `${clientName} a signé ${quoteLabel}${amount ? ` - ${amount}` : ''}`;

        // 1. Web Push (natif, aucune app tierce requise)
        const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
        const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
        if (vapidPublicKey && vapidPrivateKey) {
            webpush.setVapidDetails(
                'mailto:admin@artisanfacile.fr',
                vapidPublicKey,
                vapidPrivateKey,
            );

            const { data: pushSubs } = await supabase
                .from('push_subscriptions')
                .select('endpoint, p256dh, auth')
                .eq('user_id', quote.user_id);

            for (const sub of pushSubs ?? []) {
                try {
                    await webpush.sendNotification(
                        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                        JSON.stringify({
                            title: `Devis signé - ${clientName}`,
                            body: notifBody,
                            url: `/app/devis/${quote.id}`,
                            tag: `signature-${quote.id}`,
                        }),
                    );
                } catch (err: any) {
                    // Subscription expirée ou invalide – on la supprime
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
                    }
                    console.error('Web Push error:', err.statusCode, err.message);
                }
            }
        }

        // 2. ntfy.sh (pour les artisans qui ont l'app Ntfy installée)
        const ntfyTopic = `artisan-facile-${quote.user_id}`;
        try {
            await fetch(`https://ntfy.sh/${ntfyTopic}`, {
                method: 'POST',
                body: notifBody,
                headers: {
                    'Title': `Devis signé - ${clientName}`,
                    'Priority': 'high',
                    'Tags': 'tada,money_with_wings',
                },
            });
        } catch (ntfyErr) {
            console.error('ntfy.sh error:', ntfyErr);
        }

        // 3. Email via Resend
        const resendApiKey = Deno.env.get('RESEND_API_KEY');
        if (!resendApiKey) {
            console.log(`[DEV] Notification artisan : ${profile.email} – ${quoteLabel} signé par ${clientName}`);
            return json({ success: true, dev: true });
        }

        let artisanEmail = profile.email;
        if (!artisanEmail) {
            const { data: authUser } = await supabase.auth.admin.getUserById(quote.user_id);
            artisanEmail = authUser?.user?.email ?? null;
        }

        if (!artisanEmail) {
            return json({ success: true, email: false, reason: 'no_email' });
        }

        const emailFrom = Deno.env.get('EMAIL_FROM') ?? 'Artisan Facile <signature@artisanfacile.fr>';
        const artisanName = profile.company_name || profile.full_name || 'Artisan';

        const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: emailFrom,
                to: artisanEmail,
                subject: `${clientName} a signé votre devis`,
                text: buildEmailText({ artisanName, clientName, quoteLabel, amount }),
                html: buildEmailHtml({ artisanName, clientName, quoteLabel, amount }),
            }),
        });

        if (!emailRes.ok) {
            const detail = await emailRes.text();
            console.error('Resend error:', emailRes.status, detail);
        }

        return json({ success: true });
    } catch (err) {
        console.error('notify-artisan-portal-signature error:', err);
        return json({ error: (err as Error).message || 'Erreur interne' }, 500);
    }
});

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

function buildEmailText({ artisanName, clientName, quoteLabel, amount }: {
    artisanName: string;
    clientName: string;
    quoteLabel: string;
    amount: string | null;
}): string {
    const lines = [
        `Bonjour ${artisanName},`,
        '',
        `${clientName} vient de signer votre devis via le portail client.`,
        '',
        `Devis : ${quoteLabel}`,
        ...(amount ? [`Montant : ${amount}`] : []),
        `Client : ${clientName}`,
        '',
        'Connectez-vous à votre espace Artisan Facile pour consulter le devis signé et générer la facture.',
    ];
    return lines.join('\n');
}

function buildEmailHtml({ artisanName, clientName, quoteLabel, amount }: {
    artisanName: string;
    clientName: string;
    quoteLabel: string;
    amount: string | null;
}): string {
    const amountLine = amount
        ? `<p style="margin:0 0 8px;color:#374151;font-size:15px;">Montant : <strong>${amount}</strong></p>`
        : '';

    return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>Devis signé</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-size:48px;">✅</span>
    </div>
    <h2 style="margin:0 0 8px;color:#15803d;font-size:20px;">Devis signé !</h2>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;">
      Bonjour ${artisanName},<br><br>
      <strong>${clientName}</strong> vient de signer votre devis via le portail client.
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;margin:0 0 24px;">
      <p style="margin:0 0 8px;color:#374151;font-size:15px;">Devis : <strong>${quoteLabel}</strong></p>
      ${amountLine}
      <p style="margin:0;color:#374151;font-size:15px;">Client : <strong>${clientName}</strong></p>
    </div>
    <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">
      Connectez-vous à votre espace Artisan Facile pour consulter le devis signé et générer la facture.
    </p>
  </div>
</body>
</html>`;
}
