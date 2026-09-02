import { describe, it, expect } from 'vitest';
import {
    extractInvoiceId,
    unwrapInvoice,
    isUsableReference,
    normalizeTransmissionStatus,
    buildIssuedDocumentBody,
    getB2BRouterConfig,
    receivedInvoicePdfPath,
    platformTotalMismatch,
    vatTaxAttributes,
} from '../../supabase/functions/_shared/b2brouter.ts';

describe('extractInvoiceId', () => {
    it("lit l'identifiant dans la réponse enveloppée de B2BRouter", () => {
        expect(extractInvoiceId({ invoice: { id: 4821, number: 'FAC-2026-0062' } })).toBe('4821');
    });
    it("lit aussi un objet à plat", () => {
        expect(extractInvoiceId({ id: '77', state: 'sent' })).toBe('77');
    });
    it('ne fabrique jamais "undefined" quand la réponse ne porte pas d\'id', () => {
        expect(extractInvoiceId({ invoice: { number: 'FAC-2026-0062' } })).toBeNull();
        expect(extractInvoiceId({ message: 'created' })).toBeNull();
        expect(extractInvoiceId({ id: 'undefined' })).toBeNull();
        expect(extractInvoiceId(null)).toBeNull();
    });
});

describe('unwrapInvoice', () => {
    it("renvoie l'objet invoice ou l'objet lui-même", () => {
        expect(unwrapInvoice({ invoice: { id: 1 } })).toEqual({ id: 1 });
        expect(unwrapInvoice({ id: 2 })).toEqual({ id: 2 });
        expect(unwrapInvoice({ foo: 'bar' })).toBeNull();
        expect(unwrapInvoice([1])).toBeNull();
    });
});

describe('isUsableReference', () => {
    it('écarte les références vides ou sérialisées par erreur', () => {
        expect(isUsableReference('4821')).toBe(true);
        expect(isUsableReference('undefined')).toBe(false);
        expect(isUsableReference('null')).toBe(false);
        expect(isUsableReference('')).toBe(false);
        expect(isUsableReference(null)).toBe(false);
    });
});

describe('normalizeTransmissionStatus', () => {
    it('ramène les états B2BRouter à nos trois statuts', () => {
        expect(normalizeTransmissionStatus('sent')).toBe('sent');
        expect(normalizeTransmissionStatus('new')).toBe('pending');
        expect(normalizeTransmissionStatus('draft')).toBe('pending');
        expect(normalizeTransmissionStatus('delivered')).toBe('acknowledged');
        expect(normalizeTransmissionStatus('registered')).toBe('acknowledged');
        expect(normalizeTransmissionStatus('accepted')).toBe('acknowledged');
        expect(normalizeTransmissionStatus('refused')).toBe('rejected');
        expect(normalizeTransmissionStatus('error')).toBe('rejected');
    });
    it('ignore un état inconnu', () => {
        expect(normalizeTransmissionStatus('archived')).toBeNull();
        expect(normalizeTransmissionStatus(undefined)).toBeNull();
    });
});

describe('getB2BRouterConfig', () => {
    it('retourne null sans clé ni compte', () => {
        expect(getB2BRouterConfig(() => undefined)).toBeNull();
    });
    it('bascule sur le staging en mode sandbox', () => {
        const env = { B2BROUTER_API_KEY: 'k', B2BROUTER_ACCOUNT_ID: '12', B2BROUTER_SANDBOX: 'true' };
        expect(getB2BRouterConfig((k) => env[k])).toMatchObject({ accountId: '12', base: 'https://api-staging.b2brouter.net', sandbox: true });
    });
});

