import { describe, it, expect } from 'vitest';
import {
    isClosingInvoiceRow,
    amendmentBillableTime,
    latestClosingByParent,
    amendmentAlreadyBilled,
} from './amendmentBilling';

// Repères temporels : la clôture est générée le 10, on teste des avenants
// signés avant et après.
const CLOSING_AT = '2026-01-10T10:00:00.000Z';
const BEFORE = '2026-01-05T09:00:00.000Z';
const AFTER = '2026-01-15T09:00:00.000Z';

const closing = (over = {}) => ({
    parent_id: 1,
    type: 'invoice',
    status: 'billed',
    title: 'Facture de clôture — devis n°223',
    created_at: CLOSING_AT,
    ...over,
});

const amendment = (over = {}) => ({
    id: 42,
    parent_id: 1,
    type: 'amendment',
    status: 'accepted',
    signed_at: AFTER,
    created_at: AFTER,
    ...over,
});

describe('isClosingInvoiceRow', () => {
    it('reconnaît une facture de clôture émise (billed/paid)', () => {
        expect(isClosingInvoiceRow(closing())).toBe(true);
        expect(isClosingInvoiceRow(closing({ status: 'paid' }))).toBe(true);
        expect(isClosingInvoiceRow(closing({ title: 'Facture de cloture (sans accent)' }))).toBe(true);
    });

    it('écarte un brouillon de clôture, un acompte ou un avenant', () => {
        expect(isClosingInvoiceRow(closing({ status: 'draft' }))).toBe(false);
        expect(isClosingInvoiceRow(closing({ title: 'Acompte 30%' }))).toBe(false);
        expect(isClosingInvoiceRow(closing({ type: 'amendment' }))).toBe(false);
    });
});

describe('amendmentBillableTime', () => {
    it('utilise signed_at en priorité', () => {
        expect(amendmentBillableTime(amendment({ signed_at: BEFORE, created_at: AFTER })))
            .toBe(new Date(BEFORE).getTime());
    });

    it('retombe sur created_at quand signed_at manque', () => {
        expect(amendmentBillableTime(amendment({ signed_at: null, created_at: AFTER })))
            .toBe(new Date(AFTER).getTime());
    });

    it('renvoie null sans aucune date', () => {
        expect(amendmentBillableTime({ signed_at: null, created_at: null })).toBeNull();
    });
});

describe('latestClosingByParent', () => {
    it('retient la clôture la plus récente par devis parent', () => {
        const map = latestClosingByParent([
            closing({ created_at: '2026-01-08T10:00:00.000Z' }),
            closing({ created_at: CLOSING_AT }),
        ]);
        expect(map.get(1)).toBe(new Date(CLOSING_AT).getTime());
    });

    it('ignore les lignes qui ne sont pas des clôtures émises', () => {
        const map = latestClosingByParent([
            closing({ status: 'draft' }),
            { parent_id: 1, type: 'invoice', status: 'billed', title: 'Acompte', created_at: CLOSING_AT },
        ]);
        expect(map.has(1)).toBe(false);
    });

    it('retient Infinity pour une clôture sans date exploitable', () => {
        const map = latestClosingByParent([closing({ created_at: null })]);
        expect(map.get(1)).toBe(Infinity);
    });
});

describe('amendmentAlreadyBilled', () => {
    it('avenant signé APRÈS la clôture : reste à facturer (le cas du bug)', () => {
        const map = latestClosingByParent([closing()]);
        expect(amendmentAlreadyBilled(amendment({ signed_at: AFTER }), map)).toBe(false);
    });

    it('avenant signé AVANT la clôture : déjà facturé, à masquer', () => {
        const map = latestClosingByParent([closing()]);
        expect(amendmentAlreadyBilled(amendment({ signed_at: BEFORE }), map)).toBe(true);
    });

    it('signature exactement à la génération de la clôture : considéré inclus', () => {
        const map = latestClosingByParent([closing()]);
        expect(amendmentAlreadyBilled(amendment({ signed_at: CLOSING_AT }), map)).toBe(true);
    });

    it('aucune clôture sur le devis parent : reste à facturer', () => {
        const map = latestClosingByParent([]);
        expect(amendmentAlreadyBilled(amendment(), map)).toBe(false);
    });

    it('tombe sur created_at quand signed_at manque', () => {
        const map = latestClosingByParent([closing()]);
        expect(amendmentAlreadyBilled(amendment({ signed_at: null, created_at: AFTER }), map)).toBe(false);
        expect(amendmentAlreadyBilled(amendment({ signed_at: null, created_at: BEFORE }), map)).toBe(true);
    });

    it('avenant sans aucune date : masqué par prudence (anti double-facturation)', () => {
        const map = latestClosingByParent([closing()]);
        expect(amendmentAlreadyBilled(amendment({ signed_at: null, created_at: null }), map)).toBe(true);
    });

    it('ignore ce qui n\'est pas un avenant', () => {
        const map = latestClosingByParent([closing()]);
        expect(amendmentAlreadyBilled({ type: 'quote', parent_id: 1 }, map)).toBe(false);
        expect(amendmentAlreadyBilled(amendment({ parent_id: null }), map)).toBe(false);
    });
});
