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
        const { portal_token, quote_id } = await req.json();

        if (!portal_token || !quote_id) {
            return json({ error: 'portal_token et quote_id requis' }, 400);
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );

        // Récupérer le client_id et user_id depuis le portal_token
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('id, user_id, name')
            .eq('portal_token', portal_token)
            .single();

        if (clientError || !client) {
            return json({ error: 'Token invalide' }, 404);
        }

        // Récupérer le devis
        const { data: quote, error: quoteError } = await supabase
            .from('quotes')
            .select('id, title, total, type, client_id')
            .eq('id', quote_id)
            .eq('client_id', client.id)
            .single();

        if (quoteError || !quote) {
            return json({ error: 'Devis introuvable' }, 404);
        }

        // Récupérer l'email de l'artisan depuis les profils (champ email = email de connexion)
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('email, full_name, company_name')
            .eq('id', client.user_id)
            .single();

        if (profileError || !profile?.email) {
            // Fallback : récupérer l'email depuis auth.users
            const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(
                client.user_id
            );
            if (authError || !authUser?.user?.email) {
                console.error('Impossible de trouver l\'email artisan:', profileError, authError);
                return json({ error: 'Email artisan introuvable' }, 404);
            }
            profile.email = authUser.user.email;
        }

        const resendApiKey = Deno.env.get('RESEND_API_KEY');
        if (!resendApiKey) {
            console.log(`[DEV] Notification artisan : ${profile.email} – Devis #${quote.id} signé par ${client.name}`);
            return json({ success: true, dev: true });
        }

        const emailFrom = Deno.env.get('EMAIL_FROM') ?? 'Artisan Facile <signature@artisanfacile.fr>';
        const artisanName = profile.company_name || profile.full_name || 'Artisan';
        const quoteLabel = quote.title || `Devis #${quote.id}`;
        const amount = quote.total ? `${Number(quote.total).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €` : null;

        const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: emailFrom,
                to: profile.email,
                subject: `✅ ${client.name} a signé votre devis`,
                html: buildEmailHtml({ artisanName, clientName: client.name, quoteLabel, amount }),
            }),
        });

        if (!emailRes.ok) {
            const detail = await emailRes.text();
            console.error('Resend error:', emailRes.status, detail);
            throw new Error(`Resend ${emailRes.status}: ${detail}`);
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
