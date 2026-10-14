// ──────────────────────────────────────────────────────────────────────────────
// « Ce que l'appli m'a rapporté » — bilan calculé à partir des devis/factures.
//
//   • CA récupéré grâce aux relances : devis signés après ≥ 1 relance.
//   • Relances envoyées              : somme de follow_up_count.
//   • Temps gagné (estimation)       : minutes forfaitaires par action automatisée.
//
// Les forfaits de temps sont des estimations prudentes, affichées comme telles.
// ──────────────────────────────────────────────────────────────────────────────

export const MINUTES_PER_FOLLOW_UP = 5;
export const MINUTES_PER_DOCUMENT = 15;

const SIGNED_STATUSES = ['accepted', 'billed', 'paid'];
const amountOf = (q) => parseFloat(q.total_ht) || parseFloat(q.total_ttc) || 0;

/**
 * @param {Array} quotes devis + factures de l'utilisateur
 * @param {Date} [now]   date de référence
 * @returns {{ hasData: boolean, recoveredRevenue: number, recoveredCount: number,
 *            followUps: number, documents: number, minutesSaved: number,
 *            hoursSaved: number, signedThisYear: number }}
 */
export function computeAppValue(quotes, now = new Date()) {
    const list = Array.isArray(quotes) ? quotes : [];
    const year = now.getFullYear();

    let recoveredRevenue = 0;
    let recoveredCount = 0;
    let followUps = 0;
    let documents = 0;
    let signedThisYear = 0;

    for (const q of list) {
        if (q.status === 'cancelled') continue;
        if (q.status !== 'draft') documents += 1;

        const count = Number(q.follow_up_count) || 0;
        followUps += count;

        if (q.type === 'invoice') continue;
        const isSigned = SIGNED_STATUSES.includes(q.status) || !!q.signed_at;
        if (!isSigned) continue;

        const when = new Date(q.signed_at || q.date || q.created_at);
        if (!Number.isNaN(when.getTime()) && when.getFullYear() === year) {
            signedThisYear += 1;
            if (count > 0) {
                recoveredRevenue += amountOf(q);
                recoveredCount += 1;
            }
        }
    }

    const minutesSaved = followUps * MINUTES_PER_FOLLOW_UP + documents * MINUTES_PER_DOCUMENT;
    return {
        hasData: documents > 0,
        recoveredRevenue: Math.round(recoveredRevenue),
        recoveredCount,
        followUps,
        documents,
        minutesSaved,
        hoursSaved: Math.round(minutesSaved / 60),
        signedThisYear,
    };
}
