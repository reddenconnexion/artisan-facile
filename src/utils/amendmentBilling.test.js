import { describe, it, expect } from 'vitest';
import {
    isClosingInvoiceRow,
    amendmentBillableTime,
    latestClosingByParent,
    amendmentAlreadyBilled,
    isPostClosingComplement,
    complementInvoiceTitle,
    amendmentProjectTotals,
    amendmentParentContext,
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

describe('amendmentProjectTotals', () => {
    it('ajoute le montant de l’avenant au devis initial', () => {
        const t = amendmentProjectTotals({ total_ttc: 1200 }, 300);
        expect(t).toMatchObject({ baseline: 1200, newTotal: 1500, showDeposit: false, remaining: 1500 });
    });

    it('part des situations déjà facturées quand il y en a', () => {
        const t = amendmentProjectTotals({ total_ttc: 1200, progress_total: 800, deposit_total: 200 }, -100);
        expect(t).toMatchObject({ baseline: 800, newTotal: 700, showDeposit: false });
    });

    it('déduit l’acompte déjà versé dans le modèle additif', () => {
        const t = amendmentProjectTotals({ total_ttc: '1000', deposit_total: 300 }, 200);
        expect(t).toMatchObject({ newTotal: 1200, showDeposit: true, remaining: 900 });
    });

    it('tolère un contexte parent absent', () => {
        expect(amendmentProjectTotals(null, 50)).toMatchObject({ baseline: 0, newTotal: 50, remaining: 50 });
    });
});

describe('amendmentProjectTotals — avenants précédents', () => {
    it('ajoute les avenants précédents signés au nouveau total', () => {
        // Devis 5 000 €, avenant n°1 signé +800 €, avenant n°2 +300 €.
        const t = amendmentProjectTotals({ total_ttc: 5000, previous_amendments_total: 800, previous_amendments_count: 1 }, 300);
        expect(t).toMatchObject({ newTotal: 6100, remaining: 6100, previousAmendmentsCount: 1, showRemaining: false });
    });

    it('déduit l’acompte et les avenants précédents déjà facturés du reste à régler', () => {
        const t = amendmentProjectTotals({
            total_ttc: 5000, deposit_total: 1500,
            previous_amendments_total: 800, previous_amendments_billed: 800, previous_amendments_count: 1,
        }, 300);
        expect(t).toMatchObject({ newTotal: 6100, remaining: 3800, showDeposit: true, showPreviousBilled: true, showRemaining: true });
    });

    it('avec situations : base = situations + avenants précédents', () => {
        const t = amendmentProjectTotals({ total_ttc: 5000, progress_total: 2000, previous_amendments_total: 800 }, 300);
        expect(t).toMatchObject({ baseline: 2000, newTotal: 3100, showRemaining: false });
    });
});

describe('amendmentParentContext', () => {
    const children = [
        { id: 10, type: 'invoice', status: 'billed', title: "Facture d'Acompte - Cuisine", total_ttc: 1500 },
        { id: 11, type: 'invoice', status: 'billed', title: 'Situation n°1', amendment_details: { situation: { index: 1 } }, total_ttc: 2000 },
        { id: 12, type: 'invoice', status: 'billed', title: 'Facture de clôture', total_ttc: 9999 },
        { id: 13, type: 'invoice', status: 'cancelled', title: 'Acompte annulé', total_ttc: 400 },
        { id: 20, type: 'amendment', status: 'accepted', total_ttc: 800 },
        // Avenant signé puis converti en facture : reste un avenant (parent_quote_id).
        { id: 21, type: 'invoice', status: 'billed', parent_quote_id: 1, title: 'Ajout prises', total_ttc: 250 },
        { id: 22, type: 'amendment', status: 'draft', total_ttc: 120 },
        { id: 23, type: 'amendment', status: 'refused', total_ttc: 90 },
        { id: 30, type: 'amendment', status: 'accepted', total_ttc: 300 }, // avenant courant
        { id: 31, type: 'amendment', status: 'accepted', total_ttc: 700 }, // postérieur
    ];

    it('ne retient que les avenants antérieurs signés, sans l’avenant courant', () => {
        expect(amendmentParentContext(children, 30)).toEqual({
            progressTotal: 2000,
            depositTotal: 1500,
            previousAmendmentsTTC: 1050,
            previousAmendmentsBilledTTC: 250,
            previousAmendmentsCount: 2,
        });
    });

    it('un avenant converti en facture n’est plus compté comme acompte', () => {
        expect(amendmentParentContext(children, 20).depositTotal).toBe(1500);
        expect(amendmentParentContext(children, 20).previousAmendmentsCount).toBe(0);
    });

    it('tolère une liste vide', () => {
        expect(amendmentParentContext(null, 1).previousAmendmentsTTC).toBe(0);
    });
});
