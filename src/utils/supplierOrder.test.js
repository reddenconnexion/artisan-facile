import { describe, it, expect } from 'vitest';
import {
    extractReferenceNorm, referenceKey, normalizeParsedOrder, orderTotals, linePrices,
    labelSimilarity, suggestItemMatches, suggestQuoteForLine, guessQuoteFromText,
    splitFees, buildPurchaseRows, buildOrderHeader, buildLibraryCostUpdates, STOCK,
} from './supplierOrder';

describe('extractReferenceNorm / referenceKey (miroir du SQL)', () => {
    it('extrait la référence fabricant et retire le préfixe lettres', () => {
        expect(extractReferenceNorm('Disjoncteur DNX³ 406774')).toBe('406774');
        expect(extractReferenceNorm('LEG406774')).toBe('406774');
        expect(extractReferenceNorm('S520059 Schneider')).toBe('520059');
    });
    it('ignore les nombres trop courts', () => {
        expect(extractReferenceNorm('Câble 3G2,5 100 m')).toBeNull();
    });
    it('retombe sur la référence brute nettoyée', () => {
        expect(referenceKey('ab-12', 'Prise')).toBe('AB12');
        expect(referenceKey(null, 'Disjoncteur 406774')).toBe('406774');
    });
});

describe('normalizeParsedOrder', () => {
    it('déduit le prix unitaire du total de ligne et normalise la date', () => {
        const o = normalizeParsedOrder({
            supplier: ' 123elec ', order_ref: 'C-1', order_date: '06/09/2026',
            lines: [{ label: 'Disjoncteur', quantity: '4', line_total: '29,20' }, { label: '' }],
            shipping: 6.99, discount: -5, total: 31.19,
        });
        expect(o.supplier).toBe('123elec');
        expect(o.orderDate).toBe('2026-09-06');
        expect(o.lines).toHaveLength(1);
        expect(o.lines[0].unitPrice).toBe(7.3);
        expect(o.discount).toBe(5);
        expect(o.pricesIncludeVat).toBe(true);
    });
});

describe('orderTotals', () => {
    it('vérifie lignes + port − remise contre le total du mail', () => {
        const o = { lines: [{ quantity: 2, unitPrice: 10 }], shipping: 5, discount: 1, total: 24 };
        expect(orderTotals(o)).toMatchObject({ linesTotal: 20, computed: 24, gap: 0, balanced: true });
        expect(orderTotals({ ...o, total: 30 }).balanced).toBe(false);
    });
});

describe('linePrices', () => {
    it('convertit selon la base de prix', () => {
        expect(linePrices(12, true)).toEqual({ ht: 10, ttc: 12 });
        expect(linePrices(10, false)).toEqual({ ht: 10, ttc: 12 });
    });
});

describe('suggestItemMatches', () => {
    const items = [
        { id: 1, quote_id: 7, reference: '406774', description: 'Disjoncteur 16A', status: 'pending' },
        { id: 2, quote_id: 7, reference: null, description: 'Interrupteur différentiel 40A type A', status: 'pending' },
        { id: 3, quote_id: 8, reference: '406774', description: 'Disjoncteur 16A', status: 'pending' },
        { id: 4, quote_id: 7, reference: null, description: 'Gaine ICTA 20', status: 'cancelled' },
    ];
    it('rapproche par référence puis par libellé, dans le bon chantier', () => {
        const m = suggestItemMatches([
            { key: 'a', quoteId: 7, reference: 'LEG406774', label: 'Disj. DNX 1P+N 16A' },
            { key: 'b', quoteId: 7, reference: null, label: 'Interrupteur différentiel 40A type A Legrand' },
            { key: 'c', quoteId: 7, reference: null, label: 'Gaine ICTA 20 (couronne)' },
        ], items);
        expect(m.get('a')).toBe(1);
        expect(m.get('b')).toBe(2);
        expect(m.has('c')).toBe(false); // ligne annulée ignorée
    });
    it('ne réutilise pas une ligne déjà réglée ni deux fois la même', () => {
        const lines = [
            { key: 'a', quoteId: 7, reference: '406774', label: 'x' },
            { key: 'b', quoteId: 7, reference: '406774', label: 'x' },
        ];
        const m = suggestItemMatches(lines, items);
        expect(m.size).toBe(1);
        expect(suggestItemMatches(lines, items, new Set([1])).size).toBe(0);
    });
    it('ne propose rien sans chantier choisi', () => {
        expect(suggestItemMatches([{ key: 'a', quoteId: null, reference: '406774', label: '' }], items).size).toBe(0);
    });
});

describe('labelSimilarity', () => {
    it('ignore accents et mots vides', () => {
        expect(labelSimilarity('Câble R2V 3G2.5', 'cable r2v 3g2 5 couronne')).toBeGreaterThanOrEqual(0.6);
        expect(labelSimilarity('Prise', '')).toBe(0);
    });
});

describe('suggestQuoteForLine', () => {
    const items = [
        { id: 1, quote_id: 7, reference: '406774', status: 'pending' },
        { id: 2, quote_id: 8, reference: '406775', status: 'pending' },
        { id: 3, quote_id: 9, reference: '406775', status: 'pending' },
    ];
    it('trouve le chantier unique qui attend cette référence', () => {
        expect(suggestQuoteForLine({ reference: '406774' }, items)).toBe(7);
    });
    it('reste neutre quand plusieurs chantiers attendent la pièce', () => {
        expect(suggestQuoteForLine({ reference: '406775' }, items)).toBeNull();
    });
});

