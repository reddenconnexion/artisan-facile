import { describe, it, expect } from 'vitest';
import { buildLineItemRows, LINE_ITEM_COLUMNS } from './quoteLineExport';
import { buildCsv } from './csvExport';
import { parseQuoteCsv } from './quoteCsvImport';

// Un devis avec ce qui se perdait avant : deux lots, une ligne optionnelle,
// des réserves dans les notes.
const DEVIS = {
    id: 258,
    quote_number: 258,
    type: 'quote',
    status: 'sent',
    date: '2026-08-08',
    client_name: 'Dupont',
    title: 'Rénovation tableau',
    notes: 'Acompte 30 % à la commande\n\nRéserves :\n- Sous réserve d\'accès aux combles',
    items: [
        { id: 1, description: 'Tableau', type: 'section' },
        { id: 2, description: 'Dépose ancien tableau', quantity: 1, unit: 'forfait', price: 150, buying_price: 0, type: 'service' },
        { id: 3, description: 'Tableau 3 rangées', quantity: 1, unit: 'u', price: 280.5, buying_price: 180, type: 'material' },
        { id: 4, description: 'Extérieur', type: 'section' },
        { id: 5, description: 'Parafoudre', quantity: 1, unit: 'u', price: 95, buying_price: 60, type: 'material', is_optional: true },
    ],
};

describe('buildLineItemRows', () => {
    it('ne sort pas les titres de lot en lignes, mais les reporte en colonne Lot', () => {
        const rows = buildLineItemRows([DEVIS]);
        expect(rows).toHaveLength(3);
        expect(rows.map((r) => [r.lot, r.description])).toEqual([
            ['Tableau', 'Dépose ancien tableau'],
            ['Tableau', 'Tableau 3 rangées'],
            ['Extérieur', 'Parafoudre'],
        ]);
    });

    it('marque l\'option en colonne, sans polluer la description', () => {
        const rows = buildLineItemRows([DEVIS]);
        expect(rows[2]).toMatchObject({ description: 'Parafoudre', is_optional: 'Oui' });
        expect(rows[0].is_optional).toBe('');
        // La marque « (Option) » ne doit plus être collée dans le libellé
        expect(rows.every((r) => !r.description.includes('(Option)'))).toBe(true);
    });

    it('recopie les notes du devis sur chaque ligne', () => {
        const rows = buildLineItemRows([DEVIS]);
        expect(new Set(rows.map((r) => r.notes)).size).toBe(1);
        expect(rows[0].notes).toContain('Réserves :');
    });

    it('ignore une ligne vide et un devis sans items', () => {
        const rows = buildLineItemRows([
            { id: 1, items: [{ id: 1, description: '', price: 0 }, null] },
            { id: 2, items: null },
        ]);
        expect(rows).toEqual([]);
    });
});

describe('aller-retour export → import', () => {
    it('un devis exporté puis réimporté revient à l\'identique', () => {
        const csv = buildCsv(buildLineItemRows([DEVIS]), LINE_ITEM_COLUMNS);
        const { items, notes, error } = parseQuoteCsv(csv);

        expect(error).toBeNull();
        // Lots reconstitués en lignes de section, à leur place
        expect(items.map((i) => [i.type, i.description])).toEqual([
            ['section', 'Tableau'],
            ['service', 'Dépose ancien tableau'],
            ['material', 'Tableau 3 rangées'],
            ['section', 'Extérieur'],
            ['material', 'Parafoudre'],
        ]);
        // Prix, prix d'achat, quantités et unités intacts
        expect(items[1]).toMatchObject({ quantity: 1, unit: 'forfait', price: 150, buying_price: 0 });
        expect(items[2]).toMatchObject({ quantity: 1, unit: 'u', price: 280.5, buying_price: 180 });
        // L'option reste une option
        expect(items[4]).toMatchObject({ description: 'Parafoudre', price: 95, buying_price: 60, is_optional: true });
        expect(items[1].is_optional).toBeUndefined();
        // Notes et réserves reprises une seule fois
        expect(notes).toBe(DEVIS.notes);
        // Le n° de devis ne tatoue pas le chiffrage interne
        expect(items.every((i) => i.internal_note === undefined)).toBe(true);
    });

    it('le total ferme réimporté exclut l\'option, comme à l\'origine', () => {
        const csv = buildCsv(buildLineItemRows([DEVIS]), LINE_ITEM_COLUMNS);
        const { items } = parseQuoteCsv(csv);
        const firm = items
            .filter((i) => i.type !== 'section' && !i.is_optional)
            .reduce((sum, i) => sum + i.price * i.quantity, 0);
        expect(firm).toBe(430.5); // 150 + 280,50 — le parafoudre optionnel reste dehors
    });
});
