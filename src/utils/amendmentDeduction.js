// Déduction, sur un avenant, de prestations du devis initial qui ne seront
// finalement pas réalisées (client qui renonce à un poste, travaux devenus
// inutiles après constat terrain…).
//
// Modèle : l'avenant est un DELTA additif au devis. Une prestation retirée
// s'y inscrit donc en ligne négative, reprise telle quelle du devis parent
// (même désignation, même prix unitaire, quantité retirée) avec un prix
// unitaire négatif — même convention que les déductions d'acompte de la
// facture de clôture (quantité positive, prix négatif). La quantité peut être
// partielle (3 prises non posées sur 8).
//
// Chaque ligne déduite garde la trace de la ligne d'origine
// (`deducted_from_item_id`) : on peut ainsi savoir ce qui a déjà été retiré
// et interdire de déduire deux fois la même prestation, ou plus que le devis
// n'en contient.

const round2 = (n) => Math.round(n * 100) / 100;

const toNumber = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};

// Référence du devis parent telle que le client la connaît : son numéro,
// à défaut l'identifiant interne (devis anciens).
export const parentQuoteRef = (parentQuote) =>
    parentQuote?.quote_number || parentQuote?.id || '?';

export const DEDUCTION_SECTION_PREFIX = 'Prestations non réalisées';

export const deductionSectionTitle = (parentQuote) =>
    `${DEDUCTION_SECTION_PREFIX} — déduites du devis n°${parentQuoteRef(parentQuote)}`;

/**
 * Lignes du devis parent qu'on peut retirer sur l'avenant, avec le contexte
 * utile à l'affichage : section (Lot) d'appartenance, quantité déjà déduite
 * par cet avenant, quantité restante.
 *
 * Sont exclues : les titres de section, les options non retenues (elles ne
 * font pas partie du total ferme, il n'y a rien à déduire) et les lignes
 * sans montant.
 *
 * @param {object} parentQuote  devis parent (items, quote_number, id)
 * @param {Array}  amendmentItems lignes actuelles de l'avenant
 */
export function deductibleParentLines(parentQuote, amendmentItems = []) {
    const parentItems = Array.isArray(parentQuote?.items) ? parentQuote.items : [];
    const alreadyDeducted = {};
    (amendmentItems || []).forEach((it) => {
        if (it?.deducted_from_item_id === undefined || it.deducted_from_item_id === null) return;
        const key = String(it.deducted_from_item_id);
        alreadyDeducted[key] = (alreadyDeducted[key] || 0) + Math.abs(toNumber(it.quantity));
    });

    let section = '';
    const lines = [];
    parentItems.forEach((item, index) => {
        if (!item) return;
        if (item.type === 'section') { section = item.description || ''; return; }
        if (item.is_optional) return;
        const quantity = toNumber(item.quantity);
        const price = toNumber(item.price);
        if (quantity <= 0 || price === 0) return;
        const key = String(item.id ?? index);
        const deducted = alreadyDeducted[key] || 0;
        lines.push({
            id: item.id ?? index,
            index,
            section,
            description: item.description || '',
            type: item.type || 'service',
            unit: item.unit || 'unité',
            quantity,
            price,
            amountHT: round2(quantity * price),
            deductedQuantity: deducted,
            remainingQuantity: Math.max(round2(quantity - deducted), 0),
        });
    });
    return lines;
}

/**
 * Construit les lignes négatives à ajouter à l'avenant.
 *
 * @param {object} parentQuote devis parent
 * @param {Array<{itemId: string|number, quantity?: number}>} selections
 *        lignes retenues ; quantité omise = tout le restant
 * @param {object} [options]
 * @param {Array}  [options.existingItems] lignes actuelles de l'avenant
 *        (contrôle des doublons, et présence du titre de section)
 * @param {number} [options.idBase] base des identifiants (tests)
 * @returns {{ items: Array, totalHT: number, count: number }}
 */
export function buildDeductionItems(parentQuote, selections = [], { existingItems = [], idBase = Date.now() } = {}) {
    if (!parentQuote || !Array.isArray(parentQuote.items) || parentQuote.items.length === 0) {
        throw new Error("Le devis initial ne contient aucune ligne à déduire.");
    }
    const deductible = deductibleParentLines(parentQuote, existingItems);
    const byId = new Map(deductible.map((l) => [String(l.id), l]));
    const ref = parentQuoteRef(parentQuote);

    const chosen = (selections || []).filter(Boolean);
    if (chosen.length === 0) {
        throw new Error('Sélectionnez au moins une prestation à déduire.');
    }

    // Un seul titre de section de déduction par avenant : on ne le recrée pas
    // s'il existe déjà (deuxième passage dans le modal).
    const hasSection = (existingItems || []).some(
        (it) => it?.type === 'section' && typeof it.description === 'string' && it.description.startsWith(DEDUCTION_SECTION_PREFIX)
    );

    const seen = new Set();
    const items = [];
    let nextId = idBase;
    const sectionItem = hasSection
        ? null
        : { id: nextId++, description: deductionSectionTitle(parentQuote), type: 'section' };

    chosen.forEach((sel) => {
        const key = String(sel.itemId);
        if (seen.has(key)) {
            throw new Error('Une même prestation est sélectionnée deux fois.');
        }
        seen.add(key);
        const line = byId.get(key);
        if (!line) {
            throw new Error("Cette ligne n'existe pas (ou plus) sur le devis initial.");
        }
        const qty = sel.quantity === undefined || sel.quantity === null || sel.quantity === ''
            ? line.remainingQuantity
            : toNumber(sel.quantity);
        if (!(qty > 0)) {
            throw new Error(`Quantité invalide pour « ${line.description || 'ligne'} ».`);
        }
        if (qty > line.remainingQuantity + 0.0001) {
            throw new Error(
                `« ${line.description || 'ligne'} » : ${qty} dépasse la quantité restante du devis (${line.remainingQuantity}${line.deductedQuantity > 0 ? `, ${line.deductedQuantity} déjà déduite` : ''}).`
            );
        }
        items.push({
            id: nextId++,
            description: `${line.description || 'Prestation'} — non réalisé, déduit du devis n°${ref}`,
            quantity: round2(qty),
            unit: line.unit,
            price: -line.price,
            // Le coût d'achat reste porté par le devis initial ; une ligne de
            // retrait ne doit pas le compter une seconde fois dans la marge.
            buying_price: 0,
            type: line.type,
            deducted_from_item_id: line.id,
        });
    });

    const withSection = sectionItem ? [sectionItem, ...items] : items;

    const totalHT = round2(items.reduce((sum, it) => sum + it.quantity * it.price, 0));
    return { items: withSection, totalHT, count: items.length };
}
