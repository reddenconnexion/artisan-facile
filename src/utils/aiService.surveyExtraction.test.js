import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mêmes mocks que aiService.siteVisit.test.js : on contrôle la réponse de
// l'Edge Function ai-proxy pour tester le pipeline sans réseau.
const invokeMock = vi.fn();
vi.mock('./supabase', () => ({
    supabase: {
        functions: { invoke: (...args) => invokeMock(...args) },
    },
}));

import { extractSurveyFromVisit } from './aiService';

const okResponse = (rawResponse) => ({ data: { rawResponse }, error: null });

const TEMPLATE = {
    label: 'Relevé test',
    contextGroups: [
        {
            key: 'bien',
            label: 'Le bien',
            fields: [
                { key: 'typeBien', label: 'Type de bien', type: 'chips', options: ['Maison', 'Appartement'] },
                { key: 'delai', label: 'Délai souhaité', type: 'text' },
            ],
        },
    ],
    zoneCounters: [{ key: 'prises', label: 'Prises 2P+T' }],
    zoneExtraFields: [{ key: 'divers', label: 'Divers' }],
    hasTableau: true,
    tableauEtats: [{ value: 'conforme', label: 'Conforme' }, { value: 'a_remplacer', label: 'À remplacer' }],
    checklist: [{ id: 'parafoudre_t2', label: 'Parafoudre type 2' }],
};

beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    invokeMock.mockReset();
});

describe('extractSurveyFromVisit', () => {
    it("ne fait aucun appel IA quand il n'y a rien à analyser", async () => {
        const result = await extractSurveyFromVisit([], [], TEMPLATE, '');
        expect(result).toBeNull();
        expect(invokeMock).not.toHaveBeenCalled();
    });

    it('décrit le schéma de la trame dans le prompt système et parse la réponse JSON', async () => {
        invokeMock.mockResolvedValue(okResponse(JSON.stringify({
            demande: 'Refaire le tableau',
            contexte: { bien: { typeBien: 'Maison' } },
            zones: [{ name: 'Cuisine', counters: { prises: 6 }, fields: { divers: 'mur humide' } }],
            tableau: { etat: 'a_remplacer' },
            checklist: { parafoudre_t2: 'prevu' },
            nonConformites: 'Pas de terre',
        })));

        const result = await extractSurveyFromVisit(
            ['Dans la cuisine il faut six prises'], [], TEMPLATE, ''
        );

        expect(invokeMock).toHaveBeenCalledTimes(1);
        const [fnName, { body }] = invokeMock.mock.calls[0];
        expect(fnName).toBe('ai-proxy');
        // Le prompt décrit les options de chips et les clés de compteurs/checklist
        // dérivées de la trame, pour que l'IA ne réponde que dans ce vocabulaire.
        expect(body.systemPrompt).toContain('"typeBien"');
        expect(body.systemPrompt).toContain('"Maison", "Appartement"');
        expect(body.systemPrompt).toContain('"prises"');
        expect(body.systemPrompt).toContain('"parafoudre_t2"');
        expect(body.systemPrompt).toMatch(/n'invente et ne devine jamais/i);
        expect(body.userMessage).toContain('Dans la cuisine il faut six prises');

        expect(result).toMatchObject({
            demande: 'Refaire le tableau',
            contexte: { bien: { typeBien: 'Maison' } },
            zones: [{ name: 'Cuisine', counters: { prises: 6 }, fields: { divers: 'mur humide' } }],
            tableau: { etat: 'a_remplacer' },
            checklist: { parafoudre_t2: 'prevu' },
            nonConformites: 'Pas de terre',
        });
    });

    it('extrait le JSON même entouré de balises markdown', async () => {
        invokeMock.mockResolvedValue(okResponse('```json\n{"demande":"Mise aux normes"}\n```'));
        const result = await extractSurveyFromVisit(['note'], [], TEMPLATE);
        expect(result).toEqual({ demande: 'Mise aux normes' });
    });

    it('lève une erreur explicite si la réponse ne contient aucun JSON exploitable', async () => {
        invokeMock.mockResolvedValue(okResponse('Désolé, je ne peux pas structurer cette visite.'));
        // L'appelant (handleFinishVisit) attrape cette erreur : un échec
        // d'extraction ne doit jamais bloquer la visite, juste laisser la
        // trame telle quelle pour une saisie manuelle.
        await expect(extractSurveyFromVisit(['note'], [], TEMPLATE)).rejects.toThrow(/format invalide/i);
    });

    it("inclut les notes texte et les descriptions de photos dans le message", async () => {
        invokeMock.mockResolvedValue(okResponse('{}'));
        await extractSurveyFromVisit(
            [], ['Photo 1: tableau électrique vétuste'], TEMPLATE, 'Client pressé, veut finir avant Noël'
        );
        const [, { body }] = invokeMock.mock.calls[0];
        expect(body.userMessage).toContain('Client pressé, veut finir avant Noël');
        expect(body.userMessage).toContain('tableau électrique vétuste');
    });
});
