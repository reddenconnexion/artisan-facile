// Rentabilité par chantier et par client.
//
// Regroupe les rapports de marge réelle (voir chantierMargin.js, qui porte
// toutes les règles de rattachement coût ↔ CA) : ce module ne recalcule rien,
// il trie et additionne. Fonctions PURES.

const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};

/**
 * Une ligne par chantier, avec son bénéfice (CA − coût) et sa marge.
 * Les chantiers sans rapport (rien de réalisé, CA nul) sont comptés à part
 * dans `missing` : on ne leur invente pas de marge.
 *
 * @param {Array} roots    Devis initiaux des chantiers (avec `clients`).
 * @param {Map} reports    Résultat de chantierMarginReports.
 * @returns {{rows: Array, missing: Array}}
 */
export const chantierProfitRows = (roots, reports) => {
    const rows = [];
    const missing = [];
    (Array.isArray(roots) ? roots : []).forEach((root) => {
        if (!root || root.id == null) return;
        const report = reports instanceof Map ? reports.get(Number(root.id)) : null;
        if (!report) {
            missing.push(root);
            return;
        }
        const revenue = num(report.revenue);
        const cost = num(report.cost);
        rows.push({
            id: root.id,
            title: root.title || `Devis ${root.id}`,
            clientId: root.client_id ?? root.clients?.id ?? null,
            clientName: root.clients?.name || 'Client inconnu',
            revenue,
            cost,
            profit: revenue - cost,
            margin: report.margin,
            level: report.level,
        });
    });
    return { rows, missing };
};

/**
 * Cumul par client : CA, coût, bénéfice et marge moyenne pondérée (somme des
 * bénéfices / somme des CA, pas moyenne des pourcentages).
 */
export const clientProfitRows = (chantierRows) => {
    const byClient = new Map();
    (Array.isArray(chantierRows) ? chantierRows : []).forEach((r) => {
        const key = r.clientId ?? `name:${r.clientName}`;
        const cur = byClient.get(key) || {
            key, clientId: r.clientId, clientName: r.clientName,
            revenue: 0, cost: 0, profit: 0, chantiers: 0,
        };
        cur.revenue += r.revenue;
        cur.cost += r.cost;
        cur.profit += r.profit;
        cur.chantiers += 1;
        byClient.set(key, cur);
    });
    return [...byClient.values()].map((c) => ({
        ...c,
        margin: c.revenue > 0 ? c.profit / c.revenue : 0,
    }));
};

/** Totaux globaux de lignes (chantiers ou clients). */
export const profitTotals = (rows) => {
    const list = Array.isArray(rows) ? rows : [];
    const revenue = list.reduce((s, r) => s + r.revenue, 0);
    const cost = list.reduce((s, r) => s + r.cost, 0);
    const profit = revenue - cost;
    return { revenue, cost, profit, margin: revenue > 0 ? profit / revenue : null };
};

const SORTERS = {
    profit: (a, b) => b.profit - a.profit,
    margin: (a, b) => a.margin - b.margin, // les moins rentables d'abord
    revenue: (a, b) => b.revenue - a.revenue,
};

export const PROFIT_SORTS = [
    { id: 'profit', label: 'Bénéfice' },
    { id: 'margin', label: 'Marge (pire d\'abord)' },
    { id: 'revenue', label: 'Chiffre d\'affaires' },
];

export const sortProfitRows = (rows, sortId = 'profit') =>
    [...(Array.isArray(rows) ? rows : [])].sort(SORTERS[sortId] || SORTERS.profit);
