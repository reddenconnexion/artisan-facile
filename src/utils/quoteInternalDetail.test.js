import { describe, it, expect } from 'vitest';
import {
    lineComponents,
    componentsCost,
    effectiveLineCost,
    supplyEntries,
    quoteMargin,
} from './quoteInternalDetail';

describe('lineComponents', () => {
    it('renvoie [] pour une ligne sans chiffrage interne', () => {
        expect(lineComponents({})).toEqual([]);
        expect(lineComponents(null)).toEqual([]);
        expect(lineComponents({ components: 'pas un tableau' })).toEqual([]);
    });

    it('ignore les fournitures sans description', () => {
        const item = {
            components: [
                { id: 1, description: 'Câble 3G2.5', quantity: 50, unit: 'ml', buying_price: 0.8 },
                { id: 2, description: '   ', quantity: 1 },
                null,
            ],
        };
        expect(lineComponents(item)).toHaveLength(1);
        expect(lineComponents(item)[0].description).toBe('Câble 3G2.5');
    });
});

describe('componentsCost', () => {
    it('somme quantité × prix d\'achat des fournitures', () => {
        const item = {
            components: [
                { id: 1, description: 'Câble', quantity: 50, buying_price: 0.8 },
                { id: 2, description: 'Disjoncteur 16A', quantity: 3, buying_price: 12 },
            ],
        };
        expect(componentsCost(item)).toBe(50 * 0.8 + 3 * 12);
    });

    it('tolère les valeurs saisies en texte et les champs manquants', () => {
        const item = {
            components: [
                { id: 1, description: 'Prise', quantity: '4', buying_price: '2.5' },
                { id: 2, description: 'Boîte', quantity: undefined, buying_price: 9 },
            ],
        };
        expect(componentsCost(item)).toBe(10);
    });
});

describe('effectiveLineCost', () => {
    it('privilégie le prix d\'achat de la ligne quand il est renseigné', () => {
        const item = {
            quantity: 2,
            buying_price: 100,
            components: [{ id: 1, description: 'Fourniture', quantity: 1, buying_price: 999 }],
        };
        expect(effectiveLineCost(item)).toBe(200);
    });

    it('replie sur le chiffrage interne quand buying_price est absent ou nul', () => {
        const item = {
            quantity: 1,
            buying_price: 0,
            components: [{ id: 1, description: 'Fourniture', quantity: 2, buying_price: 15 }],
        };
        expect(effectiveLineCost(item)).toBe(30);
        expect(effectiveLineCost({ quantity: 1 })).toBe(0);
    });
});

describe('supplyEntries', () => {
    const items = [
        { id: 10, type: 'section', description: 'Salle de bain' },
        { id: 11, type: 'service', description: 'Forfait rénovation complète', quantity: 1,
          components: [
              { id: 1, description: 'Receveur 90x90', quantity: 1, unit: 'u', buying_price: 150 },
              { id: 2, description: 'Carrelage sol', quantity: 6, unit: 'm2', buying_price: 22 },
          ] },
        { id: 12, type: 'material', description: 'Colonne de douche', quantity: 1, unit: 'u' },
        { id: 13, type: 'service', description: 'Pose', quantity: 4, unit: 'h' },
    ];

    it('liste les lignes matériel et les fournitures internes, pas le reste', () => {
        const entries = supplyEntries(items);
        expect(entries.map((e) => e.description)).toEqual([
            'Receveur 90x90',
            'Carrelage sol',
            'Colonne de douche',
        ]);
    });

    it('rattache les fournitures internes à leur ligne parente', () => {
        const entries = supplyEntries(items);
        expect(entries[0].context).toBe('Forfait rénovation complète');
        expect(entries[2].context).toBeNull();
    });

    it('produit des clés stables et distinctes', () => {
        const entries = supplyEntries(items);
        expect(entries.map((e) => e.key)).toEqual(['comp:11:1', 'comp:11:2', 'line:12']);
    });

    it('tolère un devis vide ou invalide', () => {
        expect(supplyEntries(undefined)).toEqual([]);
        expect(supplyEntries([])).toEqual([]);
    });

    it('remplace une ligne Matériel par ses fournitures internes quand elle en a', () => {
        const entries = supplyEntries([
            { id: 20, type: 'material', description: 'Tableau électrique équipé', quantity: 1, unit: 'u',
              components: [{ id: 1, description: 'Disjoncteur 16A', quantity: 8, unit: 'u', buying_price: 12 }] },
        ]);
        expect(entries.map((e) => e.description)).toEqual(['Disjoncteur 16A']);
        expect(entries[0].context).toBe('Tableau électrique équipé');
    });
});

describe('quoteMargin', () => {
    // 1000 € vendus : 200 € de matière, 10 h de main d'œuvre.
    const items = [
        { type: 'material', description: 'Fournitures', quantity: 1, price: 400, buying_price: 200 },
        { type: 'service', description: 'Pose', quantity: 10, unit: 'h', price: 60, buying_price: 0 },
    ];

    it('sans coût horaire : marge matière seule, hasLabor=false', () => {
        const r = quoteMargin(items, 1000, 0);
        expect(r.materialCost).toBe(200);
        expect(r.laborCost).toBe(0);
        expect(r.hasLabor).toBe(false);
        expect(r.margin).toBeCloseTo(0.8, 5); // (1000 - 200) / 1000
    });

    it('avec coût horaire : déduit aussi la main d\'œuvre (marge nette)', () => {
        const r = quoteMargin(items, 1000, 45); // 10 h × 45 € = 450 €
        expect(r.laborHours).toBe(10);
        expect(r.laborCost).toBe(450);
        expect(r.cost).toBe(650);
        expect(r.hasLabor).toBe(true);
        expect(r.margin).toBeCloseTo(0.35, 5); // (1000 - 650) / 1000
    });

    it('forfait sans lignes en heures : aucune main d\'œuvre déduite', () => {
        const forfait = [{ type: 'service', description: 'Forfait', quantity: 1, unit: 'forfait', price: 1000, buying_price: 200 }];
        const r = quoteMargin(forfait, 1000, 45);
        expect(r.laborHours).toBe(0);
        expect(r.laborCost).toBe(0);
        expect(r.margin).toBeCloseTo(0.8, 5);
    });

    it('revenu nul : marge 0 sans division par zéro', () => {
        expect(quoteMargin([], 0, 45).margin).toBe(0);
    });
});
