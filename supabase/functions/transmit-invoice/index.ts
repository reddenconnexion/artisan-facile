/**
 * Edge Function : transmit-invoice
 *
 * Transmet une facture ou un avoir vers une Plateforme Agréée (PA), ou
 * resynchronise le statut d'un document déjà transmis.
 *
 * Body :
 *   { quote_id, pdf_base64? }            → transmission (facture ou avoir émis)
 *   { quote_id, action: 'sync' }         → relit l'état chez B2BRouter et met à jour le statut
 *
 * Modes selon les variables d'environnement :
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
 *
 * Règle d'éligibilité (identique à src/utils/einvoiceEligibility.js) : document
 * émis (numéro légal), client professionnel identifié par un SIREN. Une vente
 * à un particulier n'est pas transmise (e-reporting).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enforceRateLimit, rateLimitResponse } from '../_shared/rate-limit.ts';
import {
  getB2BRouterConfig,
  getEInvoiceEligibility,
  buildIssuedDocumentBody,
  createIssuedDocument,
  extractInvoiceId,
  unwrapInvoice,
  describeApiError,
  fetchInvoice,
  sendInvoice,
  deleteInvoice,
  platformTotalMismatch,
  findIssuedInvoiceByNumber,
  normalizeTransmissionStatus,
  isUsableReference,
  type B2BRouterConfig,
} from '../_shared/b2brouter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const DOC_LABEL: Record<string, string> = { invoice: 'facture', credit_note: 'avoir' };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TransmitResult {
  success: boolean;
  reference?: string | null;
  error?: string;
  /** 'sent' (envoyé) ou 'pending' (créé chez B2BRouter, envoi à finaliser). */
  status?: 'sent' | 'pending';
  /** Avertissement non bloquant, affiché à l'artisan. */
  warning?: string;
}

// ---------------------------------------------------------------------------
// Adaptateur B2BRouter
// ---------------------------------------------------------------------------

async function transmitToB2BRouter(
  cfg: B2BRouterConfig,
  quote: Record<string, unknown>,
  client: Record<string, unknown> | null,
  profile: Record<string, unknown> | null,
  parentInvoiceNumber: string | null,
): Promise<TransmitResult> {
  const body = buildIssuedDocumentBody(quote, client, profile, { parentInvoiceNumber });
  const result = await createIssuedDocument(cfg, body);

  if (!result.ok) {
    return { success: false, error: describeApiError(result) };
  }

  // L'identifiant B2BRouter sert au rapprochement des webhooks de statut.
  // Sans lui, on retombe sur notre numéro légal (les webhooks le portent).
  let created = unwrapInvoice(result.data);
  let reference = extractInvoiceId(result.data);
  if (!reference) {
    console.warn(`[transmit-invoice] réponse B2BRouter sans id : ${result.raw.slice(0, 200)}`);
    const { invoice: found } = await findIssuedInvoiceByNumber(cfg, String((body.invoice as Record<string, unknown>).number));
    created = found;
    reference = found ? extractInvoiceId({ invoice: found }) : null;
  }
  if (!reference) {
    return { success: false, error: "B2BRouter n'a pas renvoyé d'identifiant pour le document créé : envoi annulé." };
  }

  // Contrôle du total recalculé par la plateforme avant tout envoi. En
  // avril, le compte a ajouté 20 % de TVA à une facture en franchise.
  const platformDoc = (created && created.total != null) ? created : await fetchInvoice(cfg, reference);
  const check = platformTotalMismatch(quote.total_ttc, platformDoc);
  if (check.mismatch) {
    const del = await deleteInvoice(cfg, reference);
    const deleted = del.ok ? 'Le document a été supprimé de B2BRouter.' : `Le document ${reference} reste chez B2BRouter : supprimez-le depuis leur interface.`;
    return {
      success: false,
      error: `B2BRouter a recalculé un total de ${check.platform?.toFixed(2)} € au lieu de ${check.expected?.toFixed(2)} € : la plateforme a ajouté ou retiré de la TVA. Vérifiez la configuration des taxes de votre compte B2BRouter (une taxe TVA à 0 %, catégorie E « exonéré », doit exister et servir par défaut). ${deleted}`,
    };
  }

  // Envoi explicite du document contrôlé.
  const sent = await sendInvoice(cfg, reference);
  if (!sent.ok) {
    console.warn(`[transmit-invoice] envoi B2BRouter refusé pour ${reference} : ${describeApiError(sent)}`);
    return {
      success: true,
      reference,
      status: 'pending',
      warning: `Document créé chez B2BRouter (réf. ${reference}) mais l'envoi automatique a échoué — ${describeApiError(sent)}. Envoyez-le depuis l'interface B2BRouter ou réessayez.`,
    };
  }
  return { success: true, reference, status: 'sent' };
}

interface SyncResult {
  reference: string | null;
  rawState: string | null;
  status: string | null;
  error?: string;
}

