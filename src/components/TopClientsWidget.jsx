import React, { useMemo } from 'react';
import { Trophy, ChevronRight, Users } from 'lucide-react';
import { startOfYear } from 'date-fns';

const fmtEur = (v) =>
    v >= 10000 ? `${(v / 1000).toFixed(0)} k€`
    : v >= 1000 ? `${(v / 1000).toFixed(1)} k€`
    : `${Math.round(v)} €`;

const PODIUM_STYLES = [
    { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
    { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300' },
    { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300' },
];

const TopClientsWidget = ({ allQuotes, navigate }) => {
    const top = useMemo(() => {
        const yearStart = startOfYear(new Date());
        const tally = new Map();
        for (const q of allQuotes) {
            if (!['paid', 'billed', 'accepted'].includes(q.status)) continue;
            const d = new Date(q.date || q.created_at);
            if (d < yearStart) continue;
            const id = q.client_id;
            if (!id) continue;
            const name = q.clients?.name || 'Client inconnu';
            const amount = parseFloat(q.total_ttc) || 0;
            if (amount <= 0) continue;
            const prev = tally.get(id) ?? { id, name, total: 0, count: 0 };
            prev.total += amount;
            prev.count += 1;
            tally.set(id, prev);
        }
        return [...tally.values()].sort((a, b) => b.total - a.total).slice(0, 3);
    }, [allQuotes]);

    if (top.length === 0) return null;

    return (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <Trophy size={15} className="text-amber-500" />
                    Top clients de l'année
                </h3>
                <button
                    onClick={() => navigate('/app/clients')}
                    className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
                >
                    Voir tous <ChevronRight size={12} />
                </button>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
                {top.map((client, i) => {
                    const style = PODIUM_STYLES[i] ?? PODIUM_STYLES[2];
                    return (
                        <button
                            key={client.id}
                            onClick={() => navigate(`/app/clients/${client.id}`)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                        >
                            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${style.bg} ${style.text}`}>
                                {i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                    {client.name}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {client.count} document{client.count > 1 ? 's' : ''}
                                </div>
                            </div>
                            <div className="text-sm font-bold text-gray-800 dark:text-gray-200 flex-shrink-0">
                                {fmtEur(client.total)}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default TopClientsWidget;
