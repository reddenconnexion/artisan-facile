// v2 — server-key fallback (ANTHROPIC_API_KEY) for free users, quota-enforced
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FREE_AI_LIMIT = 5;

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

    // Lecture des préférences IA et du plan depuis la base de données
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
    const provider = aiPrefs.ai_provider || 'gemini';
    const plan = profile.plan || 'free';
    const isPro = plan === 'pro' || plan === 'owner';

    let effectiveApiKey = userApiKey;
    let effectiveProvider = provider;
    let usingServerKey = false;

    if (!effectiveApiKey) {
      const serverAnthropicKey = Deno.env.get('ANTHROPIC_API_KEY');

      if (!isPro) {
        // Free user: check monthly quota before allowing server key usage
        const currentMonth = new Date().toISOString().slice(0, 7);
        const { data: usage } = await supabase
          .from('usage_tracking')
          .select('ai_generations_count')
          .eq('user_id', user.id)
          .eq('month', currentMonth)
          .maybeSingle();

        const count = usage?.ai_generations_count ?? 0;
        if (count >= FREE_AI_LIMIT) {
          return new Response(
            JSON.stringify({ error: `Limite atteinte : ${FREE_AI_LIMIT} générations IA/mois. Passez au plan Pro pour un accès illimité.` }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      if (!serverAnthropicKey) {
        return new Response(
          JSON.stringify({ error: 'Service temporairement indisponible. Configurez votre clé API dans votre profil pour continuer.' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      effectiveApiKey = serverAnthropicKey;
      effectiveProvider = 'anthropic';
      usingServerKey = true;
    }

    const { systemPrompt, userMessage } = await req.json();

    if (!systemPrompt || !userMessage) {
      return new Response(
        JSON.stringify({ error: 'Paramètres manquants' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let rawResponse: string;

    if (effectiveProvider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': effectiveApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        return new Response(
          JSON.stringify({ error: `Erreur Anthropic (${response.status}): ${errData.error?.message || response.statusText}` }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      rawResponse = data.content?.find((b: { type: string; text?: string }) => b.type === 'text')?.text;
      if (!rawResponse) throw new Error('Réponse Anthropic vide');

    } else if (effectiveProvider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${effectiveApiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `${systemPrompt}\n\n${userMessage}` }]
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
      rawResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawResponse) throw new Error('Réponse Gemini vide');

    } else {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${effectiveApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        return new Response(
          JSON.stringify({ error: errData.error?.message || 'Erreur OpenAI API' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      rawResponse = data.choices[0].message.content;
    }

    // Increment usage counter for free users consuming the server key
    if (usingServerKey && !isPro) {
      const currentMonth = new Date().toISOString().slice(0, 7);
      await supabase.rpc('increment_ai_generation_usage', {
        p_user_id: user.id,
        p_month: currentMonth,
      });
    }

    return new Response(
      JSON.stringify({ rawResponse }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
