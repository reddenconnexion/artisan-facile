/**
 * Edge Function : transmit-invoice
 *
 * Transmet une facture vers une Plateforme Agréée (PA).
 * Supporte deux modes selon les variables d'environnement configurées :
 *
 *   Mode B2BRouter (recommandé) :
 *     B2BROUTER_API_KEY    : clé API B2BRouter (App → Developers → API key)
 *     B2BROUTER_ACCOUNT_ID : identifiant numérique du compte (App → Developers → View IDs)
 *     B2BROUTER_SANDBOX    : "true" pour utiliser api-staging.b2brouter.net (optionnel)
 *
 *   Mode générique PDP (fallback) :
 *     PDP_API_URL  : URL de base de la PDP
 *     PDP_API_KEY  : Bearer token
 *     PDP_SERVICE_NAME : nom de la PDP
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TransmitResult {
  success: boolean;
  reference?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Adaptateur B2BRouter
// ---------------------------------------------------------------------------

const vatCategory = (rate: number, includeTva: boolean): string => {
  if (!includeTva) return 'E';
  if (rate === 0) return 'Z';
  if (rate === 20) return 'S';
  return 'AA'; // 5.5%, 10%
};

const formatDate = (d: string | null | undefined): string => {
  if (!d) return new Date().toISOString().slice(0, 10);
  return new Date(d).toISOString().slice(0, 10);
};

async function transmitToB2BRouter(
  quote: Record<string, unknown>,
  client: Record<string, unknown> | null,
  profile: Record<string, unknown> | null,
): Promise<TransmitResult> {
  const apiKey = Deno.env.get('B2BROUTER_API_KEY');
  const accountId = Deno.env.get('B2BROUTER_ACCOUNT_ID');
  const sandbox = Deno.env.get('B2BROUTER_SANDBOX') === 'true';

  if (!apiKey || !accountId) {
    return { success: false, error: 'B2BRouter non configuré : renseignez B2BROUTER_API_KEY et B2BROUTER_ACCOUNT_ID dans les secrets Supabase.' };
  }

  const base = sandbox
    ? 'https://api-staging.b2brouter.net'
    : 'https://api.b2brouter.net';

  const includeTva = quote.include_tva !== false;
  const items = Array.isArray(quote.items) ? quote.items : [];

  // Date d'échéance : valid_until ou +30 jours
  const dueDate = quote.valid_until
    ? formatDate(quote.valid_until as string)
    : formatDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());

  // Lignes de facturation
  const invoiceLines = items.length > 0
    ? items.map((item: Record<string, unknown>, i: number) => {
        const rate = item.tva_rate != null ? Number(item.tva_rate) : (includeTva ? 20 : 0);
        return {
          description: (item.description as string) || `Ligne ${i + 1}`,
          quantity: Number(item.quantity) || 1,
          unit: 1,
          price: Number(item.price) || 0,
          taxes_attributes: [{
            name: 'TVA',
            category: vatCategory(rate, includeTva),
            percent: rate,
          }],
        };
      })
    : [{
        // Ligne synthétique si pas de détail (ne devrait pas arriver en prod)
        description: (quote.title as string) || 'Prestation',
        quantity: 1,
        unit: 1,
        price: Number(quote.total_ht) || 0,
        taxes_attributes: [{
          name: 'TVA',
          category: includeTva ? 'S' : 'E',
          percent: includeTva ? 20 : 0,
        }],
      }];

  // Acheteur : on utilise SIREN (0002) si dispo, sinon pas d'identifiant fiscal
  const contact: Record<string, unknown> = {
    name: (client?.name as string) || 'Client',
    address: (client?.address as string) || '',
    postalcode: (client?.postal_code as string) || '',
    city: (client?.city as string) || '',
    country: 'fr',
    transport_type_code: 'fr.dgfip', // B2B secteur privé DGFiP
  };
  if (client?.siren) {
    contact.cin_scheme = '0002'; // SIREN 9 chiffres
    contact.cin_value = client.siren as string;
  }
  if (client?.tva_intracom) {
    contact.tin_value = client.tva_intracom as string;
  }
  if (client?.email) {
    contact.email = client.email as string;
  }

  const body = {
    send_after_import: true,
    invoice: {
      type: 'IssuedInvoice',
      number: String(quote.quote_number || quote.id),
      date: formatDate(quote.date as string),
      due_date: dueDate,
      currency: 'EUR',
      ...(profile?.iban ? { payment_method: 58, iban: profile.iban } : {}),
      contact,
      invoice_lines_attributes: invoiceLines,
    },
  };

  const res = await fetch(`${base}/accounts/${accountId}/invoices`, {
    method: 'POST',
    headers: {
      'X-B2B-API-Key': apiKey,
      'X-B2B-API-Version': '2025-01-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({ message: res.statusText }));

  if (!res.ok) {
    return {
      success: false,
      error: `B2BRouter HTTP ${res.status} — ${data?.message || data?.error || JSON.stringify(data)}`,
    };
  }

  return {
    success: true,
    reference: String(data.id), // ID numérique B2BRouter → utilisé pour suivi webhook
  };
}

// ---------------------------------------------------------------------------
// Adaptateur générique PDP (fallback)
// ---------------------------------------------------------------------------

async function transmitToGenericPDP(
  pdfBase64: string,
  quoteNumber: string,
  sellerSiret: string,
  buyerSiren: string,
  userPdpConfig?: { pdp_url?: string; pdp_key?: string; pdp_service?: string } | null,
): Promise<TransmitResult> {
  const pdpUrl = userPdpConfig?.pdp_url || Deno.env.get('PDP_API_URL');
  const pdpApiKey = userPdpConfig?.pdp_key || Deno.env.get('PDP_API_KEY');

  if (!pdpUrl || !pdpApiKey) {
    return { success: false, error: 'Aucune Plateforme Agréée configurée. Renseignez vos identifiants dans les paramètres du profil.' };
  }

  const pdfBytes = Uint8Array.from(atob(pdfBase64.replace(/^data:[^;]+;base64,/, '')), (c) => c.charCodeAt(0));
  const formData = new FormData();
  formData.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), `facture_${quoteNumber}.pdf`);
  formData.append('metadata', JSON.stringify({ invoiceNumber: quoteNumber, sellerSiret, buyerSiren, currency: 'EUR', format: 'FACTURX_EN16931' }));

  const response = await fetch(`${pdpUrl}/invoices`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pdpApiKey}`, Accept: 'application/json' },
    body: formData,
  });

  const body = await response.json().catch(() => ({ message: response.statusText }));

  if (!response.ok) {
    return { success: false, error: `HTTP ${response.status} — ${body?.message || body?.error || 'Erreur PDP'}` };
  }

  return { success: true, reference: body?.id || body?.reference || body?.invoiceId || null };
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { quote_id, pdf_base64 } = await req.json();
    if (!quote_id) {
      return new Response(JSON.stringify({ error: 'Paramètre manquant : quote_id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- Récupération de la facture complète ---
    const { data: quote, error: quoteError } = await supabaseAdmin
      .from('quotes')
      .select('id, quote_number, type, user_id, client_id, transmission_status, date, valid_until, items, include_tva, total_ht, total_tva, total_ttc, title')
      .eq('id', quote_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (quoteError) {
      console.error('[transmit-invoice] Erreur DB:', JSON.stringify(quoteError));
      return new Response(JSON.stringify({ error: `Erreur base de données : ${quoteError.message}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!quote) {
      console.error(`[transmit-invoice] Facture introuvable : quote_id=${quote_id} user_id=${user.id}`);
      return new Response(JSON.stringify({ error: 'Facture introuvable' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (quote.type !== 'invoice') {
      return new Response(JSON.stringify({ error: 'Seules les factures peuvent être transmises' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- Profil vendeur ---
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('siret, company_name, full_name, iban, pdp_config')
      .eq('id', user.id)
      .single();

    // --- Client ---
    const { data: client } = quote.client_id
      ? await supabaseAdmin.from('clients').select('name, siren, tva_intracom, address, postal_code, city, email').eq('id', quote.client_id).single()
      : { data: null };

    // --- Marquer "sending" ---
    await supabaseAdmin.from('quotes').update({ transmission_status: 'sending' }).eq('id', quote_id);

    // --- Choisir l'adaptateur ---
    const useB2BRouter = !!Deno.env.get('B2BROUTER_API_KEY');
    const userPdpConfig = (profile as Record<string, unknown> | null)?.pdp_config as { pdp_url?: string; pdp_key?: string; pdp_service?: string } | null;
    const pdpServiceName = useB2BRouter
      ? 'b2brouter'
      : (userPdpConfig?.pdp_service || Deno.env.get('PDP_SERVICE_NAME') || 'pdp');

    let result: TransmitResult;

    if (useB2BRouter) {
      result = await transmitToB2BRouter(
        quote as Record<string, unknown>,
        client as Record<string, unknown> | null,
        profile as Record<string, unknown> | null,
      );
    } else {
      if (!pdf_base64) {
        return new Response(JSON.stringify({ error: 'pdf_base64 requis en mode PDP générique' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      result = await transmitToGenericPDP(
        pdf_base64,
        String(quote.quote_number || quote.id),
        profile?.siret ?? '',
        (client as Record<string, unknown> | null)?.siren as string ?? '',
        userPdpConfig,
      );
    }

    // --- Mise à jour statut ---
    const updatePayload = result.success
      ? { transmission_status: 'sent', transmission_service: pdpServiceName, transmission_ref: result.reference ?? null, transmitted_at: new Date().toISOString(), transmission_error: null }
      : { transmission_status: 'rejected', transmission_service: pdpServiceName, transmission_error: result.error ?? 'Erreur inconnue', transmitted_at: new Date().toISOString() };

    await supabaseAdmin.from('quotes').update(updatePayload).eq('id', quote_id);

    console.log(`[transmit-invoice] quote=${quote_id} mode=${useB2BRouter ? 'b2brouter' : 'generic'} status=${updatePayload.transmission_status} ref=${result.reference ?? '-'}`);

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, reference: result.reference, status: 'sent' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[transmit-invoice] Erreur inattendue:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Erreur serveur' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
