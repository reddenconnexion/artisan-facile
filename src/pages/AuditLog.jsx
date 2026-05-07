import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
    Shield, FileText, FileCheck, Trash2, PenLine, Euro, ArrowLeft,
    User, Loader2, Filter, Search, Calendar, AlertCircle,
} from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { toastError } from '../utils/supabaseErrorHandler';

/* ─── Métadonnées par type d'action ─── */
const ACTION_META = {
    'quote.created':         { label: 'Devis créé',          icon: FileText,   bg: 'bg-blue-50 dark:bg-blue-900/20',     color: 'text-blue-600 dark:text-blue-400' },
    'quote.deleted':         { label: 'Devis supprimé',      icon: Trash2,     bg: 'bg-red-50 dark:bg-red-900/20',       color: 'text-red-600 dark:text-red-400'   },
    'quote.signed':          { label: 'Devis signé',         icon: PenLine,    bg: 'bg-green-50 dark:bg-green-900/20',   color: 'text-green-600 dark:text-green-400'},
    'quote.status_changed':  { label: 'Statut modifié',      icon: ArrowLeft,  bg: 'bg-amber-50 dark:bg-amber-900/20',   color: 'text-amber-600 dark:text-amber-400'},
    'quote.amount_changed':  { label: 'Montant modifié',     icon: Euro,       bg: 'bg-orange-50 dark:bg-orange-900/20', color: 'text-orange-600 dark:text-orange-400'},
    'invoice.created':       { label: 'Facture créée',       icon: FileText,   bg: 'bg-purple-50 dark:bg-purple-900/20', color: 'text-purple-600 dark:text-purple-400'},
    'invoice.paid':          { label: 'Facture payée',       icon: FileCheck,  bg: 'bg-emerald-50 dark:bg-emerald-900/20',color: 'text-emerald-600 dark:text-emerald-400'},
    'invoice.deleted':       { label: 'Facture supprimée',   icon: Trash2,     bg: 'bg-red-50 dark:bg-red-900/20',       color: 'text-red-600 dark:text-red-400'   },
    'client.deleted':        { label: 'Client supprimé',     icon: User,       bg: 'bg-rose-50 dark:bg-rose-900/20',     color: 'text-rose-600 dark:text-rose-400' },
};

const FILTER_GROUPS = [
    { id: 'all',         label: 'Tous',         actions: null },
    { id: 'signatures',  label: 'Signatures',   actions: ['quote.signed'] },
    { id: 'payments',    label: 'Paiements',    actions: ['invoice.paid'] },
    { id: 'deletions',   label: 'Suppressions', actions: ['quote.deleted', 'invoice.deleted', 'client.deleted'] },
    { id: 'amounts',     label: 'Montants',     actions: ['quote.amount_changed'] },
];

/* ─── Formatage des détails contextuels ─── */
function formatDetails(action, details) {
    if (!details || typeof details !== 'object') return null;
    const fmt = (n) => Number(n).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

    switch (action) {
        case 'quote.signed':
            return [`Signé pour ${details.total_ttc ? fmt(details.total_ttc) : '—'}`];
        case 'invoice.paid':
            return [
                details.payment_method && `Mode : ${details.payment_method}`,
                details.total_ttc && `Montant : ${fmt(details.total_ttc)}`,
            ].filter(Boolean);
        case 'quote.status_changed':
            return [`${details.from || '—'} → ${details.to || '—'}`];
        case 'quote.amount_changed': {
            const arrow = details.delta_pct >= 0 ? '↗' : '↘';
            return [
                `${fmt(details.from_ttc)} → ${fmt(details.to_ttc)}`,
                details.delta_pct != null && `${arrow} ${details.delta_pct > 0 ? '+' : ''}${details.delta_pct}%`,
            ].filter(Boolean);
        }
        case 'quote.created':
        case 'invoice.created':
            return details.total_ttc ? [`Montant : ${fmt(details.total_ttc)}`] : null;
        case 'quote.deleted':
        case 'invoice.deleted':
            return [
                details.client_name && `Client : ${details.client_name}`,
                details.total_ttc && `Montant : ${fmt(details.total_ttc)}`,
            ].filter(Boolean);
        case 'client.deleted':
            return [
                details.email && `Email : ${details.email}`,
                details.city && `Ville : ${details.city}`,
            ].filter(Boolean);
        default:
            return null;
    }
}

/* ─── Format relatif (il y a X) ─── */
function relativeTime(dateStr) {
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60)            return "à l'instant";
    if (sec < 3600)          return `il y a ${Math.floor(sec / 60)} min`;
    if (sec < 86400)         return `il y a ${Math.floor(sec / 3600)} h`;
    if (sec < 7 * 86400)     return `il y a ${Math.floor(sec / 86400)} j`;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ─── Une ligne du journal ─── */
