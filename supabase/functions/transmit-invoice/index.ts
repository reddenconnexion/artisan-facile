/**
 * Edge Function : transmit-invoice
 *
 * Transmet une facture Factur-X (PDF + XML embarqué) vers une PDP ou le PPF.
 *
 * Flux :
 *  1. Reçoit le PDF Factur-X en base64 + quote_id depuis le navigateur
 *  2. Récupère les métadonnées de la facture (profil, client)
 *  3. Appelle l'API de la PDP/PPF configurée
 *  4. Met à jour le champ transmission_status dans la table quotes
 *
 * Variables d'environnement à configurer :
 *  - PDP_API_URL         : URL de base de la PDP (ex: https://api.ma-pdp.fr/v1)
 *  - PDP_API_KEY         : Clé API / bearer token de la PDP
 *  - PDP_SERVICE_NAME    : Nom de la PDP (ex: "chorus_pro", "yooz", "pennylane")
 *  - PDP_SENDER_SIRET    : SIRET de l'opérateur plateforme (si requis par la PDP)
 *
 * Pour Chorus Pro (PPF), ces variables correspondent à :
 *  - PDP_API_URL         : https://piste.gouv.fr/chorus-pro/api/v1   (production)
 *                          https://sandbox-piste.gouv.fr/chorus-pro/api/v1  (sandbox)
 *  - PDP_API_KEY         : Token OAuth2 PISTE (client_credentials)
 *  - PDP_SERVICE_NAME    : "chorus_pro"
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------------------------------------------------------------------------
// PDP / PPF Adapter
// ---------------------------------------------------------------------------

interface TransmitResult {
  success: boolean;
  reference?: string;
  error?: string;
  rawResponse?: unknown;
}

/**
 * Adaptateur générique PDP / PPF.
 *
 * Le corps de la requête suit la spécification Factur-X REST
 * (profil adopté par la majorité des PDP françaises certifiées) :
 *
 *   POST {PDP_API_URL}/invoices
 *   Content-Type: multipart/form-data
 *     - file    : PDF Factur-X (binary)
 *     - metadata: JSON avec les identifiants vendeur/acheteur
 *
 * Si la PDP nécessite un format différent, remplacer uniquement
 * la fonction buildRequestBody() sans toucher au reste.
 */
async function transmitToPDP(
  pdfBase64: string,
  quoteNumber: string,
  sellerSiret: string,
  buyerSiren: string,
): Promise<TransmitResult> {
  const pdpUrl = Deno.env.get('PDP_API_URL');
  const pdpApiKey = Deno.env.get('PDP_API_KEY');

  if (!pdpUrl || !pdpApiKey) {
    return {
      success: false,
      error: 'PDP non configurée : variables PDP_API_URL et PDP_API_KEY manquantes.',
    };
  }

  // Conversion base64 → Uint8Array
  const pdfBytes = Uint8Array.from(atob(pdfBase64.replace(/^data:[^;]+;base64,/, '')), (c) =>
    c.charCodeAt(0),
  );

  // Construction du body multipart
  const formData = new FormData();
  formData.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), `facture_${quoteNumber}.pdf`);
  formData.append(
    'metadata',
    JSON.stringify({
      invoiceNumber: quoteNumber,
      sellerSiret,
      buyerSiren: buyerSiren || null,
      currency: 'EUR',
      format: 'FACTURX_EN16931',
    }),
  );

  const response = await fetch(`${pdpUrl}/invoices`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pdpApiKey}`,
      Accept: 'application/json',
    },
    body: formData,
  });

  const body = await response.json().catch(() => ({ message: response.statusText }));

  if (!response.ok) {
    return {
      success: false,
      error: `HTTP ${response.status} — ${body?.message || body?.error || 'Erreur PDP'}`,
      rawResponse: body,
    };
  }

  return {
    success: true,
    // La plupart des PDP retournent un identifiant de dépôt
    reference: body?.id || body?.reference || body?.invoiceId || body?.depositId || null,
    rawResponse: body,
  };
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // --- Auth ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // --- Lecture du body ---
    const { quote_id, pdf_base64 } = await req.json();

    if (!quote_id || !pdf_base64) {
      return new Response(JSON.stringify({ error: 'Paramètres manquants : quote_id, pdf_base64' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Récupération de la facture ---
    const { data: quote, error: quoteError } = await supabaseAdmin
      .from('quotes')
      .select('id, quote_number, type, user_id, client_id, transmission_status')
      .eq('id', quote_id)
      .eq('user_id', user.id)
      .single();

    if (quoteError || !quote) {
      return new Response(JSON.stringify({ error: 'Facture introuvable' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (quote.type !== 'invoice') {
      return new Response(JSON.stringify({ error: 'Seules les factures peuvent être transmises (pas les devis)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Récupération du profil vendeur ---
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('siret, company_name, full_name')
      .eq('id', user.id)
      .single();

    // --- Récupération du client ---
    const { data: client } = quote.client_id
      ? await supabaseAdmin.from('clients').select('siren, name').eq('id', quote.client_id).single()
      : { data: null };

    const sellerSiret = profile?.siret ?? '';
    const buyerSiren = client?.siren ?? '';
    const quoteNumber = quote.quote_number?.toString() ?? quote_id.toString();

    // --- Marquer comme "sending" ---
    await supabaseAdmin
      .from('quotes')
      .update({ transmission_status: 'sending' })
      .eq('id', quote_id);

    // --- Transmission ---
    const pdpServiceName = Deno.env.get('PDP_SERVICE_NAME') || 'pdp';
    const result = await transmitToPDP(pdf_base64, quoteNumber, sellerSiret, buyerSiren);

    // --- Mise à jour du statut ---
    const updatePayload = result.success
      ? {
          transmission_status: 'sent',
          transmission_service: pdpServiceName,
          transmission_ref: result.reference ?? null,
          transmitted_at: new Date().toISOString(),
          transmission_error: null,
        }
      : {
          transmission_status: 'rejected',
          transmission_service: pdpServiceName,
          transmission_error: result.error ?? 'Erreur inconnue',
          transmitted_at: new Date().toISOString(),
        };

    await supabaseAdmin.from('quotes').update(updatePayload).eq('id', quote_id);

    console.log(
      `[transmit-invoice] quote=${quote_id} status=${updatePayload.transmission_status} ref=${result.reference ?? '-'}`,
    );

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error, details: result.rawResponse }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        reference: result.reference,
        status: 'sent',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[transmit-invoice] Erreur inattendue:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Erreur serveur' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
