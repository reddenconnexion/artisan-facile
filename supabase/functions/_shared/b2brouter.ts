/**
 * Client B2BRouter partagé par les Edge Functions e-facture
 * (transmit-invoice, pdp-webhook, received-invoice-action).
 *
 * Tout ce qui touche à l'API B2BRouter passe par ici : URL de base, en-têtes,
 * chemins des endpoints, lecture des réponses et mapping des états. Si un
 * chemin diffère de la documentation B2BRouter, il n'y a qu'un endroit à
 * corriger.
 *
 * Les fonctions pures (sans réseau ni Deno) sont testées depuis le front
 * (src/utils/b2brouterShared.test.js) : elles ne doivent importer aucun module
 * Deno et ne lire l'environnement qu'à travers `getB2BRouterConfig`.
 */

export interface B2BRouterConfig {
  apiKey: string;
  accountId: string;
  base: string;
  sandbox: boolean;
}

export const B2BROUTER_API_VERSION = '2026-03-02';

/** Types de document B2BRouter pour nos documents émis. */
export const B2BROUTER_DOCUMENT_TYPES: Record<string, string> = {
  invoice: 'IssuedInvoice',
  credit_note: 'IssuedCreditNote',
};

/**
 * Actions de cycle de vie sur une facture reçue (segment de chemin après
 * /invoices/{id}/). Côté DGFiP : ack = prise en charge, accept = approuvée,
 * refuse = refusée (motif obligatoire), paid = encaissée.
 */
export const LIFECYCLE_ACTIONS = ['ack', 'accept', 'refuse', 'paid'] as const;
export type LifecycleAction = (typeof LIFECYCLE_ACTIONS)[number];

type EnvReader = (key: string) => string | undefined;

const defaultEnv: EnvReader = (key) => {
  // deno-lint-ignore no-explicit-any
  const d = (globalThis as any).Deno;
  return d?.env?.get?.(key);
};

export function getB2BRouterConfig(env: EnvReader = defaultEnv): B2BRouterConfig | null {
  const apiKey = env('B2BROUTER_API_KEY');
  const accountId = env('B2BROUTER_ACCOUNT_ID');
  if (!apiKey || !accountId) return null;
  const sandbox = env('B2BROUTER_SANDBOX') === 'true';
  return {
    apiKey,
    accountId,
    sandbox,
    base: sandbox ? 'https://api-staging.b2brouter.net' : 'https://api.b2brouter.net',
  };
}

export function b2bHeaders(apiKey: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    'X-B2B-API-Key': apiKey,
    'Authorization': `Bearer ${apiKey}`,
    'X-B2B-API-Version': B2BROUTER_API_VERSION,
    'Accept': 'application/json',
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Lecture des réponses
// ---------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * B2BRouter enveloppe ses réponses (`{ invoice: {...} }`), mais certains
 * webhooks livrent l'objet à plat. On accepte les deux.
 */
export function unwrapInvoice(data: unknown): Record<string, unknown> | null {
  if (!isRecord(data)) return null;
  if (isRecord(data.invoice)) return data.invoice;
  if ('id' in data || 'number' in data || 'state' in data) return data;
  return null;
}

/**
 * Identifiant B2BRouter d'une facture, sous forme de chaîne, ou null.
 * Ne renvoie jamais "undefined"/"null" : c'est exactement le bug qui a laissé
 * la première facture transmise sans référence exploitable par le webhook.
 */
export function extractInvoiceId(data: unknown): string | null {
  const inv = unwrapInvoice(data);
  const raw = inv?.id;
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return null;
    return trimmed;
  }
  return null;
}

/** Une référence stockée est exploitable si elle n'est ni vide ni un "undefined" sérialisé. */
export function isUsableReference(ref: unknown): ref is string {
  return typeof ref === 'string' && ref.trim() !== '' && ref !== 'undefined' && ref !== 'null';
}

