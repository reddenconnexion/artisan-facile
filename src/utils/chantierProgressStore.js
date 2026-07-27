// Persistance du suivi de chantier (cases cochées + travaux hors devis).
//
// Contrainte terrain : sur un chantier, le réseau est souvent absent. Le suivi
// est donc TOUJOURS écrit en localStorage d'abord (instantané, hors ligne), puis
// synchronisé dans Supabase (table `chantier_progress`) dès que possible pour
// être retrouvé au bureau, sur un autre appareil, ou après vidage du cache.
//
// Si la table n'existe pas encore (migration non appliquée), on retombe
// silencieusement sur le mode local seul : le mode terrain reste utilisable.

import { supabase } from './supabase';
import { mergeDone, mergeExtras } from './chantierProgress';

const LOCAL_PREFIX = 'af-chantier-progress:';

const localKey = (quoteId) => `${LOCAL_PREFIX}${quoteId}`;

/** État vide normalisé. */
export const emptyProgress = () => ({ done: {}, extras: [], updated_at: null });

// Table absente (migration non appliquée) : on ne réessaie plus de la requêter
// pour ne pas polluer la console à chaque coche.
let remoteDisabled = false;

const isMissingTable = (error) =>
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    /relation .*chantier_progress.* does not exist|could not find the table/i.test(error?.message || '');

/** Deux cartes de coches portent-elles exactement les mêmes clés ? */
const sameKeys = (a = {}, b = {}) => {
    const keysA = Object.keys(a);
    return keysA.length === Object.keys(b).length && keysA.every((k) => k in b);
};

/** Suivi mémorisé sur cet appareil. */
export const loadLocalProgress = (quoteId) => {
    try {
        const raw = localStorage.getItem(localKey(quoteId));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return {
            done: parsed.done || {},
            extras: Array.isArray(parsed.extras) ? parsed.extras : [],
            updated_at: parsed.updated_at || null,
        };
    } catch {
        return null;
    }
};

/** Mémorise le suivi sur cet appareil (jamais bloquant). */
export const saveLocalProgress = (quoteId, progress) => {
    try {
        localStorage.setItem(localKey(quoteId), JSON.stringify(progress));
    } catch { /* quota plein : le suivi distant prend le relais */ }
};

/**
 * Charge le suivi d'un chantier : local et distant fusionnés (union des cases
 * cochées), pour ne jamais perdre une coche faite hors ligne sur un appareil.
 * Si le local était en avance (coches prises sans réseau), la fusion est
 * immédiatement renvoyée au serveur.
 *
 * @returns {Promise<{ progress: object, synced: boolean }>}
 */
export const loadProgress = async (quoteId, userId) => {
    const local = loadLocalProgress(quoteId) || emptyProgress();
    if (remoteDisabled) return { progress: local, synced: false };

    try {
        const { data, error } = await supabase
            .from('chantier_progress')
            .select('done, extras, updated_at')
            .eq('quote_id', quoteId)
            .maybeSingle();

        if (error) {
            if (isMissingTable(error)) remoteDisabled = true;
            return { progress: local, synced: false };
        }

        const remote = data
            ? { done: data.done || {}, extras: data.extras || [], updated_at: data.updated_at }
            : emptyProgress();

        const progress = {
            done: mergeDone(local.done, remote.done),
            extras: mergeExtras(local.extras, remote.extras),
            updated_at: remote.updated_at,
        };

        // Rattrapage : ce qui a été coché hors ligne remonte dès la réouverture.
        const behind = !sameKeys(progress.done, remote.done)
            || progress.extras.length !== mergeExtras(remote.extras, []).length;
        if (behind && userId) await saveProgress(userId, quoteId, progress);

        return { progress, synced: true };
    } catch {
        return { progress: local, synced: false };
    }
};

/**
 * Enregistre le suivi : localStorage immédiatement, Supabase si le réseau
 * répond. L'état complet est réécrit à chaque fois, donc une sauvegarde réussie
 * rattrape toutes les coches faites hors ligne depuis la précédente.
 *
 * @returns {Promise<boolean>} true si la synchronisation distante a réussi.
 */
export const saveProgress = async (userId, quoteId, progress) => {
    const payload = {
        done: progress.done || {},
        extras: progress.extras || [],
        updated_at: new Date().toISOString(),
    };
    saveLocalProgress(quoteId, payload);

    if (!userId || remoteDisabled) return false;

    try {
        const { error } = await supabase
            .from('chantier_progress')
            .upsert({ user_id: userId, quote_id: quoteId, ...payload }, { onConflict: 'user_id,quote_id' });
        if (error) {
            if (isMissingTable(error)) remoteDisabled = true;
            return false;
        }
        return true;
    } catch {
        return false; // hors ligne : la prochaine sauvegarde renverra tout
    }
};

/**
 * Suivi de plusieurs chantiers d'un coup, pour afficher l'avancement dans la
 * liste de sélection sans ouvrir chaque devis.
 *
 * @returns {Promise<Record<string, object>>} quoteId → { done, extras }
 */
export const loadProgressMap = async (quoteIds) => {
    const ids = (quoteIds || []).filter((id) => id != null);
    const map = {};
    ids.forEach((id) => { map[id] = loadLocalProgress(id) || emptyProgress(); });

    if (!ids.length || remoteDisabled) return map;

    try {
        const { data, error } = await supabase
            .from('chantier_progress')
            .select('quote_id, done, extras, updated_at')
            .in('quote_id', ids);
        if (error) {
            if (isMissingTable(error)) remoteDisabled = true;
            return map;
        }
        (data || []).forEach((row) => {
            const local = map[row.quote_id] || emptyProgress();
            map[row.quote_id] = {
                done: mergeDone(local.done, row.done || {}),
                extras: mergeExtras(local.extras, row.extras || []),
                updated_at: row.updated_at,
            };
        });
    } catch { /* hors ligne : on garde le suivi local */ }

    return map;
};
