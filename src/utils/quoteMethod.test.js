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
    it('est vide sans article exploitable ou sans texte de chantier', () => {
        expect(buildPriceLibraryPrompt(undefined, 'prise')).toBe('');
        expect(buildPriceLibraryPrompt([{ description: '', price: 5 }, { description: 'Gratuit', price: 0 }], 'gratuit')).toBe('');
        expect(buildPriceLibraryPrompt([{ description: 'Prise 2P+T', price: 12 }], '')).toBe('');
    });

    it('liste désignation, unité, prix et nature des articles liés au chantier', () => {
        const out = buildPriceLibraryPrompt([
            { description: 'Main d\'œuvre électricien', price: 50, unit: 'h', type: 'service' },
            { description: 'Câble R2V 3G2,5', price: 1.8, unit: 'ml', type: 'material' },
        ], 'Tirer un câble R2V depuis le tableau, travail d\'électricien');
        expect(out).toContain('BIBLIOTHÈQUE DE PRIX');
        expect(out).toContain("- Main d'œuvre électricien | h | 50 € HT | MO");
        expect(out).toContain('- Câble R2V 3G2,5 | ml | 1,8 € HT | fourniture');
    });

    it('n’envoie que les articles qui parlent du chantier', () => {
        const library = [
            { description: 'Carrelage mural', price: 30 },
            { description: 'Plinthe bois', price: 8 },
            { description: 'Interrupteur va-et-vient', price: 9 },
        ];
        const out = buildPriceLibraryPrompt(library, 'Ajouter un interrupteur dans le couloir');
        expect(out).toContain('Interrupteur va-et-vient');
        expect(out).not.toContain('Carrelage');
        expect(out).not.toContain('Plinthe');
    });

    it('ignore les mots vides et confond singulier et pluriel', () => {
        const library = [
            { description: 'Pose pour fourniture avec câblage', price: 10 },
            { description: 'Prise 2P+T 16A', price: 12 },
        ];
        const out = buildPriceLibraryPrompt(library, 'Pose de 6 prises pour la cuisine avec fourniture');
        expect(out).toContain('Prise 2P+T 16A');
        expect(out).not.toContain('Pose pour fourniture');
    });

    it('plafonne et classe les plus proches d’abord', () => {
        const library = [
            { description: 'Disjoncteur 16A', price: 9 },
            { description: 'Disjoncteur différentiel 30mA type A 40A', price: 70 },
            { description: 'Disjoncteur 20A', price: 9 },
        ];
        const out = buildPriceLibraryPrompt(library, 'disjoncteur différentiel 30mA type A', 2);
        const lines = out.split('\n').filter((l) => l.startsWith('- '));
        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain('différentiel');
    });

    it('envoie au plus 40 lignes d’une grosse bibliothèque', async () => {
        const { PRICE_LIBRARY_MAX_LINES } = await import('./quoteMethod');
        const library = Array.from({ length: 500 }, (_, i) => ({ description: `Prise modèle ${i}`, price: 10 }));
        const out = buildPriceLibraryPrompt(library, 'Remplacer les prises de la cuisine');
        expect(out.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(PRICE_LIBRARY_MAX_LINES);
        expect(PRICE_LIBRARY_MAX_LINES).toBe(40);
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
        expect(out[2].internal_note).toBe("À relever : prix estimé par l'appli");
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

describe('prix à relever (bibliothèque ancienne, sans marge, estimée)', () => {
    const NOW = new Date('2026-11-08T12:00:00Z').getTime();
    const daysAgo = (n) => new Date(NOW - n * 24 * 3600 * 1000).toISOString();

    it('n’envoie pas une fourniture vendue au prix d’achat ou en dessous', async () => {
        const { buildPriceLibraryPrompt, isUnderpricedItem } = await import('./quoteMethod');
        const library = [
            { description: 'Prise 2P+T blanche', price: 5, buying_price: 6, type: 'material' },
            { description: 'Prise 2P+T encastrée', price: 7, buying_price: 7, type: 'material' },
            { description: 'Prise 2P+T saillie', price: 12, buying_price: 7, type: 'material' },
            { description: 'Pose prise', price: 30, buying_price: 40, type: 'service' },
        ];
        expect(isUnderpricedItem(library[0])).toBe(true);
        expect(isUnderpricedItem(library[1])).toBe(true);
        expect(isUnderpricedItem(library[3])).toBe(false);
        const out = buildPriceLibraryPrompt(library, 'remplacer 3 prises 2P+T', 40, { now: NOW });
        expect(out).toContain('Prise 2P+T saillie');
        expect(out).not.toContain('blanche');
        expect(out).not.toContain('encastrée');
        expect(out).toContain('Pose prise');
    });

    it('date les fournitures, marque les anciennes et passe les récentes devant', async () => {
        const { buildPriceLibraryPrompt } = await import('./quoteMethod');
        const library = [
            { description: 'Disjoncteur 16A', price: 9, type: 'material', updated_at: daysAgo(200) },
            { description: 'Disjoncteur 16A', price: 11, type: 'material', updated_at: daysAgo(3) },
        ];
        const out = buildPriceLibraryPrompt(library, 'disjoncteur 16A', 40, { now: NOW });
        const lines = out.split('\n').filter((l) => l.startsWith('- '));
        expect(lines[0]).toContain('11 € HT');
        expect(lines[0]).not.toContain('(ancien)');
        expect(lines[1]).toContain('9 € HT');
        expect(lines[1]).toContain('(ancien)');
        expect(out).toContain('"price_stale": true');
    });

    it('sans fourniture ancienne, pas de consigne price_stale', async () => {
        const { buildPriceLibraryPrompt } = await import('./quoteMethod');
        const out = buildPriceLibraryPrompt(
            [{ description: 'Disjoncteur 16A', price: 11, type: 'material', updated_at: daysAgo(3) }],
            'disjoncteur', 40, { now: NOW });
        expect(out).toContain('prix du');
        expect(out).not.toContain('price_stale');
    });

    it('note les lignes à relever et laisse la main d’œuvre tranquille', async () => {
        const { priceCheckNote, isPriceToCheck, proItemsToFormItems } = await import('./quoteMethod');
        expect(priceCheckNote({ type: 'material', price_stale: true })).toMatch(/^À relever : prix de bibliothèque de plus de 30 jours/);
        expect(priceCheckNote({ type: 'service', price_estimated: true })).toBe('');
        const out = proItemsToFormItems([
            { description: 'Tableau 3 rangées', quantity: 1, unit: 'u', price: 189, type: 'material', price_stale: true },
            { description: 'Pose', quantity: 4, unit: 'h', price: 55, type: 'service', price_estimated: true },
        ]);
        expect(isPriceToCheck(out[0])).toBe(true);
        expect(isPriceToCheck(out[1])).toBe(false);
        expect(isPriceToCheck({ type: 'material', internal_note: 'Réf fournisseur 406774' })).toBe(false);
    });

    it('construit la liste à relever : quantités cumulées, raison d’option retirée', async () => {
        const { buildPriceCheckList } = await import('./quoteMethod');
        const note = "À relever : prix estimé par l'appli";
        const items = [
            { type: 'material', description: 'Prise 2P+T 16 A', quantity: 4, unit: 'u', internal_note: note },
            { type: 'material', description: 'prise 2P+T 16 A', quantity: 2, unit: 'u', internal_note: note },
            { type: 'material', description: 'Parafoudre — Zone orageuse', quantity: 1, unit: 'u', internal_note: note },
            { type: 'material', description: 'Câble 3G2,5', quantity: 12.5, unit: 'ml', internal_note: 'Réf 123' },
            { type: 'service', description: 'Pose', quantity: 3, unit: 'h', internal_note: note },
        ];
        expect(buildPriceCheckList(items, { title: 'Cuisine Laurent' })).toBe(
            'Prix à relever — devis « Cuisine Laurent » (désignation | quantité | unité) :\n'
            + '- Prise 2P+T 16 A | 6 | u\n'
            + '- Parafoudre | 1 | u');
        expect(buildPriceCheckList([], {})).toBe('');
    });
});
