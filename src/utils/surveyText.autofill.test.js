import { describe, it, expect } from 'vitest';
import {
    createEmptySurvey, createEmptyZone, mergeSurveyFill, extractVisitIdentity, countSurveyValues, parseLooseNumber,
} from './surveyText';
import { SURVEY_TEMPLATES } from '../constants/surveyTemplates';

const ELEC = SURVEY_TEMPLATES.electricien;

// Réponses d'IA « presque justes » : avant, chacune laissait le champ vide.
describe('mergeSurveyFill — réponses approximatives de l\'IA', () => {
    it('reprend les groupes de contexte posés à la racine (ancien schéma du prompt)', () => {
        const out = mergeSurveyFill(createEmptySurvey(), {
            bien: { typeBien: 'Maison', natureTravaux: 'Rénovation totale' },
            alimentation: { terre: 'Absente — à créer' },
        }, ELEC);
        expect(out.contexte.bien).toEqual({ typeBien: 'Maison', natureTravaux: 'Rénovation totale' });
        expect(out.contexte.alimentation.terre).toBe('Absente — à créer');
    });

    it('accepte un champ posé directement dans « contexte », sans son groupe', () => {
        const out = mergeSurveyFill(createEmptySurvey(), { contexte: { typeBien: 'Appartement', puissance: 9 } }, ELEC);
        expect(out.contexte.bien.typeBien).toBe('Appartement');
        expect(out.contexte.alimentation.puissance).toBe('9');
    });

    it('rapproche les options sans tenir compte de la casse, des accents ni d\'un libellé abrégé', () => {
        const out = mergeSurveyFill(createEmptySurvey(), {
            contexte: {
                bien: { typeBien: 'maison', occupation: 'logement occupe' },
                support: { murs: ['placo', 'BRIQUE', 'inconnu'], saignees: 'A prévoir', modePose: 'encastre' },
                alimentation: { compteur: 'linky', terre: 'absente a creer' },
            },
        }, ELEC);
        expect(out.contexte.bien).toEqual({ typeBien: 'Maison', occupation: 'Logement occupé' });
        expect(out.contexte.support.murs).toEqual(['Placo', 'Brique']);
        expect(out.contexte.support.saignees).toBe('À prévoir (à ma charge)');
        // Valeur seule pour un champ multiple : acceptée en liste.
        expect(out.contexte.support.modePose).toEqual(['Encastré']);
        expect(out.contexte.alimentation).toEqual({ compteur: 'Linky', terre: 'Absente — à créer' });
    });

    it('lit les nombres écrits avec leur unité', () => {
        const out = mergeSurveyFill(createEmptySurvey(), {
            contexte: { bien: { surface: '85 m²' } },
            zones: [{ name: 'Cuisine', counters: { prises: '6', spots: 'quatre' } }],
            tableau: { diffTypeA: '2', diffTypeAC: 1 },
        }, ELEC);
        expect(out.contexte.bien.surface).toBe(85);
        expect(out.zones[0].counters).toEqual({ prises: 6 });
        expect(out.tableau.diffTypeA).toBe(2);
        expect(out.tableau.diffTypeAC).toBe(1);
    });

    it('accepte le libellé de l\'état du tableau et « à prévoir » dans la check-list', () => {
        const out = mergeSurveyFill(createEmptySurvey(), {
            tableau: { etat: 'À remplacer', rangees: 2 },
            checklist: { parafoudre_t2: 'À prévoir', deux_differentiels: 'vérifié', inconnu: 'prevu' },
        }, ELEC);
        expect(out.tableau.etat).toBe('a_remplacer');
        expect(out.tableau.rangees).toBe('2');
        expect(out.checklist).toEqual({ parafoudre_t2: 'prevu', deux_differentiels: 'verifie' });
    });

    it('retrouve une pièce existante malgré l\'article et les accents', () => {
        const existing = { ...createEmptySurvey(), zones: [{ ...createEmptyZone(), name: 'Entrée', counters: { prises: 1 } }] };
        const out = mergeSurveyFill(existing, {
            zones: [{ name: "l'entree", counters: { prises: 3, interrupteurs: 2 } }],
        }, ELEC);
        expect(out.zones).toHaveLength(1);
        // Le comptage tapé sur place reste prioritaire.
        expect(out.zones[0].counters).toEqual({ prises: 1, interrupteurs: 2 });
    });

    it('accepte une liste pour un texte libre', () => {
        const out = mergeSurveyFill(createEmptySurvey(), {
            nonConformites: ['Pas de terre', 'Pas de différentiel 30 mA'],
            zones: [{ name: 'Cuisine', fields: { circuitsDedies: ['Four', 'Plaque 32A'] } }],
        }, ELEC);
        expect(out.nonConformites).toBe('Pas de terre, Pas de différentiel 30 mA');
        expect(out.zones[0].fields.circuitsDedies).toBe('Four, Plaque 32A');
    });

    it('n\'écrase jamais ce que l\'artisan a saisi', () => {
        const existing = createEmptySurvey();
        existing.contexte = { bien: { typeBien: 'Appartement' } };
        const out = mergeSurveyFill(existing, { contexte: { bien: { typeBien: 'Maison', surface: 60 } } }, ELEC);
        expect(out.contexte.bien).toEqual({ typeBien: 'Appartement', surface: 60 });
    });
});

describe('parseLooseNumber', () => {
    it('lit 45, « 45,5 m² » et ignore le texte', () => {
        expect(parseLooseNumber(45)).toBe(45);
        expect(parseLooseNumber('45,5 m²')).toBe(45.5);
        expect(parseLooseNumber('quatre')).toBeUndefined();
        expect(parseLooseNumber(null)).toBeUndefined();
    });
});

describe('extractVisitIdentity', () => {
    it('lit le nom et l\'adresse entendus, vide sinon', () => {
        expect(extractVisitIdentity({ client: { nom: ' M. Martin ', adresse: '12 rue des Lilas, Libourne' } }))
            .toEqual({ nom: 'M. Martin', adresse: '12 rue des Lilas, Libourne' });
        expect(extractVisitIdentity({})).toEqual({ nom: '', adresse: '' });
        expect(extractVisitIdentity(null)).toEqual({ nom: '', adresse: '' });
    });
});

describe('countSurveyValues', () => {
    it('compte les informations renseignées', () => {
        expect(countSurveyValues(createEmptySurvey())).toBe(0);
        const out = mergeSurveyFill(createEmptySurvey(), {
            demande: 'Refaire la cuisine',
            contexte: { bien: { typeBien: 'Maison' }, support: { murs: ['Placo'] } },
            zones: [{ name: 'Cuisine', counters: { prises: 6 }, fields: { circuitsDedies: 'Four' } }],
            tableau: { etat: 'conforme' },
        }, ELEC);
        // demande + 2 contexte + 1 compteur + 1 champ de pièce + état du tableau
        expect(countSurveyValues(out)).toBe(6);
    });
});
