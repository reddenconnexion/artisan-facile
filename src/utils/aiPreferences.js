import { supabase } from './supabase';

/**
 * Fusionne `patch` dans profiles.ai_preferences sans écraser les autres clés.
 *
 * Le profil lu via get_my_profile_safe a des clés retirées (référence Vault de
 * la clé API IA…) : réécrire ai_preferences à partir de lui les perdrait. On
 * relit donc la ligne brute (RLS : le propriétaire seul) avant d'écrire.
 *
 * @param {string} userId
 * @param {object} patch Clés à ajouter / remplacer.
 * @returns {Promise<object>} Les préférences enregistrées.
 */
export async function mergeAiPreferences(userId, patch) {
    const { data, error: readError } = await supabase
        .from('profiles')
        .select('ai_preferences')
        .eq('id', userId)
        .single();
    if (readError) throw readError;
    const next = { ...(data?.ai_preferences || {}), ...patch };
    const { error } = await supabase.from('profiles').update({ ai_preferences: next }).eq('id', userId);
    if (error) throw error;
    return next;
}
