import { describe, it, expect } from 'vitest';
import { buildReviewSuggestions, buildReviewSMS, resolveReviewCity } from './reviewSuggestions';

// Nom commercial volontairement sans le mot « plomberie » : les tests de
// référencement ci-dessous vérifient que le métier est cité par la phrase, pas
// par le nom de la société.
const ARTISAN = { company_name: 'Maison Dupont', full_name: 'Marc Dupont', trade: 'plombier' };

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
        const ctx = { userProfile: ARTISAN, client: { city: 'Lyon' } };
        const runs = Array.from({ length: 8 }, () => buildReviewSuggestions(ctx).join('|'));
        const distinct = new Set(runs);
        expect(distinct.size).toBeGreaterThan(1);
    });

    it('utilise le nom de société quand il est fourni', () => {
        const variants = buildReviewSuggestions({
            userProfile: ARTISAN,
            client: { city: 'Lyon' },
            intervention: { workDone: 'Réparation fuite' },
        });
        expect(variants[0]).toContain('Maison Dupont');
        expect(variants[0]).toContain('Lyon');
    });

    it('met en avant la ville du lieu d\'intervention plutôt que celle du client', () => {
        const variants = buildReviewSuggestions({
            userProfile: ARTISAN,
            client: { city: 'Paris', address: '1 rue de Paris, 75001 Paris' },
            intervention: { workDone: 'Réparation fuite', city: 'Lyon' },
        });
        expect(variants[0]).toContain('Lyon');
        expect(variants[0]).not.toContain('Paris');
    });

    it('déduit la ville depuis l\'adresse d\'intervention quand la ville n\'est pas renseignée', () => {
        const variants = buildReviewSuggestions({
            userProfile: ARTISAN,
            client: { city: 'Paris', address: '1 rue de Paris, 75001 Paris' },
            intervention: { workDone: 'Réparation fuite', address: '12 rue des Lilas, 69001 Lyon' },
        });
        expect(variants[0]).toContain('Lyon');
        expect(variants[0]).not.toContain('Paris');
    });

    it('n\'utilise pas la ville du client quand le chantier est ailleurs sans ville identifiable', () => {
        const variants = buildReviewSuggestions({
            userProfile: ARTISAN,
            client: { city: 'Paris', address: '1 rue de Paris, 75001 Paris' },
            intervention: { workDone: 'Réparation fuite', address: 'Chantier zone industrielle' },
        });
        expect(variants[0]).not.toContain('Paris');
    });

    // --- Naturel : ce qui distingue un avis crédible d'un texte généré ---

    it('cite le métier et la ville une seule fois (pas de bourrage de mots-clés)', () => {
        // C'est la répétition « un plombier à Lyon … sur Lyon » qui trahissait
        // le texte pré-écrit dans la version précédente.
        const ctx = {
            userProfile: ARTISAN,
            client: { city: 'Lyon' },
            intervention: { workDone: 'Remplacement du chauffe-eau' },
        };
        for (let run = 0; run < 10; run += 1) {
            buildReviewSuggestions(ctx).forEach(v => {
                const cityCount = v.split('Lyon').length - 1;
                const tradeCount = (v.toLowerCase().match(/plombier|plomberie/g) || []).length;
                expect(cityCount).toBe(1);
                expect(tradeCount).toBe(1);
            });
        }
    });

    it('mentionne quand même le métier (ou son domaine) quand la ville est inconnue', () => {
        const variants = buildReviewSuggestions({
            userProfile: ARTISAN,
            client: {},
            intervention: { workDone: 'Remplacement du chauffe-eau' },
        });
        variants.forEach(v => expect(v.toLowerCase()).toMatch(/plombier|plomberie/));
    });

    it('ne répète pas deux fois la même phrase dans un avis', () => {
        const ctx = { userProfile: ARTISAN, client: { city: 'Lyon' }, intervention: { workDone: 'Réparation fuite' } };
        for (let run = 0; run < 10; run += 1) {
            buildReviewSuggestions(ctx).forEach(v => {
                const sentences = v.split(/(?<=[.!?])\s+/).filter(Boolean);
                expect(new Set(sentences).size).toBe(sentences.length);
            });
        }
    });

    it('propose des longueurs variées, dont un avis court à chaque lot', () => {
        // Trois phrases calibrées à chaque fois, c'est ce qui faisait « robot ».
        for (let run = 0; run < 10; run += 1) {
            const lengths = buildReviewSuggestions({
                userProfile: ARTISAN,
                client: { city: 'Lyon' },
                intervention: { workDone: 'Réparation fuite' },
            }).map(v => v.length);
            expect(Math.min(...lengths)).toBeLessThan(160);
            expect(Math.max(...lengths) - Math.min(...lengths)).toBeGreaterThan(50);
        }
    });

    it('ne recycle pas la même ouverture pour tous les avis d\'un lot', () => {
        const variants = buildReviewSuggestions({
            userProfile: ARTISAN,
            client: { city: 'Lyon' },
            intervention: { workDone: 'Réparation fuite' },
        });
        const firstWords = variants.map(v => v.split(' ').slice(0, 3).join(' '));
        expect(new Set(firstWords).size).toBeGreaterThan(3);
    });

    it('nettoie l\'intitulé de chantier pour qu\'il se lise comme une phrase', () => {
        const variants = buildReviewSuggestions({
            userProfile: ARTISAN,
            client: { city: 'Lyon' },
            intervention: { workDone: 'Remplacement du chauffe-eau + pose mitigeur ; évacuation ancien matériel.' },
        });
        const withWork = variants.filter(v => v.includes('chauffe-eau'));
        expect(withWork.length).toBeGreaterThan(0);
        withWork.forEach(v => {
            expect(v).not.toContain(' + ');
            expect(v).not.toContain(' ;');
        });
    });

    it('tronque un compte rendu trop long au lieu de le recopier entier', () => {
        const long = 'Dépose de l\'ancien tableau électrique vétuste, remplacement par un tableau neuf 3 rangées, '
            + 'mise à la terre complète et vérification de tous les circuits de la maison';
        const variants = buildReviewSuggestions({
            userProfile: { company_name: 'Elec Martin', trade: 'electricien' },
            client: { city: 'Lyon' },
            intervention: { workDone: long },
        });
        variants.forEach(v => expect(v).not.toContain(long));
    });

    it('capitalise correctement les noms de commune composés', () => {
        const variants = buildReviewSuggestions({
            userProfile: ARTISAN,
            client: { city: 'saint-médard-de-guizières' },
        });
        variants.forEach(v => expect(v).toContain('Saint-Médard-de-Guizières'));
    });

    it('utilise parfois le prénom de l\'artisan, comme un vrai client', () => {
        const ctx = { userProfile: ARTISAN, client: { city: 'Lyon' } };
        const batches = Array.from({ length: 5 }, () => buildReviewSuggestions(ctx)).flat();
        expect(batches.some(v => v.includes('Marc'))).toBe(true);
        expect(batches.some(v => v.includes('Maison Dupont'))).toBe(true);
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

    it('invite le client à reformuler plutôt qu\'à recopier', () => {
        const sms = buildReviewSMS({
            userProfile: ARTISAN,
            client: { name: 'Jean Durand' },
            suggestion: 'Super travail.',
            reviewUrl: 'https://g.page/x',
        });
        expect(sms).toContain('Bonjour Jean,');
        expect(sms).toContain('https://g.page/x');
        expect(sms).toMatch(/à votre façon/);
    });
});
