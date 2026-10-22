import { describe, it, expect } from 'vitest';
import { chantierProfitRows, clientProfitRows, profitTotals, sortProfitRows } from './profitability';

const roots = [
    { id: 1, title: 'Rénovation', client_id: 10, clients: { id: 10, name: 'Dupont' } },
    { id: 2, title: 'Tableau', client_id: 10, clients: { id: 10, name: 'Dupont' } },
    { id: 3, title: 'Borne', client_id: 11, clients: { id: 11, name: 'Martin' } },
    { id: 4, title: 'Sans données', client_id: 11, clients: { id: 11, name: 'Martin' } },
];
const reports = new Map([
    [1, { revenue: 1000, cost: 500, margin: 0.4, level: 'ok' }],
    [2, { revenue: 500, cost: 450, margin: 0.1, level: 'below' }],
    [3, { revenue: 800, cost: 400, margin: 0.5, level: 'ok' }],
]);

describe('profitability', () => {
    it('sépare les chantiers sans rapport', () => {
        const { rows, missing } = chantierProfitRows(roots, reports);
        expect(rows).toHaveLength(3);
        expect(missing.map((m) => m.id)).toEqual([4]);
        expect(rows[0].profit).toBe(500);
    });

    it('cumule par client avec une marge pondérée', () => {
        const { rows } = chantierProfitRows(roots, reports);
        const clients = clientProfitRows(rows);
        const dupont = clients.find((c) => c.clientId === 10);
        expect(dupont.revenue).toBe(1500);
        expect(dupont.profit).toBe(550);
        expect(dupont.margin).toBeCloseTo(550 / 1500);
        expect(dupont.chantiers).toBe(2);
    });

    it('totalise et trie', () => {
        const { rows } = chantierProfitRows(roots, reports);
        expect(profitTotals(rows)).toMatchObject({ revenue: 2300, profit: 950 });
        expect(profitTotals([]).margin).toBeNull();
        expect(sortProfitRows(rows, 'margin')[0].id).toBe(2);
        expect(sortProfitRows(rows, 'profit')[0].id).toBe(1);
    });
});
