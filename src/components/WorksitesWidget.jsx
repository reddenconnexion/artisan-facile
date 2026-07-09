import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hammer, ChevronRight, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTestMode } from '../context/TestModeContext';
import { fetchWorksites, WORKSITE_STAGES, WORKSITE_STAGE_MAP } from '../utils/worksites';

// Nombre de chantiers listés avant de replier le reste. Garde le widget compact.
const PREVIEW_COUNT = 4;

// Ordre d'affichage des chantiers actifs : on suit le pipeline (attente acompte →
// commande → à planifier → en cours), « terminé » étant exclu de la liste.
const STAGE_ORDER = WORKSITE_STAGES.map(s => s.id);
const stageRank = (id) => {
    const i = STAGE_ORDER.indexOf(id);
    return i === -1 ? STAGE_ORDER.length : i;
};

/**
 * « Chantiers en cours » — widget du tableau de bord.
 *
 * Vue synthétique des chantiers (devis signés en cours de réalisation) : un
 * compteur par étape, puis une liste compacte des chantiers actifs. Réutilise
 * la même mécanique d'auto-classement que la page Pilotage Chantiers pour que
 * les chiffres concordent. Ne s'affiche pas s'il n'y a aucun chantier actif.
 */
const WorksitesWidget = () => {
    const { user } = useAuth();
    const { isTestMode } = useTestMode();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [worksites, setWorksites] = useState([]);
    const [showAll, setShowAll] = useState(false);

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
                console.error('WorksitesWidget load failed', e);
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, [user, isTestQuote]);

    // Chantiers actifs = tout sauf « terminé ». On les trie selon le pipeline.
    const activeWorksites = useMemo(
        () => worksites
            .filter(w => w.work_stage !== 'completed')
            .sort((a, b) => stageRank(a.work_stage) - stageRank(b.work_stage)),
        [worksites],
    );

    // Compteur par étape (uniquement les étapes actives non vides).
    const stageCounts = useMemo(() => {
        const counts = {};
        for (const w of activeWorksites) {
            counts[w.work_stage] = (counts[w.work_stage] || 0) + 1;
        }
        return WORKSITE_STAGES
            .filter(s => s.id !== 'completed' && counts[s.id])
            .map(s => ({ ...s, count: counts[s.id] }));
    }, [activeWorksites]);

    if (loading || activeWorksites.length === 0) return null;

    const total = activeWorksites.length;
    const visible = showAll ? activeWorksites : activeWorksites.slice(0, PREVIEW_COUNT);
    const hiddenCount = total - PREVIEW_COUNT;

    return (
        <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-gray-200/70 dark:border-white/10 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/10">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <Hammer size={15} className="text-amber-500" />
                    Chantiers en cours
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                        {total}
                    </span>
                </h3>
                <button
                    onClick={() => navigate('/app/chantiers')}
                    className="text-xs text-[#007AFF] hover:opacity-70 flex items-center gap-0.5"
                >
                    Pilotage <ChevronRight size={12} />
                </button>
            </div>

            {/* Compteur par étape */}
            {stageCounts.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-4 py-3 border-b border-gray-100 dark:border-white/10">
                    {stageCounts.map(s => (
                        <span
                            key={s.id}
                            className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
                        >
                            <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                            {s.title}
                            <span className="font-bold text-gray-800 dark:text-gray-100">{s.count}</span>
                        </span>
                    ))}
                </div>
            )}

            {/* Liste des chantiers actifs */}
            <div className="divide-y divide-gray-100 dark:divide-white/10">
                {visible.map(w => {
                    const stage = WORKSITE_STAGE_MAP[w.work_stage];
                    return (
                        <button
                            key={w.id}
                            onClick={() => navigate(`/app/devis/${w.id}`)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 active:bg-gray-100 dark:active:bg-white/10 transition-colors text-left"
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                        {w.clients?.name || w.title || `Devis #${w.id}`}
                                    </span>
                                    {stage && (
                                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${stage.badge}`}>
                                            {stage.title}
                                        </span>
                                    )}
                                </div>
                                {w.title && w.clients?.name && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{w.title}</div>
                                )}
                            </div>
                            <span className="text-sm font-bold text-gray-800 dark:text-gray-200 shrink-0">
                                {(Number(w.total_ttc) || 0).toFixed(0)} €
                            </span>
                            <ChevronRight size={16} className="text-gray-300 dark:text-gray-600 shrink-0" />
                        </button>
                    );
                })}
            </div>

            {total > PREVIEW_COUNT && (
                <button
                    type="button"
                    onClick={() => setShowAll(prev => !prev)}
                    className="w-full px-4 py-2.5 text-xs font-medium text-[#007AFF] hover:bg-gray-50 dark:hover:bg-white/5 flex items-center justify-center gap-1 border-t border-gray-100 dark:border-white/10 transition-colors"
                >
                    {showAll
                        ? 'Voir moins'
                        : `Voir les ${hiddenCount} autre${hiddenCount > 1 ? 's' : ''} chantier${hiddenCount > 1 ? 's' : ''}`}
                    <ChevronDown size={13} className={`transition-transform ${showAll ? 'rotate-180' : ''}`} />
                </button>
            )}
        </div>
    );
};

export default WorksitesWidget;