/**
 * Relit l'état du document chez B2BRouter (par référence, sinon par numéro).
 * Quand le document est introuvable, `accountTotal` dit si le compte contient
 * d'autres documents (dépôt jamais effectué) ou rien du tout (compte vide ou
 * mauvais compte).
 */
async function syncFromB2BRouter(
  cfg: B2BRouterConfig,
  quote: Record<string, unknown>,
): Promise<{ found: SyncResult | null; accountTotal: number | null }> {
  let inv: Record<string, unknown> | null = null;
  let accountTotal: number | null = null;
  const ref = quote.transmission_ref;
  if (isUsableReference(ref)) inv = await fetchInvoice(cfg, ref);
  if (!inv && quote.invoice_number) {
    const lookup = await findIssuedInvoiceByNumber(cfg, String(quote.invoice_number));
    inv = lookup.invoice;
    accountTotal = lookup.accountTotal;
  }
  if (!inv) return { found: null, accountTotal };

  const rawState = typeof inv.state === 'string' ? inv.state : null;
  const error = [inv.state_reason, inv.error, inv.errors, inv.message]
    .map((v) => (typeof v === 'string' ? v : (v && typeof v === 'object' ? JSON.stringify(v) : '')))
    .find((v) => v) || undefined;
  return {
    found: {
      reference: extractInvoiceId({ invoice: inv }),
      rawState,
      status: normalizeTransmissionStatus(rawState),
      error,
    },
    accountTotal,
  };
}

// ---------------------------------------------------------------------------
// Adaptateur générique PDP (fallback)
// ---------------------------------------------------------------------------

