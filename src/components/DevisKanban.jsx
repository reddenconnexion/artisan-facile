import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, AlertCircle, CheckCircle, Eye, EyeOff, PenTool } from 'lucide-react';

const COLS = [
    {
        id:       'draft',
        label:    'Brouillon',
        statuses: ['draft'],
        accent:   'border-gray-300 dark:border-gray-700',
        header:   'bg-gray-50 dark:bg-gray-800/60',
        badge:    'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
        dot:      'bg-gray-400',
    },
    {
        id:       'sent',
        label:    'Envoyé',
        statuses: ['sent'],
        accent:   'border-blue-300 dark:border-blue-800',
        header:   'bg-blue-50 dark:bg-blue-900/20',
        badge:    'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
        dot:      'bg-blue-500',
    },
    {
        id:       'accepted',
        label:    'Signé',
        statuses: ['accepted', 'signed'],
        accent:   'border-green-300 dark:border-green-800',
        header:   'bg-green-50 dark:bg-green-900/20',
        badge:    'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
        dot:      'bg-green-500',
    },
    {
        id:       'billed',
        label:    'Facturé',
        statuses: ['billed'],
        accent:   'border-purple-300 dark:border-purple-800',
        header:   'bg-purple-50 dark:bg-purple-900/20',
        badge:    'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
        dot:      'bg-purple-500',
    },
    {
        id:       'paid',
        label:    'Payé',
        statuses: ['paid'],
        accent:   'border-emerald-300 dark:border-emerald-800',
        header:   'bg-emerald-50 dark:bg-emerald-900/20',
        badge:    'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
        dot:      'bg-emerald-500',
    },
];

const fmt = (n) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);

const isExpiringSoon = (d) => {
    if (!['sent', 'draft'].includes(d.status) || !d.valid_until) return false;
    const days = Math.ceil((new Date(d.valid_until) - new Date()) / 86400000);
    return days >= 0 && days <= 7;
};

const isExpired = (d) => {
    if (!['sent', 'draft'].includes(d.status) || !d.valid_until) return false;
    return new Date(d.valid_until) < new Date();
};

const KanbanCard = ({ devis, onClick }) => {
    const expiring = isExpiringSoon(devis);
    const expired  = isExpired(devis);

    return (
        <button
            onClick={onClick}
            className={`w-full text-left bg-white dark:bg-gray-900 rounded-lg border p-3 shadow-sm hover:shadow-md transition-shadow group ${
                expired  ? 'border-red-300 dark:border-red-800' :
                expiring ? 'border-orange-300 dark:border-orange-700' :
                           'border-gray-100 dark:border-gray-800'
            }`}
        >
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 truncate">
                {devis.client_name || '—'}
            </p>
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate mt-0.5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {devis.title || `Devis #${devis.quote_number || devis.id}`}
            </p>

            <div className="flex items-center justify-between mt-2 gap-2">
                <span className="text-sm font-bold text-gray-800 dark:text-gray-100">
                    {fmt(devis.total_ttc)}
                </span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    {devis.status === 'sent' && (
                        devis.last_viewed_at
                            ? <Eye className="w-3 h-3 text-blue-500" title="Lu par le client" />
                            : <EyeOff className="w-3 h-3 text-gray-300 dark:text-gray-600" title="Non lu" />
                    )}
                    {devis.signed_at && (
                        <PenTool className="w-3 h-3 text-green-500" title="Signé" />
                    )}
                    {expired && (
                        <span className="text-[10px] font-semibold text-red-500 bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 rounded-full">
                            Expiré
                        </span>
                    )}
                    {!expired && expiring && (
                        <span className="text-[10px] font-semibold text-orange-500 bg-orange-50 dark:bg-orange-900/30 px-1.5 py-0.5 rounded-full">
                            Expire bientôt
                        </span>
                    )}
                </div>
            </div>

            {devis.date && (
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">
                    {new Date(devis.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                </p>
            )}
        </button>
    );
};

const KanbanColumn = ({ col, items, navigate }) => {
    const total = items.reduce((s, d) => s + (d.total_ttc || 0), 0);

    return (
        <div className={`flex flex-col min-w-[220px] w-[220px] sm:w-auto sm:flex-1 rounded-xl border-2 ${col.accent} overflow-hidden`}>
            {/* Column header */}
            <div className={`${col.header} px-3 py-2.5 flex items-center justify-between gap-2 flex-shrink-0`}>
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${col.dot}`} />
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide">
                        {col.label}
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    {items.length > 0 && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${col.badge}`}>
                            {items.length}
                        </span>
                    )}
                </div>
            </div>

            {/* Amount total */}
            {items.length > 0 && (
                <div className={`${col.header} px-3 pb-2 -mt-1 flex-shrink-0`}>
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                        {fmt(total)}
                    </span>
                </div>
            )}

            {/* Cards */}
            <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[120px] max-h-[calc(100vh-260px)]">
                {items.length === 0 ? (
                    <div className="flex items-center justify-center h-16 text-xs text-gray-300 dark:text-gray-700 italic">
                        Vide
                    </div>
                ) : (
                    items.map(d => (
                        <KanbanCard
                            key={d.id}
                            devis={d}
                            onClick={() => navigate(`/app/devis/${d.id}`)}
                        />
                    ))
                )}
            </div>
        </div>
    );
};

const DevisKanban = ({ devis, searchTerm }) => {
    const navigate = useNavigate();

    const normalize = (s) =>
        (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    const filtered = useMemo(() => {
        const q = normalize(searchTerm);
        if (!q) return devis;
        return devis.filter(d =>
            normalize(d.client_name).includes(q) ||
            normalize(d.title).includes(q) ||
            String(d.quote_number || '').includes(q) ||
            String(d.id).includes(q)
        );
    }, [devis, searchTerm]);

    const byCol = useMemo(() => {
        const map = {};
        for (const col of COLS) map[col.id] = [];
        for (const d of filtered) {
            const col = COLS.find(c => c.statuses.includes(d.status));
            if (col) map[col.id].push(d);
        }
        for (const col of COLS) {
            map[col.id].sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at));
        }
        return map;
    }, [filtered]);

    return (
        <div className="flex gap-3 overflow-x-auto pb-4 sm:grid sm:grid-cols-5 sm:overflow-visible">
            {COLS.map(col => (
                <KanbanColumn
                    key={col.id}
                    col={col}
                    items={byCol[col.id] || []}
                    navigate={navigate}
                />
            ))}
        </div>
    );
};

export default DevisKanban;
