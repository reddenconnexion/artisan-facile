// File d'attente des photos prises sans réseau : logique pure, sans IndexedDB
// ni Supabase (injectés), pour être testable. Le câblage réel est dans
// photoOutbox.js.
//
// Règle d'or : une photo mise en file n'est JAMAIS supprimée tant qu'elle
// n'est pas arrivée à bon port (upload + ligne en base). Aucun abandon
// automatique, aucune limite de tentatives.

import { isNetworkError } from './offlineSave';

/**
 * @param {object} deps
 * @param {{ put(item), all(): Promise<Array>, remove(id) }} deps.store
 * @param {(item) => Promise<void>} deps.send   envoie une photo (lève en cas d'échec)
 * @param {() => void} [deps.onChange]          appelé après chaque modification de la file
 */
export const createPhotoOutbox = ({ store, send, onChange = () => {} }) => {
    let flushing = null;

    const pending = async () =>
        (await store.all()).sort((a, b) => a.createdAt - b.createdAt);

    const enqueue = async ({ path, blob, row }) => {
        await store.put({ id: path, path, blob, row, createdAt: Date.now() });
        onChange();
    };

    /**
     * Envoie les photos en attente, les plus anciennes d'abord. Une coupure
     * réseau arrête l'envoi (on réessaiera au retour du réseau) ; une autre
     * erreur laisse la photo en file et passe à la suivante.
     * Deux appels simultanés partagent le même envoi.
     * @returns {Promise<{ sent: number, remaining: number, error: Error|null }>}
     */
    const flush = () => {
        if (flushing) return flushing;
        flushing = (async () => {
            const items = await pending();
            let sent = 0;
            let error = null;
            for (const item of items) {
                try {
                    await send(item);
                    await store.remove(item.id);
                    sent += 1;
                } catch (err) {
                    error = err;
                    if (isNetworkError(err)) break;
                }
            }
            if (sent > 0) onChange();
            return { sent, remaining: items.length - sent, error };
        })().finally(() => {
            flushing = null;
        });
        return flushing;
    };

    return { enqueue, pending, flush };
};
