/**
 * Issue d'un envoi de mail par l'Edge Function `send-document-email`.
 *
 *   - 'sent'    : le serveur confirme l'envoi ;
 *   - 'failed'  : le serveur répond une erreur lisible (SMTP refusé,
 *                 configuration incomplète…) — le mail n'est pas parti ;
 *   - 'unknown' : pas de réponse exploitable (connexion coupée, réponse
 *                 illisible d'une passerelle). Le mail a pu partir : il ne
 *                 faut ni crier à l'échec, ni rouvrir la messagerie pour un
 *                 second envoi sans vérifier.
 *
 * @param {{ ok?: boolean, result?: { success?: boolean, error?: string } | null, networkError?: boolean }} r
 * @returns {'sent' | 'failed' | 'unknown'}
 */
export const classifyEmailSendResponse = ({ ok, result, networkError } = {}) => {
    if (networkError) return 'unknown';
    if (ok && result?.success) return 'sent';
    if (!ok && typeof result?.error === 'string' && result.error) return 'failed';
    return 'unknown';
};

// Marge sur l'horodatage : l'heure du téléphone et celle du serveur
// peuvent différer de quelques dizaines de secondes.
export const EMAIL_SEND_CLOCK_MARGIN_MS = 2 * 60 * 1000;
