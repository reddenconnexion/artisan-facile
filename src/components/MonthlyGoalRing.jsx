import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import { Target, Pencil } from 'lucide-react';
import { format, startOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';

// Anneau d'objectif mensuel, façon Apple Watch : un seul élément visuel,
// le CA encaissé du mois vs l'objectif fixé par l'artisan.
// Pas d'objectif défini -> petite carte discrète pour en fixer un.

const RADIUS = 42;
const STROKE = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const fmtEur = (v) => new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
}).format(v || 0);

const MonthlyGoalRing = ({ allQuotes, user }) => {
    const [goal, setGoal] = useState(undefined); // undefined = chargement, null = non défini
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [mounted, setMounted] = useState(false);

    // Même définition que le KPI « CA du mois » : factures payées ce mois-ci.
    const caThisMonth = useMemo(() => {
        const monthStart = startOfMonth(new Date());
        return (allQuotes || [])
            .filter(q => q.status === 'paid' && new Date(q.date || q.created_at) >= monthStart)
            .reduce((sum, q) => sum + (parseFloat(q.total_ttc) || 0), 0);
    }, [allQuotes]);

    useEffect(() => {
        if (!user?.id) return;
        supabase
            .from('profiles')
            .select('monthly_revenue_goal')
            .eq('id', user.id)
            .single()
            .then(({ data }) => setGoal(data?.monthly_revenue_goal ?? null));
    }, [user?.id]);

    // Remplissage animé de l'anneau à l'apparition.
    useEffect(() => {
        const t = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(t);
    }, []);

    const pct = goal > 0 ? Math.min(caThisMonth / goal, 1) : 0;
    const reached = goal > 0 && caThisMonth >= goal;

    // Célébration éphémère, une seule fois par mois.
    useEffect(() => {
        if (!reached) return;
        const key = `goal_celebrated_${format(new Date(), 'yyyy-MM')}`;
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, '1');
        toast.success('Objectif du mois atteint 🎉', {
            description: `${fmtEur(caThisMonth)} encaissés ce mois-ci.`,
        });
    }, [reached, caThisMonth]);

    const saveGoal = async (e) => {
        e.preventDefault();
        const value = parseFloat(String(draft).replace(',', '.'));
        if (!value || value <= 0) return;
        const { error } = await supabase
            .from('profiles')
            .update({ monthly_revenue_goal: value })
            .eq('id', user.id);
        if (error) {
            toast.error("Impossible d'enregistrer l'objectif");
            return;
        }
        setGoal(value);
        setEditing(false);
        setDraft('');
    };

    if (goal === undefined) return null; // chargement silencieux

    const editForm = (
        <form onSubmit={saveGoal} className="flex items-center gap-2">
            <input
                type="number"
                inputMode="decimal"
                min="1"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="ex : 8000"
                className="w-28 px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40"
            />
            <span className="text-sm text-gray-400">€</span>
            <button
                type="submit"
                className="px-3 py-1.5 text-sm font-medium text-white bg-[#007AFF] rounded-lg hover:opacity-90 active:opacity-80"
            >
                OK
            </button>
        </form>
    );

    // Pas d'objectif : carte discrète pour en définir un.
    if (goal === null) {
        return (
            <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-gray-200/70 dark:border-white/10 shadow-sm px-4 py-3 flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/30 shrink-0">
                    <Target size={18} className="text-[#007AFF]" />
                </div>
                {editing ? editForm : (
                    <>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-900 dark:text-white">Objectif du mois</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Fixez un objectif de chiffre d'affaires pour suivre votre progression.</div>
                        </div>
                        <button
                            onClick={() => setEditing(true)}
                            className="text-sm font-medium text-[#007AFF] hover:opacity-70 shrink-0"
                        >
                            Définir
                        </button>
                    </>
                )}
            </div>
        );
    }

    const ringColor = reached ? '#34C759' : '#007AFF';
    const offset = CIRCUMFERENCE * (1 - (mounted ? pct : 0));

    return (
        <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-gray-200/70 dark:border-white/10 shadow-sm p-4 sm:p-5 flex items-center gap-4 sm:gap-6">
            <div className="relative shrink-0" style={{ width: 104, height: 104 }}>
                <svg width="104" height="104" viewBox="0 0 104 104" className="-rotate-90">
                    <circle
                        cx="52" cy="52" r={RADIUS} fill="none"
                        strokeWidth={STROKE}
                        className="stroke-gray-100 dark:stroke-white/10"
                    />
                    <circle
                        cx="52" cy="52" r={RADIUS} fill="none"
                        stroke={ringColor}
                        strokeWidth={STROKE}
                        strokeLinecap="round"
                        strokeDasharray={CIRCUMFERENCE}
                        strokeDashoffset={offset}
                        style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1), stroke 0.3s' }}
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold tabular-nums" style={{ color: ringColor }}>
                        {Math.round(pct * 100)}%
                    </span>
                </div>
            </div>

            <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900 dark:text-white capitalize">
                    Objectif de {format(new Date(), 'MMMM', { locale: fr })}
                </div>
                {editing ? (
                    <div className="mt-2">{editForm}</div>
                ) : (
                    <>
                        <div className="mt-0.5 text-xl font-bold text-gray-900 dark:text-white tabular-nums">
                            {fmtEur(caThisMonth)}
                            <span className="text-sm font-medium text-gray-400 dark:text-gray-500"> sur {fmtEur(goal)}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-3">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                {reached ? 'Objectif atteint, bravo !' : `Encore ${fmtEur(goal - caThisMonth)} pour l'atteindre.`}
                            </span>
                            <button
                                onClick={() => { setDraft(String(goal)); setEditing(true); }}
                                className="text-xs text-[#007AFF] hover:opacity-70 flex items-center gap-1 shrink-0"
                                aria-label="Modifier l'objectif"
                            >
                                <Pencil size={11} /> Modifier
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default MonthlyGoalRing;
