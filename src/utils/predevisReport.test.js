import { describe, it, expect } from 'vitest';
import { createEmptySurvey, createEmptyZone } from './surveyText';
import {
    buildPredevisReport,
    findMissingEssentials,
    surveyCompleteness,
    predevisReportFilename,
} from './predevisReport';
import { SURVEY_TEMPLATES } from '../constants/surveyTemplates';

const ELEC = SURVEY_TEMPLATES.electricien;

const zone = (name, counters = {}, fields = {}) => ({ ...createEmptyZone(), name, counters, fields });

const fullSurvey = () => ({
    ...createEmptySurvey(),
    demande: 'Refaire toute l\'électricité du rez-de-chaussée.',
    contexte: {
        bien: { typeBien: 'Maison', natureTravaux: 'Rénovation totale', surface: '95' },
        support: { murs: ['Placo', 'Pierre'], modePose: ['Encastré', 'Combles'] },
        alimentation: { terre: 'Absente — à créer' },
        client: { delai: 'Avant fin octobre' },
    },
    zones: [
        zone('Cuisine', { prises: 8, interrupteurs: 2 }, { circuitsDedies: 'four, plaque' }),
        zone('Séjour', { prises: 6, interrupteurs: 3, spots: 6 }),
    ],
    tableau: { ...createEmptySurvey().tableau, etat: 'a_remplacer', renovationComplete: true },
    checklist: { parafoudre_t2: 'prevu', deux_differentiels: 'verifie' },
    nonConformites: 'PE nu dans la GTL.',
    notesLibres: 'Stationnement dans la cour.',
});

describe('findMissingEssentials / surveyCompleteness', () => {
    it('liste tous les essentiels sur une trame vide', () => {
        const missing = findMissingEssentials(createEmptySurvey(), ELEC);
        expect(missing).toHaveLength(ELEC.essentials.length);
        expect(surveyCompleteness(createEmptySurvey(), ELEC)).toEqual({
            done: 0, total: ELEC.essentials.length, pct: 0,
        });
    });

    it('ne signale plus rien quand tous les essentiels sont renseignés', () => {
        expect(findMissingEssentials(fullSurvey(), ELEC)).toEqual([]);
        expect(surveyCompleteness(fullSurvey(), ELEC).pct).toBe(100);
    });

    it('détecte le champ de contexte manquant et le nomme', () => {
        const survey = fullSurvey();
        survey.contexte.alimentation = {};
        const missing = findMissingEssentials(survey, ELEC);
        expect(missing.map((m) => m.key)).toEqual(['contexte.alimentation.terre']);
        expect(missing[0].label).toBe('Prise de terre');
    });

    it('ignore les zones sans contenu et le tableau vierge', () => {
        const survey = { ...fullSurvey(), zones: [createEmptyZone()], tableau: createEmptySurvey().tableau };
        const keys = findMissingEssentials(survey, ELEC).map((m) => m.key);
        expect(keys).toContain('zones');
        expect(keys).toContain('tableau');
    });
});