describe('guessQuoteFromText', () => {
    it('reconnaît le client nommé dans l’adresse de livraison', () => {
        const quotes = [{ id: 1, client_name: 'Martin' }, { id: 2, client_name: 'Sély Dobigeon' }];
        expect(guessQuoteFromText('Livraison : M. Sely DOBIGEON, 12 rue…', quotes)).toBe(2);
        expect(guessQuoteFromText('Martinez SARL', quotes)).toBeNull();
    });
});

describe('splitFees', () => {
    it('ventile au prorata et tombe juste au centime', () => {
        const parts = splitFees([
            { quoteId: 1, quantity: 1, unitPrice: 100 },
            { quoteId: 2, quantity: 1, unitPrice: 50 },
        ], 10, 3);
        expect(parts).toEqual([
            { quoteId: 1, shipping: 6.67, discount: 2 },
            { quoteId: 2, shipping: 3.33, discount: 1 },
        ]);
    });
});

describe('buildPurchaseRows', () => {
    const order = {
        supplier: '123elec', orderDate: '2026-10-01', pricesIncludeVat: true,
        shipping: 6, discount: 0,
        lines: [
            { key: 'a', label: 'Disjoncteur', reference: '406774', quantity: 2, unit: 'u', unitPrice: 7.2, quoteId: 7, itemId: 1 },
            { key: 'b', label: 'Tournevis', reference: null, quantity: 1, unit: 'u', unitPrice: 12, quoteId: STOCK },
            { key: 'c', label: 'Prise', reference: null, quantity: 1, unit: 'u', unitPrice: 6, quoteId: null },
        ],
    };
    const rows = buildPurchaseRows(order, { userId: 'u', invoiceId: 9 });

    it('marque les lignes liées à la main et le stock', () => {
        expect(rows[0]).toMatchObject({ itemId: 1, row: { match_status: 'manual', quote_id: 7, unit_price: 6, unit_price_ttc: 7.2, total_price: 14.4, origin: 'web_order', invoice_id: 9 } });
        expect(rows[1].row).toMatchObject({ match_status: 'ignored', quote_id: null });
        expect(rows[2].row.match_status).toBeUndefined();
        expect(rows[2].itemId).toBeNull();
    });
    it('ajoute une ligne de port par chantier', () => {
        const ports = rows.filter((r) => r.row.product_name.startsWith('Frais de port'));
        expect(ports).toHaveLength(3);
        expect(ports.reduce((s, r) => s + r.row.total_price, 0)).toBeCloseTo(6, 2);
        expect(ports.find((r) => r.row.quote_id === 7).row.total_price).toBeCloseTo(2.67, 2);
    });
    it('n’envoie pas un itemId sans chantier', () => {
        const r = buildPurchaseRows({ ...order, shipping: 0, lines: [{ ...order.lines[0], quoteId: null }] }, { userId: 'u', invoiceId: 1 });
        expect(r[0].itemId).toBeNull();
        expect(r[0].row.match_status).toBeUndefined();
    });
});

describe('buildOrderHeader', () => {
    it('convertit un total HT en TTC', () => {
        const h = buildOrderHeader({ supplier: 'Rexel', orderRef: 'R1', orderDate: '2026-10-01', pricesIncludeVat: false, shipping: 0, discount: 0, total: 100, lines: [{ quantity: 1, unitPrice: 100 }] }, { userId: 'u' });
        expect(h).toMatchObject({ total_ht: 100, total_ttc: 120, source: 'web_order', order_ref: 'R1' });
    });
});

describe('buildLibraryCostUpdates', () => {
    const library = [
        { id: 1, description: 'Disjoncteur 16A', reference: 'LEG406774', buying_price: 6, supplier: 'Rexel' },
        { id: 2, description: 'Boîte d’encastrement', reference: null, buying_price: 0.5, supplier: '123elec' },
        { id: 3, description: 'Hublot LED', reference: null, buying_price: 15, supplier: null },
    ];
    it('met à jour le prix d’achat par référence ou désignation, sans créer', () => {
        const u = buildLibraryCostUpdates([
            { label: 'Disj DNX', reference: '406774', unitPrice: 7.2 },
            { label: 'Boîte d’encastrement', reference: null, unitPrice: 0.72 },
            { label: 'Spot inconnu', reference: null, unitPrice: 9 },
        ], library, { pricesIncludeVat: true, costIncludesVat: false, supplier: '123elec' });
        expect(u).toEqual([
            { id: 1, buying_price: 6, supplier: '123elec' },
            { id: 2, buying_price: 0.6, supplier: '123elec' },
        ]);
    });
    it('garde le TTC en franchise de TVA et saute ce qui n’a pas changé', () => {
        const u = buildLibraryCostUpdates([{ label: 'Disj', reference: '406774', unitPrice: 7.2 }], library, { pricesIncludeVat: true, costIncludesVat: true, supplier: 'Rexel' });
        expect(u).toEqual([{ id: 1, buying_price: 7.2, supplier: 'Rexel' }]);
        expect(buildLibraryCostUpdates([{ label: 'Hublot LED', unitPrice: 15 }], library, { pricesIncludeVat: false, costIncludesVat: false, supplier: '' })).toEqual([]);
    });
});
