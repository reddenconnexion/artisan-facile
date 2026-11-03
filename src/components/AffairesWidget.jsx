import { useMemo, useState } from 'react';
import { Route, ChevronRight, ChevronDown } from 'lucide-react';
import { openAffaires } from '../utils/affaireJourney';
import { formatCurrencyRounded } from '../utils/format';

const VISIBLE_COUNT = 5;

/** Les cinq étapes en pastilles : faite, en cours, à venir, sautée, bloquée. */
const StepDots = ({ steps }) => (
    <div className="flex items-center gap-1" aria-hidden="true">
        {steps.map(s => (
            <span
                key={s.id}
                title={s.label}
                className={`h-1.5 w-5 rounded-full ${
                    s.state === 'done' ? 'bg-emerald-500'
                        : s.state === 'current' ? 'bg-ios'
                            : s.state === 'blocked' ? 'bg-red-500'
                                : s.state === 'skipped' ? 'bg-gray-200 dark:bg-white/10'
                                    : 'bg-gray-300 dark:bg-white/20'
                }`}
            />
        ))}
    </div>
);

/**
 * Tableau de bord — suivi des affaires en cours : une ligne par devis envoyé
 * ou signé non soldé, avec où il en est (devis → signature → acompte →
 * chantier → facture) et la prochaine étape. Un toucher ouvre le suivi.
 */
const AffairesWidget = ({ allQuotes, navigate }) => {
    const [expanded, setExpanded] = useState(false);

    const affaires = useMemo(() => openAffaires(allQuotes), [allQuotes]);

    if (affaires.length === 0) return null;
    const shown = expanded ? affaires : affaires.slice(0, VISIBLE_COUNT);
    const hidden = affaires.length - shown.length;

    return (
        <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-gray-200/70 dark:border-white/10 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/10">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <Route size={15} className="text-ios" />
                    Suivi des affaires
                    <span className="text-xs font-medium text-gray-400">({affaires.length})</span>
                </h3>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-white/10">
                {shown.map(({ quote, journey }) => {
                    const current = journey.current;
                    return (
                        <button
                            key={quote.id}
                            type="button"
                            onClick={() => navigate(`/app/affaires/${quote.id}`)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 active:bg-gray-100 dark:active:bg-white/10 transition-colors text-left"
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                        {quote.clients?.name || quote.title || `Devis #${quote.quote_number || quote.id}`}
                                    </span>
                                    {quote.total_ttc > 0 && (
                                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 shrink-0">
                                            {formatCurrencyRounded(quote.total_ttc)}
                                        </span>
                                    )}
                                </div>
                                {quote.title && quote.clients?.name && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{quote.title}</div>
                                )}
                                <div className="flex items-center gap-2 mt-1.5">
                                    <StepDots steps={journey.steps} />
                                    {current && (
                                        <span className="text-xs text-ios font-medium truncate">
                                            {current.label}{current.action?.label ? ` : ${current.action.label}` : ''}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <ChevronRight size={16} className="text-gray-300 dark:text-gray-600 shrink-0" />
                        </button>
                    );
                })}
            </div>
            {affaires.length > VISIBLE_COUNT && (
                <button
                    type="button"
                    onClick={() => setExpanded(v => !v)}
                    className="w-full flex items-center justify-center gap-1 px-4 py-2.5 text-xs font-medium text-ios border-t border-gray-100 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5"
                >
                    {expanded ? 'Réduire' : `Voir les ${hidden} autres`}
                    <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>
            )}
        </div>
    );
};

export default AffairesWidget;
