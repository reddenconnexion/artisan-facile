import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the Supabase client so generateQuoteFromSiteVisit's call to the
// ai-proxy Edge Function returns a controlled raw response. This lets us
// verify the whole site-visit quote pipeline (prompt routing + parsing +
// normalisation) without any network/server dependency.
const invokeMock = vi.fn();
vi.mock('./supabase', () => ({
    supabase: {
        functions: { invoke: (...args) => invokeMock(...args) },
    },
}));

import { generateQuoteFromSiteVisit } from './aiService';

const okResponse = (rawResponse) => ({ data: { rawResponse }, error: null });

beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    invokeMock.mockReset();
});

describe('generateQuoteFromSiteVisit', () => {
    it('parses a well-formed site-visit quote and normalises items', async () => {
        invokeMock.mockResolvedValue(okResponse(JSON.stringify({
            title: 'Rénovation salle de bain',
            items: [
                { description: 'Dépose carrelage mural', quantity: 2, unit: 'm2', price: 45, type: 'service' },
                { description: 'Carreaux 20x20 beige', quantity: 2, unit: 'm2', price: 30, type: 'material' },
            ],
            suggestions: ['Prévoir évacuation des gravats'],
            estimated_duration: '2 jours',
            price_range: { min: 800, max: 1200 },
            confidence: 'high',
        })));

        const result = await generateQuoteFromSiteVisit(
            ['Salle de bain, carrelage décollé côté douche, 2m²'],
            ['Photo 1: mur carrelé avec carreaux décollés'],
            { hourlyRate: 45 },
        );

        expect(result.title).toBe('Rénovation salle de bain');
        expect(result.items).toHaveLength(2);
        expect(result.items[0]).toMatchObject({
            description: 'Dépose carrelage mural',
            quantity: 2,
            unit: 'm2',
            price: 45,
            type: 'service',
            buying_price: 0,
        });
        expect(result.items[0].id).toBeDefined();
        expect(result.items[1].type).toBe('material');
        expect(result.suggestions).toEqual(['Prévoir évacuation des gravats']);
        expect(result.estimated_duration).toBe('2 jours');
        expect(result.price_range).toEqual({ min: 800, max: 1200 });
        expect(result.confidence).toBe('high');
    });

    it('uses the quote-site-visit preset and forwards the hourly rate', async () => {
        invokeMock.mockResolvedValue(okResponse(JSON.stringify({ items: [] })));

        await generateQuoteFromSiteVisit([], [], { hourlyRate: 50 });

        expect(invokeMock).toHaveBeenCalledTimes(1);
        const [fnName, { body }] = invokeMock.mock.calls[0];
        expect(fnName).toBe('ai-proxy');
        expect(body.preset).toBe('quote-site-visit');
        expect(body.extras).toContain('50');
        expect(body.userMessage).toContain('VISITE CHANTIER');
    });

    it('routes through a custom system prompt when provided', async () => {
        invokeMock.mockResolvedValue(okResponse(JSON.stringify({ items: [] })));

        await generateQuoteFromSiteVisit(['note'], [], {
            customSystemPrompt: 'Mon prompt personnalisé',
        });

        const [, { body }] = invokeMock.mock.calls[0];
        expect(body.preset).toBeUndefined();
        expect(body.systemPrompt).toContain('Mon prompt personnalisé');
        expect(body.systemPrompt).toContain('MODE VISITE CHANTIER');
    });

    it('extracts JSON even when wrapped in markdown fences', async () => {
        invokeMock.mockResolvedValue(okResponse(
            '```json\n{"title":"Devis","items":[{"description":"Pose prise","quantity":1,"unit":"u","price":35}]}\n```'
        ));

        const result = await generateQuoteFromSiteVisit(['note'], []);
        expect(result.items).toHaveLength(1);
        expect(result.items[0].description).toBe('Pose prise');
        // No type given → defaults to 'service'
        expect(result.items[0].type).toBe('service');
    });

    it('falls back to safe defaults for missing/invalid optional fields', async () => {
        invokeMock.mockResolvedValue(okResponse(JSON.stringify({
            items: [{ description: 'Main d\'œuvre', quantity: 'abc', price: null }],
            confidence: 'not-a-level',
        })));

        const result = await generateQuoteFromSiteVisit(['note'], []);
        expect(result.title).toBe('Devis visite chantier');
        expect(result.items[0].quantity).toBe(1); // coerced from invalid 'abc'
        expect(result.items[0].price).toBe(0);     // coerced from null
        expect(result.confidence).toBe('medium');  // invalid → default
        expect(result.price_range).toBeNull();
        expect(result.suggestions).toEqual([]);
    });

    it('throws a user-facing error when the AI returns invalid JSON', async () => {
        invokeMock.mockResolvedValue(okResponse('désolé, je ne peux pas générer ce devis'));

        await expect(generateQuoteFromSiteVisit(['note'], []))
            .rejects.toThrow(/format invalide/i);
    });

    it('throws when an item is missing its description', async () => {
        invokeMock.mockResolvedValue(okResponse(JSON.stringify({
            items: [{ quantity: 1, price: 10 }],
        })));

        await expect(generateQuoteFromSiteVisit(['note'], []))
            .rejects.toThrow(/description manquante/i);
    });

    it('surfaces an error returned by the ai-proxy function', async () => {
        invokeMock.mockResolvedValue({ data: { error: 'Quota IA dépassé' }, error: null });

        await expect(generateQuoteFromSiteVisit(['note'], []))
            .rejects.toThrow('Quota IA dépassé');
    });
});
