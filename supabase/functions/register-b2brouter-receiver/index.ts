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
import { corsPreflight, json, requireUser } from '../_shared/http.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflight();

  try {
    // --- Auth ---
    const auth = await requireUser(req, { message: 'Session invalide' });
    if (auth.response) return auth.response;
    const { user } = auth;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // --- Récupérer le profil artisan ---
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('siret, company_name, full_name, b2b_receiver_status')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return json({ error: 'Profil introuvable' }, 404);
    }

    const siret = (profile.siret || '').replace(/\s/g, '');
    if (siret.length < 9) {
      return json({ error: 'SIRET invalide : au moins 9 chiffres requis', skipped: true }, 400);
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
      return json({ success: false, error: 'B2BRouter non configuré côté serveur', skipped: true });
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

      return json({ success: true, siren, reference: data?.id ?? null });
    }

    // Erreur B2BRouter
    const errorMsg = typeof data === 'object'
      ? String(data?.message || data?.error || data?.errors || rawText).slice(0, 300)
      : rawText.slice(0, 300);

    await supabaseAdmin
      .from('profiles')
      .update({ b2b_receiver_status: 'error', b2b_receiver_error: errorMsg })
      .eq('id', user.id);

    return json({ success: false, error: errorMsg });

  } catch (err) {
    console.error('[register-receiver] Exception:', err);
    return json({ success: false, error: String(err) }, 500);
  }
});
