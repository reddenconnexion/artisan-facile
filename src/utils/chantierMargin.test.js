import { describe, it, expect } from 'vitest';
import {
    realizedSourcesFor,
    quoteMarginSummary,
    paidQuoteIdSet,
    isDuplicatePaidChild,
    isCountedPaidDoc,
    splitServiceMaterial,
    periodNetIncome,
    paidDate,
} from './chantierMargin';
import { procurementCostByQuote, spentHoursByQuote } from './realizedMargin';

// Chantier : devis initial 9 (achats + pointage), avenant 12 sans coûts propres.
const procurementCosts = procurementCostByQuote([
    { quote_id: 9, quantity: 1, buying_price: 400, sale_price: 600 },
]);
const spentHoursMap = spentHoursByQuote([{ quote_id: 9, hours_spent: 10 }]);

const items = [
    { type: 'material', description: 'Tableau', quantity: 1, price: 600, buying_price: 350 },
    { type: 'service', description: 'Pose', unit: 'h', quantity: 8, price: 50 },
];

describe('realizedSourcesFor', () => {
    it('prend les coûts propres du document en priorité', () => {
        const { agg, spentHours } = realizedSourcesFor({ id: 9, parentId: null, doc: {}, procurementCosts, spentHoursMap });
        expect(agg.cost).toBe(400);
        expect(spentHours).toBe(10);
    });

    it('retombe sur le parent pour une facture à périmètre complet', () => {
        const { agg, spentHours } = realizedSourcesFor({
            id: 30, parentId: 9, doc: { type: 'invoice', title: 'Facture' }, procurementCosts, spentHoursMap,
        });
        expect(agg.cost).toBe(400);
        expect(spentHours).toBe(10);
    });

    it('ne retombe PAS sur le parent pour un avenant ou une situation', () => {
        const amendment = realizedSourcesFor({ id: 12, parentId: 9, doc: { type: 'amendment' }, procurementCosts, spentHoursMap });
        expect(amendment).toEqual({ agg: undefined, spentHours: 0 });
        const situation = realizedSourcesFor({
            id: 31, parentId: 9, doc: { type: 'invoice', title: 'Situation n°2' }, procurementCosts, spentHoursMap,
        });
        expect(situation).toEqual({ agg: undefined, spentHours: 0 });
    });

    it('tolère des maps absentes', () => {
        expect(realizedSourcesFor({ id: 9, parentId: null, doc: {} })).toEqual({ agg: undefined, spentHours: 0 });
    });
});

describe('quoteMarginSummary', () => {
    it('calcule marge prévue et réalisée du devis', () => {
        const { laborRate, planned, realized, chantier } = quoteMarginSummary({
            id: 9, doc: { items }, subtotal: 1000, laborCostRate: '30', procurementCosts, spentHoursMap,
        });
        expect(laborRate).toBe(30);
        expect(planned.materialCost).toBe(350);
        expect(planned.laborCost).toBe(240);
        expect(realized.materialCost).toBe(400);
        expect(realized.laborCost).toBe(300);
        expect(realized.margin).toBeCloseTo(0.3);
        expect(chantier).toBeNull();
    });

    it("n'affiche pas de marge réalisée aberrante sur un avenant sans coûts propres", () => {
        const { realized } = quoteMarginSummary({
            id: 12, doc: { items, type: 'amendment', parent_quote_id: 9 }, subtotal: 800, laborCostRate: 30, procurementCosts, spentHoursMap,
        });
        expect(realized).toBeNull();
    });

    it('ne calcule pas de marge réalisée sans CA', () => {
        const { realized } = quoteMarginSummary({ id: 9, doc: { items }, subtotal: 0, laborCostRate: 30, procurementCosts, spentHoursMap });
        expect(realized).toBeNull();
    });

    it('consolide le chantier dès qu’un avenant signé existe', () => {
        const chantierDocs = [
            { id: 9, items, total_ht: 1000 },
            { id: 12, items: [{ type: 'service', unit: 'h', quantity: 2, price: 50 }], total_ht: 100 },
        ];
        const { chantier } = quoteMarginSummary({
            id: 12, doc: { items: chantierDocs[1].items, type: 'amendment', parent_quote_id: 9 }, subtotal: 100,
            laborCostRate: 30, procurementCosts, spentHoursMap, chantierDocs,
        });
        expect(chantier.revenue).toBe(1100);
        expect(chantier.docCount).toBe(2);
        // 400 matière réelle + 300 MO pointée (devis) + 60 MO prévue (avenant)
        expect(chantier.cost).toBe(760);
    });
});

