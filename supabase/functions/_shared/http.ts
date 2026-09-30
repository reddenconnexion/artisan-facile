// Briques HTTP partagées par les Edge Functions : CORS, réponses JSON et
// authentification de l'utilisateur appelant.
//
// Usage typique dans une Edge Function :
//
//   import { corsPreflight, json, requireUser } from '../_shared/http.ts';
//
//   Deno.serve(async (req) => {
//     if (req.method === 'OPTIONS') return corsPreflight();
//
//     const auth = await requireUser(req);
//     if (auth.response) return auth.response;
//     const { user, supabase } = auth;
//     ...
//     return json({ ok: true });
//   });

import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

export type HeaderMap = Record<string, string>;

export const corsHeaders: HeaderMap = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** En-têtes CORS avec des en-têtes autorisés en plus (ex: `x-cron-secret`). */
export function corsHeadersWith(...extraAllowedHeaders: string[]): HeaderMap {
    return {
        ...corsHeaders,
        'Access-Control-Allow-Headers': [corsHeaders['Access-Control-Allow-Headers'], ...extraAllowedHeaders].join(', '),
    };
}

/** Réponse à la requête préliminaire CORS (OPTIONS). */
export function corsPreflight(headers: HeaderMap = corsHeaders): Response {
    return new Response('ok', { headers });
}

/** Réponse JSON avec les en-têtes CORS. */
export function json(body: unknown, status = 200, headers: HeaderMap = corsHeaders): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json' },
    });
}

/** Client Supabase agissant avec les droits de l'utilisateur (RLS appliquée). */
export function createUserClient(authHeader: string): SupabaseClient {
    return createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } },
    );
}

export type AuthResult =
    | { user: User; supabase: SupabaseClient; response?: undefined }
    | { response: Response; user?: undefined; supabase?: undefined };

export interface RequireUserOptions {
    /** Message d'erreur renvoyé en 401 (défaut : « Non autorisé »). */
    message?: string;
    /** En-têtes CORS de la réponse d'erreur. */
    headers?: HeaderMap;
}

/**
 * Vérifie le JWT de l'en-tête `Authorization`. Renvoie l'utilisateur et un
 * client Supabase à ses droits, ou une réponse 401 prête à être renvoyée.
 */
export async function requireUser(req: Request, options: RequireUserOptions = {}): Promise<AuthResult> {
    const { message = 'Non autorisé', headers = corsHeaders } = options;
    const unauthorized = () => ({ response: json({ error: message }, 401, headers) });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return unauthorized();

    const supabase = createUserClient(authHeader);
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return unauthorized();

    return { user, supabase };
}
