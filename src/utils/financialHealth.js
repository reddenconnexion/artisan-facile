// ──────────────────────────────────────────────────────────────────────────────
// Score de santé financière — calculé à partir des devis/factures existants.
//
// 4 métriques notées sur 100, agrégées en un score global :
//
//   1. Délai moyen de paiement      (jours entre facture et règlement)
//   2. Taux d'acceptation des devis (% de devis envoyés acceptés)
//   3. Factures en retard           (% de factures avec valid_until dépassé)
//   4. Croissance du CA             (CA des 30 derniers jours vs 30 jours d'avant)
//
// Le score global est la moyenne arithmétique des sous-scores disponibles
// (un sous-score peut être null si pas assez de données — il est ignoré).
// ──────────────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/* ─── 1. Délai moyen de paiement ─── */
function computePaymentDelay(quotes) {
    const paidInvoices = quotes.filter(q =>
        q.type === 'invoice' && q.status === 'paid' && q.paid_at && q.date,
    );
    if (paidInvoices.length === 0) return { value: null, score: null };

    const delays = paidInvoices.map(q => {
        const diff = new Date(q.paid_at) - new Date(q.date);
        return Math.max(0, diff / DAY_MS);
    });
    const avg = Math.round(delays.reduce((s, d) => s + d, 0) / delays.length);

    let score;
    if      (avg <= 15) score = 100;
    else if (avg <= 30) score = 80;
    else if (avg <= 45) score = 60;
    else if (avg <= 60) score = 40;
    else                score = 20;

    return { value: avg, score };
}

/* ─── 2. Taux d'acceptation ─── */
function computeAcceptance(quotes) {
    const sent = quotes.filter(q =>
        q.type === 'quote' && ['sent', 'accepted', 'rejected', 'paid', 'billed'].includes(q.status),
    );
    if (sent.length === 0) return { value: null, score: null };

    const accepted = sent.filter(q => ['accepted', 'paid', 'billed'].includes(q.status));
    const rate = Math.round((accepted.length / sent.length) * 100);

    let score;
    if      (rate >= 60) score = 100;
    else if (rate >= 40) score = 80;
    else if (rate >= 25) score = 60;
    else if (rate >= 10) score = 40;
    else                 score = 20;

    return { value: rate, score };
}

/* ─── 3. Factures en retard ─── */
function computeOverdue(quotes) {
    const now = new Date();
    const billed = quotes.filter(q =>
        q.type === 'invoice' && ['sent', 'billed'].includes(q.status),
    );
    if (billed.length === 0) return { value: null, score: null, count: 0, total: 0 };

    const overdue = billed.filter(q => q.valid_until && new Date(q.valid_until) < now);
    const rate = Math.round((overdue.length / billed.length) * 100);

    let score;
    if      (rate === 0)  score = 100;
    else if (rate <= 10)  score = 80;
    else if (rate <= 25)  score = 60;
    else if (rate <= 50)  score = 40;
    else                  score = 20;

    return { value: rate, score, count: overdue.length, total: billed.length };
}

/* ─── 4. Croissance du CA ─── */
function computeGrowth(quotes) {
    const now = new Date();
    const t30 = new Date(now.getTime() - 30 * DAY_MS);
    const t60 = new Date(now.getTime() - 60 * DAY_MS);

    const isSigned = q => q.signed_at && q.total_ht;
    const last30 = quotes
        .filter(q => isSigned(q) && new Date(q.signed_at) >= t30)
        .reduce((s, q) => s + Number(q.total_ht || 0), 0);
    const prev30 = quotes
        .filter(q => isSigned(q) && new Date(q.signed_at) >= t60 && new Date(q.signed_at) < t30)
        .reduce((s, q) => s + Number(q.total_ht || 0), 0);

    // Pas assez d'historique : neutre (pas comparable)
    if (prev30 === 0 && last30 === 0) return { value: null, score: null };

    let pct;
    if (prev30 === 0) {
        // Démarrage : on ne pénalise pas, score 80
        return { value: null, score: 80, isNew: true };
    }
    pct = Math.round(((last30 - prev30) / prev30) * 100);

    let score;
    if      (pct >= 20)  score = 100;
    else if (pct >= 0)   score = 80;
    else if (pct >= -10) score = 60;
    else if (pct >= -25) score = 40;
    else                 score = 20;

    return { value: pct, score };
}

