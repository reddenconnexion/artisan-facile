import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    toSafeNumber,
    validateQuoteItem,
    extractJsonObject,
    parseQuoteResponse,
} from './quoteValidation';

beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('toSafeNumber', () => {
    it('returns the fallback for null/undefined/empty string', () => {
        expect(toSafeNumber(null, 0)).toBe(0);
        expect(toSafeNumber(undefined, 1)).toBe(1);
        expect(toSafeNumber('', 5)).toBe(5);
    });

    it('parses numeric strings', () => {
        expect(toSafeNumber('12.5', 0)).toBe(12.5);
        expect(toSafeNumber('0', 99)).toBe(0);
        expect(toSafeNumber('-3', 0)).toBe(-3);
    });

    it('returns numbers unchanged', () => {
        expect(toSafeNumber(42, 0)).toBe(42);
        expect(toSafeNumber(0, 99)).toBe(0);
    });

    it('warns and falls back on garbage input instead of returning NaN', () => {
        expect(toSafeNumber('abc', 7)).toBe(7);
        expect(console.warn).toHaveBeenCalled();
    });

    it('rejects Infinity and NaN explicitly', () => {
        expect(toSafeNumber(Infinity, 1)).toBe(1);
        expect(toSafeNumber(NaN, 1)).toBe(1);
    });
});

describe('validateQuoteItem', () => {
    it('throws on non-object items', () => {
        expect(() => validateQuoteItem(null, 0)).toThrow(/structure invalide/);
        expect(() => validateQuoteItem('foo', 0)).toThrow(/structure invalide/);
        expect(() => validateQuoteItem([], 0)).toThrow(/structure invalide/);
    });

    it('throws when description is missing or empty', () => {
        expect(() => validateQuoteItem({}, 0)).toThrow(/description/);
        expect(() => validateQuoteItem({ description: '' }, 0)).toThrow(/description/);
        expect(() => validateQuoteItem({ description: '   ' }, 0)).toThrow(/description/);
        expect(() => validateQuoteItem({ description: 42 }, 0)).toThrow(/description/);
    });

    it('normalises a valid item with sensible defaults', () => {
        const result = validateQuoteItem({ description: '  Pose plinthes  ' }, 0);
        expect(result).toEqual({
            description: 'Pose plinthes',
            quantity: 1,
            unit: 'u',
            price: 0,
            type: 'service',
        });
    });

    it('coerces numeric strings and clamps unknown types to "service"', () => {
        const result = validateQuoteItem(
            { description: 'Câble', quantity: '15', price: '2.50', unit: 'ml', type: 'unknown' },
            0
        );
        expect(result.quantity).toBe(15);
        expect(result.price).toBe(2.5);
        expect(result.unit).toBe('ml');
        expect(result.type).toBe('service');
    });

    it('keeps "material" as type when explicitly set', () => {
        const result = validateQuoteItem({ description: 'Boîte', type: 'material' }, 0);
        expect(result.type).toBe('material');
    });

    it('replaces malformed quantities with the safe default 1', () => {
        const result = validateQuoteItem({ description: 'X', quantity: 'oops' }, 0);
        expect(result.quantity).toBe(1);
        expect(console.warn).toHaveBeenCalled();
    });
});

describe('extractJsonObject', () => {
    it('parses pure JSON', () => {
        expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
    });

    it('strips surrounding prose / markdown fences', () => {
        const noisy = 'Bien sûr ! Voici la réponse :\n```json\n{"items":[]}\n```\nCordialement.';
        expect(extractJsonObject(noisy)).toEqual({ items: [] });
    });

    it('throws a user-facing error on garbage input', () => {
        expect(() => extractJsonObject('not json at all')).toThrow(/format invalide/);
        expect(() => extractJsonObject('{ unbalanced')).toThrow(/format invalide/);
    });

    it('handles null/undefined input by throwing', () => {
        expect(() => extractJsonObject(null)).toThrow(/format invalide/);
        expect(() => extractJsonObject(undefined)).toThrow(/format invalide/);
    });
});

describe('parseQuoteResponse', () => {
    it('returns normalised items, suggestions, estimated_duration', () => {
        const raw = JSON.stringify({
            items: [{ description: 'Câble', quantity: 10, price: 2 }],
            suggestions: ['Penser à isoler'],
            estimated_duration: '2 jours',
        });
        const out = parseQuoteResponse(raw);
        expect(out.items).toHaveLength(1);
        expect(out.items[0].description).toBe('Câble');
        expect(out.suggestions).toEqual(['Penser à isoler']);
        expect(out.estimated_duration).toBe('2 jours');
    });

    it('accepts a top-level array as items', () => {
        const raw = JSON.stringify([{ description: 'Test', quantity: 1, price: 0 }]);
        const out = parseQuoteResponse(raw);
        expect(out.items).toHaveLength(1);
        expect(out.suggestions).toEqual([]);
        expect(out.estimated_duration).toBeNull();
    });

    it('drops non-string suggestions and non-string estimated_duration', () => {
        const raw = JSON.stringify({
            items: [{ description: 'X' }],
            suggestions: ['ok', 42, null, 'good'],
            estimated_duration: 999,
        });
        const out = parseQuoteResponse(raw);
        expect(out.suggestions).toEqual(['ok', 'good']);
        expect(out.estimated_duration).toBeNull();
    });

    it('rejects when items contains a malformed entry', () => {
        const raw = JSON.stringify({ items: [{ quantity: 1 }] }); // no description
        expect(() => parseQuoteResponse(raw)).toThrow(/description/);
    });

    it('returns an empty items array when items is missing', () => {
        const raw = JSON.stringify({ suggestions: ['x'] });
        const out = parseQuoteResponse(raw);
        expect(out.items).toEqual([]);
        expect(out.suggestions).toEqual(['x']);
    });
});
