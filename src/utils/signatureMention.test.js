import { describe, it, expect } from 'vitest';
import { isValidMention, normalizeMention } from './signatureMention';

describe('mention manuscrite « Bon pour accord »', () => {
    it('accepte la saisie exacte', () => {
        expect(isValidMention('Bon pour accord')).toBe(true);
    });

    it('accepte les variantes de casse, d\'espaces et de ponctuation', () => {
        expect(isValidMention('bon pour accord')).toBe(true);
        expect(isValidMention('BON POUR ACCORD')).toBe(true);
        expect(isValidMention('  Bon pour accord  ')).toBe(true);
        expect(isValidMention('Bon  pour   accord')).toBe(true);
        expect(isValidMention('Bon pour accord.')).toBe(true);
        expect(isValidMention('« Bon pour accord »')).toBe(true);
        expect(isValidMention('Bon-pour-accord')).toBe(true);
    });

    it('accepte une saisie accentuée par autocorrection', () => {
        expect(isValidMention('Bon pour accôrd')).toBe(true);
    });

    it('refuse une mention absente, incomplète ou différente', () => {
        expect(isValidMention('')).toBe(false);
        expect(isValidMention('   ')).toBe(false);
        expect(isValidMention(null)).toBe(false);
        expect(isValidMention('bon pour')).toBe(false);
        expect(isValidMention('accord')).toBe(false);
        expect(isValidMention('lu et approuvé')).toBe(false);
        expect(isValidMention('bon pour accord sous reserve')).toBe(false);
    });

    it('normalise en une suite de mots comparable', () => {
        expect(normalizeMention('  Bon,   POUR accord ! ')).toBe('bon pour accord');
    });
});
