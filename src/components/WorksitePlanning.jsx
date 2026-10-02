import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { startOfWeek, toDateString } from '../utils/timeTracking';
import { urgencyWeight } from '../utils/urgency';
import { updateWorksiteUrgency } from '../utils/worksites';
import { UrgencyBadge } from './ui';
import { formatDate } from '../utils/format';

// Vue planning des chantiers, volontairement minimale : une ligne par
// chantier, une pastille par jour où il a un rendez-vous d'agenda. Les RDV
// sans chantier (visites devis, dépannages…) ont leurs propres lignes, pour
// que le planning reflète tout l'agenda.
// Pas de dépendance Gantt — juste des dates, des pastilles et aujourd'hui.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS_SHOWN = 5;
const DAYS_SHOWN = WEEKS_SHOWN * 7;
const DAY_WIDTH = 34; // px — assez pour toucher au doigt, assez dense pour 5 semaines
// Largeur de la colonne des noms de chantier : réduite sur mobile pour laisser
// de la place à la timeline (sur un écran de 375 px, 176 px en mangeaient la moitié).
const LABEL_WIDTH_MOBILE = 120;
const LABEL_WIDTH_DESKTOP = 176;

// Vrai tant que le viewport est « mobile » (< 640 px, breakpoint sm de Tailwind).
// On s'en sert pour dimensionner la colonne de gauche et centrer « aujourd'hui ».
const useIsMobile = () => {
    const query = '(max-width: 639px)';
    const [isMobile, setIsMobile] = useState(
        () => typeof window !== 'undefined' && window.matchMedia(query).matches
    );
    useEffect(() => {
        const mq = window.matchMedia(query);
        const onChange = (e) => setIsMobile(e.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);
    return isMobile;
};

const STAGE_COLORS = {
    pending_deposit: 'bg-red-400',
    material_order: 'bg-indigo-400',
    planned: 'bg-blue-400',
    in_progress: 'bg-amber-400',
    completed: 'bg-emerald-400',
};

const dayIndex = (dateStr, rangeStart) =>
    Math.round((new Date(`${dateStr}T00:00:00`) - rangeStart) / DAY_MS);

// Couleur des lignes « hors chantier » (visites, dépannages, RDV divers).
const OTHER_COLOR = 'bg-gray-400 dark:bg-gray-500';

const LEGEND = [
    { color: STAGE_COLORS.pending_deposit, label: 'Attente acompte' },
    { color: STAGE_COLORS.material_order, label: 'Commande matériel' },
    { color: STAGE_COLORS.planned, label: 'Planifié' },
    { color: STAGE_COLORS.in_progress, label: 'En cours' },
    { color: STAGE_COLORS.completed, label: 'Terminé' },
    { color: OTHER_COLOR, label: 'Hors chantier' },
];

// Regroupe les RDV d'une ligne par jour : { 'YYYY-MM-DD': [rdv, …] }.
const groupByDay = (rdvs) => {
    const byDay = {};
    for (const r of rdvs) (byDay[r.day] = byDay[r.day] || []).push(r);
    return byDay;
};

const WorksitePlanning = ({ worksites }) => {
    const navigate = useNavigate();
    // RDV bruts (rattachés à un devis et/ou à un client) : on décide du
    // rattachement à un chantier plus bas, quand on connaît les chantiers.
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    // Décalage en semaines par rapport à aujourd'hui (0 = semaine courante en 2e position)
    const [offset, setOffset] = useState(0);
    const isMobile = useIsMobile();
    const labelWidth = isMobile ? LABEL_WIDTH_MOBILE : LABEL_WIDTH_DESKTOP;
    // Conteneur scrollable de la timeline — on le recentre sur « aujourd'hui ».
    const scrollRef = useRef(null);

    const rangeStart = useMemo(() => {
        const start = startOfWeek(new Date());
        start.setDate(start.getDate() + (offset - 1) * 7); // une semaine de contexte passé
        return start;
    }, [offset]);

    const days = useMemo(() =>
        Array.from({ length: DAYS_SHOWN }, (_, i) => {
            const d = new Date(rangeStart);
            d.setDate(d.getDate() + i);
            return d;
        }), [rangeStart]);

    const todayIdx = dayIndex(toDateString(new Date()), rangeStart);

    // Au chargement (et quand on revient à « Aujourd'hui »), on centre la
    // timeline sur la date du jour. Sans ça, sur mobile la vue reste calée à
    // gauche sur la semaine passée et « aujourd'hui » démarre hors écran.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || loading) return;
        if (todayIdx < 0 || todayIdx >= DAYS_SHOWN) return;
        const todayCenter = labelWidth + todayIdx * DAY_WIDTH + DAY_WIDTH / 2;
        const target = todayCenter - el.clientWidth / 2;
        el.scrollLeft = Math.max(0, target);
    }, [loading, offset, todayIdx, labelWidth]);

    useEffect(() => {
        let active = true;
        // On récupère aussi client_id : un RDV programmé sans « Devis associé »
        // (quote_id nul) doit quand même apparaître sur le chantier du client.
        // Les avenants (parent_quote_id) servent à ramener sur le chantier
        // initial un RDV rattaché à un avenant.
        Promise.all([
            supabase.from('events').select('id, quote_id, client_id, client_name, title, time, date'),
            supabase.from('quotes').select('id, parent_quote_id').not('parent_quote_id', 'is', null),
        ]).then(([{ data }, { data: amendments }]) => {
            if (!active) return;
            const parentOf = {};
            for (const a of amendments || []) parentOf[a.id] = a.parent_quote_id;
            // Remonte jusqu'au devis racine (garde-fou contre une boucle).
            const rootOf = (id) => {
                let cur = id;
                for (let i = 0; i < 10 && parentOf[cur] != null; i++) cur = parentOf[cur];
                return cur;
            };
            const rows = [];
            for (const e of data || []) {
                if (!e.date) continue;
                rows.push({
                    id: e.id,
                    quote_id: e.quote_id != null ? rootOf(e.quote_id) : null,
                    client_id: e.client_id,
                    client_name: (e.client_name || '').trim(),
                    title: (e.title || '').trim(),
                    time: e.time,
                    day: toDateString(new Date(e.date)),
                });
            }
            setEvents(rows);
            setLoading(false);
        });
        return () => { active = false; };
    }, []);

    // Premier / dernier jour affichés, pour ne garder que les lignes utiles.
    const rangeFirstDay = toDateString(days[0]);
    const rangeLastDay = toDateString(days[DAYS_SHOWN - 1]);
    const inRange = (day) => day >= rangeFirstDay && day <= rangeLastDay;

    // Chantiers avec au moins un RDV → une ligne ; les autres → « À planifier ».
    // RDV sans chantier identifiable → lignes « hors chantier » par client.
    const { planned, others, unplanned } = useMemo(() => {
        const activeWorksites = worksites.filter(w => w.work_stage !== 'completed');
        const worksiteIds = new Set(worksites.map(w => String(w.id)));

        // Combien de chantiers actifs par client ? Sert à rattacher sans risque
        // un RDV « client seul » : on ne le fait que si le rattachement est
        // univoque (un unique chantier actif pour ce client).
        const activeByClient = {};
        for (const w of activeWorksites) {
            if (w.client_id != null) {
                (activeByClient[w.client_id] = activeByClient[w.client_id] || []).push(w);
            }
        }

        const rdvsByWorksite = {};
        const otherGroups = {};
        const pushTo = (map, key, r) => { (map[key] = map[key] || []).push(r); };
        for (const e of events) {
            if (e.quote_id != null && worksiteIds.has(String(e.quote_id))) {
                pushTo(rdvsByWorksite, e.quote_id, e);
                continue;
            }
            const candidates = e.client_id != null ? activeByClient[e.client_id] : null;
            if (e.quote_id == null && candidates?.length === 1) {
                pushTo(rdvsByWorksite, candidates[0].id, e);
                continue;
            }
            // Hors chantier : regroupé par client, ou « Divers » sans client.
            const key = e.client_id != null ? `c${e.client_id}`
                : e.client_name ? `n${e.client_name.toLowerCase()}` : 'divers';
            pushTo(otherGroups, key, e);
        }

        const planned = [];
        const unplanned = [];
        for (const w of worksites) {
            const rdvs = rdvsByWorksite[w.id] || [];
            const isCompleted = w.work_stage === 'completed';
            if (rdvs.length > 0) {
                // Un chantier terminé ne reste affiché que s'il a un RDV sur la
                // période visible — sinon il encombrerait le planning à vie.
                if (isCompleted && !rdvs.some(r => inRange(r.day))) continue;
                const sorted = rdvs.map(r => r.day).sort();
                planned.push({ worksite: w, rdvs, from: sorted[0], to: sorted[sorted.length - 1] });
            } else if (!isCompleted && w.work_stage !== 'pending_deposit') {
                // Un chantier en attente d'acompte n'est pas confirmé : inutile
                // de l'inviter à « planifier » tant que l'acompte n'est pas payé.
                // (S'il a déjà un RDV, il reste visible via la branche ci-dessus.)
                unplanned.push(w);
            }
        }

        const others = Object.entries(otherGroups)
            .map(([key, rdvs]) => {
                const visible = rdvs.filter(r => inRange(r.day));
                if (visible.length === 0) return null;
                const sorted = visible.map(r => r.day).sort();
                return {
                    key,
                    name: key === 'divers' ? 'Divers' : (rdvs.find(r => r.client_name)?.client_name || 'Client'),
                    subtitle: visible.length === 1 ? visible[0].title : `${visible.length} RDV hors chantier`,
                    rdvs: visible,
                    from: sorted[0],
                };
            })
            .filter(Boolean);

        // Les lignes les plus proches en premier — l'œil lit de haut en bas.
        planned.sort((a, b) => a.from.localeCompare(b.from));
        others.sort((a, b) => a.from.localeCompare(b.from));
        // Les chantiers "à planifier" les plus urgents remontent en tête de liste.
        unplanned.sort((a, b) => urgencyWeight(b.urgency) - urgencyWeight(a.urgency));
        return { planned, others, unplanned };
    // inRange dépend uniquement de rangeFirstDay / rangeLastDay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [worksites, events, rangeFirstDay, rangeLastDay]);

    const handleUrgencyChange = async (quoteId, urgency) => {
        try {
            await updateWorksiteUrgency(quoteId, urgency);
        } catch (e) {
            toast.error("Impossible de mettre à jour l'urgence : " + e.message);
        }
    };

    const label = (w) => w.clients?.name || w.title || `Devis #${w.id}`;

    const planWorksite = (job) => {
        const address = job.intervention_address
            ? `${job.intervention_address} ${job.intervention_postal_code || ''} ${job.intervention_city || ''}`
            : `${job.clients?.address || ''} ${job.clients?.city || ''}`;
        navigate('/app/agenda', {
            state: {
                prefill: {
                    client_id: job.client_id,
                    client_name: job.clients?.name,
                    address: address.trim(),
                    title: `Intervention ${job.clients?.name || ''} - ${job.title || ''}`.trim(),
                },
            },
        });
    };

    // Une ligne de la timeline : nom à gauche, puis une pastille par jour de
    // RDV. Chaque pastille occupe exactement la case de son jour et porte le
    // numéro du jour : on voit d'un coup d'œil quels jours sont pris, même
    // quand plusieurs RDV se suivent (un fin trait relie alors les pastilles).
    const renderRow = ({ key, name, subtitle, badge, color, rdvs, onOpen }) => {
        const byDay = groupByDay(rdvs);
        const visibleIdx = new Set(
            Object.keys(byDay)
                .map(d => dayIndex(d, rangeStart))
                .filter(i => i >= 0 && i < DAYS_SHOWN)
        );
        return (
            <div key={key} className="flex items-stretch border-b border-gray-50 dark:border-gray-800/60 last:border-b-0 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                <button
                    onClick={onOpen}
                    className="shrink-0 sticky left-0 bg-white dark:bg-gray-900 z-10 text-left px-4 py-2.5 group"
                    style={{ width: labelWidth }}
                >
                    <span className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-blue-600 transition-colors">
                            {name}
                        </span>
                        {badge}
                    </span>
                    {subtitle && (
                        <p className="text-[11px] text-gray-400 truncate">{subtitle}</p>
                    )}
                </button>
                <div className="relative flex" style={{ width: DAYS_SHOWN * DAY_WIDTH, minHeight: 48 }}>
                    {/* Fond des colonnes : week-end grisé et séparation des semaines,
                        alignés sur l'en-tête pour lire le jour sous chaque pastille. */}
                    {days.map((d, i) => {
                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                        const isMonday = d.getDay() === 1;
                        return (
                            <div
                                key={i}
                                className={`shrink-0 ${isWeekend ? 'bg-gray-50/80 dark:bg-gray-800/40' : ''} ${isMonday ? 'border-l border-gray-100 dark:border-gray-800' : ''}`}
                                style={{ width: DAY_WIDTH }}
                            />
                        );
                    })}
                    {/* Repère aujourd'hui */}
                    {todayIdx >= 0 && todayIdx < DAYS_SHOWN && (
                        <div
                            className="absolute top-0 bottom-0 w-px bg-blue-500/30"
                            style={{ left: todayIdx * DAY_WIDTH + DAY_WIDTH / 2 }}
                        />
                    )}
                    {[...visibleIdx].map(i => {
                        const day = toDateString(days[i]);
                        const dayRdvs = byDay[day];
                        const linkedNext = visibleIdx.has(i + 1);
                        const tooltip = [
                            `${name} — ${formatDate(days[i], { weekday: 'long', day: 'numeric', month: 'long' })}`,
                            ...dayRdvs.map(r => `• ${r.time ? `${r.time.slice(0, 5)} ` : ''}${r.title || 'RDV'}`),
                        ].join('\n');
                        return (
                            <span key={i}>
                                {/* Trait de liaison vers la pastille du lendemain */}
                                {linkedNext && (
                                    <span
                                        className={`absolute top-1/2 -translate-y-1/2 h-1 ${color} opacity-50`}
                                        style={{ left: i * DAY_WIDTH + DAY_WIDTH - 3, width: 6 }}
                                    />
                                )}
                                <button
                                    onClick={onOpen}
                                    className={`absolute top-1/2 -translate-y-1/2 h-7 rounded-lg ${color} text-white text-[11px] font-bold tabular-nums shadow-sm ring-1 ring-black/5 hover:brightness-110 hover:scale-105 transition flex items-center justify-center`}
                                    style={{ left: i * DAY_WIDTH + 3, width: DAY_WIDTH - 6 }}
                                    title={tooltip}
                                    aria-label={tooltip}
                                >
                                    {days[i].getDate()}
                                    {dayRdvs.length > 1 && (
                                        <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[9px] leading-[14px] text-center">
                                            {dayRdvs.length}
                                        </span>
                                    )}
                                </button>
                            </span>
                        );
                    })}
                </div>
            </div>
        );
    };

    if (loading) {
        return <div className="flex justify-center items-center h-40 text-gray-400 text-sm">Chargement du planning…</div>;
    }

    return (
        <div className="px-4 pb-8 space-y-6">
            {/* Navigation temporelle — sobre, centrée sur le mois affiché */}
            <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900 dark:text-white capitalize">
                    {formatDate(days[Math.floor(DAYS_SHOWN / 2)], { month: 'long', year: 'numeric' })}
                </p>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setOffset(o => o - 2)}
                        className="p-2 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        aria-label="Semaines précédentes"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    {offset !== 0 && (
                        <button
                            onClick={() => setOffset(0)}
                            className="text-xs font-medium text-blue-600 px-2 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20"
                        >
                            Aujourd'hui
                        </button>
                    )}
                    <button
                        onClick={() => setOffset(o => o + 2)}
                        className="p-2 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        aria-label="Semaines suivantes"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Timeline */}
            <div ref={scrollRef} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-x-auto">
                <div style={{ minWidth: labelWidth + DAYS_SHOWN * DAY_WIDTH }}>
                    {/* En-tête des jours */}
                    <div className="flex border-b border-gray-100 dark:border-gray-800">
                        <div className="shrink-0 sticky left-0 bg-white dark:bg-gray-900 z-10" style={{ width: labelWidth }} />
                        <div className="flex">
                            {days.map((d, i) => {
                                const isToday = i === todayIdx;
                                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                const isMonday = d.getDay() === 1;
                                return (
                                    <div
                                        key={i}
                                        className={`text-center py-2 ${isWeekend ? 'bg-gray-50/80 dark:bg-gray-800/40' : ''} ${isMonday ? 'border-l border-gray-100 dark:border-gray-800' : ''}`}
                                        style={{ width: DAY_WIDTH }}
                                    >
                                        <p className="text-[10px] text-gray-400 leading-none">
                                            {formatDate(d, { weekday: 'narrow' })}
                                        </p>
                                        <p className={`text-xs mt-1 leading-none tabular-nums ${isToday
                                            ? 'mx-auto w-5 h-5 flex items-center justify-center rounded-full bg-blue-600 text-white font-bold'
                                            : 'text-gray-600 dark:text-gray-300'}`}>
                                            {d.getDate()}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Lignes chantiers */}
                    {planned.length === 0 && others.length === 0 ? (
                        <div className="py-14 text-center text-sm text-gray-400">
                            Aucun rendez-vous sur cette période.
                        </div>
                    ) : (
                        <>
                            {planned.map(({ worksite: w, rdvs }) => renderRow({
                                key: w.id,
                                name: label(w),
                                subtitle: w.title,
                                badge: <UrgencyBadge value={w.urgency} />,
                                color: STAGE_COLORS[w.work_stage || 'planned'] || STAGE_COLORS.planned,
                                rdvs,
                                onOpen: () => navigate(`/app/devis/${w.id}`),
                            }))}
                            {others.length > 0 && (
                                <div className="flex border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/30">
                                    <p
                                        className="shrink-0 sticky left-0 z-10 bg-gray-50 dark:bg-gray-800/90 px-4 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap"
                                        style={{ width: labelWidth }}
                                    >
                                        Hors chantier
                                    </p>
                                </div>
                            )}
                            {others.map(o => renderRow({
                                key: o.key,
                                name: o.name,
                                subtitle: o.subtitle,
                                color: OTHER_COLOR,
                                rdvs: o.rdvs,
                                onOpen: () => navigate('/app/agenda'),
                            }))}
                        </>
                    )}
                </div>
            </div>

            {/* Légende des couleurs */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 -mt-3">
                {LEGEND.map(l => (
                    <span key={l.label} className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                        <span className={`w-2.5 h-2.5 rounded-sm ${l.color}`} />
                        {l.label}
                    </span>
                ))}
            </div>

            {/* À planifier — liste discrète sous la timeline */}
            {unplanned.length > 0 && (
                <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                        À planifier · {unplanned.length}
                    </p>
                    <div className="space-y-1">
                        {unplanned.map(w => (
                            <div
                                key={w.id}
                                className="flex items-center justify-between bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-2.5"
                            >
                                <button
                                    onClick={() => navigate(`/app/devis/${w.id}`)}
                                    className="text-left min-w-0 flex-1 group"
                                >
                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-blue-600 transition-colors">
                                        {label(w)}
                                    </p>
                                    {w.title && <p className="text-[11px] text-gray-400 truncate">{w.title}</p>}
                                </button>
                                <div className="flex items-center gap-2 shrink-0">
                                    <UrgencyBadge value={w.urgency} onChange={(u) => handleUrgencyChange(w.id, u)} />
                                    <button
                                        onClick={() => planWorksite(w)}
                                        className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 px-3 py-1.5 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                    >
                                        <Calendar className="w-3.5 h-3.5" />
                                        Planifier
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default WorksitePlanning;
