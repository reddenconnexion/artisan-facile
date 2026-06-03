import { supabase } from './supabase';

/**
 * Gestion du quota de stockage (Storage Supabase partagé entre tous les comptes).
 *
 * La source de vérité est la base : la RPC `storage_quota_status` calcule
 * l'usage réel du compte (somme des tailles de ses objets) et le plafond selon
 * son plan — impossible à fausser depuis le client. Côté front on se contente
 * d'afficher l'usage et de bloquer un upload qui dépasserait le plafond.
 */

export const formatBytes = (bytes) => {
    const b = Number(bytes) || 0;
    if (b >= 1024 * 1024 * 1024) return `${(b / (1024 * 1024 * 1024)).toFixed(1)} Go`;
    if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(0)} Mo`;
    if (b >= 1024) return `${(b / 1024).toFixed(0)} Ko`;
    return `${b} o`;
};

/**
 * Récupère le statut quota du compte courant.
 * @param {number} addBytes - Octets qu'on s'apprête à ajouter (0 pour un simple affichage)
 * @returns {Promise<{used: number, cap: number, plan: string, allowed: boolean, ratio: number}|null>}
 */
export const getQuotaStatus = async (addBytes = 0) => {
    const { data, error } = await supabase.rpc('storage_quota_status', { p_add: Math.max(0, Math.round(addBytes)) });
    if (error) {
        console.warn('storage_quota_status failed', error);
        return null; // fail-open : on n'empêche pas l'utilisateur de travailler
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    const used = Number(row.used_bytes) || 0;
    const cap = Number(row.cap_bytes) || 0;
    return {
        used,
        cap,
        plan: row.plan || 'free',
        allowed: !!row.allowed,
        ratio: cap > 0 ? used / cap : 0,
    };
};

/**
 * Lève une erreur explicite si l'ajout de `addBytes` dépasse le plafond du compte.
 * À appeler avant un upload. En cas d'échec de la RPC, ne bloque pas (fail-open).
 * @param {number} addBytes
 */
export const assertWithinQuota = async (addBytes = 0) => {
    const status = await getQuotaStatus(addBytes);
    if (!status) return;
    if (!status.allowed) {
        throw new Error(
            `Espace de stockage plein (${formatBytes(status.used)} / ${formatBytes(status.cap)}). ` +
            `Supprimez d'anciennes photos ou passez à une offre supérieure pour continuer.`,
        );
    }
};

/**
 * Stats globales du projet (tous comptes) — réservé au plan 'owner'.
 * Renvoie null si l'utilisateur n'y a pas droit ou en cas d'erreur.
 * @returns {Promise<{total: number, files: number, quota: number, ratio: number}|null>}
 */
export const getGlobalStorage = async () => {
    const { data, error } = await supabase.rpc('global_storage_stats');
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    const total = Number(row.total_bytes) || 0;
    const quota = Number(row.quota_bytes) || 0;
    return { total, files: Number(row.file_count) || 0, quota, ratio: quota > 0 ? total / quota : 0 };
};
