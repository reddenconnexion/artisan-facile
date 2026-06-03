import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, ChevronRight, Info } from 'lucide-react';

const fmt = (n) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);

/**
 * Widget trésorerie prédictive à 90 jours.
 * Agrège les devis/factures par bucket temporel pour estimer les encaissements futurs.
 *
 * Buckets :
 *   En retard   — factures `billed` dont l'échéance est dépassée
 *   Ce mois     — factures `billed` dues dans les 30 jours
 *   Mois +1     — devis `accepted` non encore facturés (travaux récents = facturation prochaine)
 *   Pipeline    — devis `sent` (probabilité ~50 %)
 */
const CashFlowForecast = ({ allQuotes, navigate }) => {
    const nav = navigate || useNavigate();

    const buckets = useMemo(() => {
        const now = new Date();
        const in30  = new Date(now); in30.setDate(now.getDate() + 30);
        const in60  = new Date(now); in60.setDate(now.getDate() + 60);

        let overdue  = 0; // billed + échéance dépassée
        let thisMonth = 0; // billed + dû dans 30j
        let toInvoice = 0; // accepted (pas encore facturés)
        let pipeline  = 0; // sent (évalué à 50%)

        for (const q of allQuotes) {
            if (q.type === 'invoice' && q.status === 'billed') {
                const due = q.valid_until ? new Date(q.valid_until) : in30;
                if (due < now)   overdue   += (q.total_ttc || 0);
                else if (due <= in30) thisMonth += (q.total_ttc || 0);
                else              toInvoice += (q.total_ttc || 0) * 0.5; // in 30-60j
            } else if (q.status === 'accepted' && q.type !== 'invoice') {
                // Devis accepté non encore converti en facture
                toInvoice += (q.total_ttc || 0);
            } else if (q.status === 'sent' && q.type !== 'invoice') {
                pipeline  += (q.total_ttc || 0) * 0.5;
            }
        }

        return [
            {
                key: 'overdue',
                label: 'En retard',
                sublabel: 'Factures échues',
                amount: overdue,
                color: 'text-red-600 dark:text-red-400',
                bg: 'bg-red-50 dark:bg-red-900/20',
                bar: 'bg-red-400',
                href: '/app/devis?filter=billed',
                urgent: true,
            },
            {
                key: 'thisMonth',
                label: '30 jours',
                sublabel: 'Factures à encaisser',
                amount: thisMonth,
                color: 'text-purple-600 dark:text-purple-400',
                bg: 'bg-purple-50 dark:bg-purple-900/20',
                bar: 'bg-purple-400',
                href: '/app/devis',
            },
            {
                key: 'toInvoice',
                label: '60 jours',
                sublabel: 'Devis signés à facturer',
                amount: toInvoice,
                color: 'text-blue-600 dark:text-blue-400',
                bg: 'bg-blue-50 dark:bg-blue-900/20',
                bar: 'bg-blue-400',
                href: '/app/devis',
            },
            {
                key: 'pipeline',
                label: '90 jours',
                sublabel: 'Pipeline en cours (×50%)',
                amount: pipeline,
                color: 'text-gray-500 dark:text-gray-400',
                bg: 'bg-gray-50 dark:bg-gray-800/60',
                bar: 'bg-gray-300 dark:bg-gray-600',
                href: '/app/devis',
            },
        ];
    }, [allQuotes]);

    const maxAmount = Math.max(...buckets.map(b => b.amount), 1);
    const totalPotential = buckets.reduce((s, b) => s + b.amount, 0);

    if (totalPotential === 0) return null;

    return (
        <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-gray-200/70 dark:border-white/10 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <TrendingUp size={15} className="text-green-500" />
                    Trésorerie prévisionnelle
                </h3>
                <div className="flex items-center gap-2">
                    <span
                        title="Estimation basée sur vos devis et factures en cours. Les montants du pipeline sont pondérés à 50%."
                        className="text-gray-300 dark:text-gray-600 hover:text-gray-500 cursor-help"
                    >
                        <Info size={13} />
                    </span>
                    <button
                        onClick={() => nav('/app/devis')}
                        className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
                    >
                        Voir tout <ChevronRight size={12} />
                    </button>
                </div>
            </div>

            <div className="p-4 space-y-3">
                {/* Total potentiel */}
                <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                        {fmt(totalPotential)}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">attendus dans 90 jours</span>
                </div>

                {/* Barres par bucket */}
                <div className="space-y-2.5">
                    {buckets.map(bucket => (
                        bucket.amount > 0 && (
                            <button
                                key={bucket.key}
                                onClick={() => nav(bucket.href)}
                                className={`w-full rounded-lg p-3 text-left transition-opacity hover:opacity-80 ${bucket.bg}`}
                            >
                                <div className="flex items-center justify-between mb-1.5">
                                    <div>
                                        <span className={`text-xs font-bold ${bucket.color}`}>
                                            {bucket.label}
                                        </span>
                                        {bucket.urgent && (
                                            <span className="ml-2 text-[10px] font-bold bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded-full">
                                                Urgent
                                            </span>
                                        )}
                                        <p className="text-[11px] text-gray-400 dark:text-gray-500">
                                            {bucket.sublabel}
                                        </p>
                                    </div>
                                    <span className={`text-sm font-bold ${bucket.color}`}>
                                        {fmt(bucket.amount)}
                                    </span>
                                </div>
                                {/* Barre de progression */}
                                <div className="h-1.5 bg-white/60 dark:bg-gray-700/40 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-700 ${bucket.bar}`}
                                        style={{ width: `${Math.max((bucket.amount / maxAmount) * 100, 4)}%` }}
                                    />
                                </div>
                            </button>
                        )
                    ))}
                </div>

                <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                    Estimation basée sur vos factures en attente et devis signés. Le pipeline est pondéré à 50 %.
                </p>
            </div>
        </div>
    );
};

export default CashFlowForecast;
