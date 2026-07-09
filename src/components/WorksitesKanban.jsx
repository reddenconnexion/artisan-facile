import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Kanban, ChevronRight, FileText, Package, Calendar, Hammer, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useTestMode } from '../context/TestModeContext';
import { supabase } from '../utils/supabase';
import { fetchWorksites, WORKSITE_STAGES } from '../utils/worksites';

// Métadonnées d'affichage par colonne (reprend les étapes partagées + une icône
// et une couleur de liseré, alignées sur la page Pilotage Chantiers).
const COLUMN_META = {
    pending_deposit: { icon: FileText,    border: '#EF4444', head: 'bg-red-50 dark:bg-red-900/15' },
    material_order:  { icon: Package,     border: '#6366F1', head: 'bg-indigo-50 dark:bg-indigo-900/15' },
    planned:         { icon: Calendar,    border: '#3B82F6', head: 'bg-blue-50 dark:bg-blue-900/15' },
    in_progress:     { icon: Hammer,      border: '#F59E0B', head: 'bg-amber-50 dark:bg-amber-900/15' },
    completed:       { icon: CheckCircle, border: '#10B981', head: 'bg-emerald-50 dark:bg-emerald-900/15' },
};

/**
 * « Chantiers » — mini-kanban du tableau de bord.
 *
 * Reprend visuellement le Pilotage Chantiers : une colonne par étape, des
 * cartes déplaçables d'une colonne à l'autre (met à jour `work_stage`).
 * Version compacte à défilement horizontal. Réutilise l'util partagé
 * `fetchWorksites` pour rester cohérent avec la page complète. Ne s'affiche
 * pas s'il n'y a aucun chantier.
 */
const WorksitesKanban = () => {
    const { user } = useAuth();
    const { isTestMode } = useTestMode();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [worksites, setWorksites] = useState([]);
    const [movingId, setMovingId] = useState(null);
    const [dragOverStage, setDragOverStage] = useState(null);

    const isTestQuote = useCallback(
        (q) => !isTestMode && q.clients?.name?.includes('⚗️'),
        [isTestMode],
    );

    useEffect(() => {
        if (!user) return;
        let active = true;
        (async () => {
            try {
                const { worksites: data } = await fetchWorksites();
                if (active) setWorksites(data.filter(q => !isTestQuote(q)));
            } catch (e) {
                console.error('WorksitesKanban load failed', e);
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, [user, isTestQuote]);

    const byStage = useMemo(() => {
        const map = Object.fromEntries(WORKSITE_STAGES.map(s => [s.id, []]));
        for (const w of worksites) {
            const stage = w.work_stage && map[w.work_stage] ? w.work_stage : 'planned';
            map[stage].push(w);
        }
        return map;
    }, [worksites]);

    const updateStage = async (quoteId, newStage) => {
        const current = worksites.find(w => w.id === quoteId);
        if (!current || current.work_stage === newStage) return;
        const previousStage = current.work_stage;

        // Optimiste : on déplace la carte tout de suite, on annule en cas d'échec.
        setWorksites(prev => prev.map(w => (w.id === quoteId ? { ...w, work_stage: newStage } : w)));
        setMovingId(quoteId);
        try {
            const { error } = await supabase.from('quotes').update({ work_stage: newStage }).eq('id', quoteId);
            if (error) throw error;
            toast.success('Chantier déplacé');
        } catch (e) {
            setWorksites(prev => prev.map(w => (w.id === quoteId ? { ...w, work_stage: previousStage } : w)));
            toast.error('Déplacement impossible : ' + e.message);
        } finally {
            setMovingId(null);
        }
    };

    const handleDragStart = (e, quoteId) => {
        e.dataTransfer.setData('quoteId', String(quoteId));
        e.dataTransfer.effectAllowed = 'move';
    };
    const handleDrop = (e, stage) => {
        e.preventDefault();
        setDragOverStage(null);
        const quoteId = e.dataTransfer.getData('quoteId');
        if (quoteId) updateStage(Number(quoteId), stage);
    };

    if (loading || worksites.length === 0) return null;

    return (
        <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-gray-200/70 dark:border-white/10 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/10">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <Kanban size={15} className="text-blue-600" />
                    Chantiers
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                        {worksites.length}
                    </span>
                </h3>
                <button
                    onClick={() => navigate('/app/chantiers')}
                    className="text-xs text-[#007AFF] hover:opacity-70 flex items-center gap-0.5"
                >
                    Vue complète <ChevronRight size={12} />
                </button>
            </div>

            {/* Colonnes — défilement horizontal, chaque colonne défile verticalement */}
            <div className="flex gap-3 overflow-x-auto p-3">
                {WORKSITE_STAGES.map(stage => {
                    const meta = COLUMN_META[stage.id];
                    const Icon = meta.icon;
                    const items = byStage[stage.id];
                    const isOver = dragOverStage === stage.id;
                    return (
                        <div
                            key={stage.id}
                            onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage.id); }}
                            onDragLeave={() => setDragOverStage(prev => (prev === stage.id ? null : prev))}
                            onDrop={(e) => handleDrop(e, stage.id)}
                            className={`w-60 shrink-0 rounded-xl border transition-colors ${
                                isOver
                                    ? 'border-blue-400 bg-blue-50/60 dark:bg-blue-900/20'
                                    : 'border-gray-100 dark:border-white/10 bg-gray-50/60 dark:bg-white/[0.02]'
                            }`}
                        >
                            {/* En-tête de colonne */}
                            <div className={`flex items-center gap-2 px-3 py-2 rounded-t-xl ${meta.head}`}>
                                <Icon className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300 shrink-0" />
                                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">{stage.title}</span>
                                <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-gray-700">
                                    {items.length}
                                </span>
                            </div>

                            {/* Cartes */}
                            <div className="p-2 space-y-2 max-h-72 overflow-y-auto min-h-[56px]">
                                {items.length === 0 ? (
                                    <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center py-4">—</p>
                                ) : (
                                    items.map(job => (
                                        <div
                                            key={job.id}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, job.id)}
                                            onClick={() => navigate(`/app/devis/${job.id}`)}
                                            className="bg-white dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800 border-l-4 p-2.5 shadow-sm hover:shadow-md transition-shadow cursor-pointer active:cursor-grabbing"
                                            style={{ borderLeftColor: meta.border }}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                                                    {job.clients?.name || 'Client'}
                                                </p>
                                                {movingId === job.id && <Loader2 className="w-3 h-3 animate-spin text-gray-400 shrink-0" />}
                                            </div>
                                            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                                {job.title || `Devis #${job.id}`}
                                            </p>
                                            <p className="text-[11px] font-bold text-gray-700 dark:text-gray-300 mt-1">
                                                {(Number(job.total_ttc) || 0).toFixed(0)} €
                                            </p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default WorksitesKanban;
