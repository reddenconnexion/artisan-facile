import { describe, it, expect } from 'vitest';
import { detectSpokenZone } from './spokenZone';
import { SURVEY_TEMPLATES } from '../constants/surveyTemplates';

const ELEC = SURVEY_TEMPLATES.electricien;
const places = (zones = []) => ({ zones, topics: ELEC.dictationTopics, presets: ELEC.zonePresets });
const spoken = (text, zones) => detectSpokenZone(text, places(zones));

describe('lieu annoncé au début d\'une dictée', () => {
    it('reconnaît une pièce dite en premier', () => {
        expect(spoken('Cuisine, il faut ajouter trois prises au-dessus du plan de travail.')).toBe('Cuisine');
        expect(spoken('Salle de bain. Remplacement du spot au-dessus du lavabo.')).toBe('Salle de bain');
        expect(spoken('garage il faut tirer une ligne pour la borne')).toBe('Garage');
    });

    it('passe les mots de liaison', () => {
        expect(spoken('Alors, dans la cuisine, deux prises à déplacer.')).toBe('Cuisine');
        expect(spoken('Donc pour le séjour on remplace les interrupteurs.')).toBe('Séjour');
        expect(spoken('À l\'étage, trois chambres identiques.')).toBe('Étage');
    });

    it('reconnaît le tableau sans dire « électrique »', () => {
        expect(spoken('Tableau, deux rangées, plus aucune place libre.')).toBe('Tableau électrique');
        expect(spoken('Au tableau électrique il manque un différentiel type A.')).toBe('Tableau électrique');
        expect(spoken('Le coffret est à remplacer.')).toBe('Tableau électrique');
    });

    it('range la demande du client dans le poste général', () => {
        expect(spoken('Général. Le client veut refaire tout le rez-de-chaussée avant Noël.')).toBe('Général');
        expect(spoken('En général, logement occupé pendant les travaux.')).toBe('Général');
    });

    it('n\'attribue un alias qu\'aux lieux du métier', () => {
        const generic = SURVEY_TEMPLATES.default;
        expect(detectSpokenZone('Tableau, à remplacer.', { topics: generic.dictationTopics, presets: generic.zonePresets })).toBe('');
    });

    it('accepte les autres façons de dire', () => {
        expect(spoken('Toilettes, une prise à créer.')).toBe('WC');
        expect(spoken('W.C. du bas, remplacement de l\'interrupteur.')).toBe('WC');
        expect(spoken('Salle de bains, liaison équipotentielle à reprendre.')).toBe('Salle de bain');
        expect(spoken('Dehors, deux projecteurs sur la façade.')).toBe('Extérieur');
    });

    it('crée une pièce courante absente des pastilles', () => {
        expect(spoken('Salon, quatre spots à ajouter.')).toBe('Salon');
        expect(spoken('Cellier : un circuit dédié pour le congélateur.')).toBe('Cellier');
        expect(spoken('Salle à manger, un point lumineux central.')).toBe('Salle à manger');
    });

    it('garde le numéro d\'une pièce quand une pause le suit', () => {
        expect(spoken('Chambre 2, deux prises de chaque côté du lit.')).toBe('Chambre 2');
        expect(spoken('Chambre deux. Un va-et-vient à créer.')).toBe('Chambre 2');
    });

    it('ne prend pas une quantité pour un numéro de pièce', () => {
        expect(spoken('Cuisine 3 prises à ajouter')).toBe('Cuisine');
        expect(spoken('Chambre, 2 prises à ajouter')).toBe('Chambre');
        expect(spoken('Garage un tableau divisionnaire à créer')).toBe('Garage');
    });

    it('préfère une pièce déjà relevée, avec son orthographe', () => {
        expect(spoken('chambre parentale, une applique de chaque côté', ['Chambre parentale'])).toBe('Chambre parentale');
        expect(spoken('Chambre 2, rien à faire.', ['chambre 2'])).toBe('chambre 2');
        expect(spoken('Bureau du fond, deux prises RJ45.', ['Bureau du fond'])).toBe('Bureau du fond');
    });

    it('ignore une pièce citée au fil de la phrase', () => {
        expect(spoken('Il faut tirer une ligne depuis le tableau jusqu\'à la cuisine.')).toBe('');
        expect(spoken('Trois prises à ajouter côté cuisine.')).toBe('');
        expect(spoken('Le client veut du haut de gamme dans le séjour.')).toBe('');
    });

    it('ne confond pas un mot qui commence pareil', () => {
        expect(spoken('Généralement les prises sont à 30 cm.')).toBe('');
        expect(spoken('Entrées de câbles à reprendre.')).toBe('');
    });

    it('rend une chaîne vide sans texte', () => {
        expect(spoken('')).toBe('');
        expect(spoken(undefined)).toBe('');
        expect(detectSpokenZone('Cuisine')).toBe('');
    });
});
