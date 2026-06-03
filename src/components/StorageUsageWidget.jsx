import React, { useState, useEffect } from 'react';
import { HardDrive, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getQuotaStatus, getGlobalStorage, formatBytes } from '../utils/storageQuota';

const WARN = 0.75;   // seuil d'alerte (orange)
const CRIT = 0.9;    // seuil critique (rouge)

const barColor = (ratio) => (ratio >= CRIT ? 'bg-red-500' : ratio >= WARN ? 'bg-amber-500' : 'bg-emerald-500');
const textColor = (ratio) => (ratio >= CRIT ? 'text-red-600 dark:text-red-400' : ratio >= WARN ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400');

/**
 * Affiche l'usage du stockage Supabase.
 * - Comptes free/pro : leur usage personnel vs leur plafond.
 * - Compte 'owner' : l'usage GLOBAL du projet (tous les comptes) vs le quota du
 *   projet (1 Go), avec une alerte visuelle quand le seuil est approché — c'est
 *   le canal d'alerte demandé pour surveiller la mémoire partagée.
 */
const StorageUsageWidget = () => {
    const [personal, setPersonal] = useState(null);
    const [global, setGlobal] = useState(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
            const p = await getQuotaStatus(0);
            if (!alive) return;
            setPersonal(p);
            if (p?.plan === 'owner') {
                const g = await getGlobalStorage();
                if (alive) setGlobal(g);
            }
            if (alive) setLoaded(true);
        })();
        return () => { alive = false; };
    }, []);

    if (!loaded) return null;

    const isOwner = personal?.plan === 'owner';
    // Pour le owner on montre le global (le plafond perso ~illimité n'a pas de sens).
    const view = isOwner && global
        ? { title: 'Stockage du projet (tous les comptes)', used: global.total, cap: global.quota, ratio: global.ratio, files: global.files }
        : personal
            ? { title: 'Mon espace de stockage', used: personal.used, cap: personal.cap, ratio: personal.ratio, files: null }
            : null;

    if (!view || !(view.cap > 0)) return null;

    const pct = Math.min(100, Math.round(view.ratio * 100));
    const near = view.ratio >= WARN;

    return (
        <div className={`bg-white dark:bg-[#1c1c1e] rounded-2xl border shadow-sm p-4 ${
            view.ratio >= CRIT ? 'border-red-300 dark:border-red-700/50'
            : view.ratio >= WARN ? 'border-amber-300 dark:border-amber-700/50'
            : 'border-gray-200/70 dark:border-white/10'
        }`}>
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <HardDrive size={15} className="text-[#007AFF]" />
                    {view.title}
                </h3>
                <span className={`text-xs font-bold ${textColor(view.ratio)}`}>{pct}%</span>
            </div>

            <div className="h-2.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full ${barColor(view.ratio)} rounded-full transition-all duration-500`} style={{ width: `${Math.max(pct, 2)}%` }} />
            </div>

            <div className="flex items-center justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
                <span>{formatBytes(view.used)} / {formatBytes(view.cap)}</span>
                {view.files != null && <span>{view.files} fichiers</span>}
            </div>

            {near ? (
                <div className={`mt-3 flex items-start gap-2 text-xs rounded-lg p-2.5 ${
                    view.ratio >= CRIT ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                    : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                }`}>
                    <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                    <span>
                        {isOwner
                            ? (view.ratio >= CRIT
                                ? `Le stockage du projet est presque plein. Allégez d'anciennes photos ou passez à une offre Supabase supérieure (le quota est partagé par tous les comptes).`
                                : `Le stockage du projet approche de la limite (${formatBytes(view.cap)}). Pensez à faire le ménage ou à augmenter le quota.`)
                            : (view.ratio >= CRIT
                                ? `Votre espace est presque plein. Supprimez d'anciennes photos pour pouvoir en ajouter.`
                                : `Vous approchez de votre limite de stockage. Pensez à supprimer les photos inutiles.`)}
                    </span>
                </div>
            ) : (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 size={12} /> Espace suffisant
                </div>
            )}
        </div>
    );
};

export default StorageUsageWidget;
