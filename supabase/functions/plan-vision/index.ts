import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enforceRateLimit, rateLimitResponse } from '../_shared/rate-limit.ts';
import { readSecret } from '../_shared/vault.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// La passerelle Supabase coupe la requête à 150 s : au-delà, le client reçoit
// une erreur générique sans explication. On abandonne l'appel IA avant pour
// renvoyer un message clair.
const AI_TIMEOUT_MS = 120_000;

class AiTimeoutError extends Error {}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new AiTimeoutError("L'analyse IA a pris trop de temps. Réessayez avec une photo plus nette ou mieux cadrée.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

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

    // Rate limit : 5 analyses vision / heure / utilisateur (très coûteux)
    const rl = await enforceRateLimit('plan-vision', user.id, 5, 3600);
    if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

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
    const userApiKey = await readSecret(aiPrefs.openai_api_key_secret_id);
    const provider = aiPrefs.ai_provider || 'openai';
    const plan = profile.plan || 'free';
    const isPro = plan === 'pro' || plan === 'owner';

    // Détermine la source de la clé API
    const hasUserKey = !!userApiKey;
    const serverAnthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    // Même clé serveur que ai-proxy : sert de repli quand la clé Anthropic
    // n'est pas configurée sur le projet.
    const serverGeminiKey = Deno.env.get('GEMINI_API_KEY');

    if (!hasUserKey && !isPro) {
      return new Response(
        JSON.stringify({ error: 'Cette fonctionnalité est réservée aux comptes Pro. Passez en Pro ou configurez votre clé API dans votre profil.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!hasUserKey && isPro && !serverAnthropicKey && !serverGeminiKey) {
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

    const useServerGemini = !hasUserKey && !serverAnthropicKey;

    if ((hasUserKey && provider === 'gemini') || useServerGemini) {
      // Gemini Vision (clé perso, ou clé serveur en repli)
      const geminiKey = hasUserKey ? userApiKey : serverGeminiKey;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
      const response = await fetchWithTimeout(url, {
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
      const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
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
      const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': serverAnthropicKey!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-opus-5',
          max_tokens: 8192,
          // Effort par défaut (high) : la réflexion dépassait le délai de la
          // passerelle (150 s) sur les photos de tableau. Lire / décrire une
          // photo n'a pas besoin d'une réflexion longue.
          output_config: { effort: 'low' },
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
      if (data.stop_reason === 'refusal') {
        throw new Error("L'IA a refusé d'analyser cette image. Essayez avec une autre photo.");
      }
      text = data.content?.find((b: { type: string; text?: string }) => b.type === 'text')?.text || '';
      if (!text) {
        throw new Error(data.stop_reason === 'max_tokens'
          ? "Réponse de l'IA tronquée. Réessayez avec une photo recadrée sur une partie du tableau."
          : 'Réponse Anthropic vide');
      }
    }

    return new Response(
      JSON.stringify({ text }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: error instanceof AiTimeoutError ? 504 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
