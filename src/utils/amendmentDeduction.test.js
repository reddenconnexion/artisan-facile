import { describe, it, expect } from 'vitest';
import {
    deductibleParentLines,
    buildDeductionItems,
    deductionSectionTitle,
    DEDUCTION_SECTION_PREFIX,
} from './amendmentDeduction';

// Devis initial type : un lot « Cuisine » avec 8 prises et la main d'œuvre,
// une option non retenue, et un lot « Tableau ».
const devisParent = {
    id: 271,
    quote_number: 223,
    include_tva: false,
    items: [
        { id: 1, type: 'section', description: 'Cuisine' },
        { id: 2, type: 'material', description: 'Prise 2P+T encastrée', quantity: 8, unit: 'u', price: 18.5, buying_price: 9 },
        { id: 3, type: 'service', description: 'Pose prises cuisine', quantity: 4, unit: 'h', price: 45 },
        { id: 4, type: 'material', description: 'Prise USB', quantity: 2, unit: 'u', price: 35, is_optional: true },
        { id: 5, type: 'section', description: 'Tableau' },
        { id: 6, type: 'service', description: 'Remplacement tableau', quantity: 1, unit: 'forfait', price: 650 },
        { id: 7, type: 'material', description: 'Ligne sans prix', quantity: 1, unit: 'u', price: 0 },
    ],
};

describe('deductibleParentLines', () => {
    it('liste les lignes fermes avec leur section, sans les titres, options ni lignes sans montant', () => {
        const lines = deductibleParentLines(devisParent, []);
        expect(lines.map(l => l.id)).toEqual([2, 3, 6]);
        expect(lines[0].section).toBe('Cuisine');
        expect(lines[2].section).toBe('Tableau');
        expect(lines[0].amountHT).toBeCloseTo(148, 2);
        expect(lines[0].remainingQuantity).toBe(8);
        expect(lines[0].deductedQuantity).toBe(0);
    });

    it('tient compte de ce que l\'avenant a déjà déduit', () => {
        const existing = [
            { id: 900, type: 'section', description: deductionSectionTitle(devisParent) },
            { id: 901, type: 'material', description: 'Prise', quantity: 3, price: -18.5, deducted_from_item_id: 2 },
        ];
        const lines = deductibleParentLines(devisParent, existing);
        const prises = lines.find(l => l.id === 2);
        expect(prises.deductedQuantity).toBe(3);
        expect(prises.remainingQuantity).toBe(5);
    });

    it('rend une liste vide sans devis parent', () => {
        expect(deductibleParentLines(null, [])).toEqual([]);
        expect(deductibleParentLines({ items: 'pas un tableau' }, [])).toEqual([]);
    });
});

describe('buildDeductionItems', () => {
    it('reprend la ligne en négatif, quantité positive, prix d\'achat à zéro, avec un titre de section', () => {
        const { items, totalHT, count } = buildDeductionItems(devisParent, [{ itemId: 6 }], { idBase: 1000 });
        expect(count).toBe(1);
        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({ id: 1000, type: 'section' });
        expect(items[0].description.startsWith(DEDUCTION_SECTION_PREFIX)).toBe(true);
        expect(items[0].description).toContain('n°223'); // numéro client, pas l'id interne 271
        expect(items[1]).toMatchObject({
            id: 1001,
            quantity: 1,
            unit: 'forfait',
            price: -650,
            buying_price: 0,
            type: 'service',
            deducted_from_item_id: 6,
        });
        expect(items[1].description).toContain('Remplacement tableau');
        expect(items[1].description).toContain('devis n°223');
        expect(totalHT).toBeCloseTo(-650, 2);
    });

    it('accepte une quantité partielle (3 prises non posées sur 8)', () => {
        const { items, totalHT } = buildDeductionItems(devisParent, [{ itemId: 2, quantity: 3 }], { idBase: 1 });
        const line = items.find(i => i.type !== 'section');
        expect(line.quantity).toBe(3);
        expect(line.price).toBe(-18.5);
        expect(totalHT).toBeCloseTo(-55.5, 2);
    });

    it('déduit tout le restant quand la quantité n\'est pas précisée', () => {
        const existing = [{ id: 901, type: 'material', quantity: 3, price: -18.5, deducted_from_item_id: 2 }];
        const { items } = buildDeductionItems(devisParent, [{ itemId: 2 }], { existingItems: existing, idBase: 1 });
        expect(items.find(i => i.type !== 'section').quantity).toBe(5);
    });

    it('ne recrée pas le titre de section s\'il existe déjà sur l\'avenant', () => {
        const existing = [{ id: 900, type: 'section', description: deductionSectionTitle(devisParent) }];
        const { items } = buildDeductionItems(devisParent, [{ itemId: 3 }], { existingItems: existing, idBase: 1 });
        expect(items).toHaveLength(1);
        expect(items[0].type).toBe('service');
    });

    it('refuse de déduire plus que ce que le devis contient, déjà-déduit compris', () => {
        const existing = [{ id: 901, type: 'material', quantity: 6, price: -18.5, deducted_from_item_id: 2 }];
        expect(() => buildDeductionItems(devisParent, [{ itemId: 2, quantity: 3 }], { existingItems: existing }))
            .toThrow(/dépasse la quantité restante/);
        expect(() => buildDeductionItems(devisParent, [{ itemId: 6, quantity: 2 }]))
            .toThrow(/dépasse la quantité restante/);
    });

    it('refuse une quantité nulle ou négative, une ligne inconnue, un doublon et une sélection vide', () => {
        expect(() => buildDeductionItems(devisParent, [{ itemId: 2, quantity: 0 }])).toThrow(/Quantité invalide/);
        expect(() => buildDeductionItems(devisParent, [{ itemId: 2, quantity: -2 }])).toThrow(/Quantité invalide/);
        expect(() => buildDeductionItems(devisParent, [{ itemId: 4 }])).toThrow(/n'existe pas/); // option
        expect(() => buildDeductionItems(devisParent, [{ itemId: 42 }])).toThrow(/n'existe pas/);
        expect(() => buildDeductionItems(devisParent, [{ itemId: 2 }, { itemId: '2' }])).toThrow(/deux fois/);
        expect(() => buildDeductionItems(devisParent, [])).toThrow(/au moins une/);
        expect(() => buildDeductionItems({ id: 1, items: [] }, [{ itemId: 2 }])).toThrow(/aucune ligne/);
    });

    it('retombe sur l\'id interne si le devis parent n\'a pas de numéro', () => {
        const { items } = buildDeductionItems({ id: 271, items: devisParent.items }, [{ itemId: 6 }], { idBase: 1 });
        expect(items[0].description).toContain('n°271');
    });
});
