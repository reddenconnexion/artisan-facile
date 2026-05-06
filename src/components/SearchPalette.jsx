import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Users, FileText, ClipboardList, X } from 'lucide-react';
import { useClients, useQuotes, useInterventionReports } from '../hooks/useDataCache';

/* ─── Limites par catégorie pour éviter de surcharger ─── */
const PER_CATEGORY = 6;

/* ─── Normalise une chaîne pour la recherche (insensible accents/casse) ─── */
const normalize = (s) =>
    (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/* ─── Highlight des matchs dans le résultat ─── */
const Highlight = ({ text, query }) => {
    if (!text || !query) return text || null;
    const nText = normalize(text);
    const nQuery = normalize(query);
    const idx = nText.indexOf(nQuery);
    if (idx === -1) return text;
    return (
        <>
            {text.slice(0, idx)}
            <span className="bg-yellow-100 dark:bg-yellow-900/40 text-yellow-900 dark:text-yellow-200 font-semibold rounded-sm">
                {text.slice(idx, idx + nQuery.length)}
            </span>
            {text.slice(idx + nQuery.length)}
        </>
    );
};

/* ─── Une ligne de résultat ─── */
const ResultItem = ({ item, isActive, onSelect, onMouseEnter }) => {
    const ref = useRef(null);

    // Auto-scroll lorsque la sélection clavier sort du viewport
    useEffect(() => {
        if (isActive && ref.current) {
            ref.current.scrollIntoView({ block: 'nearest' });
        }
    }, [isActive]);

    const Icon = item.icon;
    return (
        <button
            ref={ref}
            type="button"
            onClick={onSelect}
            onMouseEnter={onMouseEnter}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                isActive
                    ? 'bg-blue-50 dark:bg-blue-900/30'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
            }`}
        >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${item.iconBg}`}>
                <Icon className={`w-4 h-4 ${item.iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {item.primaryNode || item.primary}
                </p>
                {item.secondary && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {item.secondaryNode || item.secondary}
                    </p>
                )}
            </div>
            {item.badge && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${item.badgeColor}`}>
                    {item.badge}
                </span>
            )}
        </button>
    );
};

/* ─── Section de résultats (Clients / Devis / Rapports) ─── */
const ResultGroup = ({ label, items, activeId, onSelect, onHover }) => {
    if (!items.length) return null;
    return (
        <div className="py-1.5">
            <p className="px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {label}
            </p>
            {items.map(item => (
                <ResultItem
                    key={item.key}
                    item={item}
                    isActive={item.key === activeId}
                    onSelect={() => onSelect(item)}
                    onMouseEnter={() => onHover(item.key)}
                />
            ))}
        </div>
    );
};

