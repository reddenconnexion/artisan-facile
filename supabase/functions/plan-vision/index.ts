import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
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

    // Récupération du profil (clé API + plan)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('ai_preferences, plan')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'Profil introuvable' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiPrefs = profile.ai_preferences || {};
    const userApiKey = aiPrefs.openai_api_key;
    const provider = aiPrefs.ai_provider || 'openai';
    const plan = profile.plan || 'free';
    const isPro = plan === 'pro' || plan === 'owner';

    // Détermine la source de la clé API
    const hasUserKey = !!userApiKey;
    const serverAnthropicKey = Deno.env.get('ANTHROPIC_API_KEY');

    if (!hasUserKey && !isPro) {
      return new Response(
        JSON.stringify({ error: 'Cette fonctionnalité est réservée aux comptes Pro. Passez en Pro ou configurez votre clé API dans votre profil.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!hasUserKey && isPro && !serverAnthropicKey) {
      return new Response(
        JSON.stringify({ error: 'Service temporairement indisponible. Configurez votre clé API dans votre profil pour continuer.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { imageBase64, mediaType, systemPrompt, userPrompt } = await req.json();

    if (!imageBase64 || !systemPrompt || !userPrompt) {
      return new Response(
        JSON.stringify({ error: 'Paramètres manquants (imageBase64, systemPrompt, userPrompt).' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const safeMediaType = (mediaType && mediaType.startsWith('image/')) ? mediaType : 'image/jpeg';
    let text: string;

    if (hasUserKey && provider === 'gemini') {
      // Gemini Vision
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${userApiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: `${systemPrompt}\n\n${userPrompt}` },
              { inline_data: { mime_type: safeMediaType, data: imageBase64 } },
            ]
          }]
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        return new Response(
          JSON.stringify({ error: `Erreur Gemini (${response.status}): ${errData.error?.message || response.statusText}` }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!text) throw new Error('Réponse Gemini vide');

    } else if (hasUserKey && provider === 'openai') {
      // OpenAI Vision (gpt-4o)
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: `${systemPrompt}\n\n${userPrompt}` },
              { type: 'image_url', image_url: { url: `data:${safeMediaType};base64,${imageBase64}` } },
            ],
          }],
          max_tokens: 4096,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        return new Response(
          JSON.stringify({ error: errData.error?.message || `Erreur OpenAI ${response.status}` }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      text = data.choices?.[0]?.message?.content || '';
      if (!text) throw new Error('Réponse OpenAI vide');

    } else {
      // Anthropic (clé serveur, utilisateurs Pro sans clé personnelle)
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': serverAnthropicKey!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-6',
          max_tokens: 8192,
          system: systemPrompt,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: safeMediaType, data: imageBase64 } },
              { type: 'text', text: userPrompt },
            ],
          }],
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        return new Response(
          JSON.stringify({ error: err.error?.message || `Erreur Anthropic ${response.status}` }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      text = data.content?.find((b: { type: string; text?: string }) => b.type === 'text')?.text || '';
    }

    return new Response(
      JSON.stringify({ text }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
