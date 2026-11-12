import { describe, it, expect } from 'vitest';
import {
    stopForZone, stopSpokenAliases, quickFieldSpec, getQuickValue, isQuickAnswered,
    toggleQuickValue, stopStatus, departureChecklist, setContexteText,
} from './visitStops';
import { createEmptySurvey } from './surveyText';
import { createCapture, addZoneChange, addVoice, addPhoto, addCount } from './visitCapture';
import { detectSpokenZone } from './spokenZone';
import { SURVEY_TEMPLATES } from '../constants/surveyTemplates';

const ELEC = SURVEY_TEMPLATES.electricien;
const T0 = new Date('2026-11-12T09:00:00').getTime();
const stop = (key) => ELEC.stops.find((s) => s.key === key);
const dictate = (capture, zone, id) => addVoice(addZoneChange(capture, zone, T0), { mediaId: id, duration: 10, at: T0 + 1, zone, kind: 'dictation' });
const answer = (survey, key, value) => toggleQuickValue(survey, quickFieldSpec(ELEC, key), value);

describe('trame des points de passage', () => {
    it('chaque poste est un poste dicté, avec des réponses qui existent dans la trame', () => {
        for (const template of Object.values(SURVEY_TEMPLATES)) {
            for (const s of template.stops) {
                expect(template.dictationTopics).toContain(s.label);
                expect(s.memo.length).toBeGreaterThan(0);
                for (const key of s.quick) expect(quickFieldSpec(template, key), `${s.key} → ${key}`).not.toBeNull();
            }
        }
    });

    it('n\'impose pas le tableau en premier', () => {
        expect(ELEC.stops[0].key).not.toBe('tableau');
    });

    it('distingue un poste d\'une pièce', () => {
        expect(stopForZone(ELEC, 'tableau électrique')?.key).toBe('tableau');
        expect(stopForZone(ELEC, 'Cuisine')).toBeNull();
        expect(stopForZone(ELEC, '')).toBeNull();
    });
});

describe('réponses en un tap', () => {
    it('décrit un champ à pastilles et l\'état du tableau', () => {
        expect(quickFieldSpec(ELEC, 'contexte.alimentation.terre')).toMatchObject({ label: 'Prise de terre', multi: false });
        expect(quickFieldSpec(ELEC, 'contexte.support.modePose').multi).toBe(true);
        expect(quickFieldSpec(ELEC, 'tableau.etat').options.map((o) => o.value)).toEqual(['conforme', 'a_completer', 'a_remplacer']);
        expect(quickFieldSpec(ELEC, 'contexte.alimentation.puissance')).toBeNull(); // champ texte
        expect(quickFieldSpec(SURVEY_TEMPLATES.default, 'tableau.etat')).toBeNull();
    });

    it('choix simple : un tap répond, le même tap efface', () => {
        const empty = createEmptySurvey();
        const once = answer(empty, 'contexte.alimentation.terre', 'Absente — à créer');
        expect(getQuickValue(once, 'contexte.alimentation.terre')).toBe('Absente — à créer');
        expect(isQuickAnswered(once, 'contexte.alimentation.terre')).toBe(true);
        expect(getQuickValue(empty, 'contexte.alimentation.terre')).toBe(''); // relevé d'origine intact
        const twice = answer(once, 'contexte.alimentation.terre', 'Absente — à créer');
        expect(isQuickAnswered(twice, 'contexte.alimentation.terre')).toBe(false);
    });

    it('choix multiple : les taps s\'ajoutent', () => {
        let survey = answer(createEmptySurvey(), 'contexte.support.modePose', 'Encastré');
        survey = answer(survey, 'contexte.support.modePose', 'Combles');
        expect(getQuickValue(survey, 'contexte.support.modePose')).toEqual(['Encastré', 'Combles']);
        survey = answer(survey, 'contexte.support.modePose', 'Encastré');
        expect(getQuickValue(survey, 'contexte.support.modePose')).toEqual(['Combles']);
    });

    it('écrit l\'état du tableau sans toucher au reste', () => {
        const base = { ...createEmptySurvey(), tableau: { ...createEmptySurvey().tableau, rangees: '2' } };
        const survey = answer(base, 'tableau.etat', 'a_remplacer');
        expect(survey.tableau).toMatchObject({ etat: 'a_remplacer', rangees: '2' });
    });
});

describe('état d\'un poste', () => {
    it('pas encore vu tant que rien n\'y a été fait', () => {
        const status = stopStatus({ stop: stop('comptage'), template: ELEC, survey: createEmptySurvey(), capture: createCapture() });
        expect(status).toMatchObject({ state: 'todo', voices: 0, photos: 0 });
    });

    it('vu mais incomplet quand une réponse essentielle manque', () => {
        const capture = dictate(createCapture(), 'Comptage et terre', 'd1');
        const status = stopStatus({ stop: stop('comptage'), template: ELEC, survey: createEmptySurvey(), capture });
        expect(status.state).toBe('partial');
        expect(status.missing).toEqual(['contexte.alimentation.terre']);
        expect(status.voices).toBe(1);
    });

    it('vu une fois la réponse essentielle donnée', () => {
        const survey = answer(createEmptySurvey(), 'contexte.alimentation.terre', 'Présente et raccordée');
        expect(stopStatus({ stop: stop('comptage'), template: ELEC, survey, capture: createCapture() }).state).toBe('done');
    });

    it('une photo suffit pour un poste sans réponse essentielle', () => {
        const capture = addPhoto(addZoneChange(createCapture(), 'Accès et logistique', T0), { mediaId: 'ph1', at: T0 + 1 });
        const status = stopStatus({ stop: stop('acces'), template: ELEC, survey: createEmptySurvey(), capture });
        expect(status).toMatchObject({ state: 'done', photos: 1 });
    });

    it('le tableau passe au vert avec son état', () => {
        const capture = dictate(createCapture(), 'Tableau électrique', 'd1');
        expect(stopStatus({ stop: stop('tableau'), template: ELEC, survey: createEmptySurvey(), capture }).state).toBe('partial');
        const survey = answer(createEmptySurvey(), 'tableau.etat', 'a_completer');
        expect(stopStatus({ stop: stop('tableau'), template: ELEC, survey, capture }).state).toBe('done');
    });
});