// ---------------------------------------------------------------------------
// Statuts : chaque PA a ses codes ; on les ramène à sent | acknowledged | rejected
// ---------------------------------------------------------------------------

export const STATUS_MAP: Record<string, string> = {
  // Créé chez B2BRouter mais pas encore envoyé (brouillon côté plateforme) :
  // c'est l'état du document d'avril, resté en `new` faute de destinataire
  // routable. L'afficher « déposée » serait faux.
  NEW: 'pending',
  DRAFT: 'pending',

  // Reçu / en traitement
  RECEIVED: 'sent',
  DEPOSITED: 'sent',
  PROCESSING: 'sent',
  SENDING: 'sent',
  EN_COURS: 'sent',
  RECU: 'sent',
  SENT: 'sent',        // B2BRouter : envoyé à la PA destinataire

  // Accusé de réception / validé
  ACKNOWLEDGED: 'acknowledged',
  VALIDATED: 'acknowledged',
  ACCEPTED: 'acknowledged',
  INTEGRE: 'acknowledged',
  VALIDE: 'acknowledged',
  TRAITE: 'acknowledged',
  CHORUS_INTEGRE: 'acknowledged',
  DELIVERED: 'acknowledged',    // B2BRouter : livré au destinataire
  REGISTERED: 'acknowledged',   // B2BRouter : enregistré côté acheteur
  APPROVED: 'acknowledged',
  PAID: 'acknowledged',
  CLOSED: 'acknowledged',

  // Rejeté / erreur
  REJECTED: 'rejected',
  REFUSED: 'rejected',
  ERROR: 'rejected',
  INVALID: 'rejected',
  DISCARDED: 'rejected',
  REJETE: 'rejected',
  REFUSE: 'rejected',
  ERREUR: 'rejected',
};

export function normalizeTransmissionStatus(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  return STATUS_MAP[raw.toUpperCase().replace(/[-\s]/g, '_')] ?? null;
}

// ---------------------------------------------------------------------------
// Éligibilité e-facture (miroir de src/utils/einvoiceEligibility.js)
// ---------------------------------------------------------------------------

export const normalizeSiren = (v: unknown): string => String(v ?? '').replace(/\D/g, '');
export const isValidSiren = (v: unknown): boolean => /^\d{9}$/.test(normalizeSiren(v));

export interface Eligibility {
  eligible: boolean;
  reason: string | null;
  message: string | null;
}

/**
 * La facturation électronique ne concerne que les documents émis (numérotés)
 * entre assujettis établis en France : il faut un client professionnel
 * identifié par son SIREN. Les ventes aux particuliers relèveront du
 * e-reporting, pas de la transmission de facture.
 */
export function getEInvoiceEligibility(
  doc: Record<string, unknown> | null | undefined,
  client: Record<string, unknown> | null | undefined,
): Eligibility {
  if (!doc || !['invoice', 'credit_note'].includes(String(doc.type))) {
    return { eligible: false, reason: 'not_document', message: 'Seules les factures et les avoirs se transmettent.' };
  }
  if (doc.is_external) {
    return { eligible: false, reason: 'external', message: "Document importé d'un autre outil : transmettez-le depuis cet outil." };
  }
  if (!doc.invoice_number) {
    return { eligible: false, reason: 'not_issued', message: "Émettez d'abord le document (attribution du numéro légal) avant de le transmettre." };
  }
  if (!client) {
    return { eligible: false, reason: 'no_client', message: 'Aucun client rattaché à ce document.' };
  }
  if (client.type === 'individual') {
    return { eligible: false, reason: 'individual', message: "Client particulier : la facture électronique ne s'échange qu'entre professionnels. Cette vente relèvera du e-reporting, pas de la transmission." };
  }
  if (!isValidSiren(client.siren)) {
    return { eligible: false, reason: 'no_siren', message: 'Renseignez le SIREN (9 chiffres) de ce client professionnel dans sa fiche pour pouvoir transmettre.' };
  }
  return { eligible: true, reason: null, message: null };
}

