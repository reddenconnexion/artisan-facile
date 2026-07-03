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

    it('détecte les couples M. et Mme', () => {
        expect(clientGreetingName('M. et Mme Dupont')).toBe('M. et Mme Dupont');
        expect(clientGreetingName('Monsieur et Madame Bernard Paul')).toBe('M. et Mme Bernard');
    });

    it('ne touche pas aux noms sans civilité', () => {
        expect(clientGreetingName('Cohignac Erwan')).toBe('Cohignac Erwan');
        expect(clientGreetingName('SARL Batipro')).toBe('SARL Batipro');
        // « Marie » commence par M mais n'est pas une civilité
        expect(clientGreetingName('Marie Dupont')).toBe('Marie Dupont');
        // « Mr » collé sans espace = début de nom, pas une civilité
        expect(clientGreetingName('Mrejen Paul')).toBe('Mrejen Paul');
    });

    it('traduit la civilité en anglais', () => {
        expect(clientGreetingName('M. Cohignac Erwan', 'en')).toBe('Mr Cohignac');
        expect(clientGreetingName('Mme Martin', 'en')).toBe('Mrs Martin');
        expect(clientGreetingName('M. et Mme Dupont', 'en')).toBe('Mr and Mrs Dupont');
        expect(clientGreetingName('Cohignac Erwan', 'en')).toBe('Cohignac Erwan');
    });

    it('gère les cas limites', () => {
        expect(clientGreetingName('')).toBe('');
        expect(clientGreetingName(null)).toBe('');
        expect(clientGreetingName('  M.  Dupont  ')).toBe('M. Dupont');
        // Civilité seule sans nom : renvoie le nom tel quel
        expect(clientGreetingName('Mme')).toBe('Mme');
    });
});