const LogEntry = ({ entry }) => {
    const meta    = ACTION_META[entry.action] || { label: entry.action, icon: AlertCircle, bg: 'bg-gray-50 dark:bg-gray-800', color: 'text-gray-600 dark:text-gray-400' };
    const Icon    = meta.icon;
    const details = formatDetails(entry.action, entry.details);
    const dateFull = new Date(entry.created_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

    const linkHref = entry.entity_id && (entry.entity_type === 'quote' || entry.entity_type === 'invoice')
        ? `/app/devis/${entry.entity_id}`
        : null;

    const Wrapper = linkHref ? Link : 'div';
    const wrapperProps = linkHref ? { to: linkHref } : {};

    return (
        <Wrapper
            {...wrapperProps}
            className={`group flex items-start gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0 ${
                linkHref ? 'hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer' : ''
            } transition-colors`}
        >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                <Icon className={`w-4 h-4 ${meta.color}`} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{meta.label}</span>
                    {entry.entity_label && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            · {entry.entity_label}
                        </span>
                    )}
                </div>
                {details && details.length > 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                        {details.join(' · ')}
                    </p>
                )}
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5" title={dateFull}>
                    {relativeTime(entry.created_at)}
                </p>
            </div>
        </Wrapper>
    );
};

/* ══════════════════════════════════════════════════════════════════════════════
   Page principale
══════════════════════════════════════════════════════════════════════════════ */
const AuditLog = () => {
    const { user } = useAuth();
    const [logs, setLogs]       = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter]   = useState('all');
    const [search, setSearch]   = useState('');

    useEffect(() => {
        if (!user) return;
        (async () => {
            try {
                setLoading(true);
                const { data, error } = await supabase
                    .from('audit_logs')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(500);
                if (error) throw error;
                setLogs(data || []);
            } catch (err) {
                toastError(err, 'Impossible de charger le journal d\'audit');
            } finally {
                setLoading(false);
            }
        })();
    }, [user]);

    const filtered = useMemo(() => {
        const group = FILTER_GROUPS.find(g => g.id === filter);
        const allowedActions = group?.actions;
        const q = search.trim().toLowerCase();

        return logs.filter(entry => {
            if (allowedActions && !allowedActions.includes(entry.action)) return false;
            if (q) {
                const haystack = [entry.entity_label, entry.action, JSON.stringify(entry.details || {})]
                    .filter(Boolean).join(' ').toLowerCase();
                if (!haystack.includes(q)) return false;
            }
            return true;
        });
    }, [logs, filter, search]);

    const counts = useMemo(() => ({
        all: logs.length,
        signatures: logs.filter(l => l.action === 'quote.signed').length,
        payments:   logs.filter(l => l.action === 'invoice.paid').length,
        deletions:  logs.filter(l => ['quote.deleted', 'invoice.deleted', 'client.deleted'].includes(l.action)).length,
        amounts:    logs.filter(l => l.action === 'quote.amount_changed').length,
    }), [logs]);

    return (
        <div className="max-w-4xl mx-auto space-y-5">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Shield className="w-7 h-7 text-blue-600" />
                    Journal d'audit
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Historique automatique des actions sensibles : signatures, paiements, suppressions et modifications de montant.
                    Utile en cas de litige client ou pour récupérer des informations supprimées.
                </p>
            </div>

            {/* Filtres + recherche */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Rechercher dans le journal…"
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg overflow-x-auto">
                    {FILTER_GROUPS.map(g => {
                        const active = filter === g.id;
                        const count = counts[g.id] ?? 0;
                        return (
                            <button
                                key={g.id}
                                onClick={() => setFilter(g.id)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                                    active
                                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                }`}
                            >
                                {g.label}
                                {count > 0 && (
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                        active ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                    }`}>
                                        {count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Liste */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-16 px-6">
                        <Shield className="w-10 h-10 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                            {logs.length === 0 ? 'Aucune action enregistrée' : 'Aucun résultat'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-md mx-auto">
                            {logs.length === 0
                                ? 'Le journal commencera à s\'alimenter automatiquement dès qu\'un événement sensible se produira (signature, paiement, suppression…).'
                                : 'Essayez avec un autre filtre ou une autre recherche.'}
                        </p>
                    </div>
                ) : (
                    <>
                        {filtered.map(entry => (
                            <LogEntry key={entry.id} entry={entry} />
                        ))}
                        {logs.length === 500 && (
                            <p className="text-center text-[11px] text-gray-400 dark:text-gray-500 py-3 border-t border-gray-100 dark:border-gray-800">
                                Affichage limité aux 500 entrées les plus récentes.
                            </p>
                        )}
                    </>
                )}
            </div>

            {/* Note de bas de page */}
            <div className="flex items-start gap-2 text-xs text-gray-400 dark:text-gray-500 px-1">
                <Filter className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                    Les entrées sont créées automatiquement par la base de données via des triggers. Elles ne peuvent
                    pas être modifiées ni supprimées par l'application — preuve d'intégrité en cas de litige.
                </p>
            </div>
        </div>
    );
};

export default AuditLog;
