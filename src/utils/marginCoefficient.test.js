import { describe, it, expect } from 'vitest';
import { parseMarginCoefficient } from './marginCoefficient';

describe('parseMarginCoefficient', () => {
    it('accepte la virgule et le point', () => {
        expect(parseMarginCoefficient('1,58')).toBe(1.58);
        expect(parseMarginCoefficient(' 1.58 ')).toBe(1.58);
        expect(parseMarginCoefficient(1.584)).toBe(1.58);
    });

    it('refuse la vente à perte, les fautes de frappe et le vide', () => {
        expect(parseMarginCoefficient('1')).toBeNull();
        expect(parseMarginCoefficient('0,9')).toBeNull();
        expect(parseMarginCoefficient('15')).toBeNull();
        expect(parseMarginCoefficient('')).toBeNull();
        expect(parseMarginCoefficient('abc')).toBeNull();
    });
});
