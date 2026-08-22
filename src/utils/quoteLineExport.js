// Export CSV « Détail des lignes » : toutes les lignes chiffrées de plusieurs
// devis, aplaties en un seul tableau pour bâtir un référentiel de prix dans un
// tableur — et pour pouvoir revenir dans l'application par l'import CSV.
//
// C'est le pendant écriture de quoteCsvImport.js : les en-têtes produits ici
// doivent rester lisibles par lui (un test d'aller-retour le vérifie).

// Libellés FR des statuts pour l'export (alignés sur StatusBadge)
export const STATUS_LABELS = {
    draft: 'Brouillon', sent: 'Envoyé', accepted: 'Accepté',
    rejected: 'Refusé', refused: 'Refusé', billed: 'Facturé',
    paid: 'Payé', postponed: 'Reporté',
};

const docTypeLabel = (devis) =>
    devis.type === 'invoice' ? 'Facture' : (devis.type === 'amendment' ? 'Avenant' : 'Devis');

const docReference = (devis) => {
    if (devis.type === 'invoice' && devis.invoice_number) return devis.invoice_number;
    const prefix = devis.type === 'invoice' ? 'FAC' : (devis.type === 'amendment' ? 'AVT' : 'DEV');
    return `${prefix} #${devis.quote_number || devis.id}`;
};

// Nombre au format FR (décimale = virgule) pour Excel/LibreOffice locale française.
const frNum = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n.toFixed(2).replace('.', ',') : '';
};

/**
 * Aplatit les lignes (items) de tous les devis fournis. Seules les lignes
 * chiffrées alimentent le référentiel : un titre de regroupement n'a pas de
 * prix, il ne devient donc pas une ligne — mais il n'est plus perdu pour
 * autant, il alimente la colonne Lot de toutes les lignes qui le suivent
 * (c'est ainsi que l'import les relit).
 *
 * Trois colonnes portent ce qui n'est pas un prix, pour que l'aller-retour
 * export → import ne perde rien :
 *   Lot     — le titre de regroupement dont dépend la ligne ;
 *   Option  — « Oui » sur une ligne optionnelle (hors du total ferme). La
 *             marque était auparavant un préfixe « (Option) » collé dans la
 *             description : illisible pour l'import, qui la relisait comme une
 *             ligne ferme au libellé bizarre ;
 *   Notes   — les notes/conditions du devis, réserves comprises. Recopiée sur
 *             chaque ligne (un CSV n'a pas d'étage « document ») ; à la
 *             réimportation quoteCsvImport dédoublonne.
 */
export const buildLineItemRows = (devisList) =>
    (devisList || []).flatMap((devis) => {
        const items = Array.isArray(devis.items) ? devis.items : [];
        const rows = [];
        let currentLot = '';
        for (const item of items) {
            if (!item) continue;
            if (item.type === 'section') {
                currentLot = item.description || '';
                continue;
            }
            if (!item.description && !item.price) continue;
            const qty = parseFloat(item.quantity) || 0;
            const price = parseFloat(item.price) || 0;
            rows.push({
                reference: docReference(devis),
                doc_type: docTypeLabel(devis),
                status: STATUS_LABELS[devis.status] || devis.status || '',
                date: devis.date,
                client_name: devis.client_name || '',
                title: devis.title || '',
                line_type: item.type === 'material' ? 'Matériel' : "Main d'œuvre",
                description: item.description || '',
                quantity: item.quantity ?? '',
                unit: item.unit || '',
                unit_price_ht: price,
                buying_price_ht: item.buying_price,
                line_total_ht: qty * price,
                notes: devis.notes || '',
                lot: currentLot,
                is_optional: item.is_optional ? 'Oui' : '',
            });
        }
        return rows;
    });

/**
 * Colonnes du fichier, dans l'ordre. Lot et Option sont en fin de ligne à
 * dessein : insérer une colonne au milieu décalerait les suivantes et
 * casserait les tableurs déjà bâtis sur cet export.
 */
export const LINE_ITEM_COLUMNS = [
    { key: 'reference', label: 'Référence' },
    { key: 'doc_type', label: 'Type document' },
    { key: 'status', label: 'Statut' },
    { key: 'date', label: 'Date', format: (v) => v ? new Date(v).toLocaleDateString('fr-FR') : '' },
    { key: 'client_name', label: 'Client' },
    { key: 'title', label: 'Objet' },
    { key: 'line_type', label: 'Type de ligne' },
    { key: 'description', label: 'Description' },
    { key: 'quantity', label: 'Quantité' },
    { key: 'unit', label: 'Unité' },
    { key: 'unit_price_ht', label: 'Prix unitaire HT', format: frNum },
    { key: 'buying_price_ht', label: "Prix d'achat HT", format: frNum },
    { key: 'line_total_ht', label: 'Total ligne HT', format: frNum },
    { key: 'notes', label: 'Notes' },
    { key: 'lot', label: 'Lot' },
    { key: 'is_optional', label: 'Option' },
];
