import { describe, it, expect } from 'vitest';
import { getEInvoiceEligibility, isValidSiren } from './einvoiceEligibility';
import { getEInvoiceEligibility as serverEligibility } from '../../supabase/functions/_shared/b2brouter.ts';

const issuedInvoice = { type: 'invoice', invoice_number: 'FAC-2026-0062' };
const proClient = { name: 'SARL Dupont', type: 'professional', siren: '925 082 885' };

describe('isValidSiren', () => {
    it('accepte 9 chiffres, avec ou sans espaces', () => {
        expect(isValidSiren('925082885')).toBe(true);
        expect(isValidSiren('925 082 885')).toBe(true);
    });
    it('refuse un SIRET, un numéro incomplet ou vide', () => {
        expect(isValidSiren('92508288500029')).toBe(false);
        expect(isValidSiren('92508')).toBe(false);
        expect(isValidSiren(null)).toBe(false);
    });
});

describe('getEInvoiceEligibility', () => {
    it('accepte une facture émise pour un professionnel avec SIREN', () => {
        expect(getEInvoiceEligibility(issuedInvoice, proClient)).toEqual({ eligible: true, reason: null, message: null });
    });

    it('accepte un avoir émis', () => {
        expect(getEInvoiceEligibility({ type: 'credit_note', invoice_number: 'AV-2026-0001' }, proClient).eligible).toBe(true);
    });

    it('refuse un devis ou un avenant', () => {
        expect(getEInvoiceEligibility({ type: 'quote', invoice_number: 'x' }, proClient).reason).toBe('not_document');
        expect(getEInvoiceEligibility({ type: 'amendment', invoice_number: 'x' }, proClient).reason).toBe('not_document');
    });

    it("refuse un brouillon non émis (pas de numéro légal)", () => {
        expect(getEInvoiceEligibility({ type: 'invoice', invoice_number: null }, proClient).reason).toBe('not_issued');
    });

    it('refuse un document importé', () => {
        expect(getEInvoiceEligibility({ ...issuedInvoice, is_external: true }, proClient).reason).toBe('external');
    });

    it('refuse un client particulier, même avec un SIREN saisi', () => {
        const r = getEInvoiceEligibility(issuedInvoice, { ...proClient, type: 'individual' });
        expect(r.reason).toBe('individual');
        expect(r.message).toMatch(/e-reporting/);
    });

    it('refuse un professionnel sans SIREN valide', () => {
        expect(getEInvoiceEligibility(issuedInvoice, { name: 'X', type: 'professional', siren: '' }).reason).toBe('no_siren');
        expect(getEInvoiceEligibility(issuedInvoice, { name: 'X', siren: '12345' }).reason).toBe('no_siren');
    });

    it('traite un client sans type comme un professionnel (anciennes fiches)', () => {
        expect(getEInvoiceEligibility(issuedInvoice, { name: 'X', siren: '123456789' }).eligible).toBe(true);
    });

    it('refuse sans client', () => {
        expect(getEInvoiceEligibility(issuedInvoice, null).reason).toBe('no_client');
    });

    it('rend le même verdict que la règle côté serveur', () => {
        const cases = [
            [issuedInvoice, proClient],
            [issuedInvoice, { ...proClient, type: 'individual' }],
            [issuedInvoice, { name: 'X', siren: '' }],
            [{ type: 'invoice' }, proClient],
            [{ ...issuedInvoice, is_external: true }, proClient],
            [{ type: 'quote', invoice_number: 'x' }, proClient],
            [issuedInvoice, null],
        ];
        for (const [doc, client] of cases) {
            expect(serverEligibility(doc, client)).toEqual(getEInvoiceEligibility(doc, client));
        }
    });
});
