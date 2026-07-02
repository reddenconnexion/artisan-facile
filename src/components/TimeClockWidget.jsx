import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Play, Square, Loader2, Timer, ChevronDown } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import {
    getRunningClock, startClock, stopClock,
    elapsedSeconds, secondsToHours, formatHours,
} from '../utils/timeTracking';

const pad = (n) => String(n).padStart(2, '0');
const formatChrono = (s) => `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;

/**
 * Widget de pointage ▶/⏹ : démarre un chrono associé à un chantier (devis
 * accepté) et enregistre les heures dans `task_tracking` à l'arrêt. Le chrono
 * survit aux rechargements (localStorage) et fonctionne hors ligne — seule la
 * sauvegarde finale nécessite le réseau.
 *
 * @param {boolean} compact - affichage réduit (mode Terrain)
 * @param {Function} onSaved - callback après enregistrement d'un pointage
 */
const TimeClockWidget = ({ compact = false, onSaved }) => {
    const [clock, setClock] = useState(() => getRunningClock());
    const [now, setNow] = useState(Date.now());
    const [saving, setSaving] = useState(false);

    // Chantiers pointables : devis acceptés (non archivés, non factures).
    const [worksites, setWorksites] = useState([]);
    const [selectedId, setSelectedId] = useState('');

    useEffect(() => {
        if (clock) return; // inutile de charger la liste pendant un pointage
        supabase.from('quotes')
            .select('id, title, client_name, work_stage')
            .eq('status', 'accepted')
            .neq('type', 'invoice')
            .order('created_at', { ascending: false })
            .limit(30)
            .then(({ data }) => {
                const list = (data || []).filter(q => q.work_stage !== 'completed');
                setWorksites(list);
                if (list.length > 0) setSelectedId(prev => prev || String(list[0].id));
            });
    }, [clock]);

    // Tic du chrono (1 s) uniquement quand un pointage tourne.
    useEffect(() => {
        if (!clock) return;
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [clock]);

    const elapsed = clock ? elapsedSeconds(clock.startedAt, now) : 0;

    const worksiteLabel = (q) =>
        [q.title, q.client_name].filter(Boolean).join(' — ') || `Devis #${q.id}`;

    const selectedWorksite = useMemo(
        () => worksites.find(q => String(q.id) === selectedId),
        [worksites, selectedId]
    );

    const handleStart = () => {
        const next = startClock({
            quoteId: selectedWorksite ? selectedWorksite.id : null,
            quoteLabel: selectedWorksite ? worksiteLabel(selectedWorksite) : 'Sans chantier',
        });
        setNow(Date.now());
        setClock(next);
        toast.success('Pointage démarré');
    };

    const handleStop = async () => {
        if (!clock || saving) return;
        const seconds = elapsedSeconds(clock.startedAt);
        const hours = secondsToHours(seconds);
        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Session expirée');
            const startedDate = new Date(clock.startedAt);
            const range = `${pad(startedDate.getHours())}:${pad(startedDate.getMinutes())} → ${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
            const { error } = await supabase.from('task_tracking').insert({
                user_id: user.id,
                quote_id: clock.quoteId,
                hours_spent: hours,
                date: new Date().toISOString().split('T')[0],
                notes: `Pointage ${range}`,
            });
            if (error) throw error;
            stopClock();
            setClock(null);
            toast.success(`${formatHours(hours)} enregistrées${clock.quoteLabel && clock.quoteId ? ` sur ${clock.quoteLabel}` : ''}`);
            onSaved?.();
        } catch (err) {
            console.error('Erreur enregistrement pointage:', err);
            // On ne perd pas le pointage : le chrono continue, l'artisan pourra
            // réessayer quand le réseau reviendra.
            toast.error("Impossible d'enregistrer — le chrono continue, réessayez.");
        } finally {
            setSaving(false);
        }
    };

    // ── Pointage en cours ────────────────────────────────────────────────────
    if (clock) {
        return (
            <div className={`bg-emerald-600 text-white rounded-2xl ${compact ? 'p-4' : 'p-6'} flex items-center gap-4 shadow-lg`}>
                <div className="flex-1 min-w-0">
                    <p className="text-emerald-100 text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        Pointage en cours
                    </p>
                    <p className={`font-mono font-bold tabular-nums ${compact ? 'text-2xl' : 'text-4xl'}`}>
                        {formatChrono(elapsed)}
                    </p>
                    {clock.quoteLabel && (
                        <p className="text-emerald-100 text-sm truncate">{clock.quoteLabel}</p>
                    )}
                </div>
                <button
                    onClick={handleStop}
                    disabled={saving}
                    className="flex items-center gap-2 bg-white text-emerald-700 font-bold px-5 py-3 rounded-xl hover:bg-emerald-50 transition-colors disabled:opacity-60 flex-shrink-0"
                >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Square className="w-5 h-5 fill-current" />}
                    {compact ? '' : 'Je repars'}
                </button>
            </div>
        );
    }

    // ── Prêt à pointer ───────────────────────────────────────────────────────
    return (
        <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl ${compact ? 'p-4' : 'p-6'}`}>
            <div className="flex items-center gap-2 mb-3">
                <Timer className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-gray-900 dark:text-white">Pointer mes heures</h3>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 min-w-0">
                    <select
                        value={selectedId}
                        onChange={(e) => setSelectedId(e.target.value)}
                        className="w-full appearance-none bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 pr-10 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        aria-label="Chantier à pointer"
                    >
                        {worksites.length === 0 && <option value="">Sans chantier (heures libres)</option>}
                        {worksites.map(q => (
                            <option key={q.id} value={q.id}>{worksiteLabel(q)}</option>
                        ))}
                        {worksites.length > 0 && <option value="">Sans chantier (heures libres)</option>}
                    </select>
                    <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <button
                    onClick={handleStart}
                    className="flex items-center justify-center gap-2 bg-emerald-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-emerald-700 transition-colors flex-shrink-0"
                >
                    <Play className="w-5 h-5 fill-current" />
                    J'arrive au chantier
                </button>
            </div>
            {!compact && worksites.length === 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                    Aucun devis accepté en cours — les heures seront pointées sans chantier.
                    Vous pourrez les retrouver dans votre <Link to="/app/heures" className="underline">feuille d'heures</Link>.
                </p>
            )}
        </div>
    );
};

export default TimeClockWidget;
