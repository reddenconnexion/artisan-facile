// Helpers du « chiffrage interne » des lignes de devis.
//
// Beaucoup d'artisans rédigent leurs devis en « mode groupé » : une ligne
// forfait (ex. « Rénovation salle de bain complète ») regroupe main d'œuvre
// et fournitures sans les détailler au client. Le détail (quelles fournitures,
// quelles quantités, quel coût) restait alors dans des notes papier.
//
// Le chiffrage interne stocke ce détail directement sur la ligne, dans le JSON
// `quotes.items` :
//   - item.components     : [{ id, description, quantity, unit, buying_price }]
//   - item.internal_note  : note libre (repères chantier, référence fournisseur…)
//
// Ces deux clés sont STRICTEMENT privées : ignorées par le PDF et retirées par
// les RPC publiques (lien /q/:token et portail client) — voir la migration
// 20260704120000_hide_internal_quote_item_fields.sql.

/** Fournitures internes exploitables d'une ligne (description renseignée). */
export const lineComponents = (item) =>
    (Array.isArray(item?.components) ? item.components : [])
        .filter((c) => c && (c.description || '').trim());

/** Coût d'achat total des fournitures internes d'une ligne. */
export const componentsCost = (item) =>
    lineComponents(item).reduce(
        (sum, c) => sum + (parseFloat(c.quantity) || 0) * (parseFloat(c.buying_price) || 0),
        0
    );

/**
 * Coût d'achat effectif d'une ligne pour le calcul de marge.
 * Le prix d'achat saisi sur la ligne reste prioritaire ; à défaut, on prend la
 * somme des fournitures du chiffrage interne (jamais les deux, pour éviter de
 * compter le matériel en double).
 */
export const effectiveLineCost = (item) => {
    const direct = (parseFloat(item?.quantity) || 0) * (parseFloat(item?.buying_price) || 0);
    return direct > 0 ? direct : componentsCost(item);
};

/**
 * Liste à plat des fournitures à acheter pour un devis : les lignes de type
 * « Matériel » + les fournitures internes de toutes les lignes (y compris
 * groupées). Chaque entrée porte une clé stable pour mémoriser les envois
 * vers la liste d'achats.
 *
 * @returns {Array<{key: string, description: string, quantity: number, unit: string, context: string|null}>}
 */
export const supplyEntries = (items) => {
    const entries = [];
    (Array.isArray(items) ? items : []).forEach((item, idx) => {
        if (!item || item.type === 'section') return;
        const lineId = item.id ?? idx;
        const components = lineComponents(item);
        // Une ligne Matériel détaillée par un chiffrage interne n'est pas
        // proposée elle-même : ses fournitures sont la vraie liste d'achats.
        if (item.type === 'material' && components.length === 0 && (item.description || '').trim()) {
            entries.push({
                key: `line:${lineId}`,
                description: item.description.trim(),
                quantity: parseFloat(item.quantity) || 1,
                unit: item.unit || 'u',
                context: null,
            });
        }
        components.forEach((c, ci) => {
            entries.push({
                key: `comp:${lineId}:${c.id ?? ci}`,
                description: c.description.trim(),
                quantity: parseFloat(c.quantity) || 1,
                unit: c.unit || 'u',
                context: (item.description || '').trim() || null,
            });
        });
    });
    return entries;
};
