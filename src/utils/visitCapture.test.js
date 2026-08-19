import { describe, it, expect } from 'vitest';
import {
    createCapture,
    addZoneChange,
    addCount,
    addVoice,
    addPhoto,
    addFlag,
    undoLast,
    hasCaptureContent,
    ensureSurveyZone,
    bumpSurveyCounter,
    zoneCounters,
    captureSegments,
    buildTimelineLines,
    captureFlags,
} from './visitCapture';
import { createEmptySurvey } from './surveyText';
import { SURVEY_TEMPLATES } from '../constants/surveyTemplates';

const ELEC = SURVEY_TEMPLATES.electricien;
const T0 = new Date('2026-08-18T09:05:00').getTime(); // heure locale, comme sur le chantier
const min = (n) => T0 + n * 60_000;

describe('fil de capture', () => {
    it('rattache chaque tap à la pièce en cours', () => {
        let c = createCapture();
        c = addZoneChange(c, 'Cuisine', T0);
        c = addCount(c, { counterKey: 'prises', at: min(1) });
        c = addZoneChange(c, 'Séjour', min(2));
        c = addCount(c, { counterKey: 'spots', at: min(3) });
        expect(c.zone).toBe('Séjour');
        expect(c.entries.map((e) => [e.type, e.zone])).toEqual([
            ['zone', 'Cuisine'],
            ['count', 'Cuisine'],
            ['zone', 'Séjour'],
            ['count', 'Séjour'],
        ]);
    });

    it('donne un identifiant unique à chaque entrée', () => {
        let c = createCapture();
        c = addCount(c, { counterKey: 'prises', at: T0 });
        c = addCount(c, { counterKey: 'prises', at: T0 });
        expect(new Set(c.entries.map((e) => e.id)).size).toBe(2);
    });

    it('est vide au départ', () => {
        expect(hasCaptureContent(createCapture())).toBe(false);
        expect(hasCaptureContent(addFlag(createCapture(), { at: T0 }))).toBe(true);
    });
});

describe('insertion chronologique', () => {
    it('replace un segment audio à son heure d\'ouverture', () => {
        let c = addZoneChange(createCapture(), 'Cuisine', T0);
        c = addCount(c, { counterKey: 'prises', at: min(5) });
        c = addZoneChange(c, 'Séjour', min(6));
        // Le segment micro ouvert à T0+1 ne remonte qu'à sa fermeture, après la bascule.
        c = addVoice(c, { mediaId: 'v1', duration: 300, at: min(1), zone: 'Cuisine' });
        expect(c.entries.map((e) => e.type)).toEqual(['zone', 'voice', 'count', 'zone']);
        expect(c.entries[1].zone).toBe('Cuisine'); // la pièce où le micro s'est ouvert
    });
});

describe('undoLast', () => {
    it('retourne l\'entrée retirée pour en défaire l\'effet', () => {
        let c = addCount(addZoneChange(createCapture(), 'Cuisine', T0), { counterKey: 'prises', at: min(1) });
        const { capture, undone } = undoLast(c);
        expect(undone.type).toBe('count');
        expect(undone.counterKey).toBe('prises');
        expect(capture.entries).toHaveLength(1);
    });

    it('revient à la pièce précédente quand on annule une bascule', () => {
        let c = addZoneChange(createCapture(), 'Cuisine', T0);
        c = addZoneChange(c, 'Séjour', min(1));
        const { capture } = undoLast(c);
        expect(capture.zone).toBe('Cuisine');
    });

    it('ne casse rien sur un fil vide', () => {
        const { capture, undone } = undoLast(createCapture());
        expect(undone).toBeNull();
        expect(capture.entries).toEqual([]);
    });
});

