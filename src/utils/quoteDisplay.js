// Présentation « groupée » d'un devis côté client.
//
// L'artisan rédige son devis en détaillé (indispensable pour commander le
// matériel et préparer les chantiers), mais peut choisir, client par client,
// de ne présenter qu'un total par section (quotes.client_display_mode =
// 'grouped') : le PDF et le lien public masquent alors le détail ligne à
// ligne. Les lignes optionnelles restent individuelles, le client doit
// pouvoir les choisir.

/**
 * Regroupe les lignes par section pour l'affichage groupé.
 *
 * @param {Array} items Lignes du devis (sections comprises), dans l'ordre.
 * @returns {Array<{label: string|null, total: number, count: number, options: Array}>}
 *   Un bloc par section : `label` (null pour les lignes avant toute section —
 *   au consommateur de choisir le libellé par défaut), `total` HT des lignes
 *   obligatoires, `count` de lignes agrégées, `options` individuelles.
 */
export const groupedDisplayBlocks = (items) => {
    const blocks = [];
    let current = null;
    const openBlock = (label) => {
        current = { label, total: 0, count: 0, options: [] };
        blocks.push(current);
    };
    (Array.isArray(items) ? items : []).forEach((item) => {
        if (!item) return;
        if (item.type === 'section') {
            openBlock((item.description || '').trim() || null);
            return;
        }
        if (!current) openBlock(null);
        if (item.is_optional) {
            current.options.push(item);
            return;
        }
        current.total += (parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0);
        current.count += 1;
    });
    return blocks.filter((b) => b.count > 0 || b.options.length > 0);
};
