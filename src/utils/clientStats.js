// Indicateurs d'un client (fiche client) : ce qu'il a rapporté, ce qu'il
// doit encore, les devis qui attendent sa réponse et sa rapidité de paiement.
// Logique pure : mêmes règles que la comptabilité (CA encaissé) et que les
// relances (factures impayées), pour que les chiffres concordent partout.

import { isCountedPaidDoc, paidQuoteIdSet } from './chantierMargin';
import { idsBilledByChildren, invoiceReminderStatus, isUnpaidInvoice } from './unpaidInvoices';

const DAY_MS = 24 * 60 * 60 * 1000;

const amount = (doc) => parseFloat(doc?.total_ttc) || 0;

const SIGNED_STATUSES = ['accepted', 'billed', 'paid'];
const REFUSED_STATUSES = ['refused', 'rejected'];

/**
 * @param {object[]} docs  devis, factures, avoirs et avenants du client
 * @param {Date} [today]
 */
export const computeClientStats = (docs, today = new Date()) => {
    const list = Array.isArray(docs) ? docs.filter(Boolean) : [];

    // Encaissé : documents payés, sans compter deux fois une facture dont le
    // devis parent est lui-même marqué payé (cf. Comptabilité).
    const paidQuoteIds = paidQuoteIdSet(list);
    const paidDocs = list.filter(d => isCountedPaidDoc(d, paidQuoteIds));
    const paidTotal = paidDocs.reduce((sum, d) => sum + amount(d), 0);

    // Reste à encaisser : factures émises non réglées, hors factures déjà
    // facturées par leurs factures d'acompte / de situation (cf. relances).
    const billedByChildren = idsBilledByChildren(list);
    const unpaid = list.filter(d => isUnpaidInvoice(d) && !billedByChildren.has(d.id));
    const unpaidTotal = unpaid.reduce((sum, d) => sum + amount(d), 0);
    const overdue = unpaid.filter(d => invoiceReminderStatus(d, today));

    // Devis envoyés sans réponse (les devis archivés sont abandonnés).
    const quotes = list.filter(d => (d.type || 'quote') === 'quote');
    const pendingQuotes = quotes.filter(d => d.status === 'sent' && !d.archived_at);
    const pendingQuotesTotal = pendingQuotes.reduce((sum, d) => sum + amount(d), 0);

    // Taux de signature, sur les seuls devis tranchés (signés ou refusés).
    const signed = quotes.filter(d => SIGNED_STATUSES.includes(d.status) || d.signed_at).length;
    const refused = quotes.filter(d => REFUSED_STATUSES.includes(d.status) && !d.signed_at).length;
    const decided = signed + refused;

    // Délai de paiement : de la date de facture à l'encaissement. Un
    // règlement reçu avant la facture (paiement sur place) compte pour 0 jour.
    const delays = list
        .filter(d => d.type === 'invoice' && d.status === 'paid' && d.paid_at && d.date)
        .map(d => Math.max(0, Math.round((new Date(d.paid_at) - new Date(d.date)) / DAY_MS)))
        .filter(n => Number.isFinite(n));
    const avgPaymentDays = delays.length > 0
        ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length)
        : null;

    const dates = list
        .map(d => new Date(d.date || d.created_at))
        .filter(d => !Number.isNaN(d.getTime()))
        .sort((a, b) => a - b);

    return {
        paidTotal,
        paidCount: paidDocs.length,
        unpaidTotal,
        unpaidCount: unpaid.length,
        overdueCount: overdue.length,
        overdueTotal: overdue.reduce((sum, d) => sum + amount(d), 0),
        pendingQuotesTotal,
        pendingQuotesCount: pendingQuotes.length,
        signedCount: signed,
        decidedCount: decided,
        signatureRate: decided > 0 ? signed / decided : null,
        avgPaymentDays,
        paymentSamples: delays.length,
        firstDocDate: dates[0] || null,
        lastDocDate: dates[dates.length - 1] || null,
        docCount: list.length,
    };
};
