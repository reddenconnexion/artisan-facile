import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the Supabase client so generateReviewReply's call to the ai-proxy
// Edge Function is captured locally: these tests assert on the SYSTEM PROMPT
// actually sent (tone-specific length, per-variant plan, anti-repetition),
// because that's what fixes the "all replies start the same" complaint.
const invokeMock = vi.fn();
vi.mock('./supabase', () => ({
    supabase: {
        functions: { invoke: (...args) => invokeMock(...args) },
    },
}));

import { generateReviewReply } from './aiService';

const okResponse = (rawResponse) => ({ data: { rawResponse }, error: null });
const sentPrompt = () => invokeMock.mock.calls.at(-1)[1].body.systemPrompt;

beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(okResponse(JSON.stringify({
        replies: ['Réponse A', 'Réponse B', 'Réponse C'],
    })));
});

describe('generateReviewReply', () => {
    it('parses the replies array returned by the model', async () => {
        const { replies } = await generateReviewReply({ reviewText: 'Super travail, très pro.' });
        expect(replies).toEqual(['Réponse A', 'Réponse B', 'Réponse C']);
    });

    it('rejects an empty review', async () => {
        await expect(generateReviewReply({ reviewText: '   ' })).rejects.toThrow();
    });

    it('makes the concis tone genuinely shorter than the others', async () => {
        await generateReviewReply({ reviewText: 'Nickel.', tone: 'concis' });
        const prompt = sentPrompt();
        expect(prompt).toContain('TON CONCIS');
        expect(prompt).toContain('1 à 2 phrases courtes');
        // L'ancienne limite unique qui gommait la différence entre les tons.
        expect(prompt).not.toContain('2 à 4 phrases');
    });

    it('gives the chaleureux tone its own register and length', async () => {
        await generateReviewReply({ reviewText: 'Très satisfait du chantier.', tone: 'chaleureux' });
        const prompt = sentPrompt();
        expect(prompt).toContain('TON CHALEUREUX');
        expect(prompt).toContain('3 à 4 phrases');
        expect(prompt).not.toContain('TON CONCIS');
    });

    it('never asks for one-sentence replies on a negative review, even in concis', async () => {
        await generateReviewReply({ reviewText: 'Très déçu.', rating: 1, tone: 'concis' });
        const prompt = sentPrompt();
        expect(prompt).toContain('AVIS NÉGATIF');
        expect(prompt).not.toContain('1 phrase suffit.');
    });

    it('assigns one explicit plan per variant and forbids identical openings', async () => {
        await generateReviewReply({ reviewText: 'Travail soigné, équipe ponctuelle.', count: 3 });
        const prompt = sentPrompt();
        expect(prompt).toContain('Variante 1 :');
        expect(prompt).toContain('Variante 2 :');
        expect(prompt).toContain('Variante 3 :');
        expect(prompt).toContain('JAMAIS commencer par le même mot');
        expect(prompt).toContain('Une seule variante au maximum peut ouvrir par un remerciement');
    });

    it('no longer forces the reply to open with a thank-you', async () => {
        await generateReviewReply({ reviewText: 'Excellente prestation.', customerName: 'Sophie' });
        const prompt = sentPrompt();
        expect(prompt).toContain("le remerciement n'a pas à ouvrir la réponse");
        expect(prompt).not.toContain('Remercie sincèrement le client');
    });

    it('feeds previously generated openings back so regeneration avoids them', async () => {
        await generateReviewReply({
            reviewText: 'Excellente prestation.',
            previousReplies: [
                'Merci Sophie pour ce retour qui fait vraiment plaisir à lire.',
                'Quel plaisir de lire un avis pareil après ce chantier !',
            ],
        });
        const prompt = sentPrompt();
        expect(prompt).toContain('OUVERTURES DÉJÀ PROPOSÉES');
        // Seuls les 8 premiers mots de chaque proposition sont rappelés.
        expect(prompt).toContain('Merci Sophie pour ce retour qui fait vraiment');
        expect(prompt).toContain('Quel plaisir de lire un avis pareil après');
        expect(prompt).not.toContain('plaisir à lire.');
    });

    it('omits the anti-repetition block on a first generation', async () => {
        await generateReviewReply({ reviewText: 'Excellente prestation.' });
        expect(sentPrompt()).not.toContain('OUVERTURES DÉJÀ PROPOSÉES');
    });
});
