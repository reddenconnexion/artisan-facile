import { describe, it, expect } from 'vitest';
import { computeQuoteTotals } from './quoteTotals';

const base = { is_external: false, include_tva: true, items: [] };

describe('computeQuoteTotals', () => {
    it('devis vide : tout à zéro', () => {
        expect(computeQuoteTotals(base)).toEqual({ subtotal: 0, tva: 0, total: 0, totalCost: 0 });
    });

    it('somme quantité × prix, TVA 20 %', () => {
        const r = computeQuoteTotals({
            ...base,
            items: [
                { description: 'A', quantity: 2, price: 50 },
                { description: 'B', quantity: '3', price: '10.5' },
            ],
        });
        expect(r.subtotal).toBeCloseTo(131.5);
        expect(r.tva).toBeCloseTo(26.3);
        expect(r.total).toBeCloseTo(157.8);
    });

    it('sans TVA (franchise) : total = HT', () => {
        const r = computeQuoteTotals({ ...base, include_tva: false, items: [{ quantity: 1, price: 100 }] });
        expect(r).toMatchObject({ subtotal: 100, tva: 0, total: 100 });
    });

    it('ignore les sections et les lignes optionnelles', () => {
        const r = computeQuoteTotals({
            ...base,
            items: [
                { type: 'section', description: 'Lot 1', quantity: 5, price: 999 },
                { quantity: 1, price: 100 },
                { quantity: 1, price: 500, is_optional: true },
            ],
        });
        expect(r.subtotal).toBe(100);
        expect(r.total).toBe(120);
    });

    it('valeurs invalides ou vides comptent pour 0', () => {
        const r = computeQuoteTotals({ ...base, items: [{ quantity: 'abc', price: 10 }, { quantity: 2, price: '' }] });
        expect(r.subtotal).toBe(0);
    });

    it('coût matière : prix d\'achat de la ligne, ou fournitures internes', () => {
        const r = computeQuoteTotals({
            ...base,
            items: [
                { quantity: 2, price: 100, buying_price: 30 },
                { quantity: 1, price: 500, components: [{ description: 'Câble', quantity: 10, buying_price: 2 }] },
            ],
        });
        expect(r.totalCost).toBeGreaterThan(0);
        expect(r.subtotal).toBe(700);
    });

    it('devis externe : montants manuels, indépendants des lignes', () => {
        const r = computeQuoteTotals({
            is_external: true,
            manual_total_ht: '1000',
            manual_total_tva: '200',
            manual_total_ttc: '1200',
            items: [{ quantity: 1, price: 5 }],
        });
        expect(r).toEqual({ subtotal: 1000, tva: 200, total: 1200, totalCost: 0 });
    });

    it('devis externe sans montants : zéros', () => {
        expect(computeQuoteTotals({ is_external: true, items: [] }))
            .toEqual({ subtotal: 0, tva: 0, total: 0, totalCost: 0 });
    });
});
