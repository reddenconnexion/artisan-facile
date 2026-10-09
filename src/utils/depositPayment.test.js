import { describe, it, expect } from 'vitest';
import { depositDue, epcPayload, formatIban, compactIban, paymentMessage } from './depositPayment';

describe('depositDue', () => {
    it('calcule l’acompte en % du total TTC', () => {
        expect(depositDue({ total_ttc: 1200, deposit_percentage: 30 })).toEqual({ amount: 360, balance: 840 });
    });
    it('retourne null sans acompte, sur une facture ou un avoir', () => {
        expect(depositDue({ total_ttc: 1200 })).toBeNull();
        expect(depositDue({ type: 'invoice', total_ttc: 1200, deposit_percentage: 30 })).toBeNull();
        expect(depositDue({ type: 'credit_note', total_ttc: 1200, deposit_percentage: 30 })).toBeNull();
    });
    it('privilégie l’acompte matériel', () => {
        const quote = {
            has_material_deposit: true, total_ht: 1000, total_tva: 200, total_ttc: 1200, deposit_percentage: 30,
            items: [{ type: 'material', quantity: 1, price: 500 }, { type: 'labor', quantity: 1, price: 500 }],
        };
        expect(depositDue(quote)).toEqual({ amount: 600, balance: 600 });
    });
});

describe('IBAN', () => {
    it('compacte et regroupe', () => {
        expect(compactIban('fr76 3000 6000')).toBe('FR7630006000');
        expect(formatIban('FR7630006000')).toBe('FR76 3000 6000');
    });
});

describe('epcPayload', () => {
    it('produit le format EPC v002', () => {
        const p = epcPayload({ iban: 'FR76 3000 6000 0112 3456 7890 189', name: 'Red Den', amount: 360, reference: 'Devis 12' });
        expect(p.split('\n')).toEqual(['BCD', '002', '1', 'SCT', '', 'Red Den', 'FR7630006000011234567890189', 'EUR360.00', '', '', 'Devis 12']);
    });
    it('refuse un montant nul ou un IBAN vide', () => {
        expect(epcPayload({ iban: 'FR76', amount: 0 })).toBeNull();
        expect(epcPayload({ iban: '', amount: 10 })).toBeNull();
    });
});

describe('paymentMessage', () => {
    it('contient montant, IBAN et référence', () => {
        const m = paymentMessage({ beneficiary: 'Red Den', iban: 'FR7630006000', amount: 360, reference: 'Devis 12' });
        expect(m).toContain('FR76 3000 6000');
        expect(m).toContain('Devis 12');
        expect(m).toContain('360,00');
    });
});