describe('buildPredevisReport', () => {
    const meta = {
        clientName: 'Mme Dupont',
        address: '12 rue des Lilas, Coutras',
        date: new Date('2026-08-18T09:00:00Z'),
        companyName: 'Red Den Connexion',
        artisanName: 'Denis Meriot',
        photoCount: 4,
        voiceTranscripts: ['Tableau au garage, 2 rangées libres.'],
    };

    it('assemble un compte rendu complet, numéroté et daté', () => {
        const text = buildPredevisReport({ survey: fullSurvey(), template: ELEC, meta });
        expect(text).toContain('# COMPTE RENDU DE VISITE PRÉDEVIS');
        expect(text).toContain('**Date de la visite :** 18 août 2026');
        expect(text).toContain('**Client :** Mme Dupont');
        expect(text).toContain('**Entreprise :** Red Den Connexion — Denis Meriot');
        expect(text).toContain('## 1. DEMANDE DU CLIENT');
        expect(text).toContain('## 2. CONTEXTE DU CHANTIER');
        expect(text).toContain('Nature des murs : Placo + Pierre');
        expect(text).toContain('Surface concernée : 95 m²');
        expect(text).toContain('## 3. RELEVÉ PAR ZONE');
        expect(text).toContain('- Cuisine : Prises 2P+T : 8');
        expect(text).toContain('RÉCAPITULATIF QUANTITATIF');
        expect(text).toContain('- Prises 2P+T : 14');
        expect(text).toContain('NOTES VOCALES (transcription)');
        expect(text).toContain('1. Tableau au garage, 2 rangées libres.');
        expect(text).toContain('4 photos prises pendant la visite.');
        expect(text).toContain("## CONSIGNE POUR L'IA DEVIS");
    });

    it('place le récapitulatif juste après le relevé, sans doubler la ligne TOTAL', () => {
        const text = buildPredevisReport({ survey: fullSurvey(), template: ELEC, meta });
        expect(text).toContain('## 3. RELEVÉ PAR ZONE');
        expect(text).toContain('## 4. RÉCAPITULATIF QUANTITATIF (toutes pièces)');
        expect(text).not.toContain('TOTAL toutes zones');
    });

    it('place la synthèse IA avant le détail, sans effacer le brut', () => {
        const text = buildPredevisReport({
            survey: fullSurvey(),
            template: ELEC,
            meta: { ...meta, summaryText: 'Le client veut refaire le rez-de-chaussée.' },
        });
        expect(text).toContain('## SYNTHÈSE DE LA VISITE (mise au propre automatique — à relire)');
        expect(text.indexOf('SYNTHÈSE DE LA VISITE')).toBeLessThan(text.indexOf('## 1. DEMANDE DU CLIENT'));
        expect(text).toContain('## 3. RELEVÉ PAR ZONE');
    });

    it('liste les points à confirmer quand des essentiels manquent', () => {
        const survey = { ...fullSurvey(), demande: '' };
        const text = buildPredevisReport({ survey, template: ELEC, meta });
        expect(text).toContain('POINTS À CONFIRMER AVANT CHIFFRAGE');
        expect(text).toContain('- La demande du client');
    });

    it('omet la section « points à confirmer » quand la trame est complète', () => {
        const text = buildPredevisReport({ survey: fullSurvey(), template: ELEC, meta });
        expect(text).not.toContain('POINTS À CONFIRMER');
    });

    it('intègre le déroulé de la visite et laisse alors tomber la section notes vocales', () => {
        const text = buildPredevisReport({
            survey: fullSurvey(),
            template: ELEC,
            meta: {
                ...meta,
                voiceNotesCount: 2,
                timelineLines: ['09:05 · Cuisine', '- Note vocale : « plaque à déplacer »', '- Comptage : Prises 2P+T +8'],
            },
        });
        expect(text).toContain('DÉROULÉ DE LA VISITE');
        expect(text).toContain('- Note vocale : « plaque à déplacer »');
        expect(text).not.toContain('NOTES VOCALES');
    });

    it('signale les notes vocales non transcrites plutôt que de les taire', () => {
        const text = buildPredevisReport({
            survey: fullSurvey(),
            template: ELEC,
            meta: { ...meta, voiceTranscripts: [], voiceNotesCount: 2 },
        });
        expect(text).toContain('2 notes vocales enregistrées, non transcrites');
    });

    it('reste lisible sur une trame vide et sans méta', () => {
        const text = buildPredevisReport({ survey: createEmptySurvey(), template: ELEC });
        expect(text).toContain('# COMPTE RENDU DE VISITE PRÉDEVIS');
        expect(text).toContain('POINTS À CONFIRMER AVANT CHIFFRAGE');
        expect(text).not.toContain('undefined');
    });

    it('peut omettre la consigne IA (archivage du rapport)', () => {
        const text = buildPredevisReport({ survey: fullSurvey(), template: ELEC, meta, withAiInstruction: false });
        expect(text).not.toContain("CONSIGNE POUR L'IA DEVIS");
    });
});

describe('predevisReportFilename', () => {
    it('compose un nom de fichier propre à partir de la date et du client', () => {
        expect(predevisReportFilename({ date: new Date('2026-08-18T09:00:00Z'), clientName: 'Mme Dupont' }))
            .toBe('predevis-2026-08-18-mme-dupont.txt');
    });

    it('supprime les accents et tolère un client vide', () => {
        expect(predevisReportFilename({ date: new Date('2026-08-18T09:00:00Z'), clientName: 'Éric Béchu' }))
            .toBe('predevis-2026-08-18-eric-bechu.txt');
        expect(predevisReportFilename({ date: new Date('2026-08-18T09:00:00Z') }))
            .toBe('predevis-2026-08-18.txt');
    });
});