async function transmitToGenericPDP(
  pdfBase64: string,
  documentNumber: string,
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
  formData.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), `facture_${documentNumber}.pdf`);
  formData.append('metadata', JSON.stringify({ invoiceNumber: documentNumber, sellerSiret, buyerSiren, currency: 'EUR', format: 'FACTURX_EN16931' }));

  const response = await fetch(`${pdpUrl}/invoices`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pdpApiKey}`, Accept: 'application/json' },
    body: formData,
  });

  const body = await response.json().catch(() => ({ message: response.statusText }));

  if (!response.ok) {
    return { success: false, error: `HTTP ${response.status} — ${body?.message || body?.error || 'Erreur PDP'}` };
  }

  const ref = body?.id ?? body?.reference ?? body?.invoiceId ?? null;
  return { success: true, reference: ref != null ? String(ref) : null };
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Non autorisé' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: 'Non autorisé' }, 401);

    const { quote_id, pdf_base64, action } = await req.json().catch(() => ({}));
    if (!quote_id) return json({ error: 'Paramètre manquant : quote_id' }, 400);
    const isSync = action === 'sync';

    // Rate limit : 10 transmissions / heure, 30 resynchronisations / heure
    const rl = isSync
      ? await enforceRateLimit('transmit-invoice-sync', user.id, 30, 3600)
      : await enforceRateLimit('transmit-invoice', user.id, 10, 3600);
    if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // --- Document complet ---
    const { data: quote, error: quoteError } = await supabaseAdmin
      .from('quotes')
      .select('id, quote_number, invoice_number, type, is_external, parent_id, user_id, client_id, transmission_status, transmission_ref, date, valid_until, items, include_tva, vat_on_debits, total_ht, total_tva, total_ttc, title')
      .eq('id', quote_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (quoteError) {
      console.error('[transmit-invoice] Erreur DB:', JSON.stringify(quoteError));
      return json({ error: `Erreur base de données : ${quoteError.message}` }, 500);
    }
    if (!quote) {
      console.error(`[transmit-invoice] Document introuvable : quote_id=${quote_id} user_id=${user.id}`);
      return json({ error: 'Document introuvable' }, 404);
    }
    if (!DOC_LABEL[quote.type]) {
      return json({ error: 'Seules les factures et les avoirs peuvent être transmis' }, 400);
    }

    const cfg = getB2BRouterConfig();

    // --- Client ---
    const { data: client } = quote.client_id
      ? await supabaseAdmin.from('clients').select('name, type, siren, tva_intracom, address, postal_code, city, email').eq('id', quote.client_id).single()
      : { data: null };

    // ── Resynchronisation du statut ───────────────────────────────────────
    if (isSync) {
      if (!cfg) return json({ error: 'La resynchronisation n\'est disponible qu\'avec B2BRouter.' }, 422);
      const { found: synced, accountTotal } = await syncFromB2BRouter(cfg, quote as Record<string, unknown>);
      if (!synced) {
        const label = `${DOC_LABEL[quote.type] === 'avoir' ? "L'avoir" : 'La facture'} ${quote.invoice_number ?? ''}`.trim();
        const why = accountTotal === 0
          ? "le compte B2BRouter ne contient aucun document : le dépôt n'a jamais abouti."
          : accountTotal != null
            ? `elle ne figure pas parmi les ${accountTotal} document(s) du compte B2BRouter : le dépôt n'a jamais abouti.`
            : "elle est introuvable chez B2BRouter : le dépôt n'a probablement jamais abouti.";
        // Un « déposée » qui ne correspond à rien côté plateforme est trompeur :
        // on le retire pour que le document redevienne transmissible.
        await supabaseAdmin.from('quotes').update({
          transmission_status: null,
          transmission_ref: null,
          transmission_error: null,
        }).eq('id', quote_id);
        return json({ error: `${label} : ${why} Son statut de transmission a été remis à zéro.`, status: null, reset: true }, 404);
      }
      const update: Record<string, unknown> = {
        transmission_service: 'b2brouter',
        ...(synced.reference ? { transmission_ref: synced.reference } : {}),
      };
      if (synced.status) {
        update.transmission_status = synced.status;
        update.transmission_error = synced.status === 'rejected' ? (synced.error ?? `Rejetée (état B2BRouter : ${synced.rawState})`) : null;
      }
      await supabaseAdmin.from('quotes').update(update).eq('id', quote_id);
      console.log(`[transmit-invoice] sync quote=${quote_id} ref=${synced.reference ?? '-'} state=${synced.rawState} → ${synced.status ?? 'inchangé'}`);
      return json({
        success: true,
        reference: synced.reference,
        status: synced.status ?? quote.transmission_status,
        raw_state: synced.rawState,
        error: update.transmission_error ?? null,
      });
    }

    // ── Transmission ──────────────────────────────────────────────────────
    const eligibility = getEInvoiceEligibility(quote as Record<string, unknown>, client as Record<string, unknown> | null);
    if (!eligibility.eligible) {
      return json({ error: eligibility.message, reason: eligibility.reason }, 400);
    }

    // --- Profil vendeur ---
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('siret, company_name, full_name, iban, pdp_config')
      .eq('id', user.id)
      .single();

    // --- Facture rectifiée (pour un avoir) ---
    let parentInvoiceNumber: string | null = null;
    if (quote.type === 'credit_note' && quote.parent_id) {
      const { data: parent } = await supabaseAdmin.from('quotes').select('invoice_number').eq('id', quote.parent_id).maybeSingle();
      parentInvoiceNumber = parent?.invoice_number ?? null;
    }

    // --- Marquer "sending" ---
    await supabaseAdmin.from('quotes').update({ transmission_status: 'sending' }).eq('id', quote_id);

    // --- Choisir l'adaptateur ---
    const userPdpConfig = (profile as Record<string, unknown> | null)?.pdp_config as { pdp_url?: string; pdp_key?: string; pdp_service?: string } | null;
    const pdpServiceName = cfg
      ? 'b2brouter'
      : (userPdpConfig?.pdp_service || Deno.env.get('PDP_SERVICE_NAME') || 'pdp');

    let result: TransmitResult;

    if (cfg) {
      result = await transmitToB2BRouter(
        cfg,
        quote as Record<string, unknown>,
        client as Record<string, unknown> | null,
        profile as Record<string, unknown> | null,
        parentInvoiceNumber,
      );
    } else {
      if (!pdf_base64) {
        await supabaseAdmin.from('quotes').update({ transmission_status: quote.transmission_status ?? null }).eq('id', quote_id);
        return json({ error: 'pdf_base64 requis en mode PDP générique' }, 400);
      }
      result = await transmitToGenericPDP(
        pdf_base64,
        String(quote.invoice_number),
        profile?.siret ?? '',
        (client as Record<string, unknown> | null)?.siren as string ?? '',
        userPdpConfig,
      );
    }

    // --- Mise à jour statut ---
    const finalStatus = result.success ? (result.status ?? 'sent') : 'rejected';
    const updatePayload = result.success
      ? { transmission_status: finalStatus, transmission_service: pdpServiceName, transmission_ref: result.reference ?? null, transmitted_at: new Date().toISOString(), transmission_error: result.warning ?? null }
      : { transmission_status: 'rejected', transmission_service: pdpServiceName, transmission_ref: null, transmission_error: result.error ?? 'Erreur inconnue', transmitted_at: new Date().toISOString() };

    await supabaseAdmin.from('quotes').update(updatePayload).eq('id', quote_id);

    console.log(`[transmit-invoice] quote=${quote_id} type=${quote.type} mode=${cfg ? 'b2brouter' : 'generic'} status=${updatePayload.transmission_status} ref=${result.reference ?? '-'}`);

    if (!result.success) return json({ error: result.error }, 422);

    return json({ success: true, reference: result.reference ?? null, status: finalStatus, warning: result.warning ?? null });

  } catch (err) {
    console.error('[transmit-invoice] Erreur inattendue:', err);
    return json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, 500);
  }
});
