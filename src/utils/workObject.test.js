import { describe, it, expect } from 'vitest';
import { WORK_OBJECT_MAX_CHARS, capWorkObject, normalizeWorkObject, workObjectLength } from './workObject';

describe('normalizeWorkObject', () => {
    it('aplatit les retours à la ligne et les espaces multiples', () => {
        expect(normalizeWorkObject('Fourniture et pose\n\n  d’un interphone   vidéo.'))
            .toBe('Fourniture et pose d’un interphone vidéo.');
    });

    it('rogne les bords et gère les valeurs vides', () => {
        expect(normalizeWorkObject('   \n  ')).toBe('');
        expect(normalizeWorkObject(null)).toBe('');
        expect(normalizeWorkObject(undefined)).toBe('');
        expect(normalizeWorkObject(42)).toBe('');
    });
});

describe('capWorkObject', () => {
    it('laisse intact un texte sous le plafond', () => {
        const text = 'Fourniture et pose d’un système d’interphonie vidéo au portail piéton.';
        expect(capWorkObject(text)).toBe(text);
    });

    it('ne dépasse jamais le plafond', () => {
        const long = 'périmètre '.repeat(200);
        expect(capWorkObject(long).length).toBeLessThanOrEqual(WORK_OBJECT_MAX_CHARS);
        expect(capWorkObject('x'.repeat(2000)).length).toBeLessThanOrEqual(WORK_OBJECT_MAX_CHARS);
    });

    it('coupe sur une frontière de mot, sans mot tronqué', () => {
        const out = capWorkObject('alpha bravo charlie delta', 14);
        expect(out).toBe('alpha bravo…');
    });

    it('supprime la ponctuation orpheline avant les points de suspension', () => {
        expect(capWorkObject('alpha bravo, charlie', 15)).toBe('alpha bravo…');
    });

    it('coupe net un mot unique trop long, plutôt que de tout perdre', () => {
        expect(capWorkObject('x'.repeat(50), 10)).toBe(`${'x'.repeat(9)}…`);
    });

    it('applique le plafond à la longueur aplatie, pas à la saisie brute', () => {
        // 12 caractères une fois les espaces réduits : sous un plafond de 20.
        expect(capWorkObject('alpha    \n\n   bravo', 20)).toBe('alpha bravo');
    });

    it('renvoie une chaîne vide pour une saisie vide', () => {
        expect(capWorkObject('')).toBe('');
        expect(capWorkObject(null)).toBe('');
    });
});

describe('workObjectLength', () => {
    it('compte les caractères réellement retenus', () => {
        expect(workObjectLength('alpha    bravo')).toBe(11);
        expect(workObjectLength('  ')).toBe(0);
    });
});
