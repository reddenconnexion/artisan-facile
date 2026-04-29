/**
 * Edge Function : register-b2brouter-receiver
 *
 * Enregistre le SIREN d'un artisan dans l'annuaire DGFIP via B2BRouter.
 * Appelée automatiquement quand un artisan sauvegarde son SIRET dans son profil.
 *
 * Mécanisme :
 *   POST /accounts/{accountId}/tax_report_settings  { code: "dgfip", siren, start_date }
 *   → B2BRouter enregistre le SIREN dans le PPF/Annuaire (propagation ~24h)
 *   → Active la réception Peppol 0225 : les fournisseurs peuvent désormais trouver
 *     Artisan Facile comme PA de cet artisan et lui envoyer des factures e-invoicing.
 *
 * Variables d'environnement requises (Supabase Secrets) :
 *   B2BROUTER_API_KEY     — clé API B2BRouter
 *   B2BROUTER_ACCOUNT_ID  — identifiant numérique du compte B2BRouter
 *   B2BROUTER_SANDBOX     — "true" pour utiliser api-staging.b2brouter.net (optionnel)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // --- Auth ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Session invalide' }), { status: 401, headers: corsHeaders });
    }

    // --- Récupérer le profil artisan ---
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('siret, company_name, full_name, b2b_receiver_status')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Profil introuvable' }), { status: 404, headers: corsHeaders });
    }

    const siret = (profile.siret || '').replace(/\s/g, '');
    if (siret.length < 9) {
      return new Response(
        JSON.stringify({ error: 'SIRET invalide : au moins 9 chiffres requis', skipped: true }),
        { status: 400, headers: corsHeaders },
      );
    }

    // Le SIREN est les 9 premiers chiffres du SIRET
    const siren = siret.slice(0, 9);

    // --- Config B2BRouter ---
    const apiKey = Deno.env.get('B2BROUTER_API_KEY');
    const accountId = Deno.env.get('B2BROUTER_ACCOUNT_ID');
    const sandbox = Deno.env.get('B2BROUTER_SANDBOX') === 'true';

    if (!apiKey || !accountId) {
      // B2BRouter non configuré — on logue mais on ne bloque pas l'artisan
      console.warn('[register-receiver] B2BRouter non configuré, enregistrement ignoré');
      return new Response(
        JSON.stringify({ success: false, error: 'B2BRouter non configuré côté serveur', skipped: true }),
        { status: 200, headers: corsHeaders },
      );
    }

    const base = sandbox
      ? 'https://api-staging.b2brouter.net'
      : 'https://api.b2brouter.net';

    // --- Appel B2BRouter : créer le Tax Report Setting DGFIP ---
    // Cela enregistre le SIREN dans l'annuaire PPF (~24h de propagation)
    const url = `${base}/accounts/${accountId}/tax_report_settings`;
    const body = {
      tax_report_setting: {
        code: 'dgfip',
        siren,
        // La réception est obligatoire dès sept. 2026 ; on utilise cette date comme start_date
        start_date: '2026-09-01',
        company_name: profile.company_name || profile.full_name || '',
      },
    };

    console.log(`[register-receiver] POST ${url} | siren=${siren} | sandbox=${sandbox}`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-B2B-API-Key': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'X-B2B-API-Version': '2026-03-02',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const rawText = await res.text();
    console.log(`[register-receiver] response ${res.status} | ${rawText.slice(0, 400)}`);

    let data: Record<string, unknown> = {};
    try { data = JSON.parse(rawText); } catch { /* rawText n'est pas du JSON */ }

    // 201 = créé, 200 = déjà existant (idempotent), 422 avec "already taken/registered" = OK
    const alreadyRegistered =
      res.status === 422 &&
      rawText.toLowerCase().includes('already');

    if (res.ok || alreadyRegistered) {
      await supabaseAdmin
        .from('profiles')
        .update({
          b2b_receiver_status: 'registered',
          b2b_receiver_registered_at: new Date().toISOString(),
          b2b_receiver_error: null,
        })
        .eq('id', user.id);

      return new Response(
        JSON.stringify({ success: true, siren, reference: data?.id ?? null }),
        { status: 200, headers: corsHeaders },
      );
    }

    // Erreur B2BRouter
    const errorMsg = typeof data === 'object'
      ? String(data?.message || data?.error || data?.errors || rawText).slice(0, 300)
      : rawText.slice(0, 300);

    await supabaseAdmin
      .from('profiles')
      .update({ b2b_receiver_status: 'error', b2b_receiver_error: errorMsg })
      .eq('id', user.id);

    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 200, headers: corsHeaders },
    );

  } catch (err) {
    console.error('[register-receiver] Exception:', err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: corsHeaders },
    );
  }
});
