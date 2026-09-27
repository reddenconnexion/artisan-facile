import { describe, it, expect } from 'vitest';
import {
    formatCurrency, formatPrice, formatCompactCurrency, formatAmount, formatDate, formatDateTime,
} from './format';

// Intl insère des espaces insécables (U+00A0 / U+202F) : on les normalise.
const plain = (s) => s.replace(/[  ]/g, ' ');

describe('formatCurrency', () => {
    it('formate en euros fr-FR', () => {
        expect(plain(formatCurrency(1234.5))).toBe('1 234,50 €');
    });
    it('arrondit à l’euro avec decimals: 0', () => {
        expect(plain(formatCurrency(1234.5, { decimals: 0 }))).toBe('1 235 €');
    });
    it('replie sur 0 pour une valeur invalide', () => {
        expect(plain(formatCurrency(undefined))).toBe('0,00 €');
        expect(plain(formatCurrency('abc'))).toBe('0,00 €');
        expect(plain(formatCurrency('12.3'))).toBe('12,30 €');
    });
});

describe('formatPrice', () => {
    it('formate avec deux décimales', () => {
        expect(plain(formatPrice(1234.5))).toBe('1 234,50 €');
    });
    it('renvoie le repli pour une valeur non numérique', () => {
        expect(formatPrice('abc')).toBe('');
        expect(formatPrice(undefined, '—')).toBe('—');
    });
});

describe('formatCompactCurrency', () => {
    it('compacte en k€', () => {
        expect(formatCompactCurrency(850.4)).toBe('850 €');
        expect(formatCompactCurrency(1250)).toBe('1.3 k€');
        expect(formatCompactCurrency(12600)).toBe('13 k€');
        expect(formatCompactCurrency(0)).toBe('0 €');
    });
    it('affiche un tiret pour une valeur absente', () => {
        expect(formatCompactCurrency(null)).toBe('—');
        expect(formatCompactCurrency(undefined)).toBe('—');
    });
});

describe('formatAmount', () => {
    it('garde le point décimal', () => {
        expect(formatAmount(12.5)).toBe('12.50 €');
        expect(formatAmount(null)).toBe('0.00 €');
        expect(formatAmount('7')).toBe('7.00 €');
    });
});

describe('formatDate / formatDateTime', () => {
    it('formate en fr-FR par défaut', () => {
        expect(formatDate('2026-09-27T10:00:00')).toBe('27/09/2026');
    });
    it('accepte une locale et des options Intl', () => {
        expect(formatDate('2026-09-27T10:00:00', { locale: 'en-GB' })).toBe('27/09/2026');
        expect(formatDate('2026-09-27T10:00:00', { day: 'numeric', month: 'long', year: 'numeric' })).toBe('27 septembre 2026');
    });
    it('renvoie le repli pour une date absente ou invalide', () => {
        expect(formatDate(null)).toBe('');
        expect(formatDate('pas une date', { fallback: '—' })).toBe('—');
        expect(formatDateTime(undefined, { fallback: '—' })).toBe('—');
    });
    it('accepte un objet Date', () => {
        expect(formatDate(new Date(2026, 0, 5))).toBe('05/01/2026');
    });
    it('inclut l’heure', () => {
        expect(formatDateTime('2026-09-27T14:05:00', { hour: '2-digit', minute: '2-digit' })).toBe('14:05');
    });
});
