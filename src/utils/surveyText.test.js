import { describe, it, expect } from 'vitest';
import { createEmptySurvey, createEmptyZone, hasSurveyContent, buildSurveyText, mergeSurveyFill } from './surveyText';
import { SURVEY_TEMPLATES, getSurveyTemplate } from '../constants/surveyTemplates';

const ELEC = SURVEY_TEMPLATES.electricien;
const DEFAULT = SURVEY_TEMPLATES.default;

const zone = (name, counters = {}, fields = {}) => ({ ...createEmptyZone(), name, counters, fields });

describe('getSurveyTemplate', () => {
    it('résout le métier, les clés legacy anglaises et le repli générique', () => {
        expect(getSurveyTemplate('electricien')).toBe(ELEC);
        expect(getSurveyTemplate('electrician')).toBe(ELEC); // clé legacy
        expect(getSurveyTemplate('plombier')).toBe(DEFAULT);
        expect(getSurveyTemplate('inconnu')).toBe(DEFAULT);
        expect(getSurveyTemplate(undefined)).toBe(DEFAULT);
    });
});

describe('hasSurveyContent', () => {
    it('est faux sur une trame vide', () => {
        expect(hasSurveyContent(createEmptySurvey())).toBe(false);
        expect(hasSurveyContent(null)).toBe(false);
    });

    it('devient vrai dès le moindre contenu', () => {
        const base = createEmptySurvey();
        expect(hasSurveyContent({ ...base, zones: [zone('Cuisine')] })).toBe(true);
        expect(hasSurveyContent({ ...base, zones: [zone('', { prises: 2 })] })).toBe(true);
        expect(hasSurveyContent({ ...base, tableau: { ...base.tableau, renovationComplete: true } })).toBe(true);
        expect(hasSurveyContent({ ...base, checklist: { parafoudre_t2: 'prevu' } })).toBe(true);
        expect(hasSurveyContent({ ...base, nonConformites: 'PE nu dans la GTL' })).toBe(true);
        expect(hasSurveyContent({ ...base, notesLibres: 'accès difficile' })).toBe(true);
    });

    it('ignore les zones sans contenu et les compteurs à zéro', () => {
        const base = createEmptySurvey();
        expect(hasSurveyContent({ ...base, zones: [zone('', { prises: 0 })] })).toBe(false);
    });
});

describe('buildSurveyText — template électricien', () => {
    it("retourne '' sur une trame vide", () => {
        expect(buildSurveyText(createEmptySurvey(), ELEC)).toBe('');
    });

    it('rend une zone avec ses compteurs (labels du template) et omet les compteurs à zéro', () => {
        const survey = {
            ...createEmptySurvey(),
            zones: [zone('Cuisine', { prises: 6, interrupteurs: 2, spots: 0 }, { circuitsDedies: 'four, plaque' })],
        };
        const text = buildSurveyText(survey, ELEC);
        expect(text).toContain('RELEVÉ PAR ZONE :');
        expect(text).toContain('- Cuisine : Prises 2P+T : 6 · Interrupteurs / va-et-vient : 2. Circuits dédiés : four, plaque');
        expect(text).not.toContain('Spots');
    });

    it('rend plusieurs zones et nomme les zones sans nom par leur position', () => {
        const survey = {
            ...createEmptySurvey(),
            zones: [zone('Salon', { prises: 4 }), zone('', { spots: 6 })],
        };
        const text = buildSurveyText(survey, ELEC);
        expect(text).toContain('- Salon : Prises 2P+T : 4');
        expect(text).toContain('- Zone 2 : Spots LED : 6');
    });

    it('rend le tableau : état, rénovation complète → parafoudre T2, différentiels', () => {
        const survey = {
            ...createEmptySurvey(),
            tableau: {
                ...createEmptySurvey().tableau,
                etat: 'a_remplacer',
                rangees: '2',
                placesDispo: '4',
                renovationComplete: true,
                diffTypeA: '1',
                diffTypeAC: '2',
                disjoncteurs: '2 × 32A four/plaque',
                observations: 'coffret vétuste',
            },
        };
        const text = buildSurveyText(survey, ELEC);
        expect(text).toContain('TABLEAU ÉLECTRIQUE :');
        expect(text).toContain('État : à remplacer. Rangées existantes : 2. Places disponibles : 4.');
        expect(text).toContain('Rénovation complète du tableau : OUI (prévoir parafoudre type 2 par défaut).');
        expect(text).toContain('Différentiels à créer : 1 type A 30 mA, 2 type AC 30 mA. Disjoncteurs : 2 × 32A four/plaque.');
        expect(text).toContain('Observations : coffret vétuste');
    });

    it('rend la conformité : vérifié / à prévoir / non-conformités', () => {
        const survey = {
            ...createEmptySurvey(),
            checklist: { liaison_equipot_sdb: 'verifie', parafoudre_t2: 'prevu', type_a_variateurs: 'prevu' },
            nonConformites: 'PE laissé nu derrière la plaque',
        };
        const text = buildSurveyText(survey, ELEC);
        expect(text).toContain('CONFORMITÉ (NF C 15-100) :');
        expect(text).toContain('Vérifié : Liaison équipotentielle salle de bain.');
        expect(text).toContain('À prévoir : Parafoudre type 2 au tableau ; Type A 30 mA sur circuits variateur / onduleur.');
        expect(text).toContain('Non-conformités relevées : PE laissé nu derrière la plaque');
    });

    it('omet chaque section vide et rend les notes libres', () => {
        const survey = { ...createEmptySurvey(), notesLibres: 'Accès par la cour, tableau au sous-sol.' };
        const text = buildSurveyText(survey, ELEC);
        expect(text).toBe('NOTES :\nAccès par la cour, tableau au sous-sol.');
        expect(text).not.toContain('RELEVÉ PAR ZONE');
        expect(text).not.toContain('TABLEAU');
        expect(text).not.toContain('CONFORMITÉ');
    });
});

