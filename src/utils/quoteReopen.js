/**
 * Devis rouvert par le client après sa date de validité.
 *
 * Un client qui revient consulter un devis expiré (page du lien public ou
 * e-mail d'envoi/relance) signale que le projet redevient d'actualité : c'est
 * le bon moment pour le relancer par e-mail et proposer de réactualiser le
 * devis. Ce signal passe avant la séquence de relances classique, et vaut même
 * quand cette séquence est terminée ou que le devis a été archivé entre-temps.
 */

/** Étape de relance proposée pour un devis rouvert après expiration. */
export const REOPENED_AFTER_EXPIRY_STEP = {
    label: 'Devis rouvert après expiration',
    context: "Le client vient de rouvrir le devis alors que sa date de validité est dépassée : saisir ce regain d'intérêt, proposer de réactualiser le devis (prix, planning) et d'en parler rapidement.",
};

const toDate = (value) => {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Fin (exclue) du jour de validité : `valid_until` est une date sans heure, le
 * devis reste valable toute la journée. Une consultation ce jour-là ne compte
 * donc pas comme une réouverture après expiration.
 */
const expiryInstant = (validUntil) => {
    if (!validUntil) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(validUntil));
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1);
};

/**
 * Date de la réouverture après expiration qui appelle une relance, ou null.
 *
 * @param {object} quote - devis (status, type, valid_until, last_viewed_at, last_followup_at, archived_at)
 * @param {Date|string|null} [lastEmailOpenAt] - dernière ouverture humaine d'un e-mail lié au devis
 * @returns {Date|null}
 */
export const reopenedAfterExpiryAt = (quote, lastEmailOpenAt = null) => {
    if (!quote || quote.type === 'invoice') return null;
    // Seuls les devis encore en attente de réponse : signé, refusé ou annulé,
    // il n'y a plus rien à relancer.
    if ((quote.status || '').toLowerCase() !== 'sent') return null;

    const expiry = expiryInstant(quote.valid_until);
    if (!expiry) return null;

    const opens = [toDate(quote.last_viewed_at), toDate(lastEmailOpenAt)].filter(Boolean);
    if (opens.length === 0) return null;
    const reopenedAt = new Date(Math.max(...opens.map(d => d.getTime())));
    if (reopenedAt < expiry) return null;

    // Déjà relancé depuis cette réouverture : rien de plus à faire.
    const lastFollowUp = toDate(quote.last_followup_at);
    if (lastFollowUp && lastFollowUp >= reopenedAt) return null;

    // Archivé après la réouverture : l'artisan a déjà tranché.
    const archivedAt = toDate(quote.archived_at);
    if (archivedAt && archivedAt >= reopenedAt) return null;

    return reopenedAt;
};
