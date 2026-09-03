import { describe, it, expect, vi } from 'vitest';
import { transcribeBlob, describeInvokeError, TranscriptionError, MAX_AUDIO_BYTES } from './transcribeAudio';

// Le convertisseur base64 repose sur FileReader, absent de Node : on le
// remplace par une version minimale suffisante pour les tests.
vi.mock('./mediaConverters', () => ({
    blobToBase64: async () => 'QUJD',
}));
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: vi.fn() } } }));

const blob = (size = 10) => ({ size });
const httpError = (status, body) => ({
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: { status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) },
});
const noWait = async () => {};

describe('describeInvokeError', () => {
    it("remonte le message d'erreur écrit par la fonction", async () => {
        const described = await describeInvokeError(httpError(400, { error: 'Clé API Gemini non configurée.' }));
        expect(described).toEqual({ message: 'Clé API Gemini non configurée.', status: 400 });
    });

    it('tolère un corps non JSON', async () => {
        const described = await describeInvokeError(httpError(502, 'Bad gateway'));
        expect(described.message).toBe('Bad gateway');
        expect(described.status).toBe(502);
    });

    it('identifie une coupure réseau', async () => {
        const described = await describeInvokeError({ name: 'FunctionsFetchError', message: 'Failed to fetch' });
        expect(described.network).toBe(true);
    });
});

describe('transcribeBlob', () => {
    it('retourne la transcription et signale un enregistrement muet', async () => {
        const invoke = vi.fn().mockResolvedValue({ data: { transcript: '  Bonjour  ' }, error: null });
        expect(await transcribeBlob(blob(), 'audio/webm', { invoke, wait: noWait })).toEqual({ transcript: 'Bonjour', empty: false });
        invoke.mockResolvedValue({ data: { transcript: '', empty: true }, error: null });
        expect(await transcribeBlob(blob(), 'audio/webm', { invoke, wait: noWait })).toEqual({ transcript: '', empty: true });
        expect(invoke).toHaveBeenLastCalledWith({ audioBase64: 'QUJD', mimeType: 'audio/webm' });
    });

    it('réessaie une fois sur une erreur transitoire puis réussit', async () => {
        const invoke = vi.fn()
            .mockResolvedValueOnce({ data: null, error: httpError(502, { error: 'Erreur Gemini (503)' }) })
            .mockResolvedValueOnce({ data: { transcript: 'ok' }, error: null });
        const result = await transcribeBlob(blob(), 'audio/webm', { invoke, wait: noWait });
        expect(result.transcript).toBe('ok');
        expect(invoke).toHaveBeenCalledTimes(2);
    });

    it("n'insiste pas sur une erreur définitive et garde son message", async () => {
        const invoke = vi.fn().mockResolvedValue({ data: null, error: httpError(400, { error: 'Clé API OpenAI non configurée.' }) });
        await expect(transcribeBlob(blob(), 'audio/webm', { invoke, wait: noWait }))
            .rejects.toMatchObject({ name: 'TranscriptionError', message: 'Clé API OpenAI non configurée.', retryable: false });
        expect(invoke).toHaveBeenCalledTimes(1);
    });

    it('après les tentatives, une erreur transitoire reste réessayable', async () => {
        const invoke = vi.fn().mockRejectedValue({ name: 'FunctionsFetchError', message: 'Failed to fetch' });
        const err = await transcribeBlob(blob(), 'audio/webm', { invoke, wait: noWait, retries: 2 }).catch((e) => e);
        expect(err).toBeInstanceOf(TranscriptionError);
        expect(err.retryable).toBe(true);
        expect(invoke).toHaveBeenCalledTimes(3);
    });

    it('refuse sans appel réseau un fichier trop lourd ou vide', async () => {
        const invoke = vi.fn();
        await expect(transcribeBlob(blob(MAX_AUDIO_BYTES + 1), 'audio/webm', { invoke })).rejects.toThrow(/trop volumineux/);
        await expect(transcribeBlob(blob(0), 'audio/webm', { invoke })).rejects.toThrow(/vide/);
        expect(invoke).not.toHaveBeenCalled();
    });
});
