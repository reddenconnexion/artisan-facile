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
