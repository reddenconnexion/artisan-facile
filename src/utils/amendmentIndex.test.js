import { describe, it, expect } from 'vitest';
import { amendmentIndexOf, nextAmendmentIndex, amendmentLabel } from './amendmentIndex';

describe('nextAmendmentIndex', () => {
    it('premier avenant → 1', () => {
        expect(nextAmendmentIndex([])).toBe(1);
        expect(nextAmendmentIndex(null)).toBe(1);
    });

    it('un avenant existant (sans rang stocké) → 2', () => {
        expect(nextAmendmentIndex([{ amendment_details: {} }])).toBe(2);
    });

    it('suit le nombre d’avenants existants', () => {
        expect(nextAmendmentIndex([{}, { amendment_details: { amendment_index: 2 } }])).toBe(3);
    });

    it('ne réattribue pas un rang après suppression d’un avenant', () => {
        // Avenants 1, 2, 3 créés puis le 2 supprimé : le suivant est le n°4.
        const remaining = [{}, { amendment_details: { amendment_index: 3 } }];
        expect(nextAmendmentIndex(remaining)).toBe(4);
    });

    it('lit amendment_details stocké en chaîne JSON', () => {
        expect(nextAmendmentIndex([{ amendment_details: '{"amendment_index":5}' }])).toBe(6);
    });
});

describe('amendmentIndexOf', () => {
    it('ignore les valeurs invalides', () => {
        expect(amendmentIndexOf({ amendment_details: { amendment_index: 'x' } })).toBeNull();
        expect(amendmentIndexOf({})).toBeNull();
        expect(amendmentIndexOf({ amendment_details: 'pas du json' })).toBeNull();
    });
});

describe('amendmentLabel', () => {
    it('ne numérote pas le premier avenant', () => {
        expect(amendmentLabel(1)).toBe('Avenant');
        expect(amendmentLabel(null)).toBe('Avenant');
    });

    it('numérote à partir du second', () => {
        expect(amendmentLabel(2)).toBe('Avenant n°2');
        expect(amendmentLabel(3, 'AVENANT')).toBe('AVENANT n°3');
    });
});
