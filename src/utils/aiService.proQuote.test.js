import { describe, it, expect, beforeEach, vi } from 'vitest';

// Devis Pro de l'Assistant : routage vers le preset serveur « quote-pro »,
// méthode de la skill dans les extras, et normalisation de la réponse.
const invokeMock = vi.fn();
vi.mock('./supabase', () => ({
    supabase: {
        functions: { invoke: (...args) => invokeMock(...args) },
    },
}));

import { generateProQuote } from './aiService';

const okResponse = (rawResponse) => ({ data: { rawResponse }, error: null });

const sample = {
    title: 'Tableau et prises cuisine',
    work_object: 'Remplacement du tableau.\n\nCréation de 6 prises.',
    items: [
        { description: 'Pose  du\ntableau', quantity: 6, unit: 'h', price: 55, type: 'service', lot: 'Tableau' },
        { description: 'Parafoudre', quantity: 1, unit: 'u', price: 90, type: 'material', lot: 'Tableau', is_optional: true, option_reason: 'Zone orageuse', price_estimated: true },
    ],
    reserves: ['Supports non visibles avant démontage', 'Peinture non comprise'],
    suggestions: ['Quantité estimée : 8 m de câble — à vérifier'],
    questions: ['Quelle longueur entre le tableau et la cuisine ?'],
    estimated_duration: '1 jour',
};

beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    invokeMock.mockReset();
});

describe('generateProQuote', () => {
    it('envoie le preset quote-pro avec la méthode, le taux et la bibliothèque', async () => {
        invokeMock.mockResolvedValue(okResponse(JSON.stringify(sample)));
        await generateProQuote('Remplacer le tableau', {
            hourlyRate: 55,
            instructions: 'Acompte = fournitures',
            trade: 'electricien',
            priceLibrary: [{ description: 'Tableau 3 rangées', price: 189, unit: 'u', type: 'material' }],
        });
        const body = invokeMock.mock.calls[0][1].body;
        expect(body.preset).toBe('quote-pro');
        expect(body.systemPrompt).toBeUndefined();
        expect(body.extras).toContain('55 €/h');
        expect(body.extras).toContain('Acompte = fournitures');
        expect(body.extras).toContain('STRICT NÉCESSAIRE');
        expect(body.extras).toContain('REPÈRES ÉLECTRICITÉ');
        expect(body.extras).toContain('Tableau 3 rangées');
        expect(body.userMessage).toContain('Remplacer le tableau');
    });

    it('garde le preset avec un prompt personnalisé', async () => {
        invokeMock.mockResolvedValue(okResponse(JSON.stringify(sample)));
        await generateProQuote('X', { customSystemPrompt: 'Mon prompt' });
        const body = invokeMock.mock.calls[0][1].body;
        expect(body.preset).toBe('quote-pro');
        expect(body.systemPrompt).toMatch(/^Mon prompt/);
    });

    it('normalise titre, objet, lignes, réserves et questions', async () => {
        invokeMock.mockResolvedValue(okResponse('```json\n' + JSON.stringify(sample) + '\n```'));
        const r = await generateProQuote('Remplacer le tableau');
        expect(r.title).toBe('Tableau et prises cuisine');
        expect(r.work_object).toBe('Remplacement du tableau. Création de 6 prises.');
        expect(r.items[0]).toMatchObject({ description: 'Pose du tableau', quantity: 6, unit: 'h', price: 55, type: 'service', lot: 'Tableau' });
        expect(r.items[1]).toMatchObject({ is_optional: true, option_reason: 'Zone orageuse', price_estimated: true, type: 'material' });
        expect(r.reserves).toEqual(['Supports non visibles avant démontage', 'Peinture non comprise']);
        expect(r.questions).toEqual(['Quelle longueur entre le tableau et la cuisine ?']);
        expect(r.estimated_duration).toBe('1 jour');
    });

    it('après les réponses de l’artisan, plus aucune question', async () => {
        invokeMock.mockResolvedValue(okResponse(JSON.stringify(sample)));
        const r = await generateProQuote('Remplacer le tableau', {
            answers: [{ question: 'Quelle longueur ?', answer: '12 m' }],
        });
        const body = invokeMock.mock.calls[0][1].body;
        expect(body.userMessage).toContain('12 m');
        expect(body.extras).toContain('PRÉCISIONS REÇUES');
        expect(r.questions).toEqual([]);
    });
});
