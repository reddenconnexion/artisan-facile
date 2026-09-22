// Faut-il encore proposer un avenant signé « à facturer » ?
//
// La facture de clôture d'un devis ne reprend QUE les avenants déjà signés au
// moment où elle est générée (cf. handleCreateClosingInvoice dans DevisForm) :
// elle photographie les enfants existants, puis n'en garde que les avenants au
// statut accepted/billed/paid. Un avenant signé APRÈS la clôture n'a donc pas
// pu y entrer — il reste dû et doit rester « à facturer » (facture
// complémentaire), sans quoi il disparaît à tort du tableau de bord.
//
// À l'inverse, un avenant signé AVANT la clôture y est déjà facturé : le
// reproposer ferait double emploi. La décision se joue donc sur une simple
// comparaison de dates : signature de l'avenant vs génération de la clôture.

const CLOSING_TITLE_RE = /cl[oô]ture/i;

// Millisecondes d'une date ISO/Date, ou null si inexploitable.
const toMs = (v) => {
    if (!v) return null;
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : null;
};

// Une ligne `quotes` est-elle une facture de clôture déjà émise (billed/paid) ?
export const isClosingInvoiceRow = (inv) =>
    inv?.type === 'invoice' &&
    ['billed', 'paid'].includes(inv?.status) &&
    CLOSING_TITLE_RE.test(inv?.title || '');

// Instant où l'avenant est devenu facturable (sa signature). C'est ce que la
// clôture « voit ». À défaut de `signed_at` (avenant passé accepté à la main,
// données anciennes), on retombe sur `created_at` : s'il a été créé après la
// clôture, il ne pouvait pas y figurer.
export const amendmentBillableTime = (amendment) => {
    const signed = toMs(amendment?.signed_at);
    return signed !== null ? signed : toMs(amendment?.created_at);
};

/**
 * Regroupe les factures de clôture par devis parent en retenant, pour chacun,
 * la date de génération (`created_at`) de la clôture la PLUS récente — celle qui
 * a pu balayer le plus d'avenants.
 *
 * Une clôture sans `created_at` exploitable est retenue avec `Infinity` :
 * faute de repère, on reste sur le comportement prudent (masquer l'avenant).
 *
 * @param {Array} closingInvoices lignes `quotes` candidates (factures liées)
 * @returns {Map<number, number>} parent_id -> date de clôture la plus tardive (ms)
 */
export function latestClosingByParent(closingInvoices = []) {
    const map = new Map();
    (closingInvoices || []).forEach((inv) => {
        if (!isClosingInvoiceRow(inv)) return;
        const t = toMs(inv.created_at);
        const value = t === null ? Infinity : t;
        const prev = map.get(inv.parent_id);
        if (prev === undefined || value > prev) map.set(inv.parent_id, value);
    });
    return map;
}

/**
 * Un avenant signé est-il déjà couvert par une facture de clôture existante ?
 *
 * Vrai uniquement si une clôture du devis parent a été générée à la signature
 * de l'avenant ou après : sinon l'avenant, signé plus tard, n'y figure pas et
 * reste à facturer.
 *
 * @param {object} amendment           ligne `quotes` (type 'amendment')
 * @param {Map}    closingByParent      sortie de latestClosingByParent
 * @returns {boolean}
 */
export function amendmentAlreadyBilled(amendment, closingByParent) {
    if (!amendment || amendment.type !== 'amendment' || amendment.parent_id == null) return false;
    if (!closingByParent) return false;
    const closingTime = closingByParent.get(amendment.parent_id);
    if (closingTime === undefined) return false; // aucune clôture -> reste à facturer
    const signedTime = amendmentBillableTime(amendment);
    if (signedTime === null) return true; // avenant sans date -> prudence : déjà facturé
    return signedTime <= closingTime;
}
