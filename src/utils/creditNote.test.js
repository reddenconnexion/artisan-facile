import { describe, it, expect } from 'vitest';
import { buildCreditNotePayload } from './creditNote';

const invoice = {
    id: 42,
    type: 'invoice',
    invoice_number: 'FAC-2026-0007',
    title: 'Rénovation tableau',
    date: '2026-05-10',
    include_tva: true,
    total_ht: 1000,
    total_tva: 200,
    total_ttc: 1200,
    items: [
        { id: 1, type: 'section', description: 'Lot 1' },
        { id: 2, type: 'service', description: 'Pose', quantity: 4, price: 100, buying_price: 20, unit: 'h' },
        { id: 3, type: 'material', description: 'Tableau', quantity: 1, price: 600, buying_price: 300, unit: 'u' },
    ],
};

describe('buildCreditNotePayload — avoir total', () => {
    const payload = buildCreditNotePayload(invoice, { mode: 'total', reason: 'Chantier annulé' });

    it('reprend toutes les lignes en négatif, coûts d\'achat à zéro', () => {
        const lines = payload.items.filter(i => i.type !== 'section');
        expect(lines).toHaveLength(2);
        expect(lines[0].price).toBe(-100);
        expect(lines[1].price).toBe(-600);
        expect(lines.every(i => i.buying_price === 0)).toBe(true);
    });

    it('calcule des totaux négatifs symétriques à la facture', () => {
        expect(payload.total_ht).toBe(-1000);
        expect(payload.total_tva).toBe(-200);
        expect(payload.total_ttc).toBe(-1200);
    });

    it('est émis immédiatement, rattaché à la facture, avec le contexte mémorisé', () => {
        expect(payload.type).toBe('credit_note');
        expect(payload.status).toBe('billed');
        expect(payload.parent_id).toBe(42);
        expect(payload.amendment_details.credit_note.parent_invoice_number).toBe('FAC-2026-0007');
        expect(payload.amendment_details.credit_note.mode).toBe('total');
        expect(payload.amendment_details.credit_note.reason).toBe('Chantier annulé');
        expect(payload.title).toContain('FAC-2026-0007');
    });
});

describe('buildCreditNotePayload — avoir partiel', () => {
    it('crée une ligne unique du montant demandé (TTC → HT si TVA)', () => {
        const payload = buildCreditNotePayload(invoice, { mode: 'partial', amountTTC: 120, reason: 'Geste commercial' });
        expect(payload.items).toHaveLength(1);
        expect(payload.items[0].price).toBe(-100);
        expect(payload.total_ttc).toBe(-120);
        expect(payload.items[0].description).toContain('Geste commercial');
    });

    it('sans TVA, le montant saisi est repris tel quel', () => {
        const payload = buildCreditNotePayload({ ...invoice, include_tva: false }, { mode: 'partial', amountTTC: 120 });
        expect(payload.items[0].price).toBe(-120);
        expect(payload.total_tva).toBe(0);
        expect(payload.total_ttc).toBe(-120);
    });

    it('refuse un montant nul, négatif ou supérieur au total de la facture', () => {
        expect(() => buildCreditNotePayload(invoice, { mode: 'partial', amountTTC: 0 })).toThrow(/invalide/);
        expect(() => buildCreditNotePayload(invoice, { mode: 'partial', amountTTC: -5 })).toThrow(/invalide/);
        expect(() => buildCreditNotePayload(invoice, { mode: 'partial', amountTTC: 1300 })).toThrow(/dépasse/);
    });
});

describe('buildCreditNotePayload — garde-fous', () => {
    it('refuse un document qui n\'est pas une facture', () => {
        expect(() => buildCreditNotePayload({ ...invoice, type: 'quote' }, { mode: 'total' })).toThrow(/facture/);
    });

    it('refuse une facture non émise (sans numéro légal)', () => {
        expect(() => buildCreditNotePayload({ ...invoice, invoice_number: null }, { mode: 'total' })).toThrow(/pas encore été émise/);
    });
});
