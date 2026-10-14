import { useMemo } from 'react';
import { Sparkles, Euro, Clock, BellRing } from 'lucide-react';
import { computeAppValue } from '../utils/appValue';

const fmtEur = (n) => `${n.toLocaleString('fr-FR')} €`;

const Stat = ({ icon: Icon, tone, value, label, hint }) => (
    <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${tone}`}>
            <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
            <p className="text-xl font-bold text-gray-900 dark:text-white leading-tight">{value}</p>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{label}</p>
            {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
        </div>
    </div>
);

/** Bilan annuel de la valeur apportée par l'appli (relances, temps gagné). */
const AppValueCard = ({ quotes }) => {
    const v = useMemo(() => computeAppValue(quotes), [quotes]);
    if (!v.hasData) return null;

    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5 sm:p-6">
            <div className="flex items-center gap-2.5 mb-4">
                <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/30">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                </div>
                <h3 className="font-bold text-gray-900 dark:text-white text-base">
                    Ce que l'appli vous a rapporté cette année
                </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Stat
                    icon={Euro}
                    tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                    value={fmtEur(v.recoveredRevenue)}
                    label="Signés après relance"
                    hint={v.recoveredCount > 0 ? `${v.recoveredCount} devis récupéré${v.recoveredCount > 1 ? 's' : ''}` : 'Aucun pour le moment'}
                />
                <Stat
                    icon={BellRing}
                    tone="bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                    value={v.followUps}
                    label="Relances envoyées"
                    hint={`${v.signedThisYear} devis signé${v.signedThisYear > 1 ? 's' : ''} cette année`}
                />
                <Stat
                    icon={Clock}
                    tone="bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
                    value={`≈ ${v.hoursSaved} h`}
                    label="Temps administratif gagné"
                    hint="Estimation : 5 min/relance, 15 min/document"
                />
            </div>
        </div>
    );
};

export default AppValueCard;
