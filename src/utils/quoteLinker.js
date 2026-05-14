import { supabase } from './supabase';

/**
 * Détecte les paires devis ⇄ facture probablement liées mais sans `parent_id` en base.
 *
 * Critères de matching (greedy, chaque facture appariée une seule fois) :
 *   - Devis : type !== 'invoice', status === 'accepted', pas de facture liée
 *   - Facture : type === 'invoice', parent_id null, même client_id
 *   - Montant TTC identique ou écart relatif ≤ 2 %
 *   - Date facture postérieure (ou égale) à date devis
 *   - Écart ≤ 180 jours
 *
 * Confiance :
 *   - high  : montant exact (<1 cent) ET écart ≤ 60 j
 *   - medium: montant exact OU écart ≤ 90 j
 *   - low   : reste (écart > 90 j et/ou montant approchant à 2 %)
 *
 * @param {Array} devisList — liste complète des devis + factures du user
 * @returns {Array<{ quote, invoice, confidence, daysDiff, amountDiff }>}
 */
export const findUnlinkedPairs = (devisList) => {
    if (!Array.isArray(devisList) || devisList.length === 0) return [];

    // Devis déjà liés à au moins une facture (parent_id renseigné)
    const alreadyLinkedQuoteIds = new Set(
        devisList
            .filter(d => d.type === 'invoice' && d.parent_id)
            .map(d => String(d.parent_id)),
    );

    const acceptedQuotes = devisList
        .filter(d =>
            d.type !== 'invoice' &&
            d.status === 'accepted' &&
            d.client_id &&
            !alreadyLinkedQuoteIds.has(String(d.id)),
        )
        .sort((a, b) => new Date(a.date || a.created_at) - new Date(b.date || b.created_at));

    const unlinkedInvoices = devisList.filter(d =>
        d.type === 'invoice' && !d.parent_id && d.client_id,
    );

    const usedInvoiceIds = new Set();
    const pairs = [];

    for (const quote of acceptedQuotes) {
        const quoteDate = new Date(quote.date || quote.created_at);
        const quoteAmount = parseFloat(quote.total_ttc) || 0;
        if (quoteAmount === 0) continue;

        const candidates = [];
        for (const inv of unlinkedInvoices) {
            if (usedInvoiceIds.has(inv.id)) continue;
            if (String(inv.client_id) !== String(quote.client_id)) continue;

            const invDate = new Date(inv.date || inv.created_at);
            if (invDate < quoteDate) continue;

            const daysDiff = (invDate - quoteDate) / 86400000;
            if (daysDiff > 180) continue;

            const invAmount = parseFloat(inv.total_ttc) || 0;
            if (invAmount === 0) continue;

            const amountDiff = Math.abs(invAmount - quoteAmount);
            const relDiff = amountDiff / quoteAmount;
            if (relDiff > 0.02) continue;

            candidates.push({ inv, daysDiff, amountDiff, relDiff });
        }

        if (candidates.length === 0) continue;

        // Tri : montant le plus proche, puis date la plus proche
        candidates.sort((a, b) => a.amountDiff - b.amountDiff || a.daysDiff - b.daysDiff);
        const best = candidates[0];
        usedInvoiceIds.add(best.inv.id);

        let confidence = 'low';
        const exactAmount = best.amountDiff < 0.01;
        if (exactAmount && best.daysDiff <= 60) confidence = 'high';
        else if (exactAmount || best.daysDiff <= 90) confidence = 'medium';

        pairs.push({
            quote,
            invoice: best.inv,
            confidence,
            daysDiff: best.daysDiff,
            amountDiff: best.amountDiff,
        });
    }

    return pairs;
};

/**
 * Met à jour `parent_id` d'une facture pour la rattacher à son devis source.
 */
export const linkInvoiceToQuote = async (invoiceId, quoteId) => {
    const { error } = await supabase
        .from('quotes')
        .update({ parent_id: parseInt(quoteId, 10) })
        .eq('id', invoiceId);
    if (error) throw error;
    return true;
};