/* ─── Conseil contextuel par métrique ─── */
function buildAdvice({ payment, acceptance, overdue, growth }) {
    const advice = [];

    if (payment.score !== null && payment.score < 60) {
        advice.push(
            payment.value > 60
                ? `Délai de paiement : ${payment.value} jours en moyenne — pensez à demander un acompte de 30% à la signature.`
                : `Délai de paiement : ${payment.value} jours en moyenne — relancez les factures à 30 jours.`,
        );
    }
    if (acceptance.score !== null && acceptance.score < 60) {
        advice.push(`${acceptance.value}% de devis acceptés — relancez les devis en attente avec l'onglet Relances.`);
    }
    if (overdue.score !== null && overdue.score < 60) {
        advice.push(
            overdue.count === 1
                ? `1 facture en retard — pensez à la relancer cette semaine.`
                : `${overdue.count} factures en retard sur ${overdue.total} — relancez-les depuis l'onglet Comptabilité.`,
        );
    }
    if (growth.score !== null && growth.score < 60 && !growth.isNew) {
        advice.push(`Chiffre d'affaires en baisse de ${Math.abs(growth.value)}% sur 30 jours — c'est le moment de relancer vos anciens clients.`);
    }

    return advice;
}

/* ─── Calcul global ─── */
export function computeFinancialHealth(quotes) {
    if (!quotes || quotes.length === 0) {
        return { score: null, hasData: false, breakdown: [], advice: [] };
    }

    const payment    = computePaymentDelay(quotes);
    const acceptance = computeAcceptance(quotes);
    const overdue    = computeOverdue(quotes);
    const growth     = computeGrowth(quotes);

    const subScores = [payment.score, acceptance.score, overdue.score, growth.score]
        .filter(s => s !== null);

    const score = subScores.length > 0
        ? Math.round(subScores.reduce((s, x) => s + x, 0) / subScores.length)
        : null;

    const breakdown = [
        {
            id: 'payment',
            label: 'Délai de paiement',
            value: payment.value !== null ? `${payment.value} j` : null,
            score: payment.score,
        },
        {
            id: 'acceptance',
            label: 'Devis acceptés',
            value: acceptance.value !== null ? `${acceptance.value} %` : null,
            score: acceptance.score,
        },
        {
            id: 'overdue',
            label: 'Factures en retard',
            value: overdue.total > 0 ? `${overdue.count} / ${overdue.total}` : null,
            score: overdue.score,
        },
        {
            id: 'growth',
            label: 'Croissance CA',
            value: growth.value !== null
                ? `${growth.value >= 0 ? '+' : ''}${growth.value} %`
                : (growth.isNew ? 'Démarrage' : null),
            score: growth.score,
        },
    ];

    return {
        score,
        hasData: subScores.length > 0,
        breakdown,
        advice: buildAdvice({ payment, acceptance, overdue, growth }),
    };
}

/* ─── Couleur d'un score (0-100) ─── */
export function scoreColor(score) {
    if (score === null || score === undefined) return { hex: '#9ca3af', text: 'text-gray-500' };
    if (score >= 80) return { hex: '#10b981', text: 'text-green-600 dark:text-green-400' };
    if (score >= 60) return { hex: '#3b82f6', text: 'text-blue-600 dark:text-blue-400' };
    if (score >= 40) return { hex: '#f59e0b', text: 'text-amber-600 dark:text-amber-400' };
    return                  { hex: '#ef4444', text: 'text-red-600 dark:text-red-400' };
}

/* ─── Libellé qualitatif ─── */
export function scoreLabel(score) {
    if (score === null || score === undefined) return 'En attente';
    if (score >= 85) return 'Excellent';
    if (score >= 70) return 'Très bon';
    if (score >= 55) return 'Correct';
    if (score >= 40) return 'À surveiller';
    return                'Vigilance';
}
