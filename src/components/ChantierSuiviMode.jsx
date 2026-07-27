import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
    ArrowLeft, Search, X, Loader2, CheckSquare, Square, FileText, ExternalLink,
    Package, Wrench, Plus, Trash2, Eye, EyeOff, Phone, MapPin, ClipboardCheck,
    CloudOff, Check, RotateCcw, AlertTriangle, StickyNote, ChevronDown,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchWorksites, WORKSITE_STAGE_MAP } from '../utils/worksites';
import { formatQuantity } from '../utils/quoteInternalDetail';
import {
    checklistSections, progressStats, isLineDone, toggleLine, toggleComponent,
    setAll, lineMatches,
} from '../utils/chantierProgress';
import { loadProgress, loadProgressMap, saveProgress, emptyProgress } from '../utils/chantierProgressStore';

// ─── Helpers d'affichage ──────────────────────────────────────────────────────

const euros = (value, decimals = 2) =>
    (Number(value) || 0).toLocaleString('fr-FR', {
        style: 'currency', currency: 'EUR',
        minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    });

const percent = (ratio) => Math.round((Number(ratio) || 0) * 100);

const quoteLabel = (q) => q?.title?.trim() || `Devis #${q?.quote_number || q?.id}`;

const FILTERS = [
    { id: 'all', label: 'Tout' },
    { id: 'todo', label: 'À faire' },
    { id: 'done', label: 'Fait' },
    { id: 'options', label: 'Options' },
];

// ─── Barre de progression ─────────────────────────────────────────────────────

