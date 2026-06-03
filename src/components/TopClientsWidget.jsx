import React, { useMemo, useState } from 'react';
import { Trophy, ChevronRight, ChevronDown, ExternalLink } from 'lucide-react';
import { startOfYear, format } from 'date-fns';
import { fr } from 'date-fns/locale';

const fmtEur = (v) =>
    v >= 10000 ? `${(v / 1000).toFixed(0)} k€`
    : v >= 1000 ? `${(v / 1000).toFixed(1)} k€`
    : `${Math.round(v)} €`;

const fmtEurFull = (v) => `${Math.round(v).toLocaleString('fr-FR')} €`;

const PODIUM_STYLES = [
    { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
    { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300' },
    { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300' },
];

const docLabel = (type) => {
    const t = (type || 'quote').toLowerCase();
    if (t === 'invoice') return 'FAC';
    if (t === 'amendment') return 'AVT';
    return 'DEV';
};

const TopClientsWidget = ({ allQuotes, navigate }) => {
    const [expandedId, setExpandedId] = useState(null);

    const top = useMemo(() => {
        const yearStart = startOfYear(new Date());
        const QUALIFYING = ['paid', 'billed', 'accepted'];
        // Parent documents (sans parent_id) already retained : leurs factures enfants
        // (acomptes / facture de clôture) ne doivent pas être réajoutées, sinon
        // l'affaire est comptée plusieurs fois.
        const countedParentIds = new Set(
            allQuotes
                .filter(q => !q.parent_id && QUALIFYING.includes(q.status))
                .map(q => q.id)
        );
        const tally = new Map();
        for (const q of allQuotes) {
            if (!QUALIFYING.includes(q.status)) continue;
            const type = (q.type || 'quote').toLowerCase();
            if (type === 'invoice' && q.parent_id && countedParentIds.has(q.parent_id)) continue;
            const d = new Date(q.date || q.created_at);
            if (d < yearStart) continue;
            const id = q.client_id;
            if (!id) continue;
            const name = q.clients?.name || 'Client inconnu';
            const amount = parseFloat(q.total_ttc) || 0;
            if (amount <= 0) continue;
            const prev = tally.get(id) ?? { id, name, total: 0, count: 0, docs: [] };
            prev.total += amount;
            prev.count += 1;
            prev.docs.push({
                id: q.id,
                type,
                quoteNumber: q.quote_number,
                title: q.title,
                status: q.status,
                date: d,
                amount,
            });
            tally.set(id, prev);
        }
        for (const c of tally.values()) {
            c.docs.sort((a, b) => b.date - a.date);
        }
        return [...tally.values()].sort((a, b) => b.total - a.total).slice(0, 3);
    }, [allQuotes]);

    if (top.length === 0) return null;

    return (
        <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-gray-200/70 dark:border-white/10 shadow-sm overflow-hidden">
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
                    const isOpen = expandedId === client.id;
                    return (
                        <div key={client.id}>
                            <button
                                onClick={() => setExpandedId(isOpen ? null : client.id)}
                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                                aria-expanded={isOpen}
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
                                <ChevronDown
                                    size={14}
                                    className={`flex-shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                                />
                            </button>
                            {isOpen && (
                                <div className="px-4 pb-3 pt-1 bg-gray-50/60 dark:bg-gray-800/30">
                                    <ul className="space-y-1.5 mb-2">
                                        {client.docs.map((doc) => (
                                            <li key={doc.id} className="flex items-center gap-2 text-xs">
                                                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                                                    {docLabel(doc.type)}{doc.quoteNumber ? ` #${doc.quoteNumber}` : ''}
                                                </span>
                                                <span className="flex-1 min-w-0 truncate text-gray-700 dark:text-gray-300">
                                                    {doc.title || 'Sans titre'}
                                                </span>
                                                <span className="text-gray-400 text-[10px] flex-shrink-0">
                                                    {format(doc.date, 'd MMM', { locale: fr })}
                                                </span>
                                                <span className="font-semibold text-gray-800 dark:text-gray-200 flex-shrink-0 tabular-nums">
                                                    {fmtEurFull(doc.amount)}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                            Total : {fmtEurFull(client.total)}
                                        </span>
                                        <button
                                            onClick={() => navigate(`/app/clients/${client.id}`)}
                                            className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"
                                        >
                                            Fiche client <ExternalLink size={11} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default TopClientsWidget;