// ---------------------------------------------------------------------------
// Construction du document émis (facture ou avoir)
// ---------------------------------------------------------------------------

export const vatCategory = (rate: number, includeTva: boolean): string => {
  if (!includeTva) return 'E';
  if (rate === 0) return 'Z';
  if (rate === 20) return 'S';
  return 'AA'; // 5.5 %, 10 %
};

export const isoDate = (d: unknown): string => {
  if (typeof d !== 'string' || !d) return new Date().toISOString().slice(0, 10);
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString().slice(0, 10)
    : parsed.toISOString().slice(0, 10);
};

export interface IssuedDocumentOptions {
  /** Numéro de la facture rectifiée, pour un avoir. */
  parentInvoiceNumber?: string | null;
}

/**
 * Corps JSON envoyé à POST /accounts/{id}/invoices.
 *
 * Un avoir est stocké chez nous à montants négatifs (facture rectificative) ;
 * la norme EN 16931 attend au contraire un document de type avoir (381) à
 * montants positifs. On bascule donc le type et on redresse les signes.
 */
export function buildIssuedDocumentBody(
  quote: Record<string, unknown>,
  client: Record<string, unknown> | null,
  profile: Record<string, unknown> | null,
  opts: IssuedDocumentOptions = {},
): Record<string, unknown> {
  const isCreditNote = quote.type === 'credit_note';
  const docType = B2BROUTER_DOCUMENT_TYPES[String(quote.type)] ?? B2BROUTER_DOCUMENT_TYPES.invoice;
  const sign = (n: number) => (isCreditNote ? Math.abs(n) : n);

  const includeTva = quote.include_tva !== false;
  const items = (Array.isArray(quote.items) ? quote.items : []) as Record<string, unknown>[];
  // Les lignes de section (titres) n'ont pas de montant.
  const billable = items.filter((it) => it.type !== 'section');

  const dueDate = quote.valid_until
    ? isoDate(quote.valid_until)
    : isoDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());

  const invoiceLines = billable.length > 0
    ? billable.map((item, i) => {
        const rate = item.tva_rate != null ? Number(item.tva_rate) : (includeTva ? 20 : 0);
        return {
          description: (item.description as string) || `Ligne ${i + 1}`,
          quantity: sign(Number(item.quantity) || 1),
          unit: 1,
          price: sign(Number(item.price) || 0),
          taxes_attributes: [{ name: 'TVA', category: vatCategory(rate, includeTva), percent: rate }],
        };
      })
    : [{
        description: (quote.title as string) || (isCreditNote ? 'Avoir' : 'Prestation'),
        quantity: 1,
        unit: 1,
        price: sign(Number(quote.total_ht) || 0),
        taxes_attributes: [{ name: 'TVA', category: includeTva ? 'S' : 'E', percent: includeTva ? 20 : 0 }],
      }];

  const contact: Record<string, unknown> = {
    name: (client?.name as string) || 'Client',
    address: (client?.address as string) || '',
    postalcode: (client?.postal_code as string) || '',
    city: (client?.city as string) || '',
    country: 'fr',
  };
  const siren = normalizeSiren(client?.siren);
  if (siren) {
    contact.cin_scheme = '0002'; // SIREN, 9 chiffres
    contact.cin_value = siren;
  }
  if (client?.tva_intracom) contact.tin_value = client.tva_intracom as string;
  if (client?.email) contact.email = client.email as string;

  const invoice: Record<string, unknown> = {
    type: docType,
    number: String(quote.invoice_number || quote.quote_number || quote.id),
    date: isoDate(quote.date),
    due_date: dueDate,
    currency: 'EUR',
    ...(profile?.iban ? { payment_method: 58, iban: profile.iban } : {}),
    contact,
    invoice_lines_attributes: invoiceLines,
  };

  const notes: string[] = [];
  if (isCreditNote && opts.parentInvoiceNumber) {
    notes.push(`Avoir sur facture ${opts.parentInvoiceNumber}`);
  }
  if (!includeTva) notes.push('TVA non applicable, art. 293 B du CGI');
  if (quote.vat_on_debits && includeTva) notes.push("Option pour le paiement de la TVA d'après les débits");
  if (notes.length) invoice.extra_info = notes.join(' — ');

  return { send_after_import: true, invoice };
}

