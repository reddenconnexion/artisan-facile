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

describe('devis Pro (méthode de la skill appliquée à l’Assistant)', () => {
    it('porte le tri, les lots, les réserves, l’objet et les questions', async () => {
        const { QUOTE_PRO_METHOD } = await import('./quoteMethod');
        expect(QUOTE_PRO_METHOD).toContain('STRICT NÉCESSAIRE DANS LE TOTAL');
        expect(QUOTE_PRO_METHOD).toContain('"lot"');
        expect(QUOTE_PRO_METHOD).toContain('"reserves"');
        expect(QUOTE_PRO_METHOD).toContain('"work_object"');
        expect(QUOTE_PRO_METHOD).toContain('"questions"');
        expect(QUOTE_PRO_METHOD).toContain('price_estimated');
        // Pas de montant propre à un artisan dans une méthode partagée.
        expect(QUOTE_PRO_METHOD).not.toContain('200 €');
    });

    it('ajoute les repères électricité au seul métier électricien', async () => {
        const { buildQuoteProMethod, QUOTE_PRO_METHOD } = await import('./quoteMethod');
        expect(buildQuoteProMethod('electricien')).toContain('REPÈRES ÉLECTRICITÉ');
        expect(buildQuoteProMethod('plombier')).toBe(QUOTE_PRO_METHOD);
    });

    it('nettoie les réserves et les met en forme comme l’import CSV', async () => {
        const { normalizeReserves, formatReservesBlock } = await import('./quoteMethod');
        expect(normalizeReserves(['- Supports non visibles', 'supports non visibles', '', 42, '  Peinture non comprise  ']))
            .toEqual(['Supports non visibles', 'Peinture non comprise']);
        expect(normalizeReserves('• Un\n• Deux')).toEqual(['Un', 'Deux']);
        expect(formatReservesBlock([])).toBe('');
        expect(formatReservesBlock(['Un', 'Deux'])).toBe('Réserves :\n- Un\n- Deux');
    });

    it('range les lignes par lot, garde la raison des options et signale les prix estimés', async () => {
        const { proItemsToFormItems } = await import('./quoteMethod');
        const out = proItemsToFormItems([
            { description: 'Pose du tableau', quantity: 4, unit: 'h', price: 55, type: 'service', lot: 'Tableau' },
            { description: 'Tableau 3 rangées', quantity: 1, unit: 'u', price: 189, type: 'material', lot: 'Tableau', price_estimated: true },
            { description: 'Prise 2P+T', quantity: 6, unit: 'u', price: 16, type: 'material', lot: 'Cuisine' },
            { description: 'Parafoudre', quantity: 1, unit: 'u', price: 90, type: 'material', lot: 'Cuisine', is_optional: true, option_reason: 'Zone orageuse' },
        ], 1000);
        expect(out.map((i) => i.type === 'section' ? `# ${i.description}` : i.description)).toEqual([
            '# Tableau', 'Pose du tableau', 'Tableau 3 rangées', '# Cuisine', 'Prise 2P+T', 'Parafoudre — Zone orageuse',
        ]);
        expect(out[2].internal_note).toMatch(/à vérifier/);
        expect(out[1].internal_note).toBeUndefined();
        expect(out[5].is_optional).toBe(true);
        expect(new Set(out.map((i) => i.id)).size).toBe(out.length);
    });

    it('sans lot, aucune section', async () => {
        const { proItemsToFormItems } = await import('./quoteMethod');
        const out = proItemsToFormItems([{ description: 'Dépannage', quantity: 1, unit: 'h', price: 55, type: 'service' }]);
        expect(out).toHaveLength(1);
        expect(out[0].type).toBe('service');
    });
});
