// Edge Function `send-document-email`
//
// Envoie un email via le SMTP perso de l'artisan (config stockée dans
// `profiles.smtp_config`). Permet d'envoyer devis/factures/rapports
// directement depuis l'adresse pro de l'artisan, sans passer par mailto.
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
//     test?: boolean                  // si true, envoie à l'expéditeur (test de connexion)
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
        const { to, subject, text, html, cc, bcc, reply_to, test } = body;

        if (!subject || typeof subject !== 'string') return json({ error: 'Sujet requis' }, 400);
        if (!text && !html) return json({ error: 'Contenu requis' }, 400);

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );

        const { data: profile, error: profileErr } = await supabaseAdmin
            .from('profiles')
            .select('smtp_config')
            .eq('id', user.id)
            .single();

        if (profileErr) return json({ error: 'Profil introuvable' }, 404);

        const cfg = profile?.smtp_config;
        if (!cfg?.host || !cfg?.port || !cfg?.username || !cfg?.password || !cfg?.from_email) {
            return json({ error: 'Configuration SMTP incomplète. Renseignez-la dans votre profil.' }, 400);
        }

        const toList = test ? [cfg.from_email] : normalizeRecipients(to);
        if (toList.length === 0) return json({ error: 'Destinataire requis' }, 400);

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
            content: text || '',
            html: html || undefined,
        });

        return json({ success: true, sent_to: toList });
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
