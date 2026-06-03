import React, { useMemo } from 'react';
import { AlertTriangle, ChevronRight, FileText, Clock } from 'lucide-react';
import { differenceInDays, format } from 'date-fns';
import { fr } from 'date-fns/locale';

const ExpiringQuotesWidget = ({ allQuotes, navigate }) => {
    const expiring = useMemo(() => {
        const now = new Date();
        const list = [];
        for (const q of allQuotes) {
            if (q.type === 'invoice') continue;
            if (!['draft', 'sent'].includes(q.status)) continue;
            if (q.archived_at) continue;
            if (!q.valid_until) continue;
            const validUntil = new Date(q.valid_until);
            if (Number.isNaN(validUntil.getTime())) continue;
            const daysLeft = differenceInDays(validUntil, now);
            // Devis qui expirent dans les 7 jours, ou expirés depuis ≤ 7 jours
            if (daysLeft >= -7 && daysLeft <= 7) {
                list.push({ ...q, validUntil, daysLeft });
            }
        }
        return list
            .sort((a, b) => a.daysLeft - b.daysLeft)
            .slice(0, 5);
    }, [allQuotes]);

    if (expiring.length === 0) return null;

    return (
        <div className="bg-amber-50 dark:bg-amber-900/10 rounded-2xl border border-amber-200 dark:border-amber-700/40 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-amber-200/60 dark:border-amber-700/30">
                <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-2">
                    <AlertTriangle size={15} className="text-amber-600" />
                    Devis à relancer rapidement
                </h3>
                <button
                    onClick={() => navigate('/app/devis')}
                    className="text-xs text-amber-700 dark:text-amber-300 hover:text-amber-900 flex items-center gap-0.5 font-medium"
                >
                    Voir tous <ChevronRight size={12} />
                </button>
            </div>
            <div className="divide-y divide-amber-100 dark:divide-amber-800/30">
                {expiring.map((q) => {
                    const isExpired = q.daysLeft < 0;
                    const label = isExpired
                        ? `Expiré depuis ${Math.abs(q.daysLeft)} j`
                        : q.daysLeft === 0 ? 'Expire aujourd\'hui'
                        : `Expire dans ${q.daysLeft} j`;
                    return (
                        <button
                            key={q.id}
                            onClick={() => navigate(`/app/devis/${q.id}`)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-amber-100/50 dark:hover:bg-amber-900/20 transition-colors text-left"
                        >
                            <FileText className="w-4 h-4 text-amber-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                    {q.clients?.name || q.title || `Devis #${q.id}`}
                                </div>
                                <div className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                                    <Clock className="w-3 h-3" />
                                    <span className={isExpired ? 'font-semibold' : ''}>{label}</span>
                                    <span className="text-amber-600/60">
                                        · valide jusqu'au {format(q.validUntil, 'dd MMM', { locale: fr })}
                                    </span>
                                </div>
                            </div>
                            <span className="text-sm font-bold text-gray-800 dark:text-gray-200 flex-shrink-0">
                                {(parseFloat(q.total_ttc) || 0).toFixed(0)} €
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default ExpiringQuotesWidget;
