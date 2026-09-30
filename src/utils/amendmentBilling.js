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

import { isAmendmentRow } from './amendmentIndex';

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

/**
 * L'avenant est-il un complément à facturer APRÈS une clôture déjà émise ?
 *
 * Un avenant qui reste « à facturer » alors qu'une clôture existe sur son devis
 * parent a forcément été signé après cette clôture (sinon amendmentAlreadyBilled
 * l'aurait masqué). Sa facture est donc une facture complémentaire, la clôture
 * n'étant pas retouchée. Sert à guider l'artisan sur le tableau de bord.
 *
 * @param {object} amendment       ligne `quotes` (type 'amendment')
 * @param {Map}    closingByParent  sortie de latestClosingByParent
 * @returns {boolean}
 */
export function isPostClosingComplement(amendment, closingByParent) {
    return !!amendment
        && amendment.type === 'amendment'
        && amendment.parent_id != null
        && !!closingByParent
        && closingByParent.has(amendment.parent_id);
}

export const COMPLEMENT_TITLE_PREFIX = 'Facture complémentaire';

/**
 * Titre clair pour la facture complémentaire issue d'un avenant, sans doublonner
 * le préfixe s'il est déjà présent. Évite à l'artisan de renommer à la main.
 *
 * @param {object} amendment ligne `quotes` (type 'amendment')
 * @returns {string}
 */
export function complementInvoiceTitle(amendment) {
    const base = (amendment?.title || '').trim();
    if (!base) return COMPLEMENT_TITLE_PREFIX;
    if (/complémentaire/i.test(base)) return base;
    return `${COMPLEMENT_TITLE_PREFIX} – ${base}`;
}

// ── Récapitulatif « Nouveau total projet » d'un avenant ─────────────────────

const SIGNED_AMENDMENT_STATUSES = ['accepted', 'billed', 'paid'];
const SITUATION_TITLE_RE = /situation/i;

/**
 * Contexte financier d'un avenant, tiré des documents rattachés au devis
 * initial (parent_id) :
 *  - progressTotal : situations d'avancement facturées (remplacent le devis
 *    comme base de calcul) ;
 *  - depositTotal : acomptes versés, à déduire du solde ;
 *  - previousAmendments* : avenants ANTÉRIEURS à l'avenant courant et signés
 *    par le client. Ils font partie du projet : sans eux, l'avenant n°2
 *    annonçait un « Nouveau total projet » qui ignorait l'avenant n°1.
 *    Ceux déjà convertis en facture sont en plus comptés comme facturés
 *    (previousAmendmentsBilledTTC), à déduire du reste à régler.
 *
 * @param {Array} children  lignes `quotes` dont parent_id = devis initial
 * @param {number|string|null} currentId  id de l'avenant affiché (exclu, et
 *        seuls les avenants créés avant lui sont retenus)
 */
export function amendmentParentContext(children = [], currentId = null) {
    const current = currentId != null ? Number(currentId) : null;
    const ctx = {
        progressTotal: 0,
        depositTotal: 0,
        previousAmendmentsTTC: 0,
        previousAmendmentsBilledTTC: 0,
        previousAmendmentsCount: 0,
    };

    (children || []).forEach((doc) => {
        if (!doc || doc.status === 'cancelled') return;
        if (current != null && Number(doc.id) === current) return;
        const ttc = parseFloat(doc.total_ttc) || 0;

        if (isAmendmentRow(doc)) {
            // Les ids sont séquentiels : un id plus petit = avenant antérieur.
            if (current != null && Number(doc.id) > current) return;
            const billed = doc.type === 'invoice';
            if (!billed && !SIGNED_AMENDMENT_STATUSES.includes(doc.status)) return;
            ctx.previousAmendmentsTTC += ttc;
            ctx.previousAmendmentsCount += 1;
            if (billed) ctx.previousAmendmentsBilledTTC += ttc;
            return;
        }

        if (doc.type !== 'invoice') return;
        if (CLOSING_TITLE_RE.test(doc.title || '')) return; // ni situation ni acompte
        const details = typeof doc.amendment_details === 'object' ? doc.amendment_details : null;
        if (details?.situation || SITUATION_TITLE_RE.test(doc.title || '')) ctx.progressTotal += ttc;
        else ctx.depositTotal += ttc;
    });

    return ctx;
}

/**
 * Un avenant COMPLÈTE le devis initial (modèle additif) : le nouveau total du
 * projet part du devis initial — ou des situations déjà facturées, qui le
 * remplacent comme base — auquel s'ajoutent les avenants précédents signés,
 * puis le montant de cet avenant (delta, négatif pour une moins-value). Sans
 * situation, l'acompte versé et les avenants précédents déjà facturés sont
 * déduits du nouveau total pour obtenir le reste à régler.
 *
 * @param {{total_ttc?:number, progress_total?:number, deposit_total?:number,
 *          previous_amendments_total?:number, previous_amendments_billed?:number}|null} parentQuoteData
 *        Contexte du devis parent (formData.parent_quote_data).
 * @param {number} amendmentTTC Montant TTC de l'avenant.
 */
export function amendmentProjectTotals(parentQuoteData, amendmentTTC) {
    const initialTTC = parseFloat(parentQuoteData?.total_ttc) || 0;
    const progressTotal = parseFloat(parentQuoteData?.progress_total) || 0;
    const depositTotal = parseFloat(parentQuoteData?.deposit_total) || 0;
    const previousAmendmentsTTC = parseFloat(parentQuoteData?.previous_amendments_total) || 0;
    const previousAmendmentsBilledTTC = parseFloat(parentQuoteData?.previous_amendments_billed) || 0;
    const previousAmendmentsCount = parseInt(parentQuoteData?.previous_amendments_count, 10) || 0;
    const baseline = progressTotal > 0 ? progressTotal : initialTTC;
    const newTotal = baseline + previousAmendmentsTTC + amendmentTTC;
    const hasProgress = progressTotal > 0;
    return {
        initialTTC,
        progressTotal,
        depositTotal,
        previousAmendmentsTTC,
        previousAmendmentsBilledTTC,
        previousAmendmentsCount,
        baseline,
        amendmentTTC,
        newTotal,
        showDeposit: !hasProgress && depositTotal > 0,
        showPreviousBilled: !hasProgress && previousAmendmentsBilledTTC > 0,
        showRemaining: !hasProgress && (depositTotal > 0 || previousAmendmentsBilledTTC > 0),
        remaining: newTotal - depositTotal - previousAmendmentsBilledTTC,
    };
}
