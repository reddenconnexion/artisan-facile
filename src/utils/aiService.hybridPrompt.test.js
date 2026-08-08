import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Banc d'essai du PROMPT HYBRIDE pour la visite technique ──────────────────
// On ne peut pas appeler le vrai LLM hors ligne, donc on simule la réponse que
// le modèle produirait avec le prompt hybride pour un relevé d'électricien
// réaliste, puis on la fait passer dans le VRAI pipeline de l'app pour vérifier
// que la sortie est exploitable et que toutes les règles tiennent.

const invokeMock = vi.fn();
vi.mock('./supabase', () => ({
    supabase: { functions: { invoke: (...a) => invokeMock(...a) } },
}));

import { generateQuoteFromSiteVisit } from './aiService';

// Réponse JSON telle que le modèle la renverrait avec le PROMPT HYBRIDE,
// pour le relevé d'exemple (cf. describe ci-dessous).
const HYBRID_MODEL_OUTPUT = JSON.stringify({
    title: 'Mise aux normes électrique - relevé visite',
    items: [
        { description: '[Cuisine] Pose 3 socles PC 16A 2P+T plan de travail', quantity: 3, unit: 'u', price: 42, type: 'service' },
        { description: '[Cuisine] Pose 1 socle PC 16A 2P+T dédié hotte', quantity: 1, unit: 'u', price: 40, type: 'service' },
        { description: '[Tableau] Interrupteur différentiel 30mA type A', quantity: 1, unit: 'u', price: 95, type: 'material' },
        { description: '[Tableau] Disjoncteur 16A ph+N', quantity: 1, unit: 'u', price: 18, type: 'material' },
        { description: '[Tableau] Disjoncteur 20A ph+N', quantity: 1, unit: 'u', price: 20, type: 'material' },
        { description: '[Extérieur] Pose 1 PC étanche IP44 terrasse', quantity: 1, unit: 'u', price: 35, type: 'service' },
    ],
    suggestions: [
        'À confirmer : applique en volume 2 salle de bain (note partiellement illisible)',
        'À confirmer : section des conducteurs au tableau, 2,5 mm² évoqué au mémo vocal mais à vérifier',
    ],
    estimated_duration: '1 jour',
    price_range: { min: 600, max: 900 },
    confidence: 'medium',
});

beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({ data: { rawResponse: HYBRID_MODEL_OUTPUT }, error: null });
});

describe('Prompt hybride — relevé visite technique électricien', () => {
    // Relevé d'exemple (ce que l'artisan fournit) :
    //  Note manuscrite : "Cuisine : 3 PC 16A plan de travail + 1 PC hotte.
    //   Tableau : rajouter diff 30mA type A, 1 disj 16A et 1 disj 20A.
    //   SdB volume 2 ...(illisible)... applique. Extérieur : 1 PC étanche
    //   IP44 terrasse."
    //  Mémo vocal : "Au tableau vérifier la section, je crois du 2,5 carré
    //   mais à confirmer."
    const transcripts = [
        'Cuisine : 3 PC 16A plan de travail + 1 PC hotte. Tableau : rajouter diff 30mA type A, 1 disj 16A et 1 disj 20A. SdB volume 2 [illisible] applique. Extérieur : 1 PC étanche IP44 terrasse.',
        'Au tableau vérifier la section, je crois du 2,5 carré mais à confirmer.',
    ];
    const photoAnalyses = ['Photo : tableau électrique existant avec rangée libre'];

    it('produit une sortie parsable par le pipeline de l\'app', async () => {
        const r = await generateQuoteFromSiteVisit(transcripts, photoAnalyses, { hourlyRate: 45 });
        expect(r.items).toHaveLength(6);
        expect(r.title).toMatch(/relevé visite/i);
    });

    it('regroupe par zone (préfixe [Pièce] conservé dans la description)', async () => {
        const r = await generateQuoteFromSiteVisit(transcripts, photoAnalyses);
        const zones = r.items.map(i => i.description.match(/^\[([^\]]+)\]/)?.[1]);
        expect(zones).toEqual(['Cuisine', 'Cuisine', 'Tableau', 'Tableau', 'Tableau', 'Extérieur']);
    });

    it('conserve le vocabulaire NF C 15-100 sans le vulgariser', async () => {
        const r = await generateQuoteFromSiteVisit(transcripts, photoAnalyses);
        const blob = r.items.map(i => i.description).join(' | ');
        expect(blob).toContain('PC 16A 2P+T');
        expect(blob).toContain('différentiel 30mA type A');
        expect(blob).toContain('IP44');
        // pas de reformulation grand public
        expect(blob.toLowerCase()).not.toContain('prise normale');
    });

    it('porte un chiffrage indicatif sur les postes relevés', async () => {
        const r = await generateQuoteFromSiteVisit(transcripts, photoAnalyses);
        expect(r.items.every(i => typeof i.price === 'number')).toBe(true);
        expect(r.items.every(i => i.price > 0)).toBe(true); // rien laissé à 0 ici
        expect(r.price_range).toEqual({ min: 600, max: 900 });
        expect(r.confidence).toBe('medium');
    });

    it('place l\'illisible et l\'ambigu en « À confirmer » (sans deviner ni chiffrer)', async () => {
        const r = await generateQuoteFromSiteVisit(transcripts, photoAnalyses);
        expect(r.suggestions).toHaveLength(2);
        expect(r.suggestions.every(s => s.startsWith('À confirmer'))).toBe(true);
        // les éléments à confirmer ne sont PAS devenus des lignes chiffrées
        const blob = r.items.map(i => i.description.toLowerCase()).join(' ');
        expect(blob).not.toContain('applique');
        expect(blob).not.toContain('2,5');
    });

    it('n\'invente aucun poste : 6 lignes relevées = 6 lignes en sortie', async () => {
        const r = await generateQuoteFromSiteVisit(transcripts, photoAnalyses);
        // pas de consommables/protections ajoutés d'office
        const blob = r.items.map(i => i.description.toLowerCase()).join(' ');
        expect(blob).not.toContain('consommable');
        expect(blob).not.toContain('évacuation');
        expect(r.items).toHaveLength(6);
    });

    it('normalise chaque ligne au format attendu par le formulaire de devis', async () => {
        const r = await generateQuoteFromSiteVisit(transcripts, photoAnalyses);
        for (const it of r.items) {
            expect(it).toHaveProperty('id');
            expect(it).toHaveProperty('buying_price', 0);
            expect(['service', 'material']).toContain(it.type);
            expect(['u', 'm2', 'ml', 'h', 'forfait']).toContain(it.unit);
        }
    });
});