const ProgressBar = ({ ratio, className = '' }) => (
    <div className={`h-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden ${className}`}>
        <div
            className={`h-full rounded-full transition-all duration-300 ${percent(ratio) === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
            style={{ width: `${Math.min(100, percent(ratio))}%` }}
        />
    </div>
);

// ─── Mode « Suivi de chantier » ───────────────────────────────────────────────
//
// Le devis en poche : ce qui est prévu, ce qui ne l'est pas (options, hors
// devis), et ce qui est déjà fait. Tout est cochable au doigt et enregistré
// hors ligne, pour ne plus imprimer le devis avant de partir sur le chantier.

const ChantierSuiviMode = ({ onBack }) => {
    const navigate = useNavigate();
    const { user } = useAuth();

    // ── Liste des chantiers ───────────────────────────────────────────────────
    const [loading, setLoading] = useState(true);
    const [worksites, setWorksites] = useState([]);
    const [progressMap, setProgressMap] = useState({});
    const [siteQuery, setSiteQuery] = useState('');

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const { worksites: list } = await fetchWorksites();
                if (!active) return;
                setWorksites(list);
                const map = await loadProgressMap(list.map((q) => q.id));
                if (active) setProgressMap(map);
            } catch (err) {
                console.error('Chargement des chantiers :', err);
                if (active) toast.error('Impossible de charger les chantiers');
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, []);

    // ── Chantier ouvert ───────────────────────────────────────────────────────
    const [quote, setQuote] = useState(null);
    const [progress, setProgress] = useState(emptyProgress);
    const [opening, setOpening] = useState(false);
    const [synced, setSynced] = useState(true);
    const [filter, setFilter] = useState('all');
    const [lineQuery, setLineQuery] = useState('');
    const [showPrices, setShowPrices] = useState(() => localStorage.getItem('af-chantier-prices') !== 'off');
    const [showNotes, setShowNotes] = useState(false);
    const [extraDraft, setExtraDraft] = useState('');

    const saveTimer = useRef(null);
    const pending = useRef(null);

    // Écriture différée : on coche vite plusieurs lignes d'affilée, une seule
    // sauvegarde suffit (le local, lui, est écrit à chaque fois par saveProgress).
    const persist = useCallback((quoteId, next) => {
        pending.current = { quoteId, next };
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async () => {
            const job = pending.current;
            pending.current = null;
            if (!job) return;
            const ok = await saveProgress(user?.id, job.quoteId, job.next);
            setSynced(ok);
            setProgressMap((prev) => ({ ...prev, [job.quoteId]: job.next }));
        }, 500);
    }, [user?.id]);

    // Sauvegarde immédiate de ce qui reste en attente (sortie de l'écran).
    const flush = useCallback(async () => {
        clearTimeout(saveTimer.current);
        const job = pending.current;
        pending.current = null;
        if (job) {
            const ok = await saveProgress(user?.id, job.quoteId, job.next);
            setSynced(ok);
            setProgressMap((prev) => ({ ...prev, [job.quoteId]: job.next }));
        }
    }, [user?.id]);

    useEffect(() => () => clearTimeout(saveTimer.current), []);

    const openQuote = async (q) => {
        setOpening(true);
        setQuote(q);
        setFilter('all');
        setLineQuery('');
        try {
            const { progress: loaded, synced: ok } = await loadProgress(q.id, user?.id);
            setProgress(loaded);
            setSynced(ok);
        } finally {
            setOpening(false);
        }
    };

    const closeQuote = async () => {
        await flush();
        setQuote(null);
        setExtraDraft('');
    };

    const update = (next) => {
        setProgress(next);
        if (quote) persist(quote.id, next);
    };

    const togglePrices = () => {
        setShowPrices((prev) => {
            localStorage.setItem('af-chantier-prices', prev ? 'off' : 'on');
            return !prev;
        });
    };

    // ── Check-list du devis ouvert ────────────────────────────────────────────
    const sections = useMemo(() => checklistSections(quote?.items), [quote]);
    const stats = useMemo(() => progressStats(sections, progress.done), [sections, progress.done]);

    const visibleSections = useMemo(() => sections
        .map((section) => ({
            ...section,
            lines: section.lines.filter((line) => {
                if (!lineMatches(line, lineQuery)) return false;
                const done = isLineDone(line, progress.done);
                if (filter === 'todo') return !done && !line.isOptional;
                if (filter === 'done') return done;
                if (filter === 'options') return line.isOptional;
                return true;
            }),
        }))
        .filter((section) => section.lines.length > 0),
        [sections, filter, lineQuery, progress.done]);

    const counts = useMemo(() => {
        const lines = sections.flatMap((s) => s.lines);
        return {
            all: lines.length,
            todo: lines.filter((l) => !l.isOptional && !isLineDone(l, progress.done)).length,
            done: lines.filter((l) => isLineDone(l, progress.done)).length,
            options: lines.filter((l) => l.isOptional).length,
        };
    }, [sections, progress.done]);

    // ── Travaux hors devis ────────────────────────────────────────────────────
    const addExtra = () => {
        const description = extraDraft.trim();
        if (!description) return;
        const now = new Date().toISOString();
        update({
            ...progress,
            extras: [...(progress.extras || []), {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                description,
                created_at: now,
                updated_at: now,
            }],
        });
        setExtraDraft('');
        toast.success('Noté hors devis — à chiffrer en avenant');
    };

    const removeExtra = (id) => {
        const now = new Date().toISOString();
        update({
            ...progress,
            // On marque supprimé plutôt que d'effacer : la fusion avec le suivi
            // distant ne doit pas faire réapparaître la ligne.
            extras: (progress.extras || []).map((e) =>
                e.id === id ? { ...e, deleted: true, updated_at: now } : e
            ).filter((e) => !e.deleted),
        });
    };

    const openPdf = () => {
        if (quote?.original_pdf_url) {
            window.open(quote.original_pdf_url, '_blank', 'noopener,noreferrer');
        } else {
            navigate(`/app/devis/${quote.id}`);
        }
    };

    // ═══ Écran 1 : choix du chantier ══════════════════════════════════════════

    if (!quote) {
        const q = siteQuery.trim().toLowerCase();
        const filtered = worksites.filter((w) => !q
            || (w.clients?.name || w.client_name || '').toLowerCase().includes(q)
            || quoteLabel(w).toLowerCase().includes(q));

        return (
            <div className="fixed inset-0 z-50 bg-gray-50 dark:bg-gray-800 flex flex-col font-sans overflow-hidden">
                <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-sm safe-area-top">
                    <div className="px-3 py-3 flex items-center gap-2">
                        <button
                            onClick={onBack}
                            className="p-2 -ml-1 text-gray-500 dark:text-gray-400 hover:text-gray-800 rounded-xl active:bg-gray-100"
                            aria-label="Retour"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="min-w-0">
                            <p className="font-bold text-gray-900 dark:text-white text-base leading-tight">Suivi de chantier</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Le devis en poche, sans imprimer</p>
                        </div>
                    </div>
                    <div className="px-3 pb-3">
                        <div className="relative">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="search"
                                value={siteQuery}
                                onChange={(e) => setSiteQuery(e.target.value)}
                                placeholder="Rechercher un chantier ou un client"
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {loading ? (
                        <div className="flex items-center justify-center py-16 text-gray-400">
                            <Loader2 className="w-7 h-7 animate-spin" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-16">
                            <ClipboardCheck className="w-12 h-12 mx-auto mb-3 text-gray-200 dark:text-gray-700" />
                            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                {worksites.length === 0 ? 'Aucun chantier en cours' : 'Aucun chantier ne correspond'}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 px-8">
                                Les chantiers apparaissent ici dès qu'un devis est accepté.
                            </p>
                        </div>
                    ) : filtered.map((w) => {
                        const done = progressMap[w.id]?.done || {};
                        const s = progressStats(checklistSections(w.items), done);
                        const stage = WORKSITE_STAGE_MAP[w.work_stage];
                        return (
                            <button
                                key={w.id}
                                onClick={() => openQuote(w)}
                                className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 text-left hover:border-blue-400 active:scale-[0.99] transition-all"
                            >
                                <div className="flex items-start justify-between gap-3 mb-2">
                                    <div className="min-w-0">
                                        <p className="font-bold text-gray-900 dark:text-white text-base leading-tight truncate">
                                            {w.clients?.name || w.client_name || 'Client'}
                                        </p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{quoteLabel(w)}</p>
                                    </div>
                                    {stage && (
                                        <span className={`shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full ${stage.badge}`}>
                                            {stage.title}
                                        </span>
                                    )}
                                </div>
                                <ProgressBar ratio={s.ratio} />
                                <div className="flex items-center justify-between mt-1.5">
                                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                                        {percent(s.ratio)}% · {s.doneUnits}/{s.totalUnits} opérations
                                    </span>
                                    <span className="text-xs text-gray-400">{euros(w.total_ttc, 0)} TTC</span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    // ═══ Écran 2 : le devis, cochable ═════════════════════════════════════════

    const client = quote.clients || {};
    const extras = progress.extras || [];

    const renderComponent = (line, component) => {
        const done = !!progress.done[component.key];
        return (
            <li key={component.key}>
                <button
                    type="button"
                    onClick={() => update({ ...progress, done: toggleComponent(progress.done, line, component) })}
                    className={`w-full flex items-start gap-3 pl-10 pr-3 py-2.5 rounded-xl text-left transition-colors ${done ? 'bg-emerald-50/60 dark:bg-emerald-900/10' : 'active:bg-gray-100 dark:active:bg-gray-800'}`}
                >
                    {done
                        ? <CheckSquare className="w-5 h-5 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        : <Square className="w-5 h-5 mt-0.5 shrink-0 text-gray-300 dark:text-gray-600" />}
                    <span className="flex-1 min-w-0">
                        <span className={`block text-sm ${done ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-200'}`}>
                            {component.description}
                        </span>
                        <span className="block text-xs text-gray-400">
                            {formatQuantity(component.quantity)} {component.unit}
                        </span>
                    </span>
                </button>
            </li>
        );
    };

    const renderLine = (line) => {
        const done = isLineDone(line, progress.done);
        return (
            <li key={line.key} className="border-b border-gray-50 dark:border-gray-800 last:border-0">
                <button
                    type="button"
                    onClick={() => update({ ...progress, done: toggleLine(progress.done, line) })}
                    className={`w-full flex items-start gap-3 px-3 py-3 text-left transition-colors ${done ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'active:bg-gray-100 dark:active:bg-gray-800'}`}
                >
                    {done
                        ? <CheckSquare className="w-6 h-6 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        : <Square className="w-6 h-6 mt-0.5 shrink-0 text-gray-300 dark:text-gray-600" />}
                    <span className="flex-1 min-w-0">
                        <span className={`block text-[15px] leading-snug ${done ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
                            {line.description}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                {formatQuantity(line.quantity)} {line.unit}
                            </span>
                            {showPrices && line.total > 0 && (
                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                                    {euros(line.total)}
                                </span>
                            )}
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${line.type === 'material'
                                ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300'
                                : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'}`}>
                                {line.type === 'material' ? <Package className="w-3 h-3" /> : <Wrench className="w-3 h-3" />}
                                {line.type === 'material' ? 'Matériel' : "Main d'œuvre"}
                            </span>
                            {line.isOptional && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300">
                                    Option — non prévue
                                </span>
                            )}
                        </span>
                        {line.note && (
                            <span className="block text-xs text-amber-700 dark:text-amber-400 mt-1.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-2 py-1">
                                {line.note}
                            </span>
                        )}
                    </span>
                </button>
                {line.components.length > 0 && (
                    <ul className="pb-2">{line.components.map((c) => renderComponent(line, c))}</ul>
                )}
            </li>
        );
    };

    return (
        <div className="fixed inset-0 z-50 bg-gray-50 dark:bg-gray-800 flex flex-col font-sans overflow-hidden">

            {/* ── En-tête : chantier + avancement ───────────────────────────── */}
            <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-sm safe-area-top">
                <div className="px-3 py-3 flex items-center gap-2">
                    <button
                        onClick={closeQuote}
                        className="p-2 -ml-1 text-gray-500 dark:text-gray-400 hover:text-gray-800 rounded-xl active:bg-gray-100"
                        aria-label="Retour aux chantiers"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 dark:text-white text-[15px] leading-tight truncate">
                            {client.name || quote.client_name || 'Client'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {quoteLabel(quote)} · {euros(quote.total_ttc, 0)} TTC
                        </p>
                    </div>
                    <button
                        onClick={togglePrices}
                        className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl active:bg-gray-100 dark:active:bg-gray-800"
                        title={showPrices ? 'Masquer les prix' : 'Afficher les prix'}
                        aria-label={showPrices ? 'Masquer les prix' : 'Afficher les prix'}
                    >
                        {showPrices ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                    </button>
                </div>

                <div className="px-3 pb-3">
                    <ProgressBar ratio={stats.ratio} />
                    <div className="flex items-center justify-between mt-1.5 gap-2">
                        <span className="text-sm font-bold text-gray-800 dark:text-gray-100">
                            {percent(stats.ratio)}% — {stats.doneUnits}/{stats.totalUnits} opérations
                        </span>
                        {showPrices && stats.totalAmount > 0 && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                                {euros(stats.doneAmount, 0)} / {euros(stats.totalAmount, 0)} HT réalisé
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                        {synced ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                                <Check className="w-3 h-3" /> Enregistré
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                                <CloudOff className="w-3 h-3" /> Hors ligne — gardé sur le téléphone
                            </span>
                        )}
                        {stats.totalUnits > 0 && (
                            <>
                                <button
                                    onClick={() => update({ ...progress, done: setAll(sections, true) })}
                                    className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400"
                                >
                                    <CheckSquare className="w-3 h-3" /> Tout cocher
                                </button>
                                {stats.doneUnits > 0 && (
                                    <button
                                        onClick={() => update({ ...progress, done: {} })}
                                        className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                    >
                                        <RotateCcw className="w-3 h-3" /> Remettre à zéro
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Recherche dans le devis + filtres */}
                <div className="px-3 pb-3 space-y-2">
                    <div className="relative">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                            type="search"
                            value={lineQuery}
                            onChange={(e) => setLineQuery(e.target.value)}
                            placeholder="C'est prévu ? (ex. prise garage)"
                            className="w-full pl-10 pr-9 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        {lineQuery && (
                            <button
                                onClick={() => setLineQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400"
                                aria-label="Effacer la recherche"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2 overflow-x-auto">
                        {FILTERS.map((f) => (
                            <button
                                key={f.id}
                                onClick={() => setFilter(f.id)}
                                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${filter === f.id
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}
                            >
                                {f.label} ({counts[f.id]})
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Contenu ───────────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto pb-4">
                {opening ? (
                    <div className="flex items-center justify-center py-16 text-gray-400">
                        <Loader2 className="w-7 h-7 animate-spin" />
                    </div>
                ) : (
                    <div className="p-3 space-y-4">

                        {/* Coordonnées du client — remplace le devis papier */}
                        {(client.phone || client.address) && (
                            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl divide-y divide-gray-50 dark:divide-gray-800">
                                {client.phone && (
                                    <a href={`tel:${client.phone}`} className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                                        <Phone className="w-4 h-4 text-blue-500 shrink-0" /> {client.phone}
                                    </a>
                                )}
                                {client.address && (
                                    <a
                                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-200"
                                    >
                                        <MapPin className="w-4 h-4 text-blue-500 shrink-0" />
                                        <span className="flex-1 min-w-0 truncate">{client.address}</span>
                                        <ExternalLink className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                                    </a>
                                )}
                            </div>
                        )}

                        {sections.length === 0 ? (
                            <div className="text-center py-12">
                                <FileText className="w-10 h-10 mx-auto mb-3 text-gray-200 dark:text-gray-700" />
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Ce devis n'a pas de lignes détaillées</p>
                                <p className="text-xs text-gray-400 mt-1">Ouvrez le PDF depuis le bas de l'écran pour le consulter.</p>
                            </div>
                        ) : visibleSections.length === 0 ? (
                            <p className="text-center text-sm text-gray-400 py-10">
                                {lineQuery
                                    ? <>Rien de tel dans ce devis — ce n'est pas prévu. Ajoutez-le en hors devis ci-dessous.</>
                                    : 'Aucune ligne dans ce filtre.'}
                            </p>
                        ) : visibleSections.map((section) => (
                            <div key={section.title} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                                <p className="px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide bg-gray-50 dark:bg-gray-800/60">
                                    {section.title}
                                </p>
                                <ul>{section.lines.map(renderLine)}</ul>
                            </div>
                        ))}

                        {/* ── Travaux hors devis ───────────────────────────── */}
                        <div className="bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-900/50 rounded-2xl overflow-hidden">
                            <p className="px-3 py-2 text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide bg-amber-50 dark:bg-amber-900/20 flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5" /> Hors devis {extras.length > 0 && `(${extras.length})`}
                            </p>
                            <ul className="divide-y divide-gray-50 dark:divide-gray-800">
                                {extras.map((extra) => (
                                    <li key={extra.id} className="flex items-start gap-3 px-3 py-3">
                                        <span className="flex-1 min-w-0 text-sm text-gray-800 dark:text-gray-100">{extra.description}</span>
                                        <button
                                            onClick={() => removeExtra(extra.id)}
                                            className="p-1 text-gray-300 hover:text-red-500 shrink-0"
                                            aria-label="Supprimer"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            <div className="p-3 flex gap-2">
                                <input
                                    type="text"
                                    value={extraDraft}
                                    onChange={(e) => setExtraDraft(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') addExtra(); }}
                                    placeholder="Travail demandé en plus…"
                                    className="flex-1 min-w-0 px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-base focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                />
                                <button
                                    onClick={addExtra}
                                    disabled={!extraDraft.trim()}
                                    className="px-3 py-2.5 bg-amber-500 text-white rounded-xl font-semibold disabled:opacity-40"
                                    aria-label="Ajouter au hors devis"
                                >
                                    <Plus className="w-5 h-5" />
                                </button>
                            </div>
                            <p className="px-3 pb-3 text-[11px] text-gray-400">
                                Ce qui n'est pas au devis : à chiffrer en avenant avant de le faire.
                            </p>
                        </div>

                        {/* ── Notes du devis ───────────────────────────────── */}
                        {quote.notes && (
                            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                                <button
                                    onClick={() => setShowNotes((v) => !v)}
                                    className="w-full px-3 py-3 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200"
                                >
                                    <StickyNote className="w-4 h-4 text-gray-400" />
                                    Notes et conditions du devis
                                    <ChevronDown className={`w-4 h-4 ml-auto text-gray-400 transition-transform ${showNotes ? 'rotate-180' : ''}`} />
                                </button>
                                {showNotes && (
                                    <p className="px-3 pb-3 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                                        {quote.notes}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Accès direct au devis complet ─────────────────────────────── */}
            <div className="shrink-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 px-3 py-3 flex gap-2 safe-area-bottom">
                <button
                    onClick={openPdf}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-bold rounded-2xl transition-colors"
                >
                    {quote.original_pdf_url
                        ? <><ExternalLink className="w-4 h-4" /> Ouvrir le PDF</>
                        : <><FileText className="w-4 h-4" /> Voir le devis complet</>}
                </button>
            </div>
        </div>
    );
};

export default ChantierSuiviMode;