describe('trame alimentée par le comptage', () => {
    it('crée la pièce à la volée puis incrémente son compteur', () => {
        let survey = createEmptySurvey();
        survey = bumpSurveyCounter(survey, 'Cuisine', 'prises', 1);
        survey = bumpSurveyCounter(survey, 'Cuisine', 'prises', 1);
        expect(survey.zones).toHaveLength(1);
        expect(zoneCounters(survey, 'Cuisine').prises).toBe(2);
    });

    it('retrouve la pièce quelle que soit la casse et ne la double pas', () => {
        let survey = ensureSurveyZone(createEmptySurvey(), 'Cuisine');
        survey = ensureSurveyZone(survey, 'cuisine ');
        survey = bumpSurveyCounter(survey, 'CUISINE', 'spots', 3);
        expect(survey.zones).toHaveLength(1);
        expect(zoneCounters(survey, 'Cuisine').spots).toBe(3);
    });

    it('ne descend jamais sous zéro (annulation de trop)', () => {
        let survey = bumpSurveyCounter(createEmptySurvey(), 'Cuisine', 'prises', 1);
        survey = bumpSurveyCounter(survey, 'Cuisine', 'prises', -1);
        survey = bumpSurveyCounter(survey, 'Cuisine', 'prises', -1);
        expect(zoneCounters(survey, 'Cuisine').prises).toBe(0);
    });

    it('ignore une pièce sans nom', () => {
        expect(ensureSurveyZone(createEmptySurvey(), '  ').zones).toHaveLength(0);
    });
});

describe('déroulé de la visite', () => {
    const walk = () => {
        let c = createCapture();
        c = addZoneChange(c, 'Cuisine', T0);
        c = addCount(c, { counterKey: 'prises', at: min(1) });
        c = addCount(c, { counterKey: 'prises', at: min(1) });
        c = addVoice(c, { mediaId: 'v1', duration: 18, at: min(2) });
        c = addFlag(c, { at: min(3) });
        c = addPhoto(c, { mediaId: 'p1', at: min(3) });
        c = addZoneChange(c, 'Séjour', min(10));
        c = addCount(c, { counterKey: 'spots', at: min(11) });
        return c;
    };

    it('groupe le fil par passage dans une pièce', () => {
        const segments = captureSegments(walk());
        expect(segments.map((s) => s.zone)).toEqual(['Cuisine', 'Séjour']);
        expect(segments[0].entries).toHaveLength(5);
    });

    it('rend un déroulé lisible, comptage cumulé par passage', () => {
        const lines = buildTimelineLines(walk(), { template: ELEC });
        expect(lines[0]).toMatch(/^\d{2}:\d{2} · Cuisine$/);
        expect(lines).toContain('- Note vocale (18 s, non transcrite)');
        expect(lines).toContain('- POINT SIGNALÉ — à traiter au chiffrage');
        expect(lines).toContain('- Comptage : Prises 2P+T +2');
        expect(lines).toContain('- 1 photo');
        expect(lines.some((l) => /· Séjour$/.test(l))).toBe(true);
        expect(lines).toContain('- Comptage : Spots LED +1');
    });

    it('injecte les transcriptions quand elles sont disponibles', () => {
        const lines = buildTimelineLines(walk(), {
            template: ELEC,
            transcripts: { v1: 'Le client veut déplacer la plaque contre le mur nord.' },
        });
        expect(lines).toContain('- Note vocale : « Le client veut déplacer la plaque contre le mur nord. »');
    });

    it('nomme les entrées prises avant toute bascule de pièce', () => {
        const c = addCount(createCapture(), { counterKey: 'prises', at: T0 });
        expect(buildTimelineLines(c, { template: ELEC })[0]).toMatch(/· Pièce non précisée$/);
    });

    it('ne rend rien pour un passage sans contenu', () => {
        const c = addZoneChange(createCapture(), 'Cuisine', T0);
        expect(buildTimelineLines(c, { template: ELEC })).toEqual([]);
    });

    it('liste les points signalés', () => {
        expect(captureFlags(walk())).toHaveLength(1);
    });
});