/* ══════════════════════════════════════════════════════════════════════════════
   SearchPalette — modal Cmd+K / Ctrl+K
══════════════════════════════════════════════════════════════════════════════ */
const SearchPalette = ({ isOpen, onClose }) => {
    const navigate = useNavigate();
    const inputRef = useRef(null);

    const { data: clients = [] }  = useClients();
    const { data: quotes  = [] }  = useQuotes();
    const { data: reports = [] }  = useInterventionReports();

    const [query, setQuery]           = useState('');
    const [activeKey, setActiveKey]   = useState(null);

    // Focus + reset à l'ouverture
    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setActiveKey(null);
            const t = setTimeout(() => inputRef.current?.focus(), 30);
            return () => clearTimeout(t);
        }
    }, [isOpen]);

    /* ── Filtrage des résultats ── */
    const results = useMemo(() => {
        const q = normalize(query.trim());
        if (!q) return { clients: [], quotes: [], reports: [] };

        const matchClients = clients
            .filter(c =>
                normalize(c.name).includes(q) ||
                normalize(c.email).includes(q) ||
                normalize(c.phone).includes(q) ||
                normalize(c.city).includes(q) ||
                normalize(c.address).includes(q),
            )
            .slice(0, PER_CATEGORY)
            .map(c => ({
                key:        `client-${c.id}`,
                type:       'client',
                primary:    c.name,
                primaryNode: <Highlight text={c.name} query={query} />,
                secondary:  [c.city, c.phone, c.email].filter(Boolean).join(' · '),
                icon:       Users,
                iconBg:     'bg-blue-100 dark:bg-blue-900/40',
                iconColor:  'text-blue-600 dark:text-blue-400',
                href:       `/app/clients/${c.id}`,
            }));

        const matchQuotes = quotes
            .filter(qu =>
                normalize(qu.title).includes(q) ||
                normalize(qu.client_name).includes(q) ||
                String(qu.quote_number || '').includes(q.replace(/\s/g, '')) ||
                String(qu.id).includes(q.replace(/\s/g, '')),
            )
            .slice(0, PER_CATEGORY)
            .map(qu => {
                const isInvoice = qu.type === 'invoice';
                const ref       = qu.quote_number ? `N°${qu.quote_number}` : `#${qu.id}`;
                const label     = qu.title || (isInvoice ? 'Facture' : 'Devis');
                const dateStr   = qu.date ? new Date(qu.date).toLocaleDateString('fr-FR') : '';
                return {
                    key:        `quote-${qu.id}`,
                    type:       'quote',
                    primary:    label,
                    primaryNode: <Highlight text={label} query={query} />,
                    secondary:  [ref, qu.client_name, dateStr].filter(Boolean).join(' · '),
                    icon:       FileText,
                    iconBg:     isInvoice ? 'bg-purple-100 dark:bg-purple-900/40' : 'bg-amber-100 dark:bg-amber-900/40',
                    iconColor:  isInvoice ? 'text-purple-600 dark:text-purple-400' : 'text-amber-600 dark:text-amber-400',
                    href:       `/app/devis/${qu.id}`,
                    badge:      isInvoice ? 'Facture' : 'Devis',
                    badgeColor: isInvoice ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
                };
            });

        const matchReports = reports
            .filter(r =>
                normalize(r.title).includes(q) ||
                normalize(r.description).includes(q) ||
                normalize(r.work_done).includes(q) ||
                String(r.report_number || '').includes(q.replace(/\s/g, '')),
            )
            .slice(0, PER_CATEGORY)
            .map(r => ({
                key:        `report-${r.id}`,
                type:       'report',
                primary:    r.title || `Rapport #${r.report_number || r.id}`,
                primaryNode: <Highlight text={r.title || `Rapport #${r.report_number || r.id}`} query={query} />,
                secondary:  [r.report_number && `N°${r.report_number}`, r.date && new Date(r.date).toLocaleDateString('fr-FR')].filter(Boolean).join(' · '),
                icon:       ClipboardList,
                iconBg:     'bg-orange-100 dark:bg-orange-900/40',
                iconColor:  'text-orange-600 dark:text-orange-400',
                href:       `/app/interventions/${r.id}`,
            }));

        return { clients: matchClients, quotes: matchQuotes, reports: matchReports };
    }, [query, clients, quotes, reports]);

    /* ── Liste plate pour la navigation clavier ── */
    const flatItems = useMemo(
        () => [...results.clients, ...results.quotes, ...results.reports],
        [results],
    );

    // Active item par défaut = premier résultat
    useEffect(() => {
        if (flatItems.length === 0) {
            setActiveKey(null);
        } else if (!flatItems.some(i => i.key === activeKey)) {
            setActiveKey(flatItems[0].key);
        }
    }, [flatItems, activeKey]);

    const handleSelect = useCallback((item) => {
        navigate(item.href);
        onClose();
    }, [navigate, onClose]);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
            return;
        }
        if (flatItems.length === 0) return;

        const currentIdx = flatItems.findIndex(i => i.key === activeKey);
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const next = (currentIdx + 1) % flatItems.length;
            setActiveKey(flatItems[next].key);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = currentIdx <= 0 ? flatItems.length - 1 : currentIdx - 1;
            setActiveKey(flatItems[prev].key);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const target = flatItems[currentIdx >= 0 ? currentIdx : 0];
            if (target) handleSelect(target);
        }
    }, [flatItems, activeKey, handleSelect, onClose]);

    if (!isOpen) return null;

    const totalResults = flatItems.length;
    const hasQuery = !!query.trim();

    return (
        <div
            onClick={onClose}
            className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 pt-[10vh] sm:pt-[15vh]"
        >
            <div
                onClick={e => e.stopPropagation()}
                className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
                role="dialog"
                aria-label="Recherche globale"
            >
                {/* Champ de recherche */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                    <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Rechercher un client, un devis, un rapport…"
                        className="flex-1 bg-transparent border-0 outline-none text-base text-gray-900 dark:text-white placeholder-gray-400"
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                            className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                            title="Effacer"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                    <kbd className="hidden sm:inline-flex text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded font-mono">
                        Esc
                    </kbd>
                </div>

                {/* Résultats */}
                <div className="flex-1 overflow-y-auto">
                    {!hasQuery ? (
                        <div className="p-8 text-center text-gray-400 dark:text-gray-500">
                            <Search className="w-8 h-8 mx-auto mb-3 text-gray-300 dark:text-gray-700" />
                            <p className="text-sm">Tapez pour chercher dans vos clients, devis et rapports.</p>
                        </div>
                    ) : totalResults === 0 ? (
                        <div className="p-8 text-center">
                            <p className="text-gray-500 dark:text-gray-400 text-sm">
                                Aucun résultat pour <span className="font-semibold text-gray-700 dark:text-gray-300">"{query}"</span>
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                                Essayez avec une autre orthographe ou un nom plus court.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                            <ResultGroup
                                label="Clients"
                                items={results.clients}
                                activeId={activeKey}
                                onSelect={handleSelect}
                                onHover={setActiveKey}
                            />
                            <ResultGroup
                                label="Devis & Factures"
                                items={results.quotes}
                                activeId={activeKey}
                                onSelect={handleSelect}
                                onHover={setActiveKey}
                            />
                            <ResultGroup
                                label="Rapports d'intervention"
                                items={results.reports}
                                activeId={activeKey}
                                onSelect={handleSelect}
                                onHover={setActiveKey}
                            />
                        </div>
                    )}
                </div>

                {/* Footer avec aide clavier */}
                {hasQuery && totalResults > 0 && (
                    <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-4 text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0">
                        <span className="flex items-center gap-1">
                            <kbd className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono">↑</kbd>
                            <kbd className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono">↓</kbd>
                            naviguer
                        </span>
                        <span className="flex items-center gap-1">
                            <kbd className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono">↵</kbd>
                            ouvrir
                        </span>
                        <span className="ml-auto">
                            {totalResults} résultat{totalResults > 1 ? 's' : ''}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SearchPalette;