describe('avant de partir', () => {
    it('au départ, tout manque et aucun poste n\'est vu', () => {
        const list = departureChecklist({ template: ELEC, survey: createEmptySurvey(), capture: createCapture() });
        expect(list.total).toBe(ELEC.essentials.length);
        expect(list.done).toBe(0);
        expect(list.unseenStops.map((s) => s.key)).toEqual(ELEC.stops.map((s) => s.key));
        expect(list.missing.find((m) => m.key === 'demande')).toMatchObject({ kind: 'dictate', stop: 'Demande du client' });
        expect(list.missing.find((m) => m.key === 'zones').kind).toBe('info');
        expect(list.missing.find((m) => m.key === 'tableau').spec.key).toBe('tableau.etat');
        expect(list.missing.find((m) => m.key === 'contexte.client.delai').kind).toBe('text');
        expect(list.missing.find((m) => m.key === 'contexte.alimentation.terre').kind).toBe('quick');
    });

    it('une demande dictée compte, même avant la mise au propre', () => {
        const capture = dictate(createCapture(), 'Demande du client', 'd1');
        const list = departureChecklist({ template: ELEC, survey: createEmptySurvey(), capture });
        expect(list.missing.some((m) => m.key === 'demande')).toBe(false);
        expect(list.unseenStops.some((s) => s.key === 'demande')).toBe(false);
    });

    it('une demande dictée dans « Général » compte aussi', () => {
        const capture = dictate(createCapture(), 'Général', 'd1');
        expect(departureChecklist({ template: ELEC, survey: createEmptySurvey(), capture }).missing.some((m) => m.key === 'demande')).toBe(false);
    });

    it('une pièce dictée ou comptée vaut pièce relevée, pas un poste', () => {
        const empty = createEmptySurvey();
        const inStop = dictate(createCapture(), 'Tableau électrique', 'd1');
        expect(departureChecklist({ template: ELEC, survey: empty, capture: inStop }).missing.some((m) => m.key === 'zones')).toBe(true);
        const inRoom = dictate(createCapture(), 'Cuisine', 'd1');
        expect(departureChecklist({ template: ELEC, survey: empty, capture: inRoom }).missing.some((m) => m.key === 'zones')).toBe(false);
        const counted = addCount(addZoneChange(createCapture(), 'Garage', T0), { counterKey: 'prises', at: T0 + 1 });
        expect(departureChecklist({ template: ELEC, survey: empty, capture: counted }).missing.some((m) => m.key === 'zones')).toBe(false);
    });

    it('se vide à mesure qu\'on répond', () => {
        let survey = createEmptySurvey();
        survey = answer(survey, 'contexte.bien.typeBien', 'Maison');
        survey = answer(survey, 'contexte.bien.natureTravaux', 'Rénovation partielle');
        survey = answer(survey, 'contexte.support.modePose', 'Encastré');
        survey = answer(survey, 'contexte.alimentation.terre', 'Présente à vérifier');
        survey = answer(survey, 'tableau.etat', 'conforme');
        survey = setContexteText(survey, 'contexte.client.delai', 'Avant Noël');
        let capture = dictate(createCapture(), 'Demande du client', 'd1');
        capture = dictate(capture, 'Cuisine', 'd2');
        capture = addPhoto(addZoneChange(capture, 'Accès et logistique', T0 + 5), { mediaId: 'ph1', at: T0 + 6 });
        const list = departureChecklist({ template: ELEC, survey, capture });
        expect(list.missing).toEqual([]);
        expect(list.done).toBe(list.total);
        expect(list.unseenStops).toEqual([]);
    });

    it('fonctionne pour un métier sans tableau', () => {
        const generic = SURVEY_TEMPLATES.default;
        const list = departureChecklist({ template: generic, survey: createEmptySurvey(), capture: createCapture() });
        expect(list.unseenStops.map((s) => s.key)).toEqual(['demande', 'acces']);
        expect(list.missing.every((m) => m.key !== 'tableau')).toBe(true);
    });
});

describe('postes annoncés à voix haute', () => {
    const spoken = (text) => detectSpokenZone(text, {
        topics: ELEC.dictationTopics, presets: ELEC.zonePresets, aliases: stopSpokenAliases(ELEC),
    });

    it('reconnaît chaque poste par son nom ou sa façon courante de le dire', () => {
        expect(spoken('Compteur, Linky monophasé en limite de propriété.')).toBe('Comptage et terre');
        expect(spoken('Pour la terre, piquet présent mais barrette oxydée.')).toBe('Comptage et terre');
        expect(spoken('Le client veut refaire tout le rez-de-chaussée avant Noël.')).toBe('Demande du client');
        expect(spoken('Demande du client : ajouter une borne de recharge.')).toBe('Demande du client');
        expect(spoken('Passage des câbles par les combles, murs en brique.')).toBe('Passage des câbles');
        expect(spoken('Accès, deuxième étage sans ascenseur.')).toBe('Accès et logistique');
        expect(spoken('Tableau, deux rangées.')).toBe('Tableau électrique');
    });

    it('laisse les pièces aux pièces', () => {
        expect(spoken('Cuisine, trois prises à ajouter.')).toBe('Cuisine');
        expect(spoken('Il faut voir avec le client pour la terre.')).toBe('');
    });
});
