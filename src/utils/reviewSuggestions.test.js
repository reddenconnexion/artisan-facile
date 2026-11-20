import { describe, it, expect } from 'vitest';
import { buildReviewSMS, resolveReviewCity, REVIEW_OWN_WORDS_HINT } from './reviewSuggestions';

const ARTISAN = { company_name: 'Maison Dupont', full_name: 'Marc Dupont', trade: 'plombier' };

describe('resolveReviewCity', () => {
    it('priorise la ville d\'intervention explicite', () => {
        expect(resolveReviewCity({
            intervention: { city: 'Lyon', address: 'X' },
            client: { city: 'Paris', address: 'Y' },
        })).toBe('Lyon');
    });

    it('se rabat sur la ville du client quand aucun lieu d\'intervention distinct', () => {
        expect(resolveReviewCity({
            intervention: {},
            client: { city: 'Paris' },
        })).toBe('Paris');
    });

    it('utilise la ville du client si l\'adresse d\'intervention est identique', () => {
        expect(resolveReviewCity({
            intervention: { address: '1 rue de Paris, 75001 Paris' },
            client: { city: 'Paris', address: '1 rue de Paris, 75001 Paris' },
        })).toBe('Paris');
    });

    it('extrait la ville de l\'adresse d\'intervention quand elle diffère', () => {
        expect(resolveReviewCity({
            intervention: { address: '12 rue des Lilas, 69001 Lyon' },
            client: { city: 'Paris', address: '1 rue de Paris, 75001 Paris' },
        })).toBe('Lyon');
    });
});

describe('buildReviewSMS', () => {
    it('ne plante pas quand userProfile/client valent null', () => {
        expect(() =>
            buildReviewSMS({ userProfile: null, client: null, reviewUrl: '' })
        ).not.toThrow();
        expect(buildReviewSMS({ userProfile: null, client: null })).toContain('Bonjour,');
    });

    it('ne plante pas sans aucun argument', () => {
        expect(() => buildReviewSMS()).not.toThrow();
    });

    it('demande la commune et les travaux avec les mots du client, sans texte prêt à recopier', () => {
        const sms = buildReviewSMS({
            userProfile: ARTISAN,
            client: { name: 'Jean Durand' },
            // Ancien paramètre : un texte d'avis fourni ne doit plus jamais partir.
            suggestion: 'Super travail.',
            reviewUrl: 'https://g.page/x',
        });
        expect(sms).toContain('Bonjour Jean,');
        expect(sms).toContain('https://g.page/x');
        expect(sms).toContain(REVIEW_OWN_WORDS_HINT);
        expect(sms).toMatch(/avec vos mots/);
        expect(sms).not.toContain('Super travail.');
        expect(sms).not.toContain('"');
    });
});
