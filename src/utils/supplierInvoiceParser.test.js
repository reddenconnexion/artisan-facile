import { describe, it, expect, vi } from 'vitest';

// supplierInvoiceParser importe documentParser, qui charge pdfjs-dist/mammoth/sonner
// au chargement du module — inutiles pour les helpers purs testés ici, on les mocke
// pour rester exécutable en environnement node.
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }));
vi.mock('mammoth', () => ({ default: { extractRawText: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn(), message: vi.fn() } }));

const { normalizeProductKey, guessSupplierName, toISODate, extractInvoiceNumber, isDateLike } = await import('./supplierInvoiceParser');

describe('normalizeProductKey', () => {
    it('regroupe les libellés équivalents malgré accents/casse/ponctuation', () => {
        const a = normalizeProductKey('Câble U-1000 R2V 3G2.5');
        const b = normalizeProductKey('cable u 1000 r2v 3g2.5');
        expect(a).toBe(b);
    });

    it('distingue de vrais produits différents (dimensions)', () => {
        expect(normalizeProductKey('Câble 3G2.5')).not.toBe(normalizeProductKey('Câble 3G1.5'));
    });

    it('intègre la référence quand elle est fournie', () => {
        const withRef = normalizeProductKey('Disjoncteur 16A', 'REF-12_AB');
        expect(withRef).toContain('#');
        expect(withRef).toContain('ref12ab');
    });

    it('renvoie une chaîne vide pour un libellé vide', () => {
        expect(normalizeProductKey('')).toBe('');
        expect(normalizeProductKey('   ')).toBe('');
    });
});

describe('toISODate', () => {
    it('convertit le format français en ISO', () => {
        expect(toISODate('05/03/2026')).toBe('2026-03-05');
        expect(toISODate('5/3/26')).toBe('2026-03-05');
    });
    it('laisse passer une date déjà ISO', () => {
        expect(toISODate('2026-03-05')).toBe('2026-03-05');
    });
    it('renvoie null si non reconnue', () => {
        expect(toISODate('pas une date')).toBeNull();
        expect(toISODate('')).toBeNull();
        expect(toISODate('45/13/2026')).toBeNull();
    });
});

describe('extractInvoiceNumber', () => {
    it('extrait un numéro avec marqueur explicite', () => {
        expect(extractInvoiceNumber('Facture N° FA-2026-001')).toBe('FA-2026-001');
        expect(extractInvoiceNumber('FACTURE NUMÉRO 12345')).toBe('12345');
        expect(extractInvoiceNumber('N° de facture : 2026/0012')).toBe('2026/0012');
    });

    it('ne capture jamais une date comme numéro de facture', () => {
        expect(extractInvoiceNumber('Facture du 20/06/2026')).toBe('');
        expect(extractInvoiceNumber('Facture N° 20/06/2026')).toBe('');
        expect(extractInvoiceNumber('Date de facture : 20/06/2026')).toBe('');
    });

    it('exige un marqueur et au moins un chiffre', () => {
        expect(extractInvoiceNumber('Facture acquittée')).toBe('');
        expect(extractInvoiceNumber('Merci de votre confiance')).toBe('');
    });
});

describe('isDateLike', () => {
    it('reconnaît les formats de date courants', () => {
        expect(isDateLike('20/06/2026')).toBe(true);
        expect(isDateLike('2026-06-20')).toBe(true);
        expect(isDateLike('FA-2026-001')).toBe(false);
        expect(isDateLike('12345')).toBe(false);
    });
});

describe('guessSupplierName', () => {
    it('détecte la raison sociale en tête, en ignorant les champs administratifs', () => {
        const text = [
            'Rexel France',
            '12 rue des Artisans',
            '75000 Paris',
            'Facture N° FA-2026-001',
            'Date : 05/03/2026',
        ].join('\n');
        expect(guessSupplierName(text)).toBe('Rexel France');
    });

    it('renvoie une chaîne vide si rien de convaincant', () => {
        expect(guessSupplierName('Facture\n123,45 €\nTVA 20%')).toBe('');
    });
});
