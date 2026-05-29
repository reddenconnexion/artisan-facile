import { describe, it, expect } from 'vitest';
import { buildReviewSuggestions, buildReviewSMS } from './reviewSuggestions';

describe('buildReviewSuggestions', () => {
    it('ne plante pas quand userProfile/client/intervention valent null', () => {
        // Régression : userProfile est null pendant le chargement du DevisForm.
        // Les valeurs par défaut des paramètres ne couvrent pas null.
        expect(() =>
            buildReviewSuggestions({ userProfile: null, client: null, intervention: null })
        ).not.toThrow();

        const variants = buildReviewSuggestions({ userProfile: null, client: null, intervention: null });
        expect(variants).toHaveLength(3);
        expect(variants[0]).toContain('cet artisan');
    });

    it('ne plante pas sans aucun argument', () => {
        expect(() => buildReviewSuggestions()).not.toThrow();
        expect(buildReviewSuggestions()).toHaveLength(3);
    });

    it('utilise le nom de société quand il est fourni', () => {
        const variants = buildReviewSuggestions({
            userProfile: { company_name: 'Plomberie Dupont', trade: 'plombier' },
            client: { city: 'Lyon' },
            intervention: { workDone: 'Réparation fuite' },
        });
        expect(variants[0]).toContain('Plomberie Dupont');
        expect(variants[0]).toContain('Lyon');
    });
});

describe('buildReviewSMS', () => {
    it('ne plante pas quand userProfile/client valent null', () => {
        expect(() =>
            buildReviewSMS({ userProfile: null, client: null, suggestion: '', reviewUrl: '' })
        ).not.toThrow();
        expect(buildReviewSMS({ userProfile: null, client: null })).toContain('Bonjour,');
    });

    it('ne plante pas sans aucun argument', () => {
        expect(() => buildReviewSMS()).not.toThrow();
    });
});
