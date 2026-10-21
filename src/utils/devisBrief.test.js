import { describe, it, expect } from 'vitest';
import {
    zonedTranscripts, photoFindings, zonedLine, keepPhotoNotes, isClaudeProjectUrl, untranscribedNotes, untranscribedLine,
} from './devisBrief';

describe('zonedTranscripts', () => {
    it('garde l\'ordre de la visite et la pièce, sans les notes vides', () => {
        const notes = [{ id: 'a', zone: 'Cuisine' }, { id: 'b', zone: '' }, { id: 'c', zone: 'Séjour' }];
        expect(zonedTranscripts(notes, { a: ' 3 prises ', b: 'tableau à changer', c: '' })).toEqual([
            { zone: 'Cuisine', text: '3 prises' },
            { zone: '', text: 'tableau à changer' },
        ]);
    });
});

describe('photoFindings', () => {
    it('associe chaque constat à la pièce de la photo', () => {
        const photos = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
        expect(photoFindings(photos, { p1: 'Tableau 2 rangées', p3: '' }, { p1: 'Garage' })).toEqual([
            { zone: 'Garage', text: 'Tableau 2 rangées' },
        ]);
    });
});

describe('zonedLine', () => {
    it('préfixe la pièce entre crochets', () => {
        expect(zonedLine({ zone: 'Cuisine', text: '3 prises' })).toBe('[Cuisine] 3 prises');
        expect(zonedLine({ zone: '', text: '3 prises' })).toBe('3 prises');
    });
});

describe('keepPhotoNotes', () => {
    it('oublie les constats des photos supprimées', () => {
        expect(keepPhotoNotes({ p1: 'a', p2: 'b' }, [{ id: 'p2' }])).toEqual({ p2: 'b' });
    });
});

describe('isClaudeProjectUrl', () => {
    it('n\'accepte que les liens claude.ai en https', () => {
        expect(isClaudeProjectUrl('https://claude.ai/project/0198abcd')).toBe(true);
        expect(isClaudeProjectUrl('http://claude.ai/project/x')).toBe(false);
        expect(isClaudeProjectUrl('https://evil.com/claude.ai')).toBe(false);
        expect(isClaudeProjectUrl('pas un lien')).toBe(false);
    });
});

describe('untranscribedNotes', () => {
    it('garde les notes sans transcription, mais pas celles transcrites vides (silence)', () => {
        const notes = [
            { id: 'a', zone: 'Salon', duration: 480.4 },
            { id: 'b', zone: 'Chambre', duration: 86 },
            { id: 'c', duration: 30 },
        ];
        expect(untranscribedNotes(notes, { b: '' })).toEqual([
            { zone: 'Salon', seconds: 480 },
            { zone: '', seconds: 30 },
        ]);
    });
});

describe('untranscribedLine', () => {
    it('ne dit rien quand tout est transcrit', () => {
        expect(untranscribedLine([])).toBe('');
    });

    it('donne le nombre, la durée et la pièce de chaque enregistrement manquant', () => {
        expect(untranscribedLine([{ zone: 'Salon', seconds: 480 }, { seconds: 45 }, { zone: '', seconds: 0 }]))
            .toBe('ENREGISTREMENTS NON TRANSCRITS (contenu absent de ce résumé, à réécouter) : 3 — 8 min, Salon ; 45 s');
    });
});

describe('dictées dans la matière de la visite', () => {
    it('garde la nature dictée de la note et la rend lisible', () => {
        const notes = [{ id: 'd', zone: 'Cuisine', kind: 'dictation' }, { id: 's', zone: 'Séjour' }];
        const list = zonedTranscripts(notes, { d: '3 prises', s: 'on verra' });
        expect(list).toEqual([
            { zone: 'Cuisine', text: '3 prises', kind: 'dictation' },
            { zone: 'Séjour', text: 'on verra' },
        ]);
        expect(list.map(zonedLine)).toEqual(['[Cuisine] Dictée : 3 prises', '[Séjour] on verra']);
    });
});
