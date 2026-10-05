// Commandes fournisseurs (web ou comptoir) rattachées aux chantiers.
//
// Le mail de confirmation d'une commande web est lu par l'IA (aiService
// `extractSupplierOrder`), relu par l'artisan, puis chaque ligne est imputée à
// un chantier (le devis parent). L'enregistrement passe par
// `supplier_purchases` : le trigger `match_supplier_purchase` écrit le prix
// d'achat réel dans la ligne « à commander » du devis (ou la crée), et la
// marge réelle du chantier se met à jour toute seule.
//
// Ce module ne contient que des fonctions PURES (aucun appel réseau) :
// normalisation de la réponse IA, totaux, suggestions de rattachement et
// construction des lignes à insérer.

const round = (n, d = 2) => {
    const f = 10 ** d;
    return Math.round((Number(n) || 0) * f) / f;
};

const num = (v, fallback = 0) => {
    if (v === null || v === undefined || v === '') return fallback;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
};

const text = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

export const DEFAULT_VAT_RATE = 0.2;

/** Imputation d'une ligne : chantier précis, « à trouver » ou stock/atelier. */
export const STOCK = 'stock';

/**
 * Clé de référence fabricant, miroir de `public.reference_key` (SQL) : le
 * premier jeton du type « 406774 », « DNX406774 », « S520059 »… débarrassé de
 * son préfixe lettres. Sert à reconnaître la même pièce entre le mail de
 * commande et la liste « à commander » du devis.
 */
export const extractReferenceNorm = (value) => {
    if (!value) return null;
    const tokens = String(value).toUpperCase().split(/[^A-Z0-9]+/);
    for (const tok of tokens) {
        if (tok.length >= 5 && /^[A-Z]{0,4}[0-9]{4,}[A-Z0-9]*$/.test(tok)) {
            return tok.replace(/^[A-Z]+/, '');
        }
    }
    return null;
};

export const referenceKey = (reference, label) =>
    extractReferenceNorm(reference)
    || extractReferenceNorm(label)
    || (String(reference || '').toUpperCase().replace(/[^A-Z0-9]/g, '') || null);

