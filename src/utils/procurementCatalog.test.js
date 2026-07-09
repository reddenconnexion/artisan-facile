import { describe, it, expect } from 'vitest';
import { isCatalogable, buildCatalogUpsert } from './procurementCatalog';

describe('isCatalogable', () => {
    it('exige une description et un signal de prix', () => {
        expect(isCatalogable({ description: 'Câble', buying_price: 3 })).toBe(true);
        expect(isCatalogable({ description: 'Câble', sale_price: 5 })).toBe(true);
        expect(isCatalogable({ description: 'Câble' })).toBe(false);
        expect(isCatalogable({ description: '', buying_price: 3 })).toBe(false);
        expect(isCatalogable(null)).toBe(false);
    });
});

describe('buildCatalogUpsert', () => {
    it('insère un nouvel article avec prix, prix d\'achat et fournisseur', () => {
        const { toInsert, toUpdate } = buildCatalogUpsert(
            [{ description: 'Disjoncteur 16A', sale_price: 12.5, buying_price: 6.2, supplier: 'Rexel', unit: 'u' }],
            [],
            'user-1'
        );
        expect(toUpdate).toHaveLength(0);
        expect(toInsert).toHaveLength(1);
        expect(toInsert[0]).toMatchObject({
            user_id: 'user-1',
            description: 'Disjoncteur 16A',
            price: 12.5,
            buying_price: 6.2,
            supplier: 'Rexel',
            type: 'material',
            unit: 'u',
        });
    });

    it('calcule le prix de vente depuis le prix d\'achat quand le devis n\'en fournit pas', () => {
        const { toInsert } = buildCatalogUpsert(
            [{ description: 'Gaine', buying_price: 10 }],
            [],
            'u',
            { coefficient: 2 }
        );
        expect(toInsert[0].price).toBe(20);
    });

    it('met à jour un article existant sans le dupliquer et préserve son id', () => {
        const existing = [{ id: 42, user_id: 'u', description: 'Câble 3G2.5', price: 1, buying_price: 0, supplier: null }];
        const { toInsert, toUpdate } = buildCatalogUpsert(
            [{ description: 'câble 3g2.5', sale_price: 2, buying_price: 0.9, supplier: 'Sonepar' }],
            existing,
            'u'
        );
        expect(toInsert).toHaveLength(0);
        expect(toUpdate).toHaveLength(1);
        expect(toUpdate[0]).toMatchObject({ id: 42, price: 2, buying_price: 0.9, supplier: 'Sonepar' });
    });

    it('ne remet jamais un prix d\'achat connu à 0 et ignore les lignes sans prix', () => {
        const existing = [{ id: 1, description: 'Vis', price: 5, buying_price: 3, supplier: 'Würth' }];
        const { toInsert, toUpdate, skipped } = buildCatalogUpsert(
            [
                { description: 'Vis', buying_price: 0, sale_price: 0 }, // aucun signal → ignoré
                { description: 'Cheville' }, // pas de prix → ignoré
            ],
            existing,
            'u'
        );
        expect(toInsert).toHaveLength(0);
        expect(toUpdate).toHaveLength(0);
        expect(skipped).toBe(2);
    });

    it('déduplique plusieurs lignes de même description', () => {
        const { toInsert } = buildCatalogUpsert(
            [
                { description: 'Té PVC', buying_price: 2 },
                { description: 'té pvc', buying_price: 2 },
            ],
            [],
            'u'
        );
        expect(toInsert).toHaveLength(1);
    });
});
