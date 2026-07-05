import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import {
    ChevronLeft, ChevronRight, Download, Plus, Trash2, Loader2,
    TrendingUp, AlertTriangle, CheckCircle, HelpCircle, Hammer,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { DismissibleHelp } from '../components/ui';
import TimeClockWidget from '../components/TimeClockWidget';
import { exportToCSV } from '../utils/csvExport';
import {
    estimatedHoursFromItems, formatHours, laborProfitability,
    startOfWeek, weekDays, toDateString,
} from '../utils/timeTracking';

const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const formatDayDate = (dateStr) =>
    new Date(`${dateStr}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

const formatEuro = (n) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

// ── Carte rentabilité d'un chantier ──────────────────────────────────────────

const STATUS_STYLES = {
    ok: { bar: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', Icon: CheckCircle },
    warning: { bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', Icon: AlertTriangle },
    over: { bar: 'bg-red-500', text: 'text-red-700 dark:text-red-400', Icon: AlertTriangle },
    unknown: { bar: 'bg-gray-300 dark:bg-gray-600', text: 'text-gray-500 dark:text-gray-400', Icon: HelpCircle },
};

const WorksiteCard = ({ worksite, hourlyRate }) => {
    const { estimated, spent, quote } = worksite;
    const { progress, overrunHours, overrunCost, status } = laborProfitability(estimated, spent, hourlyRate);
    const { bar, text, Icon } = STATUS_STYLES[status];
    const label = [quote.title, quote.client_name].filter(Boolean).join(' — ') || `Devis #${quote.id}`;

    return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                    <Link to={`/app/devis/${quote.id}`} className="font-bold text-gray-900 dark:text-white hover:underline truncate block">
                        {label}
                    </Link>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Devis : {formatEuro(quote.total_ht || 0)} HT
                    </p>
                </div>
                <Icon className={`w-5 h-5 flex-shrink-0 ${text}`} />
            </div>

            <div className="flex items-baseline justify-between text-sm mb-1.5">
                <span className="text-gray-600 dark:text-gray-300">
                    <strong className="text-gray-900 dark:text-white">{formatHours(spent)}</strong> pointées
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                    {estimated > 0 ? `${formatHours(estimated)} prévues` : 'pas d\'heures au devis'}
                </span>
            </div>

            <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all ${bar}`}
                    style={{ width: progress === null ? '100%' : `${Math.min(100, progress * 100)}%` }}
                />
            </div>

            {status === 'over' && (
                <p className={`text-xs font-semibold mt-2 ${text}`}>
                    Dépassement : {formatHours(overrunHours)}
                    {overrunCost > 0 && <> soit ≈ {formatEuro(overrunCost)} de main d'œuvre non facturée</>}
                </p>
            )}
            {status === 'warning' && (
                <p className={`text-xs font-semibold mt-2 ${text}`}>
                    Attention : {Math.round(progress * 100)}% des heures prévues déjà consommées
                </p>
            )}
            {status === 'unknown' && (
                <p className="text-xs mt-2 text-gray-500 dark:text-gray-400">
                    Ajoutez des lignes en heures (unité « h ») à ce devis pour suivre la rentabilité.
                </p>
            )}
        </div>
    );
};

// ── Page ─────────────────────────────────────────────────────────────────────

const TimeTracking = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [entries, setEntries] = useState([]);       // pointages de la semaine affichée
    const [worksites, setWorksites] = useState([]);   // devis acceptés + heures cumulées
    const [hourlyRate, setHourlyRate] = useState(0);
    const [weekStart, setWeekStart] = useState(() => startOfWeek());
    const [deletingId, setDeletingId] = useState(null);

    // Formulaire de saisie manuelle
    const [showForm, setShowForm] = useState(false);
    const [formDate, setFormDate] = useState(() => toDateString(new Date()));
    const [formHours, setFormHours] = useState('');
    const [formQuoteId, setFormQuoteId] = useState('');
    const [formNote, setFormNote] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const days = useMemo(() => weekDays(weekStart), [weekStart]);
    const weekEnd = days[6];

    const fetchAll = useCallback(async () => {
        if (!user) return;
        try {
            const [entriesRes, quotesRes, trackingRes, profileRes] = await Promise.all([
                supabase.from('task_tracking')
                    .select('id, quote_id, hours_spent, date, notes')
                    .gte('date', days[0])
                    .lte('date', weekEnd)
                    .order('date', { ascending: true })
                    .order('created_at', { ascending: true }),
                supabase.from('quotes')
                    .select('id, title, client_name, total_ht, items, work_stage')
                    .eq('status', 'accepted')
                    .neq('type', 'invoice')
                    .order('created_at', { ascending: false })
                    .limit(50),
                supabase.from('task_tracking').select('quote_id, hours_spent'),
                supabase.from('profiles')
                    .select('ai_preferences')
                    .eq('id', user.id)
                    .maybeSingle(),
            ]);

            setEntries(entriesRes.data || []);

            // Heures cumulées par devis (toutes dates confondues)
            const spentByQuote = {};
            for (const t of trackingRes.data || []) {
                if (t.quote_id == null) continue;
                spentByQuote[t.quote_id] = (spentByQuote[t.quote_id] || 0) + (Number(t.hours_spent) || 0);
            }

            const active = (quotesRes.data || [])
                .filter(q => q.work_stage !== 'completed' || spentByQuote[q.id] > 0)
                .map(q => ({
                    quote: q,
                    estimated: estimatedHoursFromItems(q.items),
                    spent: spentByQuote[q.id] || 0,
                }))
                // Chantiers avec activité d'abord, pour que la page soit utile dès l'arrivée
                .sort((a, b) => b.spent - a.spent);
            setWorksites(active);

            const rate = parseFloat(profileRes.data?.ai_preferences?.ai_hourly_rate);
            setHourlyRate(Number.isFinite(rate) && rate > 0 ? rate : 0);
        } catch (err) {
            console.error('Erreur chargement heures:', err);
            toast.error('Impossible de charger vos heures.');
        } finally {
            setLoading(false);
        }
    }, [user, days, weekEnd]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // Libellés de chantiers pour la feuille d'heures et le formulaire
    const quoteLabels = useMemo(() => {
        const map = {};
        for (const w of worksites) {
            map[w.quote.id] = [w.quote.title, w.quote.client_name].filter(Boolean).join(' — ') || `Devis #${w.quote.id}`;
        }
        return map;
    }, [worksites]);

    const entriesByDay = useMemo(() => {
        const map = Object.fromEntries(days.map(d => [d, []]));
        for (const e of entries) {
            if (map[e.date]) map[e.date].push(e);
        }
        return map;
    }, [entries, days]);

    const weekTotal = entries.reduce((acc, e) => acc + (Number(e.hours_spent) || 0), 0);

    const shiftWeek = (delta) => {
        setWeekStart(prev => {
            const d = new Date(prev);
            d.setDate(d.getDate() + delta * 7);
            return d;
        });
    };

    const handleAddEntry = async (e) => {
        e.preventDefault();
        const hours = parseFloat(String(formHours).replace(',', '.'));
        if (!Number.isFinite(hours) || hours <= 0) {
            toast.error('Indiquez un nombre d\'heures valide.');
            return;
        }
        setSubmitting(true);
        try {
            const { error } = await supabase.from('task_tracking').insert({
                user_id: user.id,
                quote_id: formQuoteId ? Number(formQuoteId) : null,
                hours_spent: Math.round(hours * 100) / 100,
                date: formDate,
                notes: formNote.trim() || null,
            });
            if (error) throw error;
            toast.success('Heures ajoutées');
            setFormHours('');
            setFormNote('');
            setShowForm(false);
            fetchAll();
        } catch (err) {
            console.error('Erreur ajout heures:', err);
            toast.error('Impossible d\'ajouter ces heures.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        setDeletingId(id);
        try {
            const { error } = await supabase.from('task_tracking').delete().eq('id', id);
            if (error) throw error;
            setEntries(prev => prev.filter(e => e.id !== id));
            fetchAll();
        } catch (err) {
            console.error('Erreur suppression pointage:', err);
            toast.error('Suppression impossible.');
        } finally {
            setDeletingId(null);
        }
    };

    const handleExport = () => {
        exportToCSV(
            entries,
            [
                { key: 'date', label: 'Date' },
                { key: (e) => (e.quote_id != null && quoteLabels[e.quote_id]) || (e.quote_id != null ? `Devis #${e.quote_id}` : 'Sans chantier'), label: 'Chantier' },
                { key: 'hours_spent', label: 'Heures', format: (v) => String(v ?? '').replace('.', ',') },
                { key: 'notes', label: 'Notes' },
            ],
            'feuille_heures'
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-24">
            <PageHeader
                title="Heures & rentabilité"
                subtitle="Pointez vos heures, découvrez ce que vos chantiers vous rapportent vraiment"
            />

            <TimeClockWidget onSaved={fetchAll} />

            {/* ── Rentabilité par chantier ── */}
            <section>
                <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="w-5 h-5 text-blue-600" />
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">Rentabilité par chantier</h2>
                </div>
                {worksites.length === 0 ? (
                    <div className="bg-gray-50 dark:bg-gray-800/60 border border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-8 text-center">
                        <Hammer className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-600 dark:text-gray-300 font-medium">Aucun chantier en cours</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Dès qu'un devis est accepté, il apparaît ici avec ses heures prévues vs pointées.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {worksites.map(w => (
                            <WorksiteCard key={w.quote.id} worksite={w} hourlyRate={hourlyRate} />
                        ))}
                    </div>
                )}
                {hourlyRate === 0 && worksites.length > 0 && (
                    <DismissibleHelp storageKey="timetracking_hourly_rate_tip">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 pr-8">
                            💡 Renseignez votre taux horaire dans <Link to="/app/settings" className="underline">vos réglages</Link> (section IA)
                            pour valoriser les dépassements en euros.
                        </p>
                    </DismissibleHelp>
                )}
            </section>

            {/* ── Feuille d'heures ── */}
            <section>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">Feuille d'heures</h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => shiftWeek(-1)}
                            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                            aria-label="Semaine précédente"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                            {formatDayDate(days[0])} – {formatDayDate(weekEnd)}
                        </span>
                        <button
                            onClick={() => shiftWeek(1)}
                            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                            aria-label="Semaine suivante"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleExport}
                            disabled={entries.length === 0}
                            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
                        >
                            <Download className="w-4 h-4" /> CSV
                        </button>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl divide-y divide-gray-100 dark:divide-gray-700">
                    {days.map((day, i) => {
                        const dayEntries = entriesByDay[day];
                        const dayTotal = dayEntries.reduce((acc, e) => acc + (Number(e.hours_spent) || 0), 0);
                        return (
                            <div key={day} className="px-5 py-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                        {DAY_LABELS[i]} <span className="text-gray-400 font-normal">{formatDayDate(day)}</span>
                                    </p>
                                    <p className={`text-sm font-bold tabular-nums ${dayTotal > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-300 dark:text-gray-600'}`}>
                                        {formatHours(dayTotal)}
                                    </p>
                                </div>
                                {dayEntries.length > 0 && (
                                    <ul className="mt-2 space-y-1.5">
                                        {dayEntries.map(e => (
                                            <li key={e.id} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                                                <span className="font-medium tabular-nums w-14 flex-shrink-0">{formatHours(Number(e.hours_spent) || 0)}</span>
                                                <span className="truncate flex-1">
                                                    {e.quote_id != null
                                                        ? (quoteLabels[e.quote_id] || `Devis #${e.quote_id}`)
                                                        : 'Sans chantier'}
                                                    {e.notes ? <span className="text-gray-400"> · {e.notes}</span> : null}
                                                </span>
                                                <button
                                                    onClick={() => handleDelete(e.id)}
                                                    disabled={deletingId === e.id}
                                                    className="p-1 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                                                    aria-label="Supprimer ce pointage"
                                                >
                                                    {deletingId === e.id
                                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                                        : <Trash2 className="w-4 h-4" />}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        );
                    })}
                    <div className="px-5 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-900/40 rounded-b-2xl">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">Total semaine</p>
                        <p className="text-sm font-extrabold text-gray-900 dark:text-white tabular-nums">{formatHours(weekTotal)}</p>
                    </div>
                </div>

                {/* Saisie manuelle */}
                {showForm ? (
                    <form onSubmit={handleAddEntry} className="mt-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                            <label htmlFor="tt-date" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Date</label>
                            <input
                                id="tt-date" type="date" required value={formDate}
                                onChange={(e) => setFormDate(e.target.value)}
                                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white"
                            />
                        </div>
                        <div>
                            <label htmlFor="tt-hours" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Heures</label>
                            <input
                                id="tt-hours" type="text" inputMode="decimal" required placeholder="Ex : 3,5"
                                value={formHours} onChange={(e) => setFormHours(e.target.value)}
                                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white"
                            />
                        </div>
                        <div>
                            <label htmlFor="tt-quote" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Chantier</label>
                            <select
                                id="tt-quote" value={formQuoteId}
                                onChange={(e) => setFormQuoteId(e.target.value)}
                                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white"
                            >
                                <option value="">Sans chantier</option>
                                {worksites.map(w => (
                                    <option key={w.quote.id} value={w.quote.id}>{quoteLabels[w.quote.id]}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="tt-note" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Note (optionnel)</label>
                            <input
                                id="tt-note" type="text" placeholder="Ex : pose faïence"
                                value={formNote} onChange={(e) => setFormNote(e.target.value)}
                                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white"
                            />
                        </div>
                        <div className="sm:col-span-2 lg:col-span-4 flex gap-2 justify-end">
                            <button
                                type="button" onClick={() => setShowForm(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                Annuler
                            </button>
                            <button
                                type="submit" disabled={submitting}
                                className="flex items-center gap-2 bg-blue-600 text-white text-sm font-bold px-5 py-2 rounded-xl hover:bg-blue-700 disabled:opacity-60"
                            >
                                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                Ajouter
                            </button>
                        </div>
                    </form>
                ) : (
                    <button
                        onClick={() => setShowForm(true)}
                        className="mt-4 flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
                    >
                        <Plus className="w-4 h-4" /> Ajouter des heures manuellement
                    </button>
                )}
            </section>
        </div>
    );
};

export default TimeTracking;
