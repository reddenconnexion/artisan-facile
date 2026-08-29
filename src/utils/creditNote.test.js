import { describe, it, expect } from 'vitest';
import { buildCreditNotePayload, depositsNetOfCreditNotes } from './creditNote';

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

describe('depositsNetOfCreditNotes', () => {
    const deposit = (id, total_ht) => ({ id, total_ht, title: `Acompte ${id}` });
    const creditNote = (parent_id, total_ht) => ({ parent_id, total_ht });

    it('laisse intact un acompte sans avoir', () => {
        const nets = depositsNetOfCreditNotes([deposit(286, 1356.91)], []);
        expect(nets).toHaveLength(1);
        expect(nets[0].netHT).toBe(1356.91);
        expect(nets[0].creditedHT).toBe(0);
    });

    // Le cas du devis 223 : FAC-2026-0119 annulée par AV-2026-0001. Sans cette
    // règle, la clôture déduisait encore 1 356,91 € jamais réglés.
    it('écarte un acompte entièrement annulé par un avoir', () => {
        const nets = depositsNetOfCreditNotes(
            [deposit(286, 1356.91), deposit(288, 1486.91)],
            [creditNote(286, -1356.91)],
        );
        expect(nets.map(d => d.id)).toEqual([288]);
    });

    it("ne déduit que le reliquat après un avoir partiel", () => {
        const nets = depositsNetOfCreditNotes([deposit(286, 1000)], [creditNote(286, -300)]);
        expect(nets[0].netHT).toBe(700);
        expect(nets[0].creditedHT).toBe(300);
    });

    it('cumule plusieurs avoirs sur une même facture', () => {
        const nets = depositsNetOfCreditNotes(
            [deposit(286, 1000)],
            [creditNote(286, -300), creditNote(286, -200)],
        );
        expect(nets[0].netHT).toBe(500);
    });

    it("n'applique un avoir qu'à la facture qu'il vise", () => {
        const nets = depositsNetOfCreditNotes(
            [deposit(286, 1000), deposit(288, 500)],
            [creditNote(286, -1000)],
        );
        expect(nets.map(d => [d.id, d.netHT])).toEqual([[288, 500]]);
    });

    // Un avoir supérieur au montant facturé ne doit pas se retourner en crédit.
    it('ne rend jamais un acompte négatif', () => {
        const nets = depositsNetOfCreditNotes([deposit(286, 500)], [creditNote(286, -800)]);
        expect(nets).toEqual([]);
    });

    it('ignore un avoir sans facture de rattachement', () => {
        const nets = depositsNetOfCreditNotes([deposit(286, 1000)], [creditNote(null, -1000)]);
        expect(nets[0].netHT).toBe(1000);
    });

    it('accepte des listes vides ou absentes', () => {
        expect(depositsNetOfCreditNotes([], [])).toEqual([]);
        expect(depositsNetOfCreditNotes(null, null)).toEqual([]);
        expect(depositsNetOfCreditNotes([deposit(286, 100)], null)[0].netHT).toBe(100);
    });

    it('ne modifie pas les acomptes reçus', () => {
        const source = deposit(286, 1000);
        const nets = depositsNetOfCreditNotes([source], [creditNote(286, -300)]);
        expect(nets[0]).not.toBe(source);
        expect(source).not.toHaveProperty('netHT');
    });
});
