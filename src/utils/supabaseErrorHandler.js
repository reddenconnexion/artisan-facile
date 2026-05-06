// ──────────────────────────────────────────────────────────────────────────────
// Gestion centralisée des erreurs Supabase / PostgreSQL.
//
// Pourquoi : Supabase remonte des messages techniques en anglais
// ("duplicate key value violates unique constraint", "violates foreign key…")
// qui font peur à l'utilisateur sans l'informer. Cet utilitaire les traduit
// en français lisible ET sûr (aucune fuite d'information interne).
//
// Usage typique :
//
//   import { toastError, getErrorMessage } from '@/utils/supabaseErrorHandler';
//   ...
//   const { error } = await supabase.from('clients').insert(...);
//   if (error) return toastError(error, 'Impossible de créer le client.');
//
// Pour les cas où vous gérez le toast vous-même :
//
//   if (error) {
//     setErrorState(getErrorMessage(error));
//     return;
//   }
// ──────────────────────────────────────────────────────────────────────────────

import { toast } from 'sonner';

// Codes PostgreSQL standards (https://www.postgresql.org/docs/current/errcodes-appendix.html)
const PG_ERROR_MESSAGES = {
    '23505': 'Cette valeur existe déjà.',
    '23503': 'Élément lié manquant — l\'enregistrement référencé n\'existe pas.',
    '23502': 'Champ obligatoire non renseigné.',
    '23514': 'La valeur ne respecte pas les règles attendues.',
    '42501': 'Vous n\'avez pas les permissions nécessaires.',
    '42P01': 'Erreur technique : table introuvable.',
    '42703': 'Erreur technique : champ inconnu.',
    '22P02': 'Format de données invalide.',
    '22001': 'Texte trop long.',
    '40001': 'Conflit de modification — réessayez.',
    '57014': 'Requête interrompue (timeout).',
    'PGRST116': 'Aucun résultat trouvé.',
    'PGRST301': 'Session expirée — veuillez vous reconnecter.',
    'PGRST204': 'Aucune modification effectuée.',
};

// Patterns de messages d'erreur Supabase Auth (l'API renvoie des chaînes, pas des codes)
const AUTH_PATTERNS = [
    { pattern: /invalid login credentials/i,         message: 'Email ou mot de passe incorrect.' },
    { pattern: /email not confirmed/i,               message: 'Veuillez confirmer votre email avant de vous connecter (vérifiez votre boîte mail).' },
    { pattern: /user already registered|already registered/i, message: 'Un compte existe déjà avec cet email.' },
    { pattern: /unable to validate email|valid email/i,        message: 'Adresse email invalide.' },
    { pattern: /password.*at least 6/i,              message: 'Le mot de passe doit contenir au moins 6 caractères.' },
    { pattern: /weak password/i,                     message: 'Mot de passe trop faible — utilisez au moins 8 caractères avec lettres et chiffres.' },
    { pattern: /password.*incorrect/i,               message: 'Mot de passe incorrect.' },
    { pattern: /rate limit/i,                        message: 'Trop de tentatives — patientez quelques minutes avant de réessayer.' },
    { pattern: /jwt expired|invalid.*jwt/i,          message: 'Session expirée — veuillez vous reconnecter.' },
    { pattern: /no rows.*returned|0 rows/i,          message: 'Aucun résultat trouvé.' },
    { pattern: /network|fetch failed|load failed/i,  message: 'Problème de connexion — vérifiez votre internet et réessayez.' },
    { pattern: /signup.*disabled/i,                  message: 'Les inscriptions sont temporairement désactivées.' },
    { pattern: /token.*expired/i,                    message: 'Lien expiré — demandez-en un nouveau.' },
    { pattern: /captcha/i,                           message: 'Vérification anti-bot échouée — réessayez.' },
];

