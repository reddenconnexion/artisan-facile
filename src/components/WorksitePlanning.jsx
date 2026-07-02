import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { startOfWeek, toDateString } from '../utils/timeTracking';

// Vue planning des chantiers, volontairement minimale : une ligne par
// chantier, une barre entre son premier et son dernier rendez-vous d'agenda.
// Pas de dépendance Gantt — juste des dates, des barres et aujourd'hui.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS_SHOWN = 5;
const DAYS_SHOWN = WEEKS_SHOWN * 7;
const DAY_WIDTH = 34; // px — assez pour toucher au doigt, assez dense pour 5 semaines

const STAGE_COLORS = {
    pending_deposit: 'bg-red-400',
    material_order: 'bg-indigo-400',
    planned: 'bg-blue-400',
    in_progress: 'bg-amber-400',
    completed: 'bg-emerald-400',
};

const dayIndex = (dateStr, rangeStart) =>
    Math.round((new Date(`${dateStr}T00:00:00`) - rangeStart) / DAY_MS);

const WorksitePlanning = ({ worksites }) => {
    const navigate = useNavigate();
    const [eventsByQuote, setEventsByQuote] = useState({});
    const [loading, setLoading] = useState(true);
    // Décalage en semaines par rapport à aujourd'hui (0 = semaine courante en 2e position)
    const [offset, setOffset] = useState(0);

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

    useEffect(() => {
        let active = true;
        supabase.from('events')
            .select('quote_id, date')
            .not('quote_id', 'is', null)
            .then(({ data }) => {
                if (!active) return;
                const map = {};
                for (const e of data || []) {
                    if (!e.date) continue;
                    const day = toDateString(new Date(e.date));
                    (map[e.quote_id] = map[e.quote_id] || []).push(day);
                }
                setEventsByQuote(map);
                setLoading(false);
            });
        return () => { active = false; };
    }, []);

    // Chantiers avec au moins un RDV → une barre ; les autres → « À planifier ».
    const { planned, unplanned } = useMemo(() => {
        const planned = [];
        const unplanned = [];
        for (const w of worksites) {
            if (w.work_stage === 'completed') continue; // le planning regarde devant
            const dates = eventsByQuote[w.id];
            if (dates && dates.length > 0) {
                const sorted = [...dates].sort();
                planned.push({ worksite: w, from: sorted[0], to: sorted[sorted.length - 1], dates: sorted });
            } else {
                unplanned.push(w);
            }
        }
        // Les barres les plus proches en premier — l'œil lit de haut en bas
        planned.sort((a, b) => a.from.localeCompare(b.from));
        return { planned, unplanned };
    }, [worksites, eventsByQuote]);

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

    if (loading) {
        return <div className="flex justify-center items-center h-40 text-gray-400 text-sm">Chargement du planning…</div>;
    }

    return (
        <div className="px-4 pb-8 space-y-6">
            {/* Navigation temporelle — sobre, centrée sur le mois affiché */}
            <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900 dark:text-white capitalize">
                    {days[Math.floor(DAYS_SHOWN / 2)].toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
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
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-x-auto">
                <div style={{ minWidth: 176 + DAYS_SHOWN * DAY_WIDTH }}>
                    {/* En-tête des jours */}
                    <div className="flex border-b border-gray-100 dark:border-gray-800">
                        <div className="w-44 shrink-0 sticky left-0 bg-white dark:bg-gray-900 z-10" />
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
                                            {d.toLocaleDateString('fr-FR', { weekday: 'narrow' })}
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
                    {planned.length === 0 ? (
                        <div className="py-14 text-center text-sm text-gray-400">
                            Aucun rendez-vous de chantier sur cette période.
                        </div>
                    ) : (
                        planned.map(({ worksite: w, from, to, dates }) => {
                            const startIdx = dayIndex(from, rangeStart);
                            const endIdx = dayIndex(to, rangeStart);
                            // Hors champ ? On dessine quand même la partie visible.
                            const visStart = Math.max(0, startIdx);
                            const visEnd = Math.min(DAYS_SHOWN - 1, endIdx);
                            const visible = visEnd >= 0 && visStart <= DAYS_SHOWN - 1;
                            const color = STAGE_COLORS[w.work_stage || 'planned'] || STAGE_COLORS.planned;
                            return (
                                <div key={w.id} className="flex items-center border-b border-gray-50 dark:border-gray-800/60 last:border-b-0 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                                    <button
                                        onClick={() => navigate(`/app/devis/${w.id}`)}
                                        className="w-44 shrink-0 sticky left-0 bg-white dark:bg-gray-900 z-10 text-left px-4 py-3 group"
                                    >
                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-blue-600 transition-colors">
                                            {label(w)}
                                        </p>
                                        {w.title && (
                                            <p className="text-[11px] text-gray-400 truncate">{w.title}</p>
                                        )}
                                    </button>
                                    <div className="relative" style={{ width: DAYS_SHOWN * DAY_WIDTH, height: 44 }}>
                                        {/* Repère aujourd'hui */}
                                        {todayIdx >= 0 && todayIdx < DAYS_SHOWN && (
                                            <div
                                                className="absolute top-0 bottom-0 w-px bg-blue-500/30"
                                                style={{ left: todayIdx * DAY_WIDTH + DAY_WIDTH / 2 }}
                                            />
                                        )}
                                        {visible && (
                                            <button
                                                onClick={() => navigate(`/app/devis/${w.id}`)}
                                                className={`absolute top-1/2 -translate-y-1/2 h-3.5 rounded-full ${color} opacity-90 hover:opacity-100 transition-opacity`}
                                                style={{
                                                    left: visStart * DAY_WIDTH + 4,
                                                    width: Math.max((visEnd - visStart + 1) * DAY_WIDTH - 8, DAY_WIDTH - 8),
                                                }}
                                                title={`${label(w)} — du ${new Date(`${from}T00:00:00`).toLocaleDateString('fr-FR')} au ${new Date(`${to}T00:00:00`).toLocaleDateString('fr-FR')} (${dates.length} RDV)`}
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
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
                                <button
                                    onClick={() => planWorksite(w)}
                                    className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 px-3 py-1.5 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors shrink-0"
                                >
                                    <Calendar className="w-3.5 h-3.5" />
                                    Planifier
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default WorksitePlanning;
