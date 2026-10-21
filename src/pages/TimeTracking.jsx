import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import {
    ChevronLeft, ChevronRight, Download, Plus, Pencil, Trash2, Loader2,
    TrendingUp, AlertTriangle, CheckCircle, HelpCircle, Hammer, CalendarDays,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { DismissibleHelp, EmptyState, LoadingState, SegmentedControl } from '../components/ui';
import TimeClockWidget from '../components/TimeClockWidget';
import { exportToCSV } from '../utils/csvExport';
import {
    chantierHours, chantierRootId, formatHours, hoursToInput, laborProfitability,
    parseHoursInput, startOfWeek, weekDays, toDateString,
    WORK_BLOCKS, normalizeWorkBlock, workBlockLabel, hoursByWorkBlock, hoursGapPercent,
} from '../utils/timeTracking';
import { useInvalidateCache } from '../hooks/useDataCache';
import { formatCurrencyRounded, formatDate } from '../utils/format';

const QUOTE_FIELDS = 'id, title, client_name, total_ht, items, work_stage, type, status, parent_quote_id, amendment_details';

const docLabel = (q) => [q.title, q.client_name].filter(Boolean).join(' — ') || `Devis #${q.id}`;

const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const formatDayDate = (dateStr) =>
    formatDate(`${dateStr}T00:00:00`, { day: 'numeric', month: 'short' });

// ── Carte rentabilité d'un chantier ──────────────────────────────────────────

const STATUS_STYLES = {
    ok: { bar: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', Icon: CheckCircle },
    warning: { bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', Icon: AlertTriangle },
    over: { bar: 'bg-red-500', text: 'text-red-700 dark:text-red-400', Icon: AlertTriangle },
    unknown: { bar: 'bg-gray-300 dark:bg-gray-600', text: 'text-gray-500 dark:text-gray-400', Icon: HelpCircle },
};

// Répartition des heures pointées d'un chantier par bloc de travaux. Rien
// n'est affiché tant qu'aucun pointage n'est découpé : un seul « Non précisé »
// n'apprend rien.
const WorkBlockBreakdown = ({ entries }) => {
    const { blocks, total, reconstructedHours } = hoursByWorkBlock(entries);
    if (total <= 0 || blocks.every(b => b.id === null)) return null;
    return (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Par bloc de travaux</p>
            <ul className="space-y-1">
                {blocks.map(b => (
                    <li key={b.id ?? 'none'} className="flex items-center gap-2 text-xs">
                        <span className={`flex-1 truncate ${b.id ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500 italic'}`}>
                            {b.label}
                        </span>
                        <span className="tabular-nums font-medium text-gray-900 dark:text-white">{formatHours(b.hours)}</span>
                        <span className="tabular-nums w-9 text-right text-gray-400">{Math.round((b.hours / total) * 100)}%</span>
                    </li>
                ))}
            </ul>
            {reconstructedHours > 0 && (
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">
                    dont {formatHours(reconstructedHours)} reconstituées de mémoire
                </p>
            )}
        </div>
    );
};

const WorksiteCard = ({ worksite, hourlyRate }) => {
    const { estimated, spent, quote, totalHt, amendmentCount, entries } = worksite;
    const { progress, overrunHours, overrunCost, status } = laborProfitability(estimated, spent, hourlyRate);
    const { bar, text, Icon } = STATUS_STYLES[status];
    const gap = spent > 0 ? hoursGapPercent(estimated, spent) : null;
    // Le client en titre : c'est par lui qu'on reconnaît un chantier. L'intitulé
    // du devis passe en dessous.
    const heading = quote.client_name || quote.title || `Devis #${quote.id}`;
    const subheading = quote.client_name ? quote.title : null;

    return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                    <Link to={`/app/affaires/${quote.id}`} className="text-lg font-bold text-gray-900 dark:text-white hover:underline truncate block">
                        {heading}
                    </Link>
                    {subheading && (
                        <p className="text-sm text-gray-600 dark:text-gray-300 truncate">{subheading}</p>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {amendmentCount > 0
                            ? <>Devis + {amendmentCount > 1 ? `${amendmentCount} avenants` : 'avenant'} : {formatCurrencyRounded(totalHt || 0)} HT</>
                            : <>Devis : {formatCurrencyRounded(quote.total_ht || 0)} HT</>}
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
                    {gap !== null && (
                        <span className={`ml-1.5 font-semibold tabular-nums ${gap > 0 ? text : 'text-emerald-700 dark:text-emerald-400'}`}>
                            ({gap > 0 ? '+' : ''}{gap} %)
                        </span>
                    )}
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
                    {overrunCost > 0 && <> soit ≈ {formatCurrencyRounded(overrunCost)} de main d'œuvre non facturée</>}
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

            <WorkBlockBreakdown entries={entries} />
        </div>
    );
};

// ── Page ─────────────────────────────────────────────────────────────────────

const TABS = [
    { id: 'rentabilite', label: 'Rentabilité par chantier', icon: TrendingUp },
    { id: 'feuille', label: "Feuille d'heures", icon: CalendarDays },
];

const QUICK_HOURS = [
    { label: '1 h', value: '1' },
    { label: '2 h', value: '2' },
    { label: 'Demi-journée (4 h)', value: '4' },
    { label: 'Journée (8 h)', value: '8' },
];

const TimeTracking = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [entries, setEntries] = useState([]);       // pointages de la semaine affichée
    const [worksites, setWorksites] = useState([]);   // devis acceptés + heures cumulées
    const [docLabels, setDocLabels] = useState({}); // id devis/avenant → libellé
    const [hourlyRate, setHourlyRate] = useState(0);
    const [weekStart, setWeekStart] = useState(() => startOfWeek());
    const [deletingId, setDeletingId] = useState(null);
    const { invalidateTimeTracking } = useInvalidateCache();

    // Onglet dans l'URL (?tab=feuille) : le lien « feuille d'heures » du
    // pointeur ouvre directement le bon onglet.
    const [searchParams, setSearchParams] = useSearchParams();
    const tab = TABS.some(t => t.id === searchParams.get('tab')) ? searchParams.get('tab') : 'rentabilite';
    const setTab = (id) => setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('tab', id);
        return next;
    }, { replace: true });

    // Formulaire de saisie manuelle — sert aussi à modifier un pointage existant
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);  // null = ajout
    const [formDate, setFormDate] = useState(() => toDateString(new Date()));
    const [formHours, setFormHours] = useState('');
    const [formQuoteId, setFormQuoteId] = useState('');
    const [formNote, setFormNote] = useState('');
    const [formBlock, setFormBlock] = useState('');
    const [formReconstructed, setFormReconstructed] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const days = useMemo(() => weekDays(weekStart), [weekStart]);
    const weekEnd = days[6];

    const fetchAll = useCallback(async () => {
        if (!user) return;
        try {
            const [entriesRes, quotesRes, trackingRes, profileRes] = await Promise.all([
                supabase.from('task_tracking')
                    .select('id, quote_id, hours_spent, date, notes, work_block, reconstructed, created_at')
                    .gte('date', days[0])
                    .lte('date', weekEnd)
                    .order('date', { ascending: true })
                    .order('created_at', { ascending: true }),
                supabase.from('quotes')
                    .select(QUOTE_FIELDS)
                    .eq('status', 'accepted')
                    .neq('type', 'invoice')
                    .order('created_at', { ascending: false })
                    .limit(50),
                supabase.from('task_tracking').select('quote_id, hours_spent, work_block, reconstructed'),
                supabase.from('profiles')
                    .select('ai_preferences')
                    .eq('id', user.id)
                    .maybeSingle(),
            ]);

            setEntries(entriesRes.data || []);

            // Heures cumulées par devis (toutes dates confondues), et pointages
            // par devis pour la répartition par bloc de travaux.
            const spentByQuote = {};
            const trackingByQuote = {};
            for (const t of trackingRes.data || []) {
                if (t.quote_id == null) continue;
                spentByQuote[t.quote_id] = (spentByQuote[t.quote_id] || 0) + (Number(t.hours_spent) || 0);
                (trackingByQuote[t.quote_id] ||= []).push(t);
            }

            // Un avenant signé et son devis initial forment UN chantier : heures
            // prévues et pointées sont comptées en commun (le RDV d'agenda peut
            // être lié à l'un ou à l'autre). On complète donc la liste avec les
            // devis initiaux et tous les avenants des chantiers en cours.
            const accepted = quotesRes.data || [];
            const rootIds = [...new Set(accepted.map(chantierRootId))];
            let docs = accepted;
            if (rootIds.length > 0) {
                const { data: related } = await supabase.from('quotes')
                    .select(QUOTE_FIELDS)
                    .or(`id.in.(${rootIds.join(',')}),parent_quote_id.in.(${rootIds.join(',')})`);
                docs = [...accepted, ...(related || [])];
            }
            const byRoot = chantierHours(docs, spentByQuote);
            const roots = new Map(docs.filter(q => chantierRootId(q) === q.id).map(q => [q.id, q]));
            setDocLabels(Object.fromEntries(docs.map(q => [q.id, docLabel(q)])));

            const active = rootIds
                .map(id => roots.get(id))
                .filter(Boolean)
                .map(q => {
                    const hours = byRoot.get(Number(q.id));
                    return { quote: q, ...hours, entries: hours.docIds.flatMap(id => trackingByQuote[id] || []) };
                })
                .filter(w => w.quote.work_stage !== 'completed' || w.spent > 0)
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

    // Le formulaire est sous la feuille d'heures : on l'amène sous les yeux
    // quand on modifie un pointage saisi plus haut dans la semaine.
    const formRef = useRef(null);
    useEffect(() => {
        if (showForm && editingId) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [showForm, editingId]);

    // Libellés de chantiers pour la feuille d'heures et le formulaire (devis
    // initiaux et avenants : un pointage peut viser l'un ou l'autre).
    const quoteLabels = docLabels;

    // Un pointage peut viser un chantier absent de la liste (devis terminé, au-delà
    // des 50 derniers…) : on conserve son option pour ne pas la perdre en modifiant.
    const quoteOptions = useMemo(() => {
        const options = worksites.map(w => ({ id: String(w.quote.id), label: quoteLabels[w.quote.id] }));
        if (formQuoteId && !options.some(o => o.id === formQuoteId)) {
            options.unshift({ id: formQuoteId, label: quoteLabels[formQuoteId] || `Devis #${formQuoteId}` });
        }
        return options;
    }, [worksites, quoteLabels, formQuoteId]);

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

    const closeForm = () => {
        setShowForm(false);
        setEditingId(null);
        setFormHours('');
        setFormNote('');
        setFormBlock('');
        setFormReconstructed(false);
    };

    const openAddForm = () => {
        setEditingId(null);
        setFormDate(toDateString(new Date()));
        setFormHours('');
        // Chantier du dernier pointage de la semaine présélectionné
        const lastWithQuote = [...entries].reverse().find(e => e.quote_id != null);
        setFormQuoteId(lastWithQuote ? String(lastWithQuote.quote_id) : '');
        setFormNote('');
        setFormBlock('');
        setFormReconstructed(false);
        setShowForm(true);
    };

    const openEditForm = (entry) => {
        setEditingId(entry.id);
        setFormDate(entry.date);
        setFormHours(hoursToInput(entry.hours_spent));
        setFormQuoteId(entry.quote_id != null ? String(entry.quote_id) : '');
        setFormNote(entry.notes || '');
        setFormBlock(normalizeWorkBlock(entry.work_block) || '');
        setFormReconstructed(!!entry.reconstructed);
        setShowForm(true);
    };

    const handleSubmitEntry = async (e) => {
        e.preventDefault();
        const hours = parseHoursInput(formHours);
        if (hours === null) {
            toast.error('Indiquez un nombre d\'heures valide (ex : 3,5 ou 3h30).');
            return;
        }
        setSubmitting(true);
        try {
            const payload = {
                quote_id: formQuoteId ? Number(formQuoteId) : null,
                hours_spent: hours,
                date: formDate,
                notes: formNote.trim() || null,
                work_block: normalizeWorkBlock(formBlock),
                reconstructed: formReconstructed,
            };
            const { error } = editingId
                ? await supabase.from('task_tracking').update(payload).eq('id', editingId)
                : await supabase.from('task_tracking').insert({ ...payload, user_id: user.id });
            if (error) throw error;
            toast.success(editingId ? 'Pointage modifié' : 'Heures ajoutées');
            closeForm();
            invalidateTimeTracking();
            fetchAll();
        } catch (err) {
            console.error('Erreur enregistrement heures:', err);
            toast.error(editingId ? 'Impossible de modifier ce pointage.' : 'Impossible d\'ajouter ces heures.');
        } finally {
            setSubmitting(false);
        }
    };

    // Suppression immédiate, rattrapable : « Annuler » réinsère la ligne à
    // l'identique (même id, même horodatage) pendant quelques secondes.
    const restoreEntry = async (entry) => {
        try {
            const { error } = await supabase.from('task_tracking').insert({ ...entry, user_id: user.id });
            if (error) throw error;
            toast.success('Pointage restauré');
            invalidateTimeTracking();
            fetchAll();
        } catch (err) {
            console.error('Erreur restauration pointage:', err);
            toast.error('Impossible de restaurer ce pointage.');
        }
    };

    const handleDelete = async (entry) => {
        setDeletingId(entry.id);
        try {
            const { error } = await supabase.from('task_tracking').delete().eq('id', entry.id);
            if (error) throw error;
            setEntries(prev => prev.filter(e => e.id !== entry.id));
            if (editingId === entry.id) closeForm();
            invalidateTimeTracking();
            fetchAll();
            toast(`Pointage de ${formatHours(Number(entry.hours_spent) || 0)} supprimé`, {
                duration: 8000,
                action: { label: 'Annuler', onClick: () => restoreEntry(entry) },
            });
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
                { key: (e) => workBlockLabel(e.work_block), label: 'Bloc de travaux' },
                { key: (e) => (e.reconstructed ? 'oui' : ''), label: 'Reconstitué' },
                { key: 'notes', label: 'Notes' },
            ],
            'feuille_heures'
        );
    };

    if (loading) {
        return <LoadingState className="py-24" />;
    }

    return (
        <div className="space-y-8 pb-24">
            <PageHeader
                title="Heures & rentabilité"
                subtitle="Pointez vos heures, découvrez ce que vos chantiers vous rapportent vraiment"
            />

            <TimeClockWidget onSaved={fetchAll} />

            <SegmentedControl options={TABS} value={tab} onChange={setTab} />

            {/* ── Rentabilité par chantier ── */}
            {tab === 'rentabilite' && (
                <section>
                    {worksites.length === 0 ? (
                        <EmptyState
                            icon={Hammer}
                            title="Aucun chantier en cours"
                            description="Dès qu'un devis est accepté, il apparaît ici avec ses heures prévues vs pointées."
                        />
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
                                💡 Renseignez votre taux horaire dans <Link to="/app/settings?tab=application" className="underline">Réglages › Application</Link> (Tarifs, zones de déplacement et IA)
                                pour valoriser les dépassements en euros.
                            </p>
                        </DismissibleHelp>
                    )}
                </section>
            )}

            {/* ── Feuille d'heures ── */}
            {tab === 'feuille' && (
                <section>
                    <div className="flex flex-wrap items-center justify-end gap-3 mb-4">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => shiftWeek(-1)}
                                className="tap-target p-2.5 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                                aria-label="Semaine précédente"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                                {formatDayDate(days[0])} – {formatDayDate(weekEnd)}
                            </span>
                            <button
                                onClick={() => shiftWeek(1)}
                                className="tap-target p-2.5 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                                aria-label="Semaine suivante"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                            <button
                                onClick={handleExport}
                                disabled={entries.length === 0}
                                className="tap-target flex items-center gap-1.5 text-sm font-medium px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
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
                                                <li
                                                    key={e.id}
                                                    className={`flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 rounded-lg ${
                                                        editingId === e.id ? 'bg-blue-50 dark:bg-blue-900/30 -mx-2 px-2 py-1' : ''
                                                    }`}
                                                >
                                                    <span className="font-medium tabular-nums w-14 flex-shrink-0">{formatHours(Number(e.hours_spent) || 0)}</span>
                                                    <span className="truncate flex-1">
                                                        {e.quote_id != null
                                                            ? (quoteLabels[e.quote_id] || `Devis #${e.quote_id}`)
                                                            : 'Sans chantier'}
                                                        {e.work_block && (
                                                            <span className="text-gray-500 dark:text-gray-400"> · {workBlockLabel(e.work_block)}</span>
                                                        )}
                                                        {e.reconstructed && (
                                                            <span className="text-gray-400 italic"> (reconstitué)</span>
                                                        )}
                                                        {e.notes ? <span className="text-gray-400"> · {e.notes}</span> : null}
                                                    </span>
                                                    <button
                                                        onClick={() => openEditForm(e)}
                                                        className="w-11 h-11 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex-shrink-0"
                                                        aria-label="Modifier ce pointage"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(e)}
                                                        disabled={deletingId === e.id}
                                                        className="w-11 h-11 flex items-center justify-center rounded-lg text-red-400 dark:text-red-400/80 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
                                                        aria-label="Supprimer ce pointage"
                                                    >
                                                        {deletingId === e.id
                                                            ? <Loader2 className="w-5 h-5 animate-spin" />
                                                            : <Trash2 className="w-5 h-5" />}
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

                    {/* Saisie manuelle / modification d'un pointage */}
                    {showForm ? (
                        <form ref={formRef} onSubmit={handleSubmitEntry} className="mt-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <p className="sm:col-span-2 lg:col-span-4 text-sm font-bold text-gray-900 dark:text-white">
                                {editingId ? 'Modifier le pointage' : 'Ajouter des heures'}
                            </p>
                            <div>
                                <label htmlFor="tt-date" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Date</label>
                                <input
                                    id="tt-date" type="date" required value={formDate}
                                    onChange={(e) => setFormDate(e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-3 text-base text-gray-900 dark:text-white"
                                />
                            </div>
                            <div>
                                <label htmlFor="tt-hours" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Heures</label>
                                <input
                                    id="tt-hours" type="text" inputMode="decimal" required placeholder="Ex : 3,5 ou 3h30"
                                    value={formHours} onChange={(e) => setFormHours(e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-3 text-base text-gray-900 dark:text-white"
                                />
                            </div>
                            <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap gap-2 -mt-1" role="group" aria-label="Durées rapides">
                                {QUICK_HOURS.map(q => (
                                    <button
                                        key={q.value} type="button" onClick={() => setFormHours(q.value)}
                                        className={`tap-target min-h-[44px] px-4 rounded-full border text-sm font-medium ${
                                            formHours === q.value
                                                ? 'bg-blue-600 border-blue-600 text-white'
                                                : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        {q.label}
                                    </button>
                                ))}
                            </div>
                            <div>
                                <label htmlFor="tt-quote" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Chantier</label>
                                <select
                                    id="tt-quote" value={formQuoteId}
                                    onChange={(e) => setFormQuoteId(e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-3 text-base text-gray-900 dark:text-white"
                                >
                                    <option value="">Sans chantier</option>
                                    {quoteOptions.map(o => (
                                        <option key={o.id} value={o.id}>{o.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="tt-block" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Bloc de travaux</label>
                                <select
                                    id="tt-block" value={formBlock}
                                    onChange={(e) => setFormBlock(e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-3 text-base text-gray-900 dark:text-white"
                                >
                                    <option value="">Non précisé</option>
                                    {WORK_BLOCKS.map(b => (
                                        <option key={b.id} value={b.id}>{b.hint ? `${b.label} (${b.hint})` : b.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="tt-note" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Note (optionnel)</label>
                                <input
                                    id="tt-note" type="text" placeholder="Ex : pose faïence"
                                    value={formNote} onChange={(e) => setFormNote(e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-3 text-base text-gray-900 dark:text-white"
                                />
                            </div>
                            <label className="sm:col-span-2 lg:col-span-4 flex items-start gap-3 min-h-[44px] text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                <input
                                    type="checkbox" checked={formReconstructed}
                                    onChange={(e) => setFormReconstructed(e.target.checked)}
                                    className="mt-0.5 w-5 h-5 rounded border-gray-300 dark:border-gray-600 flex-shrink-0"
                                />
                                <span>
                                    Reconstitué de mémoire
                                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                                        Découpage refait après coup, pas relevé sur le moment : il reste signalé pour ne pas le confondre avec du réel.
                                    </span>
                                </span>
                            </label>
                            <div className="sm:col-span-2 lg:col-span-4 flex gap-2 sm:justify-end">
                                <button
                                    type="button" onClick={closeForm}
                                    className="flex-1 sm:flex-none min-h-[48px] px-4 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    Annuler
                                </button>
                                <button
                                    type="submit" disabled={submitting}
                                    className="flex-1 sm:flex-none min-h-[48px] justify-center flex items-center gap-2 bg-blue-600 text-white text-sm font-bold px-5 rounded-xl hover:bg-blue-700 disabled:opacity-60"
                                >
                                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {editingId ? 'Enregistrer' : 'Ajouter'}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <button
                            onClick={openAddForm}
                            className="mt-4 w-full sm:w-auto min-h-[48px] justify-center flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 border border-blue-200 dark:border-blue-900 rounded-xl px-4"
                        >
                            <Plus className="w-4 h-4" /> Ajouter des heures manuellement
                        </button>
                    )}
                </section>
            )}
        </div>
    );
};

export default TimeTracking;
