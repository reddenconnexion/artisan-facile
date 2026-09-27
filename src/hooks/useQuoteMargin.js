import { useState, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import { useProcurementCostByQuote, useSpentHoursByQuote } from './useDataCache';
import { signedAmendments } from '../utils/materialDeposit';
import { quoteMarginSummary } from '../utils/chantierMargin';

/**
 * Marges affichées sur la fiche devis (DevisForm) : prévue, réalisée et
 * consolidée du chantier — calcul délégué à quoteMarginSummary
 * (utils/chantierMargin.js), l'agrégateur unique « marge chantier ».
 *
 * Coûts d'achat réels (« Matériel à commander ») et heures pointées
 * (task_tracking) agrégés par devis — lecture seule, le devis n'est jamais
 * modifié.
 *
 * @param {object} p
 * @param {string} p.id                   Id du devis (route).
 * @param {object} p.formData
 * @param {number} p.subtotal             Total HT vendu.
 * @param {number|string} p.laborCostRate Coût horaire de revient (profil).
 * @returns {{laborRate, planned, realized, chantier, loadChantierDocs}}
 */
export const useQuoteMargin = ({ id, formData, subtotal, laborCostRate }) => {
    const procurementCosts = useProcurementCostByQuote();
    const spentHoursMap = useSpentHoursByQuote();
    // Devis initial + avenants signés du même chantier (id + lignes + total HT
    // de chacun), pour la marge réalisée CONSOLIDÉE — null tant qu'il n'y a
    // pas au moins un avenant signé (sinon identique à la marge par document).
    const [chantierDocs, setChantierDocs] = useState(null);

    // Appelé au chargement du devis, avec la ligne `quotes` lue en base.
    const loadChantierDocs = useCallback(async (data) => {
        // Marge réalisée CONSOLIDÉE du chantier (devis initial + avenants
        // signés) : voir docs/analyse-marge-avenants.md, Piste 2. Les coûts
        // réels s'accumulent le plus souvent sur le seul devis initial alors
        // que le CA est réparti entre lui et ses avenants — sans effet sur
        // les factures, qui ne facturent qu'une part du chantier.
        if (data.type !== 'invoice') {
            const chantierRootId = data.type === 'amendment' && data.parent_quote_id
                ? data.parent_quote_id
                : data.id;
            const { data: chantierRows } = await supabase
                .from('quotes')
                .select('id, type, status, items, total_ht')
                .or(`id.eq.${chantierRootId},parent_quote_id.eq.${chantierRootId}`);

            const rootRow = (chantierRows || []).find((r) => r.id === chantierRootId);
            const amendmentRows = (chantierRows || []).filter((r) => r.id !== chantierRootId);
            const signed = signedAmendments(amendmentRows);

            setChantierDocs(rootRow && signed.length > 0
                ? [
                    { id: rootRow.id, items: rootRow.items, total_ht: rootRow.total_ht },
                    ...signed.map((a) => ({ id: a.id, items: a.items, total_ht: a.total_ht })),
                ]
                : null);
        } else {
            setChantierDocs(null);
        }
    }, []);

    const summary = quoteMarginSummary({
        id,
        doc: formData,
        subtotal,
        laborCostRate,
        procurementCosts,
        spentHoursMap,
        chantierDocs,
    });

    return { ...summary, loadChantierDocs };
};
