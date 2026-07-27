import { describe, it, expect } from 'vitest';
import {
    procurementCostByQuote,
    spentHoursByQuote,
    realizedQuoteMargin,
    groupMaterialsMargin,
    realizedNetAdjustment,
    isPartialScopeDoc,
} from './realizedMargin';

// Lignes d'achat type : deux devis suivis + une saisie terrain sans devis.
const rows = [
    { quote_id: 7, quantity: 2, buying_price: 10, sale_price: 20 },   // 20 € d'achat
    { quote_id: 7, quantity: 1, buying_price: 30, sale_price: null }, // 30 €, PV inconnu
    { quote_id: 7, quantity: 4, buying_price: null, sale_price: 8 },  // prix non renseigné
    { quote_id: 9, quantity: 1, buying_price: 100, sale_price: 150 },
    { quote_id: null, quantity: 3, buying_price: 5 },                 // terrain, ignorée
];

describe('procurementCostByQuote', () => {
    it('agrège quantité × prix d\'achat par devis, en ignorant les lignes sans devis', () => {
        const map = procurementCostByQuote(rows);
        expect(map.size).toBe(2);
        expect(map.get(7)).toMatchObject({ cost: 50, totalCount: 3, pricedCount: 2 });
        expect(map.get(9)).toMatchObject({ cost: 100, totalCount: 1, pricedCount: 1 });
    });

    it('ne compte en base comparable (saleKnown/costKnown) que les lignes avec PV et PA', () => {
        const agg = procurementCostByQuote(rows).get(7);
        expect(agg.saleKnown).toBe(40);  // 2 × 20 (la ligne sans PV est exclue)
        expect(agg.costKnown).toBe(20);
    });

    it('tolère les listes vides ou invalides', () => {
        expect(procurementCostByQuote([]).size).toBe(0);
        expect(procurementCostByQuote(null).size).toBe(0);
        expect(procurementCostByQuote([null, {}]).size).toBe(0);
    });
});

describe('spentHoursByQuote', () => {
    it('cumule les heures pointées par devis, en ignorant les pointages sans chantier', () => {
        const map = spentHoursByQuote([
            { quote_id: 7, hours_spent: 2.5 },
            { quote_id: 7, hours_spent: 1.5 },
            { quote_id: 9, hours_spent: '3' },
            { quote_id: null, hours_spent: 4 },
        ]);
        expect(map.get(7)).toBe(4);
        expect(map.get(9)).toBe(3);
        expect(map.size).toBe(2);
    });

    it('tolère les listes vides ou invalides', () => {
        expect(spentHoursByQuote([]).size).toBe(0);
        expect(spentHoursByQuote(null).size).toBe(0);
    });
});

describe('realizedQuoteMargin', () => {
    // Devis : 1000 € HT vendus, 300 € de matériel prévu, pas de main d'œuvre chiffrée.
    const items = [
        { type: 'material', description: 'Tableau', quantity: 1, price: 600, buying_price: 300 },
        { type: 'service', description: 'Pose', quantity: 1, price: 400, buying_price: 0 },
    ];

    it('null sans achats au prix renseigné (rien de « réalisé »)', () => {
        expect(realizedQuoteMargin(items, 1000, 0, undefined)).toBeNull();
        expect(realizedQuoteMargin(items, 1000, 0, { cost: 0, pricedCount: 0, totalCount: 2 })).toBeNull();
    });

    it('remplace le coût matière prévu par le coût réel des achats', () => {
        const agg = { cost: 250, pricedCount: 2, totalCount: 2 };
        const r = realizedQuoteMargin(items, 1000, 0, agg);
        expect(r.materialCost).toBe(250);
        expect(r.margin).toBeCloseTo(0.75, 6);        // (1000 − 250) / 1000
        expect(r.plannedMargin).toBeCloseTo(0.70, 6); // (1000 − 300) / 1000
        expect(r.delta).toBeCloseTo(0.05, 6);
    });

    it('conserve la main d\'œuvre du devis dans le coût total', () => {
        const withLabor = [
            ...items,
            { type: 'service', description: 'Main d\'œuvre', quantity: 2, unit: 'h', price: 50, buying_price: 0 },
        ];
        const agg = { cost: 250, pricedCount: 1, totalCount: 1 };
        const r = realizedQuoteMargin(withLabor, 1100, 30, agg);
        expect(r.laborCost).toBe(60); // 2 h × 30 €
        expect(r.cost).toBe(310);
        expect(r.hasLabor).toBe(true);
        expect(r.laborIsReal).toBe(false);
    });

    const withLabor = [
        ...items,
        { type: 'service', description: 'Main d\'œuvre', quantity: 2, unit: 'h', price: 50, buying_price: 0 },
    ];

    it('pointage réalisé : la main d\'œuvre est valorisée au temps réellement passé', () => {
        const agg = { cost: 250, pricedCount: 1, totalCount: 1 };
        // 2 h facturées, mais 3 h pointées sur le chantier.
        const r = realizedQuoteMargin(withLabor, 1100, 30, agg, 3);
        expect(r.laborIsReal).toBe(true);
        expect(r.laborCost).toBe(90);         // 3 h pointées × 30 €
        expect(r.cost).toBe(340);             // 250 + 90
        expect(r.spentHours).toBe(3);
        expect(r.estimatedHours).toBe(2);
        expect(r.margin).toBeCloseTo((1100 - 340) / 1100, 6);
    });

    it('pointage seul (sans achats suivis) : matière au prévu, main d\'œuvre au réel', () => {
        const r = realizedQuoteMargin(withLabor, 1100, 30, undefined, 4);
        expect(r.materialIsReal).toBe(false);
        expect(r.materialCost).toBe(300);     // coût matière prévu au devis
        expect(r.laborCost).toBe(120);        // 4 h × 30 €
        expect(r.laborIsReal).toBe(true);
    });

    it('pointage sans coût horaire connu : rien de chiffrable, null', () => {
        expect(realizedQuoteMargin(withLabor, 1100, 0, undefined, 4)).toBeNull();
    });
});