describe('documents payés comptés', () => {
    const docs = [
        { id: 1, type: 'quote', status: 'paid' },
        { id: 2, type: 'invoice', status: 'paid', parent_id: 1 },  // doublon du devis 1
        { id: 3, type: 'invoice', status: 'paid', parent_id: 99 }, // parent non payé
        { id: 4, type: null, status: 'PAID' },
        { id: 5, type: 'quote', status: 'sent' },
    ];
    const paid = paidQuoteIdSet(docs);

    it('repère les devis payés (hors factures)', () => {
        expect([...paid].sort()).toEqual([1, 4]);
    });

    it('écarte les factures enfant d’un devis déjà payé', () => {
        expect(isDuplicatePaidChild(docs[1], paid)).toBe(true);
        expect(isDuplicatePaidChild(docs[2], paid)).toBe(false);
        expect(docs.filter((d) => isCountedPaidDoc(d, paid)).map((d) => d.id)).toEqual([1, 3, 4]);
    });
});

describe('splitServiceMaterial', () => {
    it('ventile les lignes par type', () => {
        expect(splitServiceMaterial({ items })).toEqual({ serviceAmount: 400, materialAmount: 600 });
    });
    it('compte tout en main d’œuvre sans lignes', () => {
        expect(splitServiceMaterial({ items: [], total_ht: 500 })).toEqual({ serviceAmount: 500, materialAmount: 0 });
        expect(splitServiceMaterial({ total_ttc: 120 })).toEqual({ serviceAmount: 120, materialAmount: 0 });
    });
});

describe('periodNetIncome', () => {
    it('bascule la marge matériel au réel et ne compte le coût parent qu’une fois', () => {
        const entries = [
            { id: 12, parentId: 9, materialAmount: 300 },
            { id: 13, parentId: 9, materialAmount: 300 },
        ];
        const res = periodNetIncome({
            entries, costByQuote: procurementCosts,
            caServices: 1000, caMateriel: 800, materialMarginRate: 0.25,
            urssafCharges: 100, proChargesForPeriod: 50, incomeTax: 20,
        });
        expect(res.realCoveredCount).toBe(2);
        expect(res.caMaterielReal).toBe(600);
        expect(res.realMaterialCost).toBe(400);
        // marge matériel = (800 − 600) × 25 % + (600 − 400) = 250
        expect(res.margeMateriel).toBe(250);
        expect(res.revenuNet).toBe(1000 + 250 - 100 - 50 - 20);
    });

    it('reste au forfait sans achats suivis', () => {
        const res = periodNetIncome({ entries: [], costByQuote: new Map(), caServices: 100, caMateriel: 100, materialMarginRate: 0.25 });
        expect(res.margeMateriel).toBe(25);
        expect(res.realCoveredCount).toBe(0);
    });
});

describe('paidDate', () => {
    it("range un document payé à sa date d'encaissement", () => {
        const doc = { date: '2026-09-15', created_at: '2026-09-15T10:00:00Z', paid_at: '2026-10-02T09:00:00Z' };
        expect(paidDate(doc).toISOString()).toBe('2026-10-02T09:00:00.000Z');
    });

    it("se replie sur la date du document sans paid_at", () => {
        expect(paidDate({ date: '2026-09-15', created_at: '2026-09-01T10:00:00Z' }).toISOString().slice(0, 10)).toBe('2026-09-15');
        expect(paidDate({ created_at: '2026-09-01T10:00:00Z' }).toISOString().slice(0, 10)).toBe('2026-09-01');
    });
});
