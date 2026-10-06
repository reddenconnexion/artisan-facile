// v2 — server-key fallback (GEMINI_API_KEY) for free users, quota-enforced
import { enforceRateLimit, rateLimitResponse } from '../_shared/rate-limit.ts';
import { readSecret } from '../_shared/vault.ts';
import { corsHeaders, corsPreflight, json, requireUser } from '../_shared/http.ts';

const FREE_AI_LIMIT = 5;

// Default system prompts kept server-side so they can be tuned without a
// frontend redeploy. Clients send `preset: 'quote' | 'quote-site-visit'`
// plus optional `extras` instead of duplicating these strings.
const QUOTE_PROMPT = `Tu es un expert artisan du bâtiment français. Génère un devis précis à partir de la description des travaux.

RÈGLES DE TARIFICATION:
- Matériaux électriques: prix catalogue TTC 123elec.com × 1.25 (= prix client HT si TVA applicable, sinon prix TTC direct)
- Autres matériaux/fournitures: prix négoce français + marge 20-30% selon la filière
- Main d'œuvre: taux horaire marché selon la spécialité (électricien, plombier, peintre…)

RÈGLES GÉNÉRALES:
- type "service" = main d'œuvre/prestation | type "material" = fourniture/matériau
- Unités: u | m2 | ml | h | forfait
- Inclure consommables, protections sols/meubles, évacuation déchets si pertinent
- Descriptions courtes et précises (max 8 mots)
- Prix HT réalistes, compétitifs mais rentables

JSON UNIQUEMENT — pas de markdown, pas de texte avant/après:
{"items":[{"description":"...","quantity":1,"unit":"u","price":0.00,"type":"service"}],"suggestions":["..."],"estimated_duration":"X jours"}`;

const SITE_VISIT_EXTRAS = `\n\nMODE VISITE CHANTIER — retourne aussi title, work_object, price_range et confidence:
- "title" : nom court du projet (8 mots max), pas une phrase.
- "work_object" : le périmètre en 2 à 4 phrases (400 caractères max) — ce qui est compris, ce qui ne l'est pas, et les constats relevés qui conditionnent le prix (longueurs, alimentation existante, accès). Aucune liste de postes, aucun montant.
{"title":"...","work_object":"...","items":[...],"suggestions":[...],"estimated_duration":"...","price_range":{"min":0,"max":0},"confidence":"high|medium|low"}`;

// Chiffrage d'une visite technique : le modèle léger (Gemini Flash sans
// réflexion, gpt-4o-mini) sortait des devis incomplets et irréalistes à partir
// d'une conversation de chantier décousue. Sans clé personnelle, un compte Pro
// passe donc par Claude, le même moteur que la skill « devis électrique » qui,
// elle, colle à la réalité. Repli sur Gemini si Claude ne répond pas à temps.
const CLAUDE_QUOTE_PRESETS = new Set(['quote-site-visit']);
// La passerelle Supabase coupe à 150 s : on laisse la marge du repli Gemini.
const CLAUDE_TIMEOUT_MS = 100_000;

async function callClaude(apiKey: string, systemPrompt: string, userMessage: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-5-5',
        max_tokens: 16000,
        fallbacks: 'default',
        // Effort moyen : assez de réflexion pour trier ferme / options et
        // estimer les heures poste par poste, sans dépasser le délai.
        output_config: { effort: 'medium' },
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Erreur Anthropic ${response.status}`);
    }
    const data = await response.json();
    const text = (data.content || [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('');
    console.log(`ai-proxy anthropic model=${data.model} in=${data.usage?.input_tokens} out=${data.usage?.output_tokens} stop=${data.stop_reason}`);
    if (!text) throw new Error('Réponse Claude vide');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function resolvePresetPrompt(preset: string, userOverride: string | null | undefined, extras: string): string {
  const customBase = (userOverride && userOverride.trim()) ? userOverride.trim() : QUOTE_PROMPT;
  if (preset === 'quote') {
    return customBase + (extras || '');
  }
  if (preset === 'quote-site-visit') {
    return customBase + SITE_VISIT_EXTRAS + (extras || '');
  }
  return customBase + (extras || '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight();

  try {
    // Authentification
    const auth = await requireUser(req);
    if (auth.response) return auth.response;
    const { user, supabase } = auth;

    // Rate limit anti-burst : 30 appels IA / heure / utilisateur
    // (en plus du quota mensuel free de 5/mois géré plus bas)
    const rl = await enforceRateLimit('ai-proxy', user.id, 30, 3600);
    if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

    // Lecture des préférences IA et du plan depuis la base de données
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
    const provider = aiPrefs.ai_provider || 'gemini';
    const plan = profile.plan || 'free';
    const isPro = plan === 'pro' || plan === 'owner';

    let effectiveApiKey = userApiKey;
    let effectiveProvider = provider;
    let usingServerKey = false;

    if (!effectiveApiKey) {
      const serverGeminiKey = Deno.env.get('GEMINI_API_KEY');

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
          return json({ error: `Limite atteinte : ${FREE_AI_LIMIT} générations IA/mois. Passez au plan Pro pour un accès illimité.` }, 403);
        }
      }

      if (!serverGeminiKey) {
        return json({ error: 'Service temporairement indisponible. Configurez votre clé API dans votre profil pour continuer.' }, 503);
      }

      effectiveApiKey = serverGeminiKey;
      effectiveProvider = 'gemini';
      usingServerKey = true;
    }

    const { systemPrompt, userMessage, preset, extras } = await req.json();

    let resolvedSystemPrompt: string | undefined = systemPrompt;
    if (!resolvedSystemPrompt && preset) {
      resolvedSystemPrompt = resolvePresetPrompt(
        preset,
        aiPrefs.quote_system_prompt,
        typeof extras === 'string' ? extras : ''
      );
    }

    if (!resolvedSystemPrompt || !userMessage) {
      return json({ error: 'Paramètres manquants' }, 400);
    }

    let rawResponse: string | undefined;

    const serverAnthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (usingServerKey && isPro && serverAnthropicKey && CLAUDE_QUOTE_PRESETS.has(preset)) {
      try {
        rawResponse = await callClaude(serverAnthropicKey, resolvedSystemPrompt, userMessage);
      } catch (err) {
        console.warn(`ai-proxy: Claude indisponible, repli Gemini — ${(err as Error).message}`);
      }
    }

    if (rawResponse) {
      // Chiffrage déjà produit par Claude.
    } else if (effectiveProvider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${effectiveApiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `${resolvedSystemPrompt}\n\n${userMessage}` }]
          }],
          // gemini-2.5-flash est un modèle "thinking" : sur un prompt lourd
          // (ex. conseiller comptable, qui attend un gros JSON structuré), le
          // temps de réflexion peut dépasser le délai de la Edge Function et
          // faire tomber la connexion ("Failed to send a request to the Edge
          // Function"). On désactive la réflexion (thinkingBudget: 0) pour
          // retrouver la latence du 2.0-flash et on borne la sortie.
          generationConfig: {
            maxOutputTokens: 8192,
            thinkingConfig: { thinkingBudget: 0 },
          },
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        return json({ error: `Erreur Gemini (${response.status}): ${errData.error?.message || response.statusText}` }, 502);
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
            { role: 'system', content: resolvedSystemPrompt },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        return json({ error: errData.error?.message || 'Erreur OpenAI API' }, 502);
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

    return json({ rawResponse });

  } catch (error) {
    return json({ error: error.message }, 500);
  }
});
