// Edge Function `save-smtp-config`
//
// Sauvegarde (ou supprime) la configuration SMTP de l'artisan. Le mot de passe
// est stocké côté serveur uniquement et n'est jamais renvoyé au client par la
// suite (cf. get_my_profile_safe qui strip le champ `password`).
//
// Body attendu :
//   { config: { host, port, secure, username, password, from_email, from_name } }
//   - Si `password` est omis et qu'une config existait déjà, on conserve l'ancien.
//   - Si `config` est null, on supprime totalement la config SMTP.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

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

        const { config } = await req.json();

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );

        // Suppression complète
        if (config === null) {
            const { error } = await supabaseAdmin
                .from('profiles')
                .update({ smtp_config: null })
                .eq('id', user.id);
            if (error) return json({ error: 'Erreur lors de la suppression' }, 500);
            return json({ success: true, configured: false });
        }

        if (!config || typeof config !== 'object') {
            return json({ error: 'Configuration invalide' }, 400);
        }

        const host = String(config.host || '').trim();
        const port = Number(config.port);
        const secure = !!config.secure;
        const username = String(config.username || '').trim();
        const fromEmail = String(config.from_email || '').trim();
        const fromName = String(config.from_name || '').trim();
        const password = typeof config.password === 'string' ? config.password : '';

        if (!host) return json({ error: 'Serveur SMTP requis' }, 400);
        if (!Number.isFinite(port) || port <= 0 || port > 65535) {
            return json({ error: 'Port SMTP invalide' }, 400);
        }
        if (!username) return json({ error: 'Identifiant SMTP requis' }, 400);
        if (!fromEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
            return json({ error: 'Adresse email expéditeur invalide' }, 400);
        }

        // Préserver l'ancien password si non fourni
        let finalPassword = password;
        if (!finalPassword) {
            const { data: existing } = await supabaseAdmin
                .from('profiles')
                .select('smtp_config')
                .eq('id', user.id)
                .single();
            finalPassword = existing?.smtp_config?.password || '';
            if (!finalPassword) {
                return json({ error: 'Mot de passe SMTP requis' }, 400);
            }
        }

        const smtpConfig = {
            host,
            port,
            secure,
            username,
            password: finalPassword,
            from_email: fromEmail,
            from_name: fromName,
        };

        const { error: updateError } = await supabaseAdmin
            .from('profiles')
            .update({ smtp_config: smtpConfig })
            .eq('id', user.id);

        if (updateError) return json({ error: 'Erreur lors de la mise à jour' }, 500);

        return json({ success: true, configured: true });
    } catch (err) {
        console.error('save-smtp-config error:', err);
        return json({ error: 'Erreur interne du serveur' }, 500);
    }
});