// ---------------------------------------------------------------------------
// Appels réseau
// ---------------------------------------------------------------------------

export interface ApiResult {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
  raw: string;
}

async function callJson(cfg: B2BRouterConfig, method: string, path: string, body?: unknown): Promise<ApiResult> {
  const res = await fetch(`${cfg.base}${path}`, {
    method,
    headers: b2bHeaders(cfg.apiKey, body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(raw); } catch { data = { message: raw || res.statusText }; }
  console.log(`[B2BRouter] ${method} ${path} → ${res.status} | ${raw.slice(0, 300)}`);
  return { ok: res.ok, status: res.status, data, raw };
}

export function describeApiError(result: ApiResult): string {
  const d = result.data;
  const detail = d?.message || d?.error || d?.errors || result.raw || 'Erreur B2BRouter';
  return `B2BRouter HTTP ${result.status} — ${typeof detail === 'object' ? JSON.stringify(detail) : String(detail)}`;
}

export function createIssuedDocument(cfg: B2BRouterConfig, body: Record<string, unknown>): Promise<ApiResult> {
  return callJson(cfg, 'POST', `/accounts/${cfg.accountId}/invoices`, body);
}

export async function fetchInvoice(cfg: B2BRouterConfig, id: string): Promise<Record<string, unknown> | null> {
  const r = await callJson(cfg, 'GET', `/invoices/${encodeURIComponent(id)}.json`);
  return r.ok ? unwrapInvoice(r.data) : null;
}

/** Liste paginée des documents du compte : `{ invoices: [...], meta: { total_count, offset, limit } }`. */
export async function listAccountInvoices(
  cfg: B2BRouterConfig,
  params: Record<string, string | number> = {},
): Promise<{ invoices: Record<string, unknown>[]; totalCount: number | null } | null> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  const r = await callJson(cfg, 'GET', `/accounts/${cfg.accountId}/invoices${qs ? `?${qs}` : ''}`);
  if (!r.ok) return null;
  const raw = Array.isArray(r.data) ? r.data : (Array.isArray(r.data.invoices) ? r.data.invoices : []);
  const invoices = (raw as unknown[]).map(unwrapInvoice).filter((inv): inv is Record<string, unknown> => !!inv);
  const meta = isRecord(r.data.meta) ? r.data.meta : null;
  const totalCount = meta && typeof meta.total_count === 'number' ? meta.total_count : null;
  return { invoices, totalCount };
}

export interface FindByNumberResult {
  invoice: Record<string, unknown> | null;
  /** Nombre de documents présents sur le compte (null si inconnu). */
  accountTotal: number | null;
}

/**
 * Retrouve un document émis par son numéro (notre numéro légal FAC-/AV-).
 *
 * On interroge d'abord avec le filtre `number` ; s'il ne renvoie rien, on
 * parcourt les premières pages du compte et on compare nous-mêmes — le filtre
 * n'est pas garanti par la documentation, et le parcours dit au passage si le
 * compte contient quoi que ce soit (diagnostic d'un dépôt jamais effectué).
 */
export async function findIssuedInvoiceByNumber(cfg: B2BRouterConfig, number: string): Promise<FindByNumberResult> {
  const byNumber = (inv: Record<string, unknown>) => String(inv.number) === number;

  const filtered = await listAccountInvoices(cfg, { number });
  const direct = filtered?.invoices.find(byNumber);
  if (direct) return { invoice: direct, accountTotal: filtered?.totalCount ?? null };

  const pageSize = 100;
  let offset = 0;
  let accountTotal: number | null = null;
  for (let page = 0; page < 5; page++) {
    const chunk = await listAccountInvoices(cfg, { limit: pageSize, offset });
    if (!chunk) break;
    accountTotal = chunk.totalCount ?? accountTotal;
    const hit = chunk.invoices.find(byNumber);
    if (hit) return { invoice: hit, accountTotal };
    if (chunk.invoices.length < pageSize) break;
    offset += pageSize;
    if (accountTotal != null && offset >= accountTotal) break;
  }
  console.log(`[B2BRouter] document ${number} absent du compte (${accountTotal ?? '?'} document(s) au total)`);
  return { invoice: null, accountTotal };
}

/**
 * Change l'état d'une facture reçue et notifie le fournisseur via le réseau
 * d'origine (Peppol / PA). `commit: with_mail` couvre les factures arrivées
 * par simple e-mail, où seul un courriel peut prévenir l'émetteur.
 */
export function switchInvoiceState(
  cfg: B2BRouterConfig,
  id: string,
  action: LifecycleAction,
  opts: { reason?: string } = {},
): Promise<ApiResult> {
  const body: Record<string, unknown> = { commit: 'with_mail' };
  if (opts.reason) body.reason = opts.reason;
  return callJson(cfg, 'PUT', `/invoices/${encodeURIComponent(id)}/${action}`, body);
}

const looksLikePdf = (bytes: Uint8Array) =>
  bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF

/**
 * Télécharge le PDF d'une facture. B2BRouter expose le rendu PDF sous
 * /invoices/{id}.pdf ; on tente ensuite le fichier d'origine au cas où la
 * facture soit arrivée en Factur-X (PDF/A-3 avec XML embarqué).
 */
export async function downloadInvoicePdf(cfg: B2BRouterConfig, id: string): Promise<Uint8Array | null> {
  const enc = encodeURIComponent(id);
  const candidates = [`/invoices/${enc}.pdf`, `/invoices/${enc}/original`];
  for (const path of candidates) {
    try {
      const res = await fetch(`${cfg.base}${path}`, {
        headers: b2bHeaders(cfg.apiKey, { Accept: 'application/pdf' }),
      });
      if (!res.ok) {
        console.warn(`[B2BRouter] GET ${path} → ${res.status}`);
        continue;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (looksLikePdf(bytes)) return bytes;
      console.warn(`[B2BRouter] GET ${path} : réponse non PDF (${res.headers.get('content-type')})`);
    } catch (err) {
      console.warn(`[B2BRouter] GET ${path} : ${err instanceof Error ? err.message : err}`);
    }
  }
  return null;
}

export const RECEIVED_INVOICES_BUCKET = 'received-invoices';

/** Chemin de stockage du PDF d'une facture reçue : un dossier par artisan. */
export const receivedInvoicePdfPath = (userId: string, rowId: string) => `${userId}/${rowId}.pdf`;

/**
 * Télécharge le PDF chez B2BRouter et le range dans le bucket privé, puis
 * mémorise le chemin sur la ligne received_invoices. Renvoie le chemin ou null.
 */
export async function storeReceivedInvoicePdf(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  cfg: B2BRouterConfig,
  row: { id: string; user_id: string; b2brouter_id: string | null },
): Promise<string | null> {
  if (!row.b2brouter_id) return null;
  const bytes = await downloadInvoicePdf(cfg, row.b2brouter_id);
  if (!bytes) return null;

  const path = receivedInvoicePdfPath(row.user_id, row.id);
  const { error: upErr } = await supabaseAdmin.storage
    .from(RECEIVED_INVOICES_BUCKET)
    .upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) {
    console.error('[B2BRouter] upload PDF facture reçue :', upErr.message ?? upErr);
    return null;
  }
  const { error: dbErr } = await supabaseAdmin
    .from('received_invoices')
    .update({ pdf_path: path })
    .eq('id', row.id);
  if (dbErr) {
    console.error('[B2BRouter] enregistrement pdf_path :', dbErr.message ?? dbErr);
    return null;
  }
  return path;
}
