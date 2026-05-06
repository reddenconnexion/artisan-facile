// Rate limiting partagé pour les Edge Functions Supabase.
// Implémenté via la RPC `check_rate_limit` (fenêtre fixe atomique côté DB).
//
// Usage typique dans une Edge Function :
//
//   import { enforceRateLimit, rateLimitResponse } from '../_shared/rate-limit.ts';
//   ...
//   const rl = await enforceRateLimit('voice-transcribe', user.id, 10, 3600);
//   if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

import { createClient } from 'npm:@supabase/supabase-js@2';

export interface RateLimitResult {
    allowed: boolean;
    remaining?: number;
    retryAfterSeconds?: number;
    resetAt?: string;
}

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
 * Vérifie + incrémente le compteur de manière atomique.
 *
 * @param namespace   Identifiant de la fonction (ex: "voice-transcribe")
 * @param identifier  Clé d'identité (user_id, IP, etc.)
 * @param maxRequests Nombre max autorisé dans la fenêtre
 * @param windowSec   Durée de la fenêtre en secondes
 *
 * En cas d'erreur DB ou d'env manquant, on **fail open** (autorise) pour
 * ne pas bloquer le service en cas de problème côté infra.
 */
export async function enforceRateLimit(
    namespace: string,
    identifier: string,
    maxRequests: number,
    windowSec: number,
): Promise<RateLimitResult> {
    const client = getServiceClient();
    if (!client) {
        console.warn('[rate-limit] service-role client unavailable, failing open');
        return { allowed: true };
    }

    const key = `${namespace}:${identifier}`;
    const { data, error } = await client.rpc('check_rate_limit', {
        p_key:            key,
        p_max_requests:   maxRequests,
        p_window_seconds: windowSec,
    });

    if (error) {
        console.error('[rate-limit] check_rate_limit failed:', error.message);
        return { allowed: true };
    }

    return {
        allowed:           data?.allowed === true,
        remaining:         data?.remaining,
        retryAfterSeconds: data?.retry_after_seconds,
        resetAt:           data?.reset_at,
    };
}

/**
 * Réponse HTTP 429 standardisée avec en-tête `Retry-After`.
 */
export function rateLimitResponse(
    result: RateLimitResult,
    corsHeaders: Record<string, string>,
    customMessage?: string,
) {
    const retryAfter = result.retryAfterSeconds || 60;
    const minutes = Math.ceil(retryAfter / 60);
    const defaultMsg = retryAfter < 60
        ? `Trop de requêtes — réessayez dans ${retryAfter} seconde${retryAfter > 1 ? 's' : ''}.`
        : `Trop de requêtes — réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.`;

    return new Response(
        JSON.stringify({
            error: customMessage || defaultMsg,
            retry_after_seconds: retryAfter,
        }),
        {
            status: 429,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
                'Retry-After':  String(retryAfter),
            },
        },
    );
}
