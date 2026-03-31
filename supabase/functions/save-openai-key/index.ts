import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Méthode non autorisée' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Authentification
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Non autorisé' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Non autorisé' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { api_key } = body;

    // Suppression de la clé si null/vide
    const deletingKey = api_key === null || api_key === '';

    if (!deletingKey) {
      // Validation format : les clés OpenAI commencent par sk-
      if (typeof api_key !== 'string' || !api_key.startsWith('sk-') || api_key.length < 20) {
        return new Response(
          JSON.stringify({ error: 'Format de clé API invalide. Elle doit commencer par "sk-".' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Récupération des préférences actuelles pour les préserver
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: profile, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select('ai_preferences')
      .eq('id', user.id)
      .single();

    if (fetchError) {
      return new Response(
        JSON.stringify({ error: 'Profil introuvable' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const currentPrefs = profile?.ai_preferences || {};

    // Mise à jour de la clé sans renvoyer les autres préférences au client
    const updatedPrefs = {
      ...currentPrefs,
      openai_api_key: deletingKey ? null : api_key,
    };

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ ai_preferences: updatedPrefs })
      .eq('id', user.id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: 'Erreur lors de la mise à jour' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Réponse : jamais la clé elle-même, uniquement son statut
    return new Response(
      JSON.stringify({ success: true, configured: !deletingKey }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch {
    return new Response(
      JSON.stringify({ error: 'Erreur interne du serveur' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
