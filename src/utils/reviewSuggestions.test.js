import { describe, it, expect } from 'vitest';
import { buildReviewSuggestions, buildReviewSMS, resolveReviewCity } from './reviewSuggestions';

describe('buildReviewSuggestions', () => {
    it('ne plante pas quand userProfile/client/intervention valent null', () => {
        // Régression : userProfile est null pendant le chargement du DevisForm.
        // Les valeurs par défaut des paramètres ne couvrent pas null.
        expect(() =>
            buildReviewSuggestions({ userProfile: null, client: null, intervention: null })
        ).not.toThrow();

        const variants = buildReviewSuggestions({ userProfile: null, client: null, intervention: null });
        expect(variants).toHaveLength(6);
        // Tous les modèles mentionnent l'artisan, quel que soit l'ordre tiré.
        variants.forEach(v => expect(v).toContain('cet artisan'));
    });

    it('ne plante pas sans aucun argument', () => {
        expect(() => buildReviewSuggestions()).not.toThrow();
        expect(buildReviewSuggestions()).toHaveLength(6);
    });

    it('varie les formulations proposées (tirage aléatoire)', () => {
        // Sur plusieurs appels, l'ordre/sélection doit changer au moins une fois.
        const ctx = { userProfile: { company_name: 'Plomberie Dupont', trade: 'plombier' }, client: { city: 'Lyon' } };
        const runs = Array.from({ length: 8 }, () => buildReviewSuggestions(ctx).join('|'));
        const distinct = new Set(runs);
        expect(distinct.size).toBeGreaterThan(1);
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
    it('met en avant la ville du lieu d\'intervention plutôt que celle du client', () => {
        const variants = buildReviewSuggestions({
            userProfile: { company_name: 'Plomberie Dupont', trade: 'plombier' },
            client: { city: 'Paris', address: '1 rue de Paris, 75001 Paris' },
            intervention: { workDone: 'Réparation fuite', city: 'Lyon' },
        });
        expect(variants[0]).toContain('Lyon');
        expect(variants[0]).not.toContain('Paris');
    });

    it('déduit la ville depuis l\'adresse d\'intervention quand la ville n\'est pas renseignée', () => {
        const variants = buildReviewSuggestions({
            userProfile: { company_name: 'Plomberie Dupont', trade: 'plombier' },
            client: { city: 'Paris', address: '1 rue de Paris, 75001 Paris' },
            intervention: { workDone: 'Réparation fuite', address: '12 rue des Lilas, 69001 Lyon' },
        });
        expect(variants[0]).toContain('Lyon');
        expect(variants[0]).not.toContain('Paris');
    });

    it('n\'utilise pas la ville du client quand le chantier est ailleurs sans ville identifiable', () => {
        const variants = buildReviewSuggestions({
            userProfile: { company_name: 'Plomberie Dupont', trade: 'plombier' },
            client: { city: 'Paris', address: '1 rue de Paris, 75001 Paris' },
            intervention: { workDone: 'Réparation fuite', address: 'Chantier zone industrielle' },
        });
        expect(variants[0]).not.toContain('Paris');
    });
});

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
            buildReviewSMS({ userProfile: null, client: null, suggestion: '', reviewUrl: '' })
        ).not.toThrow();
        expect(buildReviewSMS({ userProfile: null, client: null })).toContain('Bonjour,');
    });

    it('ne plante pas sans aucun argument', () => {
        expect(() => buildReviewSMS()).not.toThrow();
    });
});
