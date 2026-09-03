import { depositsNetOfCreditNotes } from './creditNote';

const round2 = (n) => Math.round(n * 100) / 100;

// ── Acompte matériel : montants du bloc « Conditions de règlement » du devis ──
//
// Règle commune à toute l'app (total du devis, acompte généré depuis le
// formulaire, RPC select_quote_options) : les lignes optionnelles (is_optional)
// ne font pas partie du chiffrage ferme tant que le client ne les a pas
// retenues. L'acompte « 100 % des fournitures » ne couvre donc que les
// fournitures fermes, et le solde (total ferme − acompte) retombe exactement
// sur la main d'œuvre.

// Montant d'une ligne : en présentation « poste global », le serveur a déjà
// fusionné les lignes et fourni un total (line_total), sans quantité ni prix
// unitaire. Sinon on calcule quantité × prix comme d'habitude.
export const quoteLineAmount = (item) => (item.line_total != null && item.line_total !== '')
    ? (parseFloat(item.line_total) || 0)
    : (parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0);

// Calcule l'acompte matériel TTC et le solde TTC d'un devis, ou null si le
// devis n'a aucune fourniture ferme (rien à provisionner — le bloc ne doit
// alors pas s'afficher, quitte à retomber sur l'acompte en % du total).
export function materialDepositAmounts(devis) {
    const items = devis.items || [];
    const firmMaterials = items.filter(i => i.type === 'material' && !i.is_optional);
    if (firmMaterials.length === 0) return null;

    const materialHT = firmMaterials.reduce((sum, i) => sum + quoteLineAmount(i), 0);

    // Taux de TVA effectif déduit des totaux, pour suivre les ajustements
    // manuels ou un taux différent de 20 %.
    let vatRate = 0.20;
    if (devis.total_ht > 0 && devis.total_tva >= 0) {
        vatRate = devis.total_tva / devis.total_ht;
    }

    const materialTTC = devis.include_tva !== false ? materialHT * (1 + vatRate) : materialHT;
    const balanceTTC = Math.max((Number(devis.total_ttc) || 0) - materialTTC, 0);
    return { materialTTC, balanceTTC };
}

// ── Fournitures couvertes par l'acompte matériel ──
//
// L'acompte matériel provisionne ce que l'artisan doit acheter avant
// d'intervenir. Le chantier ne se limite pas au devis initial : un avenant
// SIGNÉ engage le client sur des fournitures supplémentaires, que l'artisan
// avance de la même façon. La facture de clôture reprend déjà les lignes de ces
// avenants ; sans la même règle ici, l'acompte restait calculé sur le seul
// devis et laissait ces fournitures à la charge de l'artisan jusqu'à la fin du
// chantier (devis n° 223 : 130 € de fournitures d'avenant hors acompte).
//
// Un avenant non signé n'entre pas dans le calcul : rien n'y est encore dû.
const SIGNED_AMENDMENT_STATUSES = ['accepted', 'billed', 'paid'];

/** Les avenants d'un devis que le client a acceptés — les seuls qui l'engagent. */
const signedAmendments = (linkedDocs) => (linkedDocs || [])
    .filter(doc => doc.type === 'amendment' && SIGNED_AMENDMENT_STATUSES.includes(doc.status));

/**
 * Lignes de fourniture fermes couvertes par l'acompte : celles du devis, plus
 * celles de ses avenants signés, chacune étiquetée de l'avenant dont elle vient.
 *
 * @param {Array} quoteItems Les lignes du devis racine.
 * @param {Array} linkedDocs Ses documents enfants (avenants et factures liées).
 * @returns {Array} Les lignes retenues ; celles d'un avenant portent `amendmentLabel`.
 */
export function depositMaterialItems(quoteItems, linkedDocs) {
    const isFirmMaterial = (i) => i.type === 'material' && !i.is_optional;

    const own = (quoteItems || []).filter(isFirmMaterial);

    const fromAmendments = signedAmendments(linkedDocs)
        .flatMap(amd => {
            const label = amd.quote_number ? `Avenant n°${amd.quote_number}` : (amd.title || 'Avenant');
            return (Array.isArray(amd.items) ? amd.items : [])
                .filter(isFirmMaterial)
                .map(item => ({ ...item, amendmentLabel: label }));
        });

    return [...own, ...fromAmendments];
}

/**
 * Part de l'acompte provenant d'avenants signés : montant HT et libellés des
 * avenants concernés, pour l'annoncer à l'artisan et sur la facture.
 *
 * @param {Array} items Le retour de `depositMaterialItems`.
 * @returns {{totalHT: number, labels: string[]}}
 */
export function depositAmendmentShare(items) {
    const fromAmendments = (items || []).filter(i => i.amendmentLabel);
    return {
        totalHT: fromAmendments.reduce((sum, i) => sum + quoteLineAmount(i), 0),
        labels: [...new Set(fromAmendments.map(i => i.amendmentLabel))],
    };
}

