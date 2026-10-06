import { enforceRateLimit, rateLimitResponse } from '../_shared/rate-limit.ts';
import { readSecret } from '../_shared/vault.ts';
import { corsHeaders, corsPreflight, json, requireUser } from '../_shared/http.ts';

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
  if (req.method === 'OPTIONS') return corsPreflight();

  try {
    // Authentification
    const auth = await requireUser(req);
    if (auth.response) return auth.response;
    const { user, supabase } = auth;

    // Rate limit : 30 analyses vision / heure / utilisateur (coûteux). À 5,
    // une visite technique de 10 photos n'en faisait analyser que 5 : les
    // autres étaient ignorées sans bruit et le chiffrage partait incomplet.
    const rl = await enforceRateLimit('plan-vision', user.id, 30, 3600);
    if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

    // Récupération du profil (clé API + plan)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('ai_preferences, plan')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return json({ error: 'Profil introuvable' }, 404);
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
      return json({ error: 'Cette fonctionnalité est réservée aux comptes Pro. Passez en Pro ou configurez votre clé API dans votre profil.' }, 403);
    }

    if (!hasUserKey && isPro && !serverAnthropicKey && !serverGeminiKey) {
      return json({ error: 'Service temporairement indisponible. Configurez votre clé API dans votre profil pour continuer.' }, 503);
    }

    // outputSchema (optionnel) : schéma JSON imposé à la réponse sur la voie
    // Anthropic (sorties structurées). Les voies Gemini / OpenAI l'ignorent et
    // s'appuient sur la consigne JSON du prompt.
    const { imageBase64, mediaType, systemPrompt, userPrompt, outputSchema } = await req.json();

    if (!imageBase64 || !systemPrompt || !userPrompt) {
      return json({ error: 'Paramètres manquants (imageBase64, systemPrompt, userPrompt).' }, 400);
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
        return json({ error: `Erreur Gemini (${response.status}): ${errData.error?.message || response.statusText}` }, 502);
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
        return json({ error: errData.error?.message || `Erreur OpenAI ${response.status}` }, 502);
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
          'anthropic-beta': 'server-side-fallback-2026-07-01',
        },
        body: JSON.stringify({
          model: 'claude-opus-5-5',
          max_tokens: 8192,
          // En cas de refus, l'API relance la requête sur le modèle de repli
          // recommandé au lieu de renvoyer le refus.
          fallbacks: 'default',
          // Effort bas : avec un effort plus élevé, la réflexion dépassait le
          // délai de la passerelle (150 s) sur les photos de tableau. Lire /
          // décrire une photo n'a pas besoin d'une réflexion longue.
          output_config: {
            effort: 'low',
            ...(outputSchema ? { format: { type: 'json_schema', schema: outputSchema } } : {}),
          },
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
        return json({ error: err.error?.message || `Erreur Anthropic ${response.status}` }, 502);
      }

      const data = await response.json();
      // Suivi des coûts : visible dans les logs de la fonction Supabase.
      console.log(`plan-vision anthropic model=${data.model} in=${data.usage?.input_tokens} out=${data.usage?.output_tokens} stop=${data.stop_reason}`);
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

    return json({ text });

  } catch (error) {
    return json({ error: (error as Error).message }, error instanceof AiTimeoutError ? 504 : 500);
  }
});