describe('buildIssuedDocumentBody', () => {
    const profile = { iban: 'FR7612345' };
    const client = { name: 'SARL Dupont', siren: '925 082 885', address: '1 rue A', postal_code: '33230', city: 'Coutras', email: 'c@x.fr' };

    it('construit une facture avec SIREN acheteur, IBAN et lignes', () => {
        const quote = {
            type: 'invoice', invoice_number: 'FAC-2026-0062', date: '2026-04-26', include_tva: false,
            items: [
                { type: 'section', description: 'Tableau' },
                { description: 'Remplacement disjoncteur', quantity: 2, price: 45 },
            ],
        };
        const body = buildIssuedDocumentBody(quote, client, profile);
        expect(body.send_after_import).toBe(false);
        expect(body.invoice).toMatchObject({
            type: 'IssuedInvoice', number: 'FAC-2026-0062', date: '2026-04-26', currency: 'EUR', payment_method: 58, iban: 'FR7612345',
            contact: { cin_scheme: '0002', cin_value: '925082885', email: 'c@x.fr' },
        });
        expect(body.invoice.invoice_lines_attributes).toHaveLength(1);
        expect(body.invoice.invoice_lines_attributes[0]).toMatchObject({ quantity: 2, price: 45, taxes_attributes: [{ category: 'E', percent: 0, comment: 'TVA non applicable, art. 293 B du CGI' }] });
        expect(body.invoice.extra_info).toMatch(/293 B/);
    });

    it("transmet un avoir comme document d'avoir à montants positifs, en citant la facture rectifiée", () => {
        const quote = {
            type: 'credit_note', invoice_number: 'AV-2026-0001', date: '2026-05-02', include_tva: true,
            items: [{ description: 'Ligne (avoir sur facture FAC-2026-0062)', quantity: 1, price: -120 }],
        };
        const body = buildIssuedDocumentBody(quote, client, profile, { parentInvoiceNumber: 'FAC-2026-0062' });
        expect(body.invoice.type).toBe('IssuedCreditNote');
        expect(body.invoice.number).toBe('AV-2026-0001');
        expect(body.invoice.invoice_lines_attributes[0]).toMatchObject({ quantity: 1, price: 120, taxes_attributes: [{ category: 'S', percent: 20 }] });
        expect(body.invoice.extra_info).toBe('Avoir sur facture FAC-2026-0062');
    });

    it('produit une ligne synthétique quand la facture est sans détail', () => {
        const body = buildIssuedDocumentBody({ type: 'invoice', invoice_number: 'FAC-2026-0001', total_ht: 300, include_tva: true, title: 'Dépannage' }, client, null);
        expect(body.invoice.invoice_lines_attributes).toEqual([
            { description: 'Dépannage', quantity: 1, unit: 1, price: 300, taxes_attributes: [{ name: 'TVA', category: 'S', percent: 20 }] },
        ]);
        expect(body.invoice.iban).toBeUndefined();
    });
});

describe('receivedInvoicePdfPath', () => {
    it('range le PDF dans le dossier de l\'artisan (la policy de lecture s\'appuie dessus)', () => {
        expect(receivedInvoicePdfPath('user-1', 'row-9')).toBe('user-1/row-9.pdf');
    });
});

describe('vatTaxAttributes', () => {
    it('porte le motif d\'exonération en franchise, et rien de plus au taux normal', () => {
        expect(vatTaxAttributes(0, false)).toEqual({ name: 'TVA', category: 'E', percent: 0, comment: 'TVA non applicable, art. 293 B du CGI' });
        expect(vatTaxAttributes(20, true)).toEqual({ name: 'TVA', category: 'S', percent: 20 });
        expect(vatTaxAttributes(10, true)).toEqual({ name: 'TVA', category: 'AA', percent: 10 });
    });
});

describe('platformTotalMismatch', () => {
    it("détecte la TVA ajoutée par la plateforme (le cas d'avril : 972 € pour 810 €)", () => {
        expect(platformTotalMismatch(810, { total: 972.0 })).toEqual({ mismatch: true, expected: 810, platform: 972 });
    });
    it('accepte un total identique à l\'arrondi près, et compare les avoirs en valeur absolue', () => {
        expect(platformTotalMismatch('1486.91', { total: 1486.9 }).mismatch).toBe(false);
        expect(platformTotalMismatch(-120, { total: 120 }).mismatch).toBe(false);
    });
    it("ne bloque pas quand la plateforme n'expose pas de total", () => {
        expect(platformTotalMismatch(810, { id: 1 }).mismatch).toBe(false);
        expect(platformTotalMismatch(810, null).mismatch).toBe(false);
    });
});
