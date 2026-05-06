import React from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, X, Sparkles } from 'lucide-react';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus';

/* ─── Une étape de la checklist ─── */
const StepItem = ({ step }) => {
    const clickable = !!step.action && !step.done;
    const Wrapper   = clickable ? Link : 'div';
    const wrapperProps = clickable ? { to: step.action } : {};

    return (
        <Wrapper
            {...wrapperProps}
            className={`group flex items-center gap-3 p-3 rounded-xl transition-all ${
                step.done
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800/40'
                    : 'bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm'
            } ${clickable ? 'cursor-pointer' : ''}`}
        >
            {/* Indicateur de complétion */}
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                step.done
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 group-hover:border-blue-400'
            }`}>
                {step.done && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
            </div>

            {/* Texte */}
            <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold truncate ${
                    step.done
                        ? 'text-green-800 dark:text-green-300 line-through opacity-75'
                        : 'text-gray-900 dark:text-white'
                }`}>
                    {step.label}
                </p>
                {!step.done && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {step.hint || step.description}
                    </p>
                )}
            </div>

            {/* Chevron sur action cliquable */}
            {clickable && (
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors flex-shrink-0" />
            )}
        </Wrapper>
    );
};

/* ─── Composant principal ─── */
const OnboardingChecklist = () => {
    const { steps, completedCount, totalCount, shouldShow, dismiss } = useOnboardingStatus();

    if (!shouldShow) return null;

    const progressPct = Math.round((completedCount / totalCount) * 100);

    let statusText;
    if (completedCount === 0) {
        statusText = 'Suivez ces étapes pour configurer votre espace en quelques minutes.';
    } else if (completedCount === totalCount - 1) {
        statusText = 'Plus qu\'une étape — vous y êtes presque !';
    } else {
        statusText = `${completedCount} sur ${totalCount} étapes accomplies — continuez sur votre lancée !`;
    }

    return (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl border border-blue-100 dark:border-blue-800/40 overflow-hidden">
            <div className="p-5 sm:p-6">
                {/* En-tête */}
                <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                            <Sparkles className="w-5 h-5 text-white" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-bold text-gray-900 dark:text-white text-lg">
                                Bienvenue sur Artisan Facile
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {statusText}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={dismiss}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-white/50 dark:hover:bg-white/5 transition-colors flex-shrink-0"
                        title="Masquer cette checklist"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Barre de progression */}
                <div className="mb-5">
                    <div className="flex items-center justify-between text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1.5">
                        <span>Progression</span>
                        <span>{progressPct}%</span>
                    </div>
                    <div className="w-full h-2 bg-blue-100 dark:bg-blue-900/40 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${progressPct}%` }}
                        />
                    </div>
                </div>

                {/* Étapes */}
                <div className="space-y-2">
                    {steps.map(step => (
                        <StepItem key={step.id} step={step} />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default OnboardingChecklist;