describe('groupMaterialsMargin', () => {
    it('marge à périmètre égal : uniquement les lignes avec PV et PA connus', () => {
        const gm = groupMaterialsMargin(rows.filter(r => r.quote_id === 7));
        expect(gm.margin).toBeCloseTo(0.5, 6); // (40 − 20) / 40
        expect(gm.pricedCount).toBe(2);
        expect(gm.totalCount).toBe(3);
    });

    it('null quand aucune base de vente comparable', () => {
        expect(groupMaterialsMargin([{ quote_id: 1, quantity: 1, buying_price: 10, sale_price: null }])).toBeNull();
        expect(groupMaterialsMargin([])).toBeNull();
    });
});

describe('realizedNetAdjustment', () => {
    const costByQuote = procurementCostByQuote(rows);

    it('bascule au réel la part matériel des factures couvertes', () => {
        const entries = [
            { id: 7, parentId: null, materialAmount: 400 },   // couvert (coût réel 50)
            { id: 42, parentId: null, materialAmount: 300 },  // pas d'achats suivis
        ];
        const a = realizedNetAdjustment(entries, costByQuote);
        expect(a).toEqual({ caMaterielReal: 400, realMaterialCost: 50, coveredCount: 1 });
    });

    it('retrouve les achats du devis parent pour une facture enfant', () => {
        const entries = [{ id: 123, parentId: 9, materialAmount: 150 }];
        const a = realizedNetAdjustment(entries, costByQuote);
        expect(a).toEqual({ caMaterielReal: 150, realMaterialCost: 100, coveredCount: 1 });
    });

    it('neutre sans données (aucun achat suivi)', () => {
        const a = realizedNetAdjustment([{ id: 1, materialAmount: 100 }], new Map());
        expect(a).toEqual({ caMaterielReal: 0, realMaterialCost: 0, coveredCount: 0 });
    });

    it('ne compte le coût du parent QU\'UNE FOIS pour plusieurs enfants (avenants, situations)', () => {
        // 3 documents payés du même chantier (devis 9, coût réel 100) : deux
        // situations + un avenant. Le CA s'additionne, le coût reste unique.
        const entries = [
            { id: 101, parentId: 9, materialAmount: 60 },
            { id: 102, parentId: 9, materialAmount: 40 },
            { id: 103, parentId: 9, materialAmount: 50 },
        ];
        const a = realizedNetAdjustment(entries, costByQuote);
        expect(a.caMaterielReal).toBe(150);  // 60 + 40 + 50 : propre à chaque doc
        expect(a.realMaterialCost).toBe(100); // et NON 300
        expect(a.coveredCount).toBe(3);
    });

    it('ne compte pas deux fois le coût quand le parent est lui-même dans la période', () => {
        const entries = [
            { id: 9, parentId: null, materialAmount: 200 }, // le devis parent, payé
            { id: 104, parentId: 9, materialAmount: 50 },   // un avenant du même chantier
        ];
        const a = realizedNetAdjustment(entries, costByQuote);
        expect(a.caMaterielReal).toBe(250);
        expect(a.realMaterialCost).toBe(100); // le coût du devis 9, une seule fois
    });

    it('additionne les coûts de chantiers DISTINCTS', () => {
        const entries = [
            { id: 7, parentId: null, materialAmount: 100 }, // coût réel 50
            { id: 9, parentId: null, materialAmount: 200 }, // coût réel 100
        ];
        const a = realizedNetAdjustment(entries, costByQuote);
        expect(a.realMaterialCost).toBe(150);
        expect(a.coveredCount).toBe(2);
    });
});

describe('isPartialScopeDoc', () => {
    it('un avenant ne couvre qu\'une part du chantier', () => {
        expect(isPartialScopeDoc({ type: 'amendment' })).toBe(true);
        expect(isPartialScopeDoc({ type: 'AMENDMENT' })).toBe(true);
    });

    it('une facture de situation est partielle (contexte mémorisé ou titre)', () => {
        expect(isPartialScopeDoc({ type: 'invoice', amendment_details: { situation: {} } })).toBe(true);
        expect(isPartialScopeDoc({ type: 'invoice', title: 'Situation n°2' })).toBe(true);
    });

    it('un devis ou une facture ordinaire couvre le périmètre complet', () => {
        expect(isPartialScopeDoc({ type: 'quote', title: 'Rénovation salle de bain' })).toBe(false);
        expect(isPartialScopeDoc({ type: 'invoice', title: 'Facture finale' })).toBe(false);
        expect(isPartialScopeDoc(null)).toBe(false);
        expect(isPartialScopeDoc({})).toBe(false);
    });
});
