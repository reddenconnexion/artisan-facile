// ── Devis du portail client selon les options retenues ──
//
// Le portail laisse le client cocher les lignes optionnelles (is_optional)
// avant de signer. Deux règles, une par état de l'option :
//
//   • Option RETENUE → ligne ferme : le flag is_optional est retiré, comme le
//     fait la RPC `select_quote_options` (migration 20260713120000) au moment
//     de la signature. Elle entre alors dans le total ET dans les sous-totaux
//     et l'acompte matériel, qui filtrent is_optional.
//   • Option NON retenue → conservée telle quelle, marquée « (Option) » dans
//     les tableaux et hors total : le client garde sous les yeux tout ce que
//     l'artisan lui propose, exactement comme sur le PDF envoyé par e-mail. La
//     signature, elle, retire ces lignes du devis (règle de la RPC) — leur
//     montant n'a jamais été dû, le total signé est inchangé.
//
// Sans le retrait du flag sur les options retenues, l'aperçu était incohérent :
// le total les comptait alors que les sous-totaux les excluaient. Sous-total
// main d'œuvre + sous-total fournitures ne retombait pas sur le TOTAL HT,
// l'écart valant exactement le montant des options cochées (devis n° 223 :
// 825,00 + 1 356,91 affichés sous un total de 2 536,91, soit 355 € d'options
// alors pré-cochées).

// Montant d'une ligne : même helper que le PDF et l'acompte matériel (gère les
// postes fusionnés du mode « poste global », qui portent un line_total).
import { quoteLineAmount } from './materialDeposit';

/**
 * Une option est retenue si son id est coché. Sélection pas encore initialisée
 * (null) : aucune option retenue — c'est le devis ferme de l'artisan, celui dont
 * les totaux sont stockés en base, et le défaut du portail depuis que les
 * options s'ouvrent décochées.
 */
const isSelected = (item, selectedIds) =>
    selectedIds ? selectedIds.has(String(item.id)) : false;

/**
 * Sélection d'options à l'ouverture du lien client : le devis s'affiche d'abord
 * au PRIX FERME de l'artisan, celui dont les totaux sont stockés en base.
 *
 *  - Options libres (cases à cocher) : décochées — le client ajoute ce qu'il
 *    veut. Pré-cocher afficherait le montant maximum et lui ferait payer une
 *    option qu'il n'a pas demandée s'il signe sans ouvrir le panneau.
 *  - Groupe à choix multiple non obligatoire : aucune retenue (le groupe offre
 *    « Aucune de ces options »).
 *  - Groupe à choix OBLIGATOIRE : la première option sert de défaut, le groupe
 *    n'ayant pas de « aucune » et attendant une réponse.
 *
 * @param {Array} items Les lignes du devis.
 * @returns {Set<string>} Les ids des options retenues au départ.
 */
export function initialOptionSelection(items) {
    const optItems = (items || []).filter(i => i.is_optional);
    const requiredGroups = new Set(
        optItems.filter(i => i.option_group && i.option_group_required)
            .map(i => i.option_group)
    );
    const ids = new Set();
    const seenGroups = new Set();
    for (const it of optItems) {
        if (!it.option_group || seenGroups.has(it.option_group)) continue;
        seenGroups.add(it.option_group);
        if (requiredGroups.has(it.option_group)) ids.add(String(it.id));
    }
    return ids;
}

/**
 * Applique la sélection d'options du client à un devis : les options retenues
 * deviennent des lignes fermes, celles qui ne le sont pas restent affichées
 * comme options hors total, et les totaux sont recalculés sur les seules lignes
 * fermes.
 *
 * @param {object} quote        Le devis tel que renvoyé par get_public_quote.
 * @param {Set<string>|null} selectedIds Ids des options retenues (null = aucune).
 * @returns {object|null} Le devis à passer au générateur de PDF.
 */
export function quoteWithSelectedOptions(quote, selectedIds) {
    if (!quote) return null;

    const items = (quote.items || []).map(item => {
        if (!item.is_optional || !isSelected(item, selectedIds)) return item;
        // Option retenue → ligne ferme : comptée dans le total ET dans les
        // sous-totaux / l'acompte matériel, qui filtrent is_optional.
        const firm = { ...item };
        delete firm.is_optional;
        return firm;
    });

    // Devis externe : les totaux sont saisis à la main, les lignes ne font pas
    // foi (même exception que la RPC). On ne touche qu'aux lignes.
    if (quote.is_external) return { ...quote, items };

    const includeTva = quote.include_tva !== false;
    // Total ferme : ni les titres de section, ni les options laissées de côté
    // (mêmes filtres que les sous-totaux du PDF et que l'acompte matériel).
    const totalHT = items
        .filter(item => item.type !== 'section' && !item.is_optional)
        .reduce((sum, item) => sum + quoteLineAmount(item), 0);
    const totalTVA = includeTva ? totalHT * 0.20 : 0;

    return {
        ...quote,
        items,
        total_ht: totalHT,
        total_tva: totalTVA,
        total_ttc: totalHT + totalTVA,
    };
}