// Contraintes nommées explicitement → message métier
// (utilisé quand le code est 23505 et qu'on peut identifier la contrainte)
const CONSTRAINT_MESSAGES = {
    'clients_user_id_email_key':  'Un client avec cette adresse email existe déjà.',
    'clients_email_key':          'Un client avec cette adresse email existe déjà.',
    'profiles_pkey':              'Profil déjà existant.',
    'profiles_email_key':         'Cet email est déjà utilisé par un autre compte.',
    'quotes_pkey':                'Numéro de devis déjà utilisé.',
    'price_library_pkey':         'Cet article existe déjà dans votre bibliothèque.',
    'rate_limits_pkey':           'Limite de requêtes atteinte — patientez.',
    'push_subscriptions_user_id_endpoint_key': 'Cet appareil est déjà abonné aux notifications.',
};

/**
 * Convertit une erreur en message lisible (français), sans exposer d'infos internes.
 * Toujours sûr à afficher à l'utilisateur final.
 *
 * @param {*} error    L'erreur captée (Supabase, fetch, Error, string)
 * @param {string} fallback Message par défaut si aucun pattern ne matche
 * @returns {string}
 */
export function getErrorMessage(error, fallback = 'Une erreur est survenue. Réessayez ou rafraîchissez la page.') {
    if (!error) return fallback;
    if (typeof error === 'string') return error;

    // Erreur réseau (offline ou timeout)
    if (error.name === 'TypeError' && /fetch|network|load failed/i.test(error.message || '')) {
        return navigator.onLine
            ? 'Problème de connexion au serveur. Réessayez dans un instant.'
            : 'Pas de connexion internet — vos modifications seront synchronisées au retour en ligne.';
    }

    // Code PostgreSQL standard
    if (error.code && PG_ERROR_MESSAGES[error.code]) {
        // Pour les violations d'unicité, on cherche le nom de la contrainte
        if (error.code === '23505') {
            const txt = `${error.details || ''} ${error.message || ''}`;
            const constraint = txt.match(/constraint "([^"]+)"/)?.[1];
            if (constraint && CONSTRAINT_MESSAGES[constraint]) return CONSTRAINT_MESSAGES[constraint];
        }
        return PG_ERROR_MESSAGES[error.code];
    }

    // Patterns sur le message (Supabase Auth, erreurs custom)
    const message = error.message || error.error_description || error.error || '';
    for (const { pattern, message: friendly } of AUTH_PATTERNS) {
        if (pattern.test(message)) return friendly;
    }

    // Statut HTTP
    if (error.status === 429) return 'Trop de requêtes — patientez quelques secondes.';
    if (error.status === 401) return 'Vous devez être connecté pour cette action.';
    if (error.status === 403) return 'Action non autorisée.';
    if (error.status === 404) return 'Élément introuvable.';
    if (error.status >= 500)  return 'Erreur serveur — réessayez dans quelques instants.';

    // Heuristique : message Postgres typique = anglais technique avec underscores ou
    // "violates" / "duplicate" / "permission denied" — on remplace par le fallback.
    if (/violates|duplicate key|permission denied|relation .* does not exist|column .* does not exist/i.test(message)) {
        return fallback;
    }

    // Message déjà français et court → on l'affiche tel quel
    if (message && /^[A-ZÀ-Ü]/.test(message) && message.length < 200 && !/[a-z]_[a-z]/.test(message)) {
        return message;
    }

    return fallback;
}

/**
 * Affiche un toast d'erreur avec message safe + log l'erreur brute en console pour debug.
 * Remplacement direct de `toast.error(error.message)`.
 *
 * @returns {string} Le message affiché (utile si on veut aussi le mettre dans le state)
 */
export function toastError(error, fallback) {
    if (typeof console !== 'undefined') console.error('[Supabase error]', error);
    const message = getErrorMessage(error, fallback);
    toast.error(message);
    return message;
}

/**
 * Wrapper pratique pour les blocs async : log + toast + re-throw optionnel.
 * Utile dans les useMutation onError, par exemple.
 */
export function handleSupabaseError(error, options = {}) {
    const { fallback, rethrow = false, silent = false } = options;
    if (typeof console !== 'undefined') console.error('[Supabase error]', error);
    const message = getErrorMessage(error, fallback);
    if (!silent) toast.error(message);
    if (rethrow) throw new Error(message);
    return message;
}
