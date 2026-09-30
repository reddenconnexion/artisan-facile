// Rang d'un avenant parmi les avenants d'un même devis.
//
// Le premier avenant reste « Avenant » tout court ; dès qu'un avenant existe
// déjà sur le devis, le suivant est numéroté (Avenant n°2, n°3…) pour que le
// client et l'artisan distinguent les documents sans ambiguïté.
//
// Le rang est figé à la création dans amendment_details.amendment_index : il
// ne bouge plus si un avenant précédent est supprimé ensuite.

const parseDetails = (details) => {
    if (!details) return {};
    if (typeof details === 'string') {
        try { return JSON.parse(details) || {}; } catch { return {}; }
    }
    return details;
};

export function amendmentIndexOf(amendment) {
    const n = Number(parseDetails(amendment?.amendment_details).amendment_index);
    return Number.isInteger(n) && n > 0 ? n : null;
}

// Une ligne `quotes` rattachée à un devis est-elle un avenant ?
// Un avenant signé peut être converti en facture depuis le tableau de bord : il
// passe alors au type 'invoice' mais garde la colonne parent_quote_id, que seuls
// les avenants renseignent (acomptes, situations et clôtures ne portent que
// parent_id). Il doit rester compté comme avenant.
export function isAmendmentRow(row) {
    if (!row) return false;
    if (row.type === 'amendment') return true;
    if (row.type !== 'invoice') return false;
    return row.parent_quote_id != null || amendmentIndexOf(row) != null;
}

// Rang du prochain avenant, d'après les avenants déjà rattachés au devis.
// Tous les avenants comptent (y compris refusés/annulés) : un numéro déjà
// remis au client n'est jamais réattribué. On prend aussi le plus grand rang
// déjà attribué pour ne pas créer de doublon après une suppression.
export function nextAmendmentIndex(existingAmendments = []) {
    const list = existingAmendments || [];
    const maxIndex = list.reduce((max, a) => Math.max(max, amendmentIndexOf(a) || 0), 0);
    return Math.max(list.length, maxIndex) + 1;
}

// Libellé « Avenant » / « Avenant n°2 » (le premier n'est pas numéroté).
export function amendmentLabel(index, base = 'Avenant') {
    return index && index >= 2 ? `${base} n°${index}` : base;
}
