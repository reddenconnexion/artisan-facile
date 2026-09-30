import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { upsertSecret, deleteSecret } from '../_shared/vault.ts';
import { corsPreflight, json, requireUser } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight();

  if (req.method !== 'POST') {
    return json({ error: 'Méthode non autorisée' }, 405);
  }

  try {
    // Authentification
    const auth = await requireUser(req);
    if (auth.response) return auth.response;
    const { user } = auth;

    const body = await req.json();
    const { api_key } = body;

    // Suppression de la clé si null/vide
    const deletingKey = api_key === null || api_key === '';

    if (!deletingKey) {
      // Validation format : on accepte OpenAI (sk-…) ET Gemini (AIza…).
      // Anthropic n'est utilisé qu'avec la clé serveur, pas via cet endpoint.
      const isString = typeof api_key === 'string';
      const isOpenAI = isString && api_key.startsWith('sk-') && api_key.length >= 20;
      const isGemini = isString && api_key.startsWith('AIza') && api_key.length >= 35;
      if (!isOpenAI && !isGemini) {
        return json({ error: 'Format de clé API invalide. Elle doit commencer par "sk-" (OpenAI) ou "AIza" (Gemini).' }, 400);
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
      return json({ error: 'Profil introuvable' }, 404);
    }

    const currentPrefs = profile?.ai_preferences || {};
    const existingSecretId = currentPrefs.openai_api_key_secret_id || null;

    // La clé n'est jamais stockée en clair : seul son id dans Supabase Vault
    // (chiffré) est conservé dans `ai_preferences`.
    const updatedPrefs = { ...currentPrefs };
    delete updatedPrefs.openai_api_key;
    delete updatedPrefs.gemini_api_key;

    if (deletingKey) {
      await deleteSecret(existingSecretId);
      delete updatedPrefs.openai_api_key_secret_id;
      delete updatedPrefs.openai_api_key_last4;
    } else {
      const secretId = await upsertSecret(existingSecretId, api_key, `ai_api_key_${user.id}`);
      if (!secretId) {
        return json({ error: 'Erreur lors du chiffrement de la clé API' }, 500);
      }
      updatedPrefs.openai_api_key_secret_id = secretId;
      updatedPrefs.openai_api_key_last4 = api_key.slice(-4);
    }

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ ai_preferences: updatedPrefs })
      .eq('id', user.id);

    if (updateError) {
      return json({ error: 'Erreur lors de la mise à jour' }, 500);
    }

    // Réponse : jamais la clé elle-même, uniquement son statut
    return json({ success: true, configured: !deletingKey });

  } catch {
    return json({ error: 'Erreur interne du serveur' }, 500);
  }
});
