import { useMemo } from 'react';
import { useProcurementCostByQuote, useSpentHoursByQuote, useUserProfile } from './useDataCache';
import { chantierMarginReports, chantierMarginAlerts, marginAlertThreshold } from '../utils/chantierMargin';

/**
 * Marge réelle des chantiers (devis + avenants signés rapprochés des achats
 * saisis et des heures pointées) et alertes sous le seuil du profil.
 *
 * @param {Array} roots      Devis initiaux des chantiers.
 * @param {Array} linkedRows Avenants (lignes quotes avec parent_quote_id).
 * @returns {{reports: Map, alerts: Array, threshold: number, laborRate: number}}
 */
export const useChantierMargins = (roots, linkedRows) => {
    const procurementCosts = useProcurementCostByQuote();
    const spentHoursMap = useSpentHoursByQuote();
    const { data: profile } = useUserProfile();
    const threshold = marginAlertThreshold(profile);
    const laborRate = parseFloat(profile?.labor_cost_rate) || 0;

    return useMemo(() => {
        const reports = chantierMarginReports({
            roots,
            linkedRows,
            procurementCosts,
            spentHoursMap,
            laborCostRate: laborRate,
            thresholdPct: threshold,
        });
        return { reports, alerts: chantierMarginAlerts(roots, reports), threshold, laborRate };
    }, [roots, linkedRows, procurementCosts, spentHoursMap, laborRate, threshold]);
};
