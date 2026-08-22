import { describe, it, expect } from 'vitest';
import { documentNumber, documentRef } from './documentNumber';

describe('documentNumber', () => {
    it('retourne le numéro légal pour une facture émise', () => {
        expect(documentNumber({ type: 'invoice', invoice_number: 'FAC-2026-0007', quote_number: 12, id: 3 }))
            .toBe('FAC-2026-0007');
    });

    it('retombe sur la référence interne pour une facture non émise', () => {
        expect(documentNumber({ type: 'invoice', invoice_number: null, quote_number: 12, id: 3 })).toBe('12');
        expect(documentNumber({ type: 'invoice', id: 3 })).toBe('3');
    });

    it('utilise quote_number pour un devis, même si invoice_number traîne', () => {
        expect(documentNumber({ type: 'quote', invoice_number: 'FAC-2026-0007', quote_number: 12 })).toBe('12');
    });

    it('gère les objets vides', () => {
        expect(documentNumber(null)).toBe('');
        expect(documentNumber({})).toBe('');
    });
});

describe('documentRef', () => {
    it('facture émise : numéro légal seul, sans préfixe redondant', () => {
        expect(documentRef({ type: 'invoice', invoice_number: 'FAC-2026-0001', quote_number: 5 }))
            .toBe('FAC-2026-0001');
    });

    it('facture non émise : préfixe FAC + référence interne', () => {
        expect(documentRef({ type: 'invoice', quote_number: 5 })).toBe('FAC #5');
    });

    it('devis et avenant : préfixes DEV / AVT', () => {
        expect(documentRef({ type: 'quote', quote_number: 5 })).toBe('DEV #5');
        expect(documentRef({ type: 'amendment', quote_number: 9 })).toBe('AVT #9');
    });
});
