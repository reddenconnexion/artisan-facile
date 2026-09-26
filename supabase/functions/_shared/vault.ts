// Accès partagé à Supabase Vault pour les Edge Functions.
//
// Les secrets tiers de l'artisan (clé API OpenAI/Gemini, mot de passe SMTP)
// ne sont plus stockés en clair dans `profiles.ai_preferences`/`smtp_config` :
// seul un `*_secret_id` (uuid) y est conservé, et le secret réel vit chiffré
// dans `vault.secrets`. Le schéma `vault` n'étant pas exposé via PostgREST,
// on passe par des fonctions RPC `vault_*` (SECURITY DEFINER, réservées à
// `service_role` — voir la migration `add_vault_secrets_for_profiles`).
//
// Usage typique dans une Edge Function :
//
//   import { readSecret, createSecret, updateSecret, deleteSecret } from '../_shared/vault.ts';
//   const apiKey = await readSecret(aiPrefs.openai_api_key_secret_id);

import { createClient } from 'npm:@supabase/supabase-js@2';

let cachedClient: ReturnType<typeof createClient> | null = null;

function getServiceClient() {
    if (cachedClient) return cachedClient;
    const url        = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) return null;
    cachedClient = createClient(url, serviceKey);
    return cachedClient;
}

/**
 * Déchiffre un secret par son id. Retourne `null` si l'id est vide ou si la
 * lecture échoue (fail-closed : l'appelant doit alors se comporter comme si
 * aucune clé personnelle n'était configurée, jamais planter la requête).
 */
export async function readSecret(secretId: string | null | undefined): Promise<string | null> {
    if (!secretId) return null;
    const client = getServiceClient();
    if (!client) {
        console.warn('[vault] service-role client unavailable');
        return null;
    }
    const { data, error } = await client.rpc('vault_read_secret', { p_secret_id: secretId });
    if (error) {
        console.error('[vault] vault_read_secret failed:', error.message);
        return null;
    }
    return data ?? null;
}

/**
 * Crée un nouveau secret et retourne son id, ou `null` en cas d'échec.
 */
export async function createSecret(secret: string, name: string): Promise<string | null> {
    const client = getServiceClient();
    if (!client) return null;
    const { data, error } = await client.rpc('vault_create_secret', { p_secret: secret, p_name: name });
    if (error) {
        console.error('[vault] vault_create_secret failed:', error.message);
        return null;
    }
    return data ?? null;
}

/**
 * Met à jour un secret existant. Retourne `true` en cas de succès.
 */
export async function updateSecret(secretId: string, secret: string): Promise<boolean> {
    const client = getServiceClient();
    if (!client) return false;
    const { error } = await client.rpc('vault_update_secret', { p_secret_id: secretId, p_secret: secret });
    if (error) {
        console.error('[vault] vault_update_secret failed:', error.message);
        return false;
    }
    return true;
}

/**
 * Crée le secret s'il n'existe pas encore, sinon le met à jour en place.
 * Retourne l'id du secret (nouveau ou existant), ou `null` en cas d'échec.
 */
export async function upsertSecret(
    existingSecretId: string | null | undefined,
    secret: string,
    name: string,
): Promise<string | null> {
    if (existingSecretId) {
        const ok = await updateSecret(existingSecretId, secret);
        return ok ? existingSecretId : null;
    }
    return createSecret(secret, name);
}

/**
 * Supprime un secret (ex : l'artisan retire sa clé API/son mot de passe SMTP).
 */
export async function deleteSecret(secretId: string | null | undefined): Promise<void> {
    if (!secretId) return;
    const client = getServiceClient();
    if (!client) return;
    const { error } = await client.rpc('vault_delete_secret', { p_secret_id: secretId });
    if (error) console.error('[vault] vault_delete_secret failed:', error.message);
}
