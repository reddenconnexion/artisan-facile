import { describe, it, expect } from 'vitest';
import { materialDepositAmounts, quoteLineAmount } from './materialDeposit';

// Cas réel (devis n° 226) : main d'œuvre 580 € + fournitures fermes 1118,35 €
// + une option non retenue à 190 €, sans TVA (art. 293 B du CGI).
// Le total ferme exclut l'option (1698,35 €) ; l'acompte doit l'exclure aussi,
// sinon le solde affiché (total − acompte) ne retombe pas sur la main d'œuvre.
const devis226 = {
    include_tva: false,
    total_ht: 1698.35,
    total_tva: 0,
    total_ttc: 1698.35,
    has_material_deposit: true,
    items: [
        { type: 'service', description: "Main d'œuvre", quantity: 1, price: 580 },
        { type: 'material', description: 'Fournitures', quantity: 1, price: 1118.35 },
        { type: 'material', description: 'Reprise de la prise de terre', quantity: 1, price: 190, is_optional: true },
    ],
};

describe('materialDepositAmounts', () => {
    it("exclut les fournitures optionnelles : le solde retombe sur la main d'œuvre (devis 226)", () => {
        const amounts = materialDepositAmounts(devis226);
        expect(amounts.materialTTC).toBeCloseTo(1118.35, 2);
        expect(amounts.balanceTTC).toBeCloseTo(580, 2);
    });

    it('applique la TVA effective déduite des totaux quand le devis est TTC', () => {
        const amounts = materialDepositAmounts({
            include_tva: true,
            total_ht: 1000,
            total_tva: 200,
            total_ttc: 1200,
            items: [
                { type: 'service', quantity: 10, price: 40 },
                { type: 'material', quantity: 2, price: 300 },
            ],
        });
        expect(amounts.materialTTC).toBeCloseTo(720, 2); // 600 HT × 1,20
        expect(amounts.balanceTTC).toBeCloseTo(480, 2); // main d'œuvre TTC
    });

    it('retourne null quand toutes les fournitures sont optionnelles (rien à provisionner)', () => {
        expect(materialDepositAmounts({
            include_tva: false,
            total_ht: 500,
            total_tva: 0,
            total_ttc: 500,
            items: [
                { type: 'service', quantity: 1, price: 500 },
                { type: 'material', quantity: 1, price: 190, is_optional: true },
            ],
        })).toBeNull();
    });

    it('retourne null sans aucune fourniture', () => {
        expect(materialDepositAmounts({ items: [{ type: 'service', quantity: 1, price: 100 }] })).toBeNull();
        expect(materialDepositAmounts({})).toBeNull();
    });

    it('ne laisse jamais le solde négatif', () => {
        const amounts = materialDepositAmounts({
            include_tva: false,
            total_ht: 100,
            total_tva: 0,
            total_ttc: 100,
            items: [{ type: 'material', quantity: 1, price: 150 }],
        });
        expect(amounts.balanceTTC).toBe(0);
    });
});

describe('quoteLineAmount', () => {
    it('utilise line_total pour les postes fusionnés (mode poste global)', () => {
        expect(quoteLineAmount({ line_total: '250.50' })).toBeCloseTo(250.5, 2);
    });
    it('calcule quantité × prix sinon', () => {
        expect(quoteLineAmount({ quantity: 3, price: 10 })).toBe(30);
    });
});
