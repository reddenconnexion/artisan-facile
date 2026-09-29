import { describe, it, expect } from 'vitest';
import { computeClientStats } from './clientStats';

const today = new Date('2026-06-30T12:00:00');

describe('computeClientStats', () => {
    it('renvoie des indicateurs vides sans document', () => {
        const s = computeClientStats([], today);
        expect(s.paidTotal).toBe(0);
        expect(s.unpaidTotal).toBe(0);
        expect(s.signatureRate).toBeNull();
        expect(s.avgPaymentDays).toBeNull();
        expect(s.firstDocDate).toBeNull();
    });

    it("compte l'encaissé sans doublon devis payé / facture fille", () => {
        const s = computeClientStats([
            { id: 1, type: 'quote', status: 'paid', total_ttc: '300', date: '2026-01-01' },
            { id: 2, type: 'invoice', status: 'paid', total_ttc: '300', parent_id: 1, date: '2026-01-05' },
            { id: 3, type: 'invoice', status: 'paid', total_ttc: '120', date: '2026-02-01' },
        ], today);
        expect(s.paidTotal).toBe(420);
        expect(s.paidCount).toBe(2);
    });

    it('ne compte pas comme due une facture déjà facturée par ses acomptes', () => {
        // Cas réel : facture « accepted » réglée via deux factures filles.
        const s = computeClientStats([
            { id: 114, type: 'invoice', status: 'accepted', total_ttc: '1619.68', date: '2026-03-08' },
            { id: 128, type: 'invoice', status: 'paid', total_ttc: '809.68', parent_id: 114, date: '2026-03-16', paid_at: '2026-03-15' },
            { id: 167, type: 'invoice', status: 'paid', total_ttc: '810', parent_id: 114, date: '2026-04-24', paid_at: '2026-04-25' },
        ], today);
        expect(s.unpaidTotal).toBe(0);
        expect(s.paidTotal).toBeCloseTo(1619.68);
    });

    it('sépare le reste à encaisser et la part en retard', () => {
        const s = computeClientStats([
            { id: 1, type: 'invoice', status: 'billed', total_ttc: '500', date: '2026-06-01', valid_until: '2026-06-15' },
            { id: 2, type: 'invoice', status: 'billed', total_ttc: '200', date: '2026-06-28', valid_until: '2026-07-28' },
            { id: 3, type: 'invoice', status: 'cancelled', total_ttc: '999', date: '2026-05-01' },
            { id: 4, type: 'invoice', status: 'draft', total_ttc: '50', date: '2026-06-29' },
        ], today);
        expect(s.unpaidTotal).toBe(700);
        expect(s.unpaidCount).toBe(2);
        expect(s.overdueCount).toBe(1);
        expect(s.overdueTotal).toBe(500);
    });

    it('liste les devis en attente de réponse, hors archivés', () => {
        const s = computeClientStats([
            { id: 1, type: 'quote', status: 'sent', total_ttc: '1000', date: '2026-06-01' },
            { id: 2, type: 'quote', status: 'sent', total_ttc: '400', date: '2026-01-01', archived_at: '2026-03-01' },
            { id: 3, type: 'quote', status: 'draft', total_ttc: '80', date: '2026-06-20' },
        ], today);
        expect(s.pendingQuotesCount).toBe(1);
        expect(s.pendingQuotesTotal).toBe(1000);
    });

    it('calcule le taux de signature sur les devis tranchés uniquement', () => {
        const s = computeClientStats([
            { id: 1, type: 'quote', status: 'accepted' },
            { id: 2, type: 'quote', status: 'paid' },
            { id: 3, type: 'quote', status: 'refused' },
            { id: 4, type: 'quote', status: 'sent' },
            { id: 5, type: 'amendment', status: 'refused' },
        ], today);
        expect(s.signedCount).toBe(2);
        expect(s.decidedCount).toBe(3);
        expect(s.signatureRate).toBeCloseTo(2 / 3);
    });

    it('moyenne le délai de paiement, un paiement anticipé comptant pour 0 jour', () => {
        const s = computeClientStats([
            { id: 1, type: 'invoice', status: 'paid', date: '2026-03-16', paid_at: '2026-03-15T00:00:00Z' },
            { id: 2, type: 'invoice', status: 'paid', date: '2026-05-21', paid_at: '2026-05-31T00:00:00Z' },
            { id: 3, type: 'invoice', status: 'paid', date: '2026-05-21' },
        ], today);
        expect(s.paymentSamples).toBe(2);
        expect(s.avgPaymentDays).toBe(5);
    });

    it('donne la première et la dernière date de document', () => {
        const s = computeClientStats([
            { id: 1, type: 'quote', status: 'sent', date: '2026-04-10' },
            { id: 2, type: 'quote', status: 'sent', created_at: '2025-11-02T10:00:00Z' },
        ], today);
        expect(s.firstDocDate.getFullYear()).toBe(2025);
        expect(s.lastDocDate.getMonth()).toBe(3);
    });
});
