// Transcription d'un enregistrement audio via la fonction `voice-transcribe`.
//
// Un seul point d'appel pour toute l'application, qui remonte la VRAIE cause
// d'un échec : jusqu'ici l'erreur du serveur (clé absente, quota, fichier
// refusé par le fournisseur) était perdue et l'utilisateur ne voyait qu'un
// « réseau ou quota ? » sans moyen d'agir.
//
// Le client Supabase est injectable pour rester testable sans réseau.

import { supabase } from './supabase';
import { blobToBase64 } from './mediaConverters';

/** Whisper plafonne à 25 Mo par fichier : au-delà l'appel échoue sans rien dire d'utile. */
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

export class TranscriptionError extends Error {
    constructor(message, { status, retryable = false } = {}) {
        super(message);
        this.name = 'TranscriptionError';
        this.status = status;
        this.retryable = retryable;
    }
}

/**
 * Extrait un message lisible d'une erreur renvoyée par `functions.invoke`.
 * La réponse HTTP est dans `error.context` (FunctionsHttpError) : c'est là
 * que se trouve le `{ error: "..." }` écrit par la fonction.
 */
export const describeInvokeError = async (error) => {
    if (!error) return { message: 'Erreur inconnue', status: undefined };
    const response = error.context;
    const status = typeof response?.status === 'number' ? response.status : undefined;
    if (response && typeof response.text === 'function') {
        try {
            const raw = await response.text();
            try {
                const parsed = JSON.parse(raw);
                if (parsed?.error) return { message: String(parsed.error), status };
            } catch { /* corps non JSON */ }
            if (raw?.trim()) return { message: raw.trim().slice(0, 200), status };
        } catch { /* corps illisible */ }
    }
    if (error.name === 'FunctionsFetchError' || /fetch|network|Failed to fetch/i.test(error.message || '')) {
        return { message: 'Réseau indisponible — la transcription sera réessayée.', status, network: true };
    }
    return { message: error.message || 'Erreur de transcription', status };
};

// Un échec transitoire (réseau, 5xx, 429) mérite une nouvelle tentative ;
// une clé absente (400) ou un refus (401/403) n'en mérite aucune.
const isRetryable = ({ status, network }) => Boolean(network) || status === undefined || status === 429 || status >= 500;

/**
 * Transcrit un blob audio.
 *
 * @param {Blob} blob
 * @param {string} mimeType
 * @param {object} [options]
 * @param {number} [options.retries=1] - tentatives supplémentaires sur échec transitoire
 * @param {(body: object) => Promise<{data: any, error: any}>} [options.invoke]
 * @param {(ms: number) => Promise<void>} [options.wait]
 * @returns {Promise<{ transcript: string, empty: boolean }>}
 */
export const transcribeBlob = async (blob, mimeType, {
    retries = 1,
    invoke = (body) => supabase.functions.invoke('voice-transcribe', { body }),
    wait = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) => {
    if (!blob || !blob.size) {
        throw new TranscriptionError('Enregistrement vide.', { retryable: false });
    }
    if (blob.size > MAX_AUDIO_BYTES) {
        throw new TranscriptionError(
            `Enregistrement trop volumineux (${Math.round(blob.size / 1024 / 1024)} Mo, maximum 20 Mo).`,
            { retryable: false }
        );
    }
    const audioBase64 = await blobToBase64(blob);

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        if (attempt > 0) await wait(1500 * attempt);
        let result;
        try {
            result = await invoke({ audioBase64, mimeType });
        } catch (err) {
            result = { data: null, error: err };
        }
        if (!result.error) {
            const transcript = String(result.data?.transcript ?? '').trim();
            return { transcript, empty: transcript === '' };
        }
        const described = await describeInvokeError(result.error);
        lastError = new TranscriptionError(described.message, {
            status: described.status,
            retryable: isRetryable(described),
        });
        if (!lastError.retryable) break;
    }
    throw lastError;
};