const isoDate = (v) => {
    const s = text(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const fr = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (fr) {
        const y = fr[3].length === 2 ? `20${fr[3]}` : fr[3];
        return `${y}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
    }
    return null;
};

/**
 * Normalise la réponse de l'IA (ou une saisie) en commande exploitable.
 * Les prix restent dans la base indiquée par `pricesIncludeVat` ; un prix
 * unitaire manquant est déduit du total de ligne.
 */
export const normalizeParsedOrder = (raw = {}, { today = new Date().toISOString().slice(0, 10) } = {}) => {
    const lines = (Array.isArray(raw.lines) ? raw.lines : [])
        .map((l, i) => {
            const quantity = num(l?.quantity, 1) || 1;
            let unitPrice = num(l?.unit_price, NaN);
            const lineTotal = num(l?.line_total, NaN);
            if (!Number.isFinite(unitPrice) && Number.isFinite(lineTotal)) unitPrice = lineTotal / quantity;
            return {
                key: `l${i}`,
                reference: text(l?.reference) || null,
                label: text(l?.label || l?.description),
                quantity,
                unit: text(l?.unit) || 'u',
                unitPrice: Number.isFinite(unitPrice) ? round(unitPrice, 4) : 0,
            };
        })
        .filter((l) => l.label || l.reference);

    return {
        supplier: text(raw.supplier),
        orderRef: text(raw.order_ref) || null,
        orderDate: isoDate(raw.order_date) || today,
        pricesIncludeVat: raw.prices_include_vat !== false,
        shipping: Math.max(0, num(raw.shipping)),
        discount: Math.abs(num(raw.discount)),
        total: raw.total == null || raw.total === '' ? null : num(raw.total, null),
        lines,
    };
};

/** Totaux de la commande dans sa base de prix (TTC ou HT selon la commande). */
export const orderTotals = (order) => {
    const linesTotal = round((order?.lines || []).reduce((s, l) => s + num(l.quantity) * num(l.unitPrice), 0));
    const computed = round(linesTotal + num(order?.shipping) - num(order?.discount));
    const total = order?.total == null ? null : round(order.total);
    const gap = total == null ? 0 : round(total - computed);
    return { linesTotal, computed, total, gap, balanced: Math.abs(gap) <= 0.01 };
};

/** Prix unitaire HT et TTC d'une ligne selon la base de la commande. */
export const linePrices = (unitPrice, pricesIncludeVat, vatRate = DEFAULT_VAT_RATE) => {
    const p = num(unitPrice);
    return pricesIncludeVat
        ? { ht: round(p / (1 + vatRate), 4), ttc: round(p, 4) }
        : { ht: round(p, 4), ttc: round(p * (1 + vatRate), 4) };
};

const WORD_STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'pour', 'avec', 'a', 'au', 'x', 'un', 'une']);
const words = (s) => new Set(
    String(s || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 1 && !WORD_STOP.has(w)),
);

/** Ressemblance de deux libellés (0 à 1), sur les mots en commun. */
export const labelSimilarity = (a, b) => {
    const A = words(a);
    const B = words(b);
    if (A.size === 0 || B.size === 0) return 0;
    let common = 0;
    A.forEach((w) => { if (B.has(w)) common += 1; });
    return common / Math.min(A.size, B.size);
};

const SIMILARITY_MIN = 0.6;

/**
 * Propose, pour chaque ligne de la commande, la ligne « à commander » du
 * chantier qu'elle règle : même référence d'abord, sinon libellé proche.
 * Une ligne prévue ne sert qu'une fois (affectation gloutonne, la meilleure
 * correspondance d'abord) et les lignes déjà réglées par un achat sont
 * écartées pour ne pas compter deux fois le même matériel.
 *
 * @param {Array<{key, reference, label, quoteId}>} lines
 * @param {Array<{id, quote_id, reference, description, status}>} items
 * @param {Set<number>} [alreadyLinked] ids procurement_items déjà réglés
 * @returns {Map<string, number>} clé de ligne → id procurement_items
 */
export const suggestItemMatches = (lines, items, alreadyLinked = new Set()) => {
    const pool = (items || []).filter((it) => it && it.status !== 'cancelled' && !alreadyLinked.has(it.id));
    const pairs = [];
    for (const line of lines || []) {
        if (typeof line.quoteId !== 'number') continue;
        const lineRef = referenceKey(line.reference, line.label);
        for (const it of pool) {
            if (Number(it.quote_id) !== line.quoteId) continue;
            const itRef = it.reference ? referenceKey(it.reference, null) : extractReferenceNorm(it.description);
            let score = 0;
            if (lineRef && itRef && lineRef === itRef) score = 2;
            else {
                const sim = labelSimilarity(line.label, it.description);
                if (sim >= SIMILARITY_MIN) score = sim;
            }
            if (score > 0) pairs.push({ key: line.key, id: it.id, score });
        }
    }
    pairs.sort((a, b) => b.score - a.score);
    const out = new Map();
    const used = new Set();
    for (const p of pairs) {
        if (out.has(p.key) || used.has(p.id)) continue;
        out.set(p.key, p.id);
        used.add(p.id);
    }
    return out;
};

/**
 * Chantier probable d'une ligne : celui dont la liste « à commander » porte
 * la même référence (s'il n'y en a qu'un).
 */
export const suggestQuoteForLine = (line, items) => {
    const ref = referenceKey(line.reference, line.label);
    if (!ref) return null;
    const quotes = new Set();
    for (const it of items || []) {
        if (!it || it.quote_id == null || it.status === 'cancelled') continue;
        const itRef = it.reference ? referenceKey(it.reference, null) : extractReferenceNorm(it.description);
        if (itRef === ref) quotes.add(Number(it.quote_id));
    }
    return quotes.size === 1 ? [...quotes][0] : null;
};

/**
 * Chantier dont le client est nommé dans le mail (adresse de livraison sur le
 * chantier, nom en commentaire…). Renvoie l'id du devis le plus récent.
 */
export const guessQuoteFromText = (rawText, quotes) => {
    const hay = ` ${String(rawText || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')} `;
    for (const q of quotes || []) {
        const name = String(q.client_name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
        if (name.length < 4) continue;
        const parts = name.split(/\s+/).filter((p) => p.length >= 4);
        if (parts.length === 0) continue;
        if (parts.every((p) => new RegExp(`[^a-z0-9]${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^a-z0-9]`).test(hay))) {
            return q.id;
        }
    }
    return null;
};

/**
 * Répartit frais de port et remise entre les chantiers, au prorata du
 * montant des lignes de chacun. Le dernier groupe absorbe l'arrondi pour
 * que la somme tombe juste.
 *
 * @returns {Array<{quoteId, shipping, discount}>}
 */
export const splitFees = (lines, shipping, discount) => {
    const totals = new Map();
    for (const l of lines || []) {
        const k = l.quoteId ?? null;
        totals.set(k, (totals.get(k) || 0) + num(l.quantity) * num(l.unitPrice));
    }
    const groups = [...totals.entries()];
    const grand = groups.reduce((s, [, v]) => s + v, 0);
    if (groups.length === 0) return [];
    let restS = round(shipping);
    let restD = round(discount);
    return groups.map(([quoteId, v], i) => {
        const last = i === groups.length - 1;
        const share = grand > 0 ? v / grand : 1 / groups.length;
        const s = last ? restS : round(shipping * share);
        const d = last ? restD : round(discount * share);
        restS = round(restS - s);
        restD = round(restD - d);
        return { quoteId, shipping: s, discount: d };
    });
};

const purchaseRow = ({ userId, invoiceId, supplier, date, quoteId, label, reference, quantity, unit, unitPrice, pricesIncludeVat, vatRate }) => {
    const { ht, ttc } = linePrices(unitPrice, pricesIncludeVat, vatRate);
    const row = {
        user_id: userId,
        invoice_id: invoiceId,
        supplier_name: supplier || null,
        product_name: label,
        product_key: label.toLowerCase().slice(0, 120),
        reference: reference || null,
        quantity,
        unit: unit || 'u',
        unit_price: ht,
        unit_price_ttc: ttc,
        total_price: round(quantity * ttc),
        purchase_date: date,
        origin: 'web_order',
        quote_id: typeof quoteId === 'number' ? quoteId : null,
    };
    if (quoteId === STOCK) row.match_status = 'ignored';
    return row;
};

/**
 * Lignes `supplier_purchases` à insérer pour une commande relue.
 *
 * - ligne rattachée à une ligne prévue (`itemId`) : insérée en `manual`
 *   (le trigger la laisse passer), puis liée par l'appelant via la RPC
 *   `link_supplier_purchase` — renvoyée avec son `itemId` à part ;
 * - ligne imputée à un chantier sans ligne prévue : le trigger la rapproche
 *   par référence ou crée la ligne « à commander » au prix réel ;
 * - ligne « stock / atelier » : `ignored`, hors marge chantier ;
 * - port et remise : une ligne par chantier, au prorata.
 *
 * @returns {Array<{row: object, itemId: number|null}>}
 */
export const buildPurchaseRows = (order, { userId, invoiceId, vatRate = DEFAULT_VAT_RATE }) => {
    const base = {
        userId,
        invoiceId,
        supplier: order.supplier,
        date: order.orderDate,
        pricesIncludeVat: order.pricesIncludeVat,
        vatRate,
    };
    const out = order.lines.map((l) => {
        const row = purchaseRow({
            ...base,
            quoteId: l.quoteId ?? null,
            label: l.label || l.reference,
            reference: l.reference,
            quantity: num(l.quantity) || 1,
            unit: l.unit,
            unitPrice: l.unitPrice,
        });
        const itemId = typeof l.quoteId === 'number' && typeof l.itemId === 'number' ? l.itemId : null;
        if (itemId) row.match_status = 'manual';
        return { row, itemId };
    });

    const who = order.supplier ? ` ${order.supplier}` : '';
    for (const g of splitFees(order.lines, num(order.shipping), num(order.discount))) {
        if (g.shipping > 0) {
            out.push({
                row: purchaseRow({ ...base, quoteId: g.quoteId, label: `Frais de port${who}`, reference: null, quantity: 1, unit: 'forfait', unitPrice: g.shipping }),
                itemId: null,
            });
        }
        if (g.discount > 0) {
            out.push({
                row: purchaseRow({ ...base, quoteId: g.quoteId, label: `Remise${who}`, reference: null, quantity: 1, unit: 'forfait', unitPrice: -g.discount }),
                itemId: null,
            });
        }
    }
    return out;
};

/** En-tête `supplier_invoices` de la commande (source `web_order`). */
export const buildOrderHeader = (order, { userId, vatRate = DEFAULT_VAT_RATE }) => {
    const { computed, total } = orderTotals(order);
    const t = total ?? computed;
    const ttc = order.pricesIncludeVat ? t : round(t * (1 + vatRate));
    const ht = order.pricesIncludeVat ? round(t / (1 + vatRate)) : t;
    return {
        user_id: userId,
        supplier_name: order.supplier || 'Fournisseur',
        order_ref: order.orderRef || null,
        invoice_date: order.orderDate,
        total_ht: ht,
        total_ttc: ttc,
        shipping_cost: order.pricesIncludeVat ? round(order.shipping) : round(order.shipping * (1 + vatRate)),
        currency: 'EUR',
        item_count: order.lines.length,
        source: 'web_order',
    };
};

/** Libellé court d'un chantier (devis parent) pour les listes. */
export const chantierLabel = (q) => {
    if (!q) return '';
    const who = q.client_name || q.clients?.name || 'Client';
    const what = q.title ? ` — ${q.title}` : '';
    return `${who}${what}`;
};

/**
 * Prix d'achat à remonter dans la bibliothèque de prix : pour chaque article
 * commandé qui existe déjà au catalogue (même référence, sinon même
 * désignation), le dernier prix payé remplace l'ancien prix d'achat. Le
 * prochain devis part ainsi du prix réel. On ne crée jamais d'article et on
 * ne touche jamais au prix de vente.
 *
 * @param {Array} lines lignes de la commande (hors port/remise)
 * @param {Array} library articles price_library {id, description, reference, buying_price, supplier}
 * @param {{pricesIncludeVat:boolean, costIncludesVat:boolean, supplier:string, vatRate?:number}} opts
 *   costIncludesVat : l'artisan raisonne en TTC (franchise de TVA)
 * @returns {Array<{id:number, buying_price:number, supplier:string|null}>}
 */
export const buildLibraryCostUpdates = (lines, library, { pricesIncludeVat, costIncludesVat, supplier, vatRate = DEFAULT_VAT_RATE }) => {
    const byRef = new Map();
    const byDesc = new Map();
    for (const it of library || []) {
        const ref = it.reference ? referenceKey(it.reference, null) : null;
        if (ref) byRef.set(ref, it);
        if (it.description) byDesc.set(String(it.description).trim().toLowerCase(), it);
    }
    const out = new Map();
    for (const l of lines || []) {
        if (!(num(l.unitPrice) > 0)) continue;
        const ref = l.reference ? referenceKey(l.reference, null) : null;
        const hit = (ref && byRef.get(ref)) || byDesc.get(String(l.label || '').trim().toLowerCase());
        if (!hit || out.has(hit.id)) continue;
        const { ht, ttc } = linePrices(l.unitPrice, pricesIncludeVat, vatRate);
        const cost = round(costIncludesVat ? ttc : ht);
        const sameCost = Math.abs(num(hit.buying_price) - cost) < 0.01;
        const sameSupplier = !supplier || supplier === (hit.supplier || '');
        if (sameCost && sameSupplier) continue;
        out.set(hit.id, { id: hit.id, buying_price: cost, supplier: supplier || hit.supplier || null });
    }
    return [...out.values()];
};