describe('mergeSurveyFill', () => {
    it('remplit une trame vide à partir du relevé extrait par IA', () => {
        const extracted = {
            demande: 'Refaire le tableau et ajouter des prises en cuisine',
            contexte: { bien: { typeBien: 'Maison', natureTravaux: 'Rénovation partielle' } },
            zones: [{ name: 'Cuisine', counters: { prises: 6 }, fields: { circuitsDedies: 'four, plaque' } }],
            tableau: { etat: 'a_remplacer', disjoncteurs: 'à revoir' },
            checklist: { parafoudre_t2: 'prevu' },
            nonConformites: 'Pas de terre en cuisine',
        };
        const merged = mergeSurveyFill(createEmptySurvey(), extracted, ELEC);
        expect(merged.demande).toBe('Refaire le tableau et ajouter des prises en cuisine');
        expect(merged.contexte.bien).toEqual({ typeBien: 'Maison', natureTravaux: 'Rénovation partielle' });
        expect(merged.zones).toHaveLength(1);
        expect(merged.zones[0]).toMatchObject({ name: 'Cuisine', counters: { prises: 6 }, fields: { circuitsDedies: 'four, plaque' } });
        expect(merged.zones[0].id).toBeDefined(); // zone créée avec un id valide
        expect(merged.tableau.etat).toBe('a_remplacer');
        expect(merged.tableau.disjoncteurs).toBe('à revoir');
        expect(merged.checklist).toEqual({ parafoudre_t2: 'prevu' });
        expect(merged.nonConformites).toBe('Pas de terre en cuisine');
    });

    it("ne remplace jamais ce que l'artisan a déjà saisi", () => {
        const existing = {
            ...createEmptySurvey(),
            demande: 'Mise aux normes générale',
            tableau: { ...createEmptySurvey().tableau, etat: 'conforme' },
            checklist: { parafoudre_t2: 'verifie' },
            zones: [zone('Cuisine', { prises: 3 }, { divers: 'déjà noté' })],
        };
        const extracted = {
            demande: 'Autre chose complètement différente',
            tableau: { etat: 'a_remplacer' },
            checklist: { parafoudre_t2: 'prevu' },
            zones: [{ name: 'Cuisine', counters: { prises: 8 }, fields: { divers: 'écrasé ?' } }],
        };
        const merged = mergeSurveyFill(existing, extracted, ELEC);
        expect(merged.demande).toBe('Mise aux normes générale');
        expect(merged.tableau.etat).toBe('conforme');
        expect(merged.checklist.parafoudre_t2).toBe('verifie');
        expect(merged.zones[0].counters.prises).toBe(3);
        expect(merged.zones[0].fields.divers).toBe('déjà noté');
    });

    it('complète une zone existante homonyme sans doublon, et ajoute les zones nouvelles', () => {
        const existing = { ...createEmptySurvey(), zones: [zone('Cuisine', { prises: 3 })] };
        const extracted = {
            zones: [
                { name: 'cuisine', counters: { interrupteurs: 2 } }, // insensible à la casse, complète
                { name: 'Séjour', counters: { spots: 6 } }, // nouvelle zone
            ],
        };
        const merged = mergeSurveyFill(existing, extracted, ELEC);
        expect(merged.zones).toHaveLength(2);
        expect(merged.zones[0]).toMatchObject({ name: 'Cuisine', counters: { prises: 3, interrupteurs: 2 } });
        expect(merged.zones[1]).toMatchObject({ name: 'Séjour', counters: { spots: 6 } });
    });

    it('ignore les valeurs hors schéma (chip inconnue, compteur inexistant, checklist invalide)', () => {
        const extracted = {
            contexte: { bien: { typeBien: 'Yourte' } }, // pas une option valide
            zones: [{ name: 'Cave', counters: { inexistant: 5, prises: -2 }, fields: { inconnu: 'x' } }],
            checklist: { parafoudre_t2: 'peut-être' },
        };
        const merged = mergeSurveyFill(createEmptySurvey(), extracted, ELEC);
        expect(merged.contexte.bien).toBeUndefined();
        expect(merged.zones[0].counters).toEqual({}); // compteur inconnu et valeur négative écartés
        expect(merged.zones[0].fields).toEqual({});
        expect(merged.checklist).toEqual({});
    });

    it('retourne la trame telle quelle si rien n\'a été extrait', () => {
        const existing = { ...createEmptySurvey(), demande: 'Existant' };
        expect(mergeSurveyFill(existing, null, ELEC)).toBe(existing);
        expect(mergeSurveyFill(existing, {}, ELEC).demande).toBe('Existant');
    });
});

describe('buildSurveyText — template générique', () => {
    it('rend les zones en texte libre, sans section TABLEAU, conformité sans NF C 15-100', () => {
        const survey = {
            ...createEmptySurvey(),
            zones: [zone('Salle de bain', {}, { divers: 'joint silicone à refaire, mitigeur qui fuit' })],
            tableau: { ...createEmptySurvey().tableau, renovationComplete: true }, // ignoré : hasTableau=false
            nonConformites: 'évacuation non conforme',
        };
        const text = buildSurveyText(survey, DEFAULT);
        expect(text).toContain('- Salle de bain : À relever dans cette pièce : joint silicone à refaire, mitigeur qui fuit');
        expect(text).not.toContain('TABLEAU ÉLECTRIQUE');
        expect(text).toContain('CONFORMITÉ :');
        expect(text).not.toContain('NF C 15-100');
        expect(text).toContain('Non-conformités relevées : évacuation non conforme');
    });
});
