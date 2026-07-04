import { describe, it, expect } from 'vitest';
import { groupedDisplayBlocks } from './quoteDisplay';

describe('groupedDisplayBlocks', () => {
    const items = [
        { id: 1, type: 'service', description: 'Diagnostic', quantity: 1, price: 120 },
        { id: 2, type: 'section', description: 'Salle de bain' },
        { id: 3, type: 'service', description: 'Dépose existant', quantity: 1, price: 400 },
        { id: 4, type: 'material', description: 'Receveur 90x90', quantity: 1, price: 250 },
        { id: 5, type: 'material', description: 'Carrelage premium', quantity: 6, price: 45, is_optional: true },
        { id: 6, type: 'section', description: 'Cuisine' },
        { id: 7, type: 'service', description: 'Crédence', quantity: 3, price: 80 },
    ];

    it('produit un total par section, dans l\'ordre du devis', () => {
        const blocks = groupedDisplayBlocks(items);
        expect(blocks.map((b) => [b.label, b.total])).toEqual([
            [null, 120],
            ['Salle de bain', 650],
            ['Cuisine', 240],
        ]);
    });

    it('laisse les lignes optionnelles individuelles, hors du total', () => {
        const blocks = groupedDisplayBlocks(items);
        const sdb = blocks.find((b) => b.label === 'Salle de bain');
        expect(sdb.total).toBe(650);
        expect(sdb.options).toHaveLength(1);
        expect(sdb.options[0].description).toBe('Carrelage premium');
    });

    it('ignore les sections vides et titre vide → label null', () => {
        const blocks = groupedDisplayBlocks([
            { id: 1, type: 'section', description: 'Vide' },
            { id: 2, type: 'section', description: '   ' },
            { id: 3, type: 'service', description: 'Pose', quantity: 2, price: 50 },
        ]);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].label).toBeNull();
        expect(blocks[0].total).toBe(100);
    });

    it('conserve un bloc qui ne contient que des options', () => {
        const blocks = groupedDisplayBlocks([
            { id: 1, type: 'section', description: 'Extras' },
            { id: 2, type: 'service', description: 'Éclairage LED', quantity: 1, price: 90, is_optional: true },
        ]);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].count).toBe(0);
        expect(blocks[0].options).toHaveLength(1);
    });

    it('tolère les entrées invalides', () => {
        expect(groupedDisplayBlocks(undefined)).toEqual([]);
        expect(groupedDisplayBlocks([null, undefined])).toEqual([]);
    });
});
