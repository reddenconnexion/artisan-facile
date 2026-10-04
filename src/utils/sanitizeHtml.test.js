// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { sanitizeSignatureHtml } from './sanitizeHtml';

describe('sanitizeSignatureHtml', () => {
    it('retire scripts et gestionnaires d\'événements', () => {
        const out = sanitizeSignatureHtml('<p>Hi</p><script>alert(1)</script><img src="x" onerror="alert(1)">');
        expect(out).not.toMatch(/script|onerror/i);
        expect(out).toContain('<p>Hi</p>');
    });
    it('retire les URLs javascript:', () => {
        expect(sanitizeSignatureHtml('<a href="javascript:alert(1)">x</a>')).not.toMatch(/javascript/i);
    });
    it('garde la mise en forme et les liens sûrs', () => {
        const out = sanitizeSignatureHtml('<strong style="color:red">A</strong><a href="https://a.fr">l</a><a href="tel:0600">t</a>');
        expect(out).toContain('<strong style="color:red">A</strong>');
        expect(out).toContain('href="https://a.fr"');
        expect(out).toContain('href="tel:0600"');
    });
    it('vide en entrée vide', () => {
        expect(sanitizeSignatureHtml(null)).toBe('');
    });
});
