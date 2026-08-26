import { describe, it, expect } from 'vitest';
import { isVatFranchise, vatFranchiseTotal } from './vatFranchise';

describe('franchise en base de TVA (art. 293 B du CGI)', () => {
    it('ne reconnaît la franchise que sur include_tva explicitement faux', () => {
        expect(isVatFranchise({ include_tva: false })).toBe(true);
        expect(isVatFranchise({ include_tva: true })).toBe(false);
        // Devis anciens ou champ absent : la TVA reste appliquée par défaut.
        expect(isVatFranchise({})).toBe(false);
        expect(isVatFranchise(null)).toBe(false);
        expect(isVatFranchise(undefined)).toBe(false);
    });

    it('nomme le total « à régler » sur un devis, jamais « HT »', () => {
        const { label, note } = vatFranchiseTotal();
        expect(label).toBe('MONTANT À RÉGLER');
        expect(label).not.toMatch(/\bHT\b/);
        expect(note).toContain('293 B du CGI');
        expect(note).toContain("aucune TVA ne s'ajoute");
    });

    it('parle de net à payer sur une facture', () => {
        expect(vatFranchiseTotal({ isInvoice: true }).label).toBe('NET À PAYER');
    });

    it("ne fait pas « payer » un avoir, même émis comme une facture", () => {
        expect(vatFranchiseTotal({ isCreditNote: true }).label).toBe("MONTANT DE L'AVOIR");
        expect(vatFranchiseTotal({ isCreditNote: true, isInvoice: true }).label).toBe("MONTANT DE L'AVOIR");
        expect(vatFranchiseTotal({ isCreditNote: true }).note).not.toContain('à payer');
    });

    it('traduit libellé et mention pour un client anglophone', () => {
        const en = vatFranchiseTotal({ lang: 'en' });
        expect(en.label).toBe('AMOUNT PAYABLE');
        expect(en.note).toContain('art. 293 B of the French Tax Code');
        expect(vatFranchiseTotal({ lang: 'en', isCreditNote: true }).label).toBe('CREDIT NOTE AMOUNT');
    });

    it('retombe sur le français pour une langue inconnue', () => {
        expect(vatFranchiseTotal({ lang: 'de' })).toEqual(vatFranchiseTotal({ lang: 'fr' }));
    });

    it('rappelle la mention légale sur chaque libellé servi', () => {
        for (const lang of ['fr', 'en']) {
            for (const kind of [{}, { isInvoice: true }, { isCreditNote: true }]) {
                const { label, note } = vatFranchiseTotal({ lang, ...kind });
                expect(label.length).toBeGreaterThan(0);
                expect(note).toMatch(/293 B/);
            }
        }
    });
});
