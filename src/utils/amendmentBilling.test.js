import { describe, it, expect } from 'vitest';
import {
    isClosingInvoiceRow,
    amendmentBillableTime,
    latestClosingByParent,
    amendmentAlreadyBilled,
    isPostClosingComplement,
    complementInvoiceTitle,
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

describe('isPostClosingComplement', () => {
    it('vrai pour un avenant dont le devis parent a une clôture (donc signé après)', () => {
        const map = latestClosingByParent([closing()]);
        expect(isPostClosingComplement(amendment(), map)).toBe(true);
    });

    it('faux sans clôture sur le devis parent', () => {
        expect(isPostClosingComplement(amendment(), latestClosingByParent([]))).toBe(false);
    });

    it('faux pour un devis ou un avenant sans parent', () => {
        const map = latestClosingByParent([closing()]);
        expect(isPostClosingComplement({ type: 'quote', parent_id: 1 }, map)).toBe(false);
        expect(isPostClosingComplement(amendment({ parent_id: null }), map)).toBe(false);
    });
});

describe('complementInvoiceTitle', () => {
    it('préfixe le titre de l\'avenant', () => {
        expect(complementInvoiceTitle({ title: 'Ajout prise cuisine' }))
            .toBe('Facture complémentaire – Ajout prise cuisine');
    });

    it('ne double pas le préfixe déjà présent', () => {
        expect(complementInvoiceTitle({ title: 'Facture complémentaire – tableau' }))
            .toBe('Facture complémentaire – tableau');
    });

    it('retombe sur le préfixe seul quand il n\'y a pas de titre', () => {
        expect(complementInvoiceTitle({ title: '' })).toBe('Facture complémentaire');
        expect(complementInvoiceTitle({})).toBe('Facture complémentaire');
    });
});
