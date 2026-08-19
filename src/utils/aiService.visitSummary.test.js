import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock du client Supabase : structureVisitTranscript passe par l'Edge
// Function ai-proxy, on vérifie le contenu envoyé et le texte renvoyé.
const invokeMock = vi.fn();
vi.mock('./supabase', () => ({
    supabase: {
        functions: { invoke: (...args) => invokeMock(...args) },
    },
}));

import { structureVisitTranscript } from './aiService';

const okResponse = (rawResponse) => ({ data: { rawResponse }, error: null });

beforeEach(() => { invokeMock.mockReset(); });

describe('structureVisitTranscript', () => {
    it('envoie la transcription et le contexte, et retourne le texte mis au propre', async () => {
        invokeMock.mockResolvedValue(okResponse('  DEMANDE DU CLIENT :\nRefaire la cuisine.  '));

        const result = await structureVisitTranscript('euh alors ici la cuisine, il veut six prises', {
            clientName: 'Mme Dupont',
            address: '12 rue des Lilas',
        });

        expect(result).toBe('DEMANDE DU CLIENT :\nRefaire la cuisine.');
        const [fnName, { body }] = invokeMock.mock.calls[0];
        expect(fnName).toBe('ai-proxy');
        expect(body.systemPrompt).toContain("N'invente RIEN");
        expect(body.userMessage).toContain('Client : Mme Dupont');
        expect(body.userMessage).toContain('Adresse : 12 rue des Lilas');
        expect(body.userMessage).toContain('euh alors ici la cuisine');
    });

    it('refuse une transcription vide sans appeler le serveur', async () => {
        await expect(structureVisitTranscript('   ')).rejects.toThrow('transcription est vide');
        expect(invokeMock).not.toHaveBeenCalled();
    });

    it('remonte l\'erreur du proxy IA', async () => {
        invokeMock.mockResolvedValue({ data: { error: 'Quota dépassé' }, error: null });
        await expect(structureVisitTranscript('des notes')).rejects.toThrow('Quota dépassé');
    });
});
