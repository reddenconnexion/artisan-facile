import { describe, it, expect } from 'vitest';
import { buildSiteVisitMethod, buildPriceLibraryPrompt, SITE_VISIT_METHOD } from './quoteMethod';

describe('buildSiteVisitMethod', () => {
    it('ajoute les repères électricité au seul métier électricien (clé legacy comprise)', () => {
        expect(buildSiteVisitMethod('electricien')).toContain('REPÈRES ÉLECTRICITÉ');
        expect(buildSiteVisitMethod('electrician')).toContain('REPÈRES ÉLECTRICITÉ');
        expect(buildSiteVisitMethod('plombier')).toBe(SITE_VISIT_METHOD);
        expect(buildSiteVisitMethod(undefined)).toBe(SITE_VISIT_METHOD);
    });

    it('porte les règles de tri ferme / options', () => {
        expect(SITE_VISIT_METHOD).toContain('is_optional');
        expect(SITE_VISIT_METHOD).toContain('option_reason');
        expect(SITE_VISIT_METHOD).toContain('5 000 € HT');
    });
});

describe('buildPriceLibraryPrompt', () => {
    it('est vide sans article exploitable', () => {
        expect(buildPriceLibraryPrompt(undefined)).toBe('');
        expect(buildPriceLibraryPrompt([{ description: '', price: 5 }, { description: 'Gratuit', price: 0 }])).toBe('');
    });

    it('liste désignation, unité, prix et nature', () => {
        const out = buildPriceLibraryPrompt([
            { description: 'Main d\'œuvre électricien', price: 50, unit: 'h', type: 'service' },
            { description: 'Câble R2V 3G2,5', price: 1.8, unit: 'ml', type: 'material' },
        ]);
        expect(out).toContain('BIBLIOTHÈQUE DE PRIX');
        expect(out).toContain("- Main d'œuvre électricien | h | 50 € HT | MO");
        expect(out).toContain('- Câble R2V 3G2,5 | ml | 1,8 € HT | fourniture');
    });

    it('au-delà de la limite, garde les articles qui parlent de la visite', () => {
        const library = [
            { description: 'Carrelage mural', price: 30 },
            { description: 'Plinthe bois', price: 8 },
            { description: 'Interrupteur va-et-vient', price: 9 },
        ];
        const out = buildPriceLibraryPrompt(library, 'Ajouter un interrupteur dans le couloir', 1);
        expect(out).toContain('Interrupteur va-et-vient');
        expect(out).not.toContain('Carrelage');
    });
});

describe('buildSitePhotoPrompts', () => {
    it('oriente la photo vers les constats électriques pour un électricien', async () => {
        const { buildSitePhotoPrompts } = await import('./quoteMethod');
        const { systemPrompt, userPrompt } = buildSitePhotoPrompts('electricien');
        expect(systemPrompt).toContain('Tableau');
        expect(systemPrompt).toContain('sans conseil ni liste de travaux');
        expect(userPrompt).toBeTruthy();
    });

    it('reste générique pour les autres métiers', async () => {
        const { buildSitePhotoPrompts } = await import('./quoteMethod');
        expect(buildSitePhotoPrompts('plombier').systemPrompt).not.toContain('Tableau');
    });
});

describe('lecture de la visite', () => {
    it('demande de distinguer travaux demandés et bavardages', () => {
        expect(SITE_VISIT_METHOD).toContain('TRAVAUX DEMANDÉS');
        expect(SITE_VISIT_METHOD).toContain('dernière version qui compte');
    });
});
