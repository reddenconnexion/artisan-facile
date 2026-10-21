// Effacer le fichier d'une photo seulement quand plus rien ne l'affiche.
//
// Un même fichier sert souvent plusieurs fois : la visite prédevis le verse
// dans le dossier du client sans second téléversement, le rapport de visite
// le garde, une entrée peut être en double dans le dossier. Supprimer une de
// ces entrées ne doit pas effacer l'image des autres : le fichier ne part
// qu'avec sa dernière référence.

import { supabase } from './supabase';
import { PHOTO_BUCKET, storagePathFromUrl } from './storagePhoto';

/**
 * La photo est-elle encore référencée (dossier client ou rapport) ? En cas
 * d'erreur de lecture, on répond oui : mieux vaut un fichier orphelin
 * qu'une photo perdue.
 * @param {{ userId: string, url: string }} args
 * @returns {Promise<boolean>}
 */
export const isPhotoFileStillUsed = async ({ userId, url }) => {
    const [rows, reports] = await Promise.all([
        supabase
            .from('project_photos')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('photo_url', url),
        supabase
            .from('intervention_reports')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .contains('photos', JSON.stringify([{ url }])),
    ]);
    if (rows.error || reports.error) {
        console.error('Références de la photo illisibles, fichier conservé', rows.error || reports.error);
        return true;
    }
    return (rows.count || 0) + (reports.count || 0) > 0;
};

/**
 * Supprime le fichier de la photo s'il n'est plus utilisé nulle part.
 * À appeler après avoir retiré la référence qu'on supprime.
 * @param {{ userId: string, url: string }} args
 * @returns {Promise<boolean>} true si le fichier a été effacé
 */
export const removePhotoFileIfUnused = async ({ userId, url }) => {
    const path = storagePathFromUrl(url);
    if (!userId || !path) return false;
    if (await isPhotoFileStillUsed({ userId, url })) return false;
    const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    if (error) {
        console.error('Suppression du fichier impossible :', error);
        return false;
    }
    return true;
};
