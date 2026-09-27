import React from 'react';
import { Check } from 'lucide-react';

/**
 * Barre de progression mobile du formulaire de devis : étapes cliquables
 * (défilement vers la section) + jauge. Collée sous la barre du haut mobile
 * (h-14) pour rester visible pendant la saisie sur chantier.
 *
 * steps : [{ id, label, done, targetId }]
 */
const DevisProgress = ({ steps }) => {
    const doneCount = steps.filter(s => s.done).length;
    const pct = Math.round((doneCount / steps.length) * 100);
    const current = steps.find(s => !s.done);

    const scrollTo = (targetId) => {
        const el = document.getElementById(targetId);
        if (!el) return;
        // Décale sous la barre du haut (56 px) + cette barre (~64 px)
        el.style.scrollMarginTop = '128px';
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <nav
            aria-label="Progression du devis"
            className="md:hidden sticky top-14 z-20 -mx-4 px-4 py-2 mb-4 bg-gray-100/90 dark:bg-black/80 backdrop-blur-xl border-b border-gray-200/70 dark:border-white/10"
        >
            <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-gray-700 dark:text-gray-200">
                    {current ? `Étape ${steps.indexOf(current) + 1}/${steps.length} · ${current.label}` : 'Devis complet'}
                </span>
                <span className="text-gray-500 dark:text-gray-400">{doneCount}/{steps.length}</span>
            </div>
            <div
                className="h-1.5 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
            >
                <div
                    className={`h-full rounded-full transition-all duration-300 ${pct === 100 ? 'bg-emerald-500' : 'bg-ios'}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <ol className="flex gap-1 mt-1.5 overflow-x-auto">
                {steps.map((step, i) => (
                    <li key={step.id} className="flex-1 min-w-0">
                        <button
                            type="button"
                            onClick={() => scrollTo(step.targetId)}
                            aria-current={step === current ? 'step' : undefined}
                            className={`tap-target w-full flex items-center justify-center gap-1 px-1 rounded-lg text-[11px] font-medium truncate ${
                                step.done
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : step === current
                                        ? 'text-ios bg-white dark:bg-white/10 shadow-sm'
                                        : 'text-gray-500 dark:text-gray-400'
                            }`}
                        >
                            {step.done
                                ? <Check className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                                : <span className="flex-shrink-0">{i + 1}.</span>}
                            <span className="truncate">{step.label}</span>
                        </button>
                    </li>
                ))}
            </ol>
        </nav>
    );
};

export default DevisProgress;
