// Redresser une photo déjà enregistrée.
//
// Le fichier d'origine n'est jamais écrasé : le bucket n'autorise pas la
// réécriture, et une URL inchangée resterait servie depuis le cache avec
// l'ancienne orientation. On dépose donc une version tournée à côté, puis on
// fait pointer vers elle tout ce qui référence la photo : les lignes du
// dossier client (`project_photos`) et les rapports d'intervention. Sans ce
// second point, un rapport de visite réenregistré reverserait l'ancienne
// version, de travers, dans le dossier du client.
//
// L'ancien fichier reste en place : d'autres documents (archives de visite,
// devis envoyés) peuvent encore pointer dessus.

import { supabase } from './supabase';
import { assertWithinQuota } from './storageQuota';
import { rotateImageBlob, normalizeQuarterTurn } from './imageRotation';
import { PHOTO_BUCKET, fetchStoredPhoto, storagePathFromUrl } from './storagePhoto';

const BUCKET = PHOTO_BUCKET;

/** Emplacement de la version tournée : même dossier que l'original. */
export const rotatedPhotoPath = (originalPath, userId, id) => {
    const slash = originalPath ? originalPath.lastIndexOf('/') : -1;
    const dir = slash > 0 ? originalPath.slice(0, slash) : `${userId}/rotations`;
    return `${dir}/${id}.jpg`;
};

/**
 * Remplace, dans la liste de photos d'un rapport, l'ancienne URL par la
 * nouvelle. Renvoie null si le rapport ne contient pas cette photo.
 */
export const replacePhotoInList = (photos, oldUrl, next) => {
    if (!Array.isArray(photos)) return null;
    let found = false;
    const updated = photos.map((p) => {
        if (p?.url !== oldUrl) return p;
        found = true;
        return { ...p, url: next.url, path: next.path };
    });
    return found ? updated : null;
};

/**
 * Tourne une photo enregistrée et met à jour ses références.
 * @param {object} args
 * @param {string} args.userId
 * @param {string} args.url - URL publique actuelle de la photo
 * @param {number} args.rotation - degrés, sens horaire (90, 180, 270)
 * @returns {Promise<{ url: string, path: string, rows: object[] }>} la
 *   nouvelle photo et les lignes `project_photos` recréées
 */
export const rotateSavedPhoto = async ({ userId, url, rotation }) => {
    const turn = normalizeQuarterTurn(rotation);
    if (!userId || !url || !turn) throw new Error('Rotation invalide');

    const original = await fetchStoredPhoto(url);
    const rotated = await rotateImageBlob(original, turn);
    await assertWithinQuota(rotated.size);

    const path = rotatedPhotoPath(storagePathFromUrl(url), userId, crypto.randomUUID());
    const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, rotated, { contentType: 'image/jpeg' });
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);

    // Dossier client : la table n'a pas de politique RLS UPDATE, on recrée
    // donc chaque ligne avec la nouvelle URL puis on supprime l'ancienne
    // (même stratégie que le déplacement de colonne dans ProjectPhotos).
    const { data: oldRows, error: lookupError } = await supabase
        .from('project_photos')
        .select('*')
        .eq('user_id', userId)
        .eq('photo_url', url);
    if (lookupError) throw lookupError;

    let rows = [];
    if (oldRows?.length) {
        const copies = oldRows.map(row => ({
            user_id: row.user_id,
            client_id: row.client_id,
            project_id: row.project_id,
            category: row.category,
            description: row.description,
            created_at: row.created_at,
            photo_url: publicUrl,
        }));
        const { data: inserted, error: insertError } = await supabase
            .from('project_photos')
            .insert(copies)
            .select();
        if (insertError) throw insertError;
        rows = inserted || [];
        const { error: deleteError } = await supabase
            .from('project_photos')
            .delete()
            .in('id', oldRows.map(r => r.id));
        if (deleteError) console.error('Rotation : ancienne ligne non supprimée', deleteError);
    }

    // Rapports d'intervention qui contiennent cette photo.
    const { data: reports, error: reportsError } = await supabase
        .from('intervention_reports')
        .select('id, photos')
        .eq('user_id', userId)
        .contains('photos', JSON.stringify([{ url }]));
    if (reportsError) {
        console.error('Rotation : rapports non mis à jour', reportsError);
    } else {
        for (const report of reports || []) {
            const photos = replacePhotoInList(report.photos, url, { url: publicUrl, path });
            if (!photos) continue;
            const { error } = await supabase
                .from('intervention_reports')
                .update({ photos })
                .eq('id', report.id);
            if (error) console.error('Rotation : rapport non mis à jour', report.id, error);
        }
    }

    return { url: publicUrl, path, rows };
};
