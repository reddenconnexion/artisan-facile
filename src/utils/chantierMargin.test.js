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
    monthlyNetIncomeSeries,
    rangeNetIncome,
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
    it('ignore les options non retenues et les titres de section', () => {
        const withOptions = [
            { type: 'section', description: 'Cuisine' },
            ...items,
            { type: 'service', description: 'Prise en option', quantity: 2, price: 45, is_optional: true },
            { type: 'material', description: 'Spots en option', quantity: 4, price: 30, is_optional: true },
        ];
        expect(splitServiceMaterial({ items: withOptions })).toEqual({ serviceAmount: 400, materialAmount: 600 });
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

describe('monthlyNetIncomeSeries', () => {
    const now = new Date(2026, 9, 24); // 24 octobre 2026
    const paid = (id, paidAt, total) => ({ id, status: 'paid', type: 'quote', paid_at: paidAt, total_ht: total });
    const base = { costByQuote: new Map(), materialMarginRate: 0.25, taxMethod: 'versement_liberatoire', now };

    it("démarre au premier encaissement et s'arrête au mois en cours", () => {
        const docs = [paid(1, '2025-09-10T10:00:00Z', 1000), paid(2, '2026-03-05T10:00:00Z', 2000)];
        const y2025 = monthlyNetIncomeSeries({ ...base, docs, year: 2025 });
        expect(y2025.map(m => m.key)).toEqual(['2025-09', '2025-10', '2025-11', '2025-12']);
        const y2026 = monthlyNetIncomeSeries({ ...base, docs, year: 2026 });
        expect(y2026).toHaveLength(10); // janvier → octobre
        expect(monthlyNetIncomeSeries({ ...base, docs, year: 2024 })).toEqual([]);
        expect(monthlyNetIncomeSeries({ ...base, docs, year: 2027 })).toEqual([]);
        expect(monthlyNetIncomeSeries({ ...base, docs: [], year: 2026 })).toEqual([]);
    });

    it('calcule chaque mois comme le bloc revenu net (URSSAF, charges, impôt)', () => {
        const docs = [paid(1, '2026-03-05T10:00:00Z', 2000)];
        const series = monthlyNetIncomeSeries({ ...base, docs, year: 2026, proChargesMonthly: 100 });
        const march = series.find(m => m.key === '2026-03');
        // URSSAF services 21,2 % + CFP 0,3 % + CMA 0,48 % ; versement libératoire 1,7 %.
        const urssaf = 2000 * (0.212 + 0.003 + 0.0048);
        expect(march.urssafCharges).toBeCloseTo(urssaf, 6);
        expect(march.incomeTax).toBeCloseTo(34, 6);
        expect(march.revenuNet).toBeCloseTo(2000 - urssaf - 100 - 34, 6);
        // Mois sans encaissement : seules les charges pro.
        expect(series.find(m => m.key === '2026-04').revenuNet).toBe(-100);
    });

    it("applique l'ACRE jusqu'au mois de fin indiqué", () => {
        const docs = [paid(1, '2026-06-05T10:00:00Z', 1000), paid(2, '2026-07-05T10:00:00Z', 1000)];
        const series = monthlyNetIncomeSeries({ ...base, docs, year: 2026, acreEndMonth: '2026-06' });
        const june = series.find(m => m.key === '2026-06');
        const july = series.find(m => m.key === '2026-07');
        expect(june.hasAcre).toBe(true);
        expect(july.hasAcre).toBe(false);
        expect(june.urssafCharges).toBeLessThan(july.urssafCharges);
        // Sans date de fin, la case ACRE vaut pour tous les mois.
        expect(monthlyNetIncomeSeries({ ...base, docs, year: 2026, hasAcre: true }).every(m => m.hasAcre)).toBe(true);
    });

    it('ne compte pas deux fois une facture enfant de devis payé', () => {
        const docs = [
            paid(1, '2026-02-05T10:00:00Z', 1000),
            { id: 2, parent_id: 1, type: 'invoice', status: 'paid', paid_at: '2026-02-06T10:00:00Z', total_ht: 1000 },
        ];
        const feb = monthlyNetIncomeSeries({ ...base, docs, year: 2026 }).find(m => m.key === '2026-02');
        expect(feb.caTotal).toBe(1000);
    });

    it("hors micro-entreprise, pas d'URSSAF estimée", () => {
        const docs = [paid(1, '2026-02-05T10:00:00Z', 1000)];
        const feb = monthlyNetIncomeSeries({ ...base, docs, year: 2026, status: 'sasu' }).find(m => m.key === '2026-02');
        expect(feb.urssafCharges).toBe(0);
        expect(feb.margeChantier).toBe(1000);
    });
});

describe('rangeNetIncome', () => {
    const now = new Date(2026, 9, 24, 15); // samedi 24 octobre 2026
    const paid = (id, paidAt, total) => ({ id, status: 'paid', type: 'quote', paid_at: paidAt, total_ht: total });
    const base = { costByQuote: new Map(), materialMarginRate: 0.25, taxMethod: 'versement_liberatoire', now };
    const docs = [paid(1, '2025-09-10T10:00:00', 1000), paid(2, '2026-10-05T10:00:00', 2000)];

    it('retombe sur le revenu net du mois (comme monthlyNetIncomeSeries)', () => {
        const res = rangeNetIncome({ ...base, docs, start: new Date(2026, 9, 1), days: 31, proChargesForPeriod: 240 });
        const october = monthlyNetIncomeSeries({ ...base, docs, year: 2026, proChargesMonthly: 240 }).find(m => m.key === '2026-10');
        expect(res.total).toBeCloseTo(october.revenuNet, 6);
        // Les points s'additionnent au total ; pas de charges sur les jours à venir.
        expect(res.points.reduce((a, b) => a + b, 0)).toBeCloseTo(res.total, 6);
        expect(res.points.slice(24).every(v => v === 0)).toBe(true);
        expect(res.points[0]).toBeCloseTo(-10, 6); // 240 € répartis sur 24 jours écoulés
    });

    it('vaut 0 avant le début d’activité ou dans le futur', () => {
        expect(rangeNetIncome({ ...base, docs, start: new Date(2025, 7, 1), days: 31, proChargesForPeriod: 240 }).total).toBe(0);
        expect(rangeNetIncome({ ...base, docs, start: new Date(2026, 10, 1), days: 30, proChargesForPeriod: 240 }).total).toBe(0);
    });

    it('commence à compter les charges au premier encaissement', () => {
        const res = rangeNetIncome({ ...base, docs, start: new Date(2025, 8, 1), days: 30, proChargesForPeriod: 210 });
        expect(res.points.slice(0, 9).every(v => v === 0)).toBe(true);
        expect(res.points[29]).toBeCloseTo(-10, 6); // 210 € sur 21 jours (10 → 30 septembre)
    });
});
