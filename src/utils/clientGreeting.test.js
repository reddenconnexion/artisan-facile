import { describe, it, expect } from 'vitest';
import { clientGreetingName } from './clientGreeting';

describe('clientGreetingName', () => {
    it('détecte M. et garde le nom seul (fiches saisies « Nom Prénom »)', () => {
        expect(clientGreetingName('M. Cohignac Erwan')).toBe('M. Cohignac');
        expect(clientGreetingName('M Dupont')).toBe('M. Dupont');
        expect(clientGreetingName('mr dupont jean')).toBe('M. Dupont');
        expect(clientGreetingName('Monsieur Dupont')).toBe('M. Dupont');
    });

    it('détecte Mme et Mlle', () => {
        expect(clientGreetingName('Mme Martin Sophie')).toBe('Mme Martin');
        expect(clientGreetingName('madame martin')).toBe('Mme Martin');
        expect(clientGreetingName('Mlle Petit')).toBe('Mlle Petit');
        expect(clientGreetingName('Mademoiselle Petit Léa')).toBe('Mlle Petit');
    });

    it('remet le NOM en minuscules après la civilité', () => {
        expect(clientGreetingName('Mme LAFITTE Marie')).toBe('Mme Lafitte');
        expect(clientGreetingName('Mme Marie LAFITTE')).toBe('Mme Lafitte');
        expect(clientGreetingName('M. DUPONT-MOREL Jean')).toBe('M. Dupont-Morel');
    });

    it('détecte les couples M. et Mme', () => {
        expect(clientGreetingName('M. et Mme Dupont')).toBe('M. et Mme Dupont');
        expect(clientGreetingName('Monsieur et Madame Bernard Paul')).toBe('M. et Mme Bernard');
    });

    it('sans civilité : « NOM Prénom » devient « Prénom Nom »', () => {
        expect(clientGreetingName('LAFITTE Marie')).toBe('Marie Lafitte');
        expect(clientGreetingName('Marie LAFITTE')).toBe('Marie Lafitte');
        expect(clientGreetingName('DUPONT-MOREL Jean-Pierre')).toBe('Jean-Pierre Dupont-Morel');
        expect(clientGreetingName('LAFITTE Marie Claire')).toBe('Marie Claire Lafitte');
        // Convention « Nom Prénom » sans majuscules
        expect(clientGreetingName('Cohignac Erwan')).toBe('Erwan Cohignac');
        expect(clientGreetingName('lafitte marie')).toBe('Marie Lafitte');
        expect(clientGreetingName('LAFITTE MARIE')).toBe('Marie Lafitte');
        // « Mr » collé sans espace = début de nom, pas une civilité
        expect(clientGreetingName('Mrejen Paul')).toBe('Paul Mrejen');
    });

    it('garde l\'ordre quand le nom est déjà saisi « Prénom Nom »', () => {
        // « Marie » commence par M mais n'est pas une civilité
        expect(clientGreetingName('Marie Dupont')).toBe('Marie Dupont');
        expect(clientGreetingName('Jean-Pierre Martin')).toBe('Jean-Pierre Martin');
        expect(clientGreetingName('Hélène Durand')).toBe('Hélène Durand');
    });

    it('ne touche pas aux sociétés ni aux noms impossibles à découper', () => {
        expect(clientGreetingName('SARL Batipro')).toBe('SARL Batipro');
        expect(clientGreetingName('Mairie de Coutras')).toBe('Mairie de Coutras');
        expect(clientGreetingName('Syndic Foncia Libourne')).toBe('Syndic Foncia Libourne');
        expect(clientGreetingName('De La Fontaine Jean')).toBe('De La Fontaine Jean');
        expect(clientGreetingName('DUPONT')).toBe('Dupont');
    });

    it('traduit la civilité en anglais', () => {
        expect(clientGreetingName('M. Cohignac Erwan', 'en')).toBe('Mr Cohignac');
        expect(clientGreetingName('Mme Martin', 'en')).toBe('Mrs Martin');
        expect(clientGreetingName('M. et Mme Dupont', 'en')).toBe('Mr and Mrs Dupont');
        expect(clientGreetingName('Cohignac Erwan', 'en')).toBe('Erwan Cohignac');
    });

    it('gère les cas limites', () => {
        expect(clientGreetingName('')).toBe('');
        expect(clientGreetingName(null)).toBe('');
        expect(clientGreetingName('  M.  Dupont  ')).toBe('M. Dupont');
        // Civilité seule sans nom : renvoie le nom tel quel
        expect(clientGreetingName('Mme')).toBe('Mme');
    });

    it('utilise la civilité choisie sur la fiche', () => {
        expect(clientGreetingName('LAFITTE Marie', 'fr', 'mme')).toBe('Mme Lafitte');
        expect(clientGreetingName('Marie LAFITTE', 'fr', 'mme')).toBe('Mme Lafitte');
        expect(clientGreetingName('Cohignac Erwan', 'fr', 'm')).toBe('M. Cohignac');
        expect(clientGreetingName('Marie Dupont', 'fr', 'mme')).toBe('Mme Dupont');
        expect(clientGreetingName('DUPONT Jean et Marie', 'fr', 'm_et_mme')).toBe('M. et Mme Dupont');
        expect(clientGreetingName('Lafitte', 'fr', 'mme')).toBe('Mme Lafitte');
        expect(clientGreetingName('LAFITTE Marie', 'en', 'mme')).toBe('Mrs Lafitte');
    });

    it('la civilité de la fiche prime sur celle saisie dans le nom', () => {
        expect(clientGreetingName('M. Dupont Jean', 'fr', 'mme')).toBe('Mme Dupont');
    });

    it('ignore la civilité pour une société ou une valeur inconnue', () => {
        expect(clientGreetingName('SARL Batipro', 'fr', 'm')).toBe('SARL Batipro');
        expect(clientGreetingName('LAFITTE Marie', 'fr', '')).toBe('Marie Lafitte');
        expect(clientGreetingName('LAFITTE Marie', 'fr', 'xyz')).toBe('Marie Lafitte');
    });
});
