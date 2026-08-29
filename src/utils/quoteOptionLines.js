// ── Séparation des lignes fermes et des options proposées ──
//
// Une option n'est pas due tant que le client ne l'a pas retenue. Tant qu'elle
// figurait DANS les tableaux « Main d'œuvre » et « Fournitures », montant en
// colonne, elle se lisait comme une ligne à payer : seul un préfixe « (Option) »
// la distinguait, et les sous-totaux — qui l'excluent — ne retombaient plus sur
// la somme visible de la colonne. Le client additionnait le tableau, trouvait
// autre chose que le total, et écrivait pour demander d'où venait l'écart
// (devis n° 223 : 355 € d'options introuvables entre les sous-totaux et le
// TOTAL HT).
//
// D'où la règle appliquée ici : les tableaux ne portent QUE ce qui est dû, les
// options proposées sont sorties dans leur propre bloc, après les totaux. Le
// devis reste une trace complète de ce qui a été offert, mais plus une seule
// colonne ne mélange des montants dus et des montants qui ne le sont pas.
//
// Une option RETENUE (option_accepted, is_optional retiré par la RPC
// `select_quote_options`) est une ligne ferme : elle reste dans les tableaux,
// où son libellé « (Option retenue) » rappelle qu'elle vient d'un choix du
// client. Une option ÉCARTÉE (option_declined) garde is_optional et rejoint le
// bloc des options, barrée : le devis signé dit ce qui a été proposé et refusé.

/**
 * Répartit les lignes d'un devis entre le chiffrage ferme et les options.
 *
 * Les titres de section restent du côté ferme : ils structurent les tableaux,
 * et `buildGroupRows` n'en émet le sous-titre que si une ligne suit — une
 * section devenue vide (ne contenant que des options) disparaît d'elle-même.
 *
 * Chaque option emporte le nom de la section où l'artisan l'a placée
 * (`option_section`), pour que le bloc des options garde le même regroupement
 * que le reste du devis plutôt qu'une liste à plat.
 *
 * @param {Array} items Les lignes du devis, dans l'ordre voulu par l'artisan.
 * @returns {{firmItems: Array, offeredOptions: Array}}
 */
export function splitQuoteOptionLines(items) {
    const firmItems = [];
    const offeredOptions = [];
    let currentSection = null;

    for (const item of (items || [])) {
        if (item.type === 'section') {
            currentSection = (item.description || '').trim() || null;
            firmItems.push(item);
            continue;
        }
        if (item.is_optional) {
            offeredOptions.push(currentSection ? { ...item, option_section: currentSection } : { ...item });
        } else {
            firmItems.push(item);
        }
    }

    return { firmItems, offeredOptions };
}
