import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { lookup_token } = await req.json();

        if (!lookup_token) {
            return json({ error: 'lookup_token requis' }, 400);
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );

        // Récupérer le devis via son public_token
        const { data: quote, error: quoteError } = await supabase
            .from('quotes')
            .select('id, title, total_ttc, quote_number, user_id, client_id')
            .eq('public_token', lookup_token)
            .single();

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

        // Envoi ntfy.sh (push mobile) côté serveur – fiable même si l'app artisan est fermée
        const ntfyTopic = `artisan-facile-${quote.user_id}`;
        const ntfyMessage = `${clientName} a signé ${quoteLabel}${amount ? ` - ${amount}` : ''}`;
        try {
            await fetch(`https://ntfy.sh/${ntfyTopic}`, {
                method: 'POST',
                body: ntfyMessage,
                headers: {
                    'Title': `Devis signé - ${clientName}`,
                    'Priority': 'high',
                    'Tags': 'tada,money_with_wings',
                },
            });
        } catch (ntfyErr) {
            console.error('ntfy.sh error:', ntfyErr);
            // Non-bloquant : on continue avec l'email
        }

        // Envoi email via Resend si la clé est configurée
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
                subject: `✅ ${clientName} a signé votre devis`,
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