/**
 * Montant TTC des avenants signés d'un devis, à ajouter à son total pour
 * obtenir celui du CHANTIER.
 *
 * L'acompte en pourcentage se calculait sur le seul devis initial : après
 * signature d'un avenant, « 30 % du chantier » n'en couvrait plus 30 %. La
 * facture de clôture, elle, facture déjà l'ensemble — le pourcentage doit donc
 * porter sur la même assiette, sinon le solde final s'écarte d'autant.
 *
 * Un avenant de moins-value porte un total négatif et réduit l'assiette, ce qui
 * est le comportement voulu.
 *
 * @param {Array} linkedDocs Les documents enfants du devis.
 * @returns {number} La somme des totaux TTC des avenants signés (0 s'il n'y en a pas).
 */
export function amendmentsTotalTTC(linkedDocs) {
    return signedAmendments(linkedDocs)
        .reduce((sum, amd) => sum + (parseFloat(amd.total_ttc) || 0), 0);
}

// ── Acompte matériel déjà facturé : ne facturer que le complément ──
//
// Modèle de règlement : le matériel se paie d'avance, le solde (main d'œuvre)
// à la fin du chantier. Quand un avenant signé ajoute des fournitures APRÈS
// l'acompte matériel initial, le bouton « Acompte matériel » recalculait
// l'assiette entière (devis + avenants) sans retrancher l'acompte déjà
// encaissé : un second clic facturait deux fois les fournitures du devis.
//
// On reconnaît les acomptes matériel parmi les factures rattachées au devis
// (même règle de détection que le titre et la ligne générés ici), nets des
// avoirs qui les annulent, et on ne facture que ce qui reste à couvrir.

const MATERIAL_DEPOSIT_RE = /acompte\s+mat[ée]riel/i;

/**
 * Factures d'acompte matériel (non annulées) parmi les enfants du devis.
 * @param {Array} linkedDocs Les documents enfants du devis.
 */
export function materialDepositInvoices(linkedDocs) {
    return (linkedDocs || []).filter((doc) =>
        doc?.type === 'invoice'
        && doc.status !== 'cancelled'
        && (MATERIAL_DEPOSIT_RE.test(doc.title || '')
            || (Array.isArray(doc.items) && doc.items.some((it) => MATERIAL_DEPOSIT_RE.test(it?.description || ''))))
    );
}

/**
 * Part du matériel restant à facturer en acompte.
 *
 * @param {number} materialTotalHT Fournitures fermes du devis + avenants signés (HT).
 * @param {Array}  linkedDocs Les documents enfants du devis.
 * @param {Array}  [creditNotes] Avoirs rattachés (parent_id = facture d'acompte).
 * @returns {{ alreadyIssuedHT: number, remainingHT: number, previous: Array<{id:number, invoice_number:string|null, netHT:number}> }}
 */
export function materialDepositComplement(materialTotalHT, linkedDocs, creditNotes = []) {
    const deposits = depositsNetOfCreditNotes(materialDepositInvoices(linkedDocs), creditNotes);
    const alreadyIssuedHT = round2(deposits.reduce((sum, d) => sum + d.netHT, 0));
    const remainingHT = round2(Math.max((parseFloat(materialTotalHT) || 0) - alreadyIssuedHT, 0));
    return {
        alreadyIssuedHT,
        remainingHT,
        previous: deposits.map((d) => ({ id: d.id, invoice_number: d.invoice_number || null, netHT: round2(d.netHT) })),
    };
}

/**
 * Photographie complète de l'acompte matériel d'un chantier, depuis son devis
 * racine : fournitures fermes (devis + avenants signés), acomptes déjà émis,
 * reliquat à facturer et part venant des avenants. C'est ce que l'écran
 * « prochaine étape » et le bouton « Acompte matériel » lisent tous les deux,
 * pour raconter la même chose à l'artisan.
 *
 * @param {object} rootQuote Le devis racine (items, include_tva…).
 * @param {Array}  linkedDocs Ses documents enfants.
 * @param {Array}  [creditNotes] Avoirs rattachés aux acomptes.
 */
export function materialDepositStatus(rootQuote, linkedDocs, creditNotes = []) {
    const materialItems = depositMaterialItems(rootQuote?.items || [], linkedDocs);
    const materialTotalHT = round2(materialItems.reduce(
        (sum, item) => sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0), 0
    ));
    const complement = materialDepositComplement(materialTotalHT, linkedDocs, creditNotes);
    const amendmentShare = depositAmendmentShare(materialItems);
    return {
        materialItems,
        materialTotalHT,
        ...complement,
        amendmentShare,
        isComplement: complement.alreadyIssuedHT > 0,
    };
}
