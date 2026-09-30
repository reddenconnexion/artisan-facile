import React from 'react';
import { Check, Eye, ChevronDown, AlertTriangle } from 'lucide-react';
import { URGENCY_LEVELS } from '../../utils/urgency';
import { formatDate } from '../../utils/format';

/**
 * Colonne « Statut » de l'en-tête : pipeline cliquable, cas particuliers,
 * urgence client, relances et accusé de réception.
 */
const QuoteStatusField = ({
    followUpSteps,
    formData,
    handleMarkAsFollowedUp,
    id,
    isCreditNote,
    markingFollowUp,
    setFormData,
    setShowSpecialStatuses,
    setShowViewHistory,
    showSpecialStatuses,
    viewCount,
}) => {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Statut</label>
            {/* Pipeline visuel cliquable */}
            {(() => {
                const pipeline = isCreditNote
                    ? [{ key: 'billed', label: 'Émis' }, { key: 'paid', label: 'Remboursé / imputé' }]
                    : formData.type === 'invoice'
                        ? [{ key: 'accepted', label: 'Émise' }, { key: 'billed', label: 'Facturée' }, { key: 'paid', label: 'Payée' }]
                        : [{ key: 'draft', label: 'Brouillon' }, { key: 'sent', label: 'Envoyé' }, { key: 'accepted', label: 'Accepté' }, { key: 'billed', label: 'Facturé' }, { key: 'paid', label: 'Payé' }];
                const currentIdx = pipeline.findIndex(s => s.key === formData.status);
                return (
                    <div className="flex items-center mb-2">
                        {pipeline.map((step, idx) => (
                            <React.Fragment key={step.key}>
                                <button
                                    type="button"
                                    onClick={() => setFormData(p => ({ ...p, status: step.key }))}
                                    className={`text-[10px] font-semibold px-2 py-1 rounded whitespace-nowrap transition-colors ${
                                        idx === currentIdx ? 'animate-shimmer-step text-white' :
                                        currentIdx >= 0 && idx < currentIdx ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200' :
                                        'bg-gray-100 dark:bg-gray-800 text-gray-400 hover:bg-gray-200'
                                    }`}
                                >
                                    {step.label}
                                </button>
                                {idx < pipeline.length - 1 && (
                                    <div className={`h-px flex-1 mx-0.5 min-w-[4px] ${currentIdx >= 0 && idx < currentIdx ? 'bg-blue-300' : 'bg-gray-200'}`} />
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                );
            })()}
            {/* Statuts d'exception (hors flux normal) — repliés derrière un
                dropdown ; le bloc reste ouvert si un statut particulier est actif. */}
            {(() => {
                const specialStatuses = [
                    { key: 'refused', label: 'Refusé', activeColor: 'bg-red-100 text-red-700 dark:text-red-400 border-red-300' },
                    { key: 'postponed', label: 'Reporté', activeColor: 'bg-amber-100 text-amber-700 dark:text-amber-400 border-amber-300' },
                    { key: 'cancelled', label: 'Annulé', activeColor: 'bg-gray-200 text-gray-700 dark:text-gray-300 border-gray-400' },
                ];
                const activeSpecial = specialStatuses.find(opt => opt.key === formData.status);
                const open = showSpecialStatuses || !!activeSpecial;
                return (
                    <div className="mt-2">
                        <button
                            type="button"
                            onClick={() => setShowSpecialStatuses(prev => !prev)}
                            aria-expanded={open}
                            disabled={!!activeSpecial}
                            className="flex items-center gap-1 text-[10px] text-gray-400 uppercase tracking-wider hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:hover:text-gray-400"
                        >
                            Cas particuliers
                            <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </button>
                        {open && (
                            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                                {specialStatuses.map(opt => {
                                    const isActive = formData.status === opt.key;
                                    return (
                                        <button
                                            key={opt.key}
                                            type="button"
                                            onClick={() => setFormData(p => ({ ...p, status: isActive ? 'draft' : opt.key }))}
                                            className={`text-[10px] font-semibold px-2 py-0.5 rounded border whitespace-nowrap transition-colors ${
                                                isActive ? opt.activeColor : 'bg-white dark:bg-gray-900 text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })()}
            {/* Urgence client : une fois le devis accepté, sert à prioriser la
                préparation (acompte/matériel) et la planification du chantier
                dans le Pilotage Chantiers. */}
            {formData.type === 'quote' && ['accepted', 'billed', 'paid'].includes(formData.status) && (
                <div className="mt-3">
                    <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">
                        Urgence client
                    </label>
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {URGENCY_LEVELS.map(level => {
                            const isActive = (formData.urgency || 'normal') === level.id;
                            return (
                                <button
                                    key={level.id}
                                    type="button"
                                    onClick={() => setFormData(p => ({ ...p, urgency: level.id }))}
                                    className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full border transition-colors ${
                                        isActive
                                            ? `${level.badge} border-transparent`
                                            : 'bg-white dark:bg-gray-900 text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                                    }`}
                                >
                                    {level.id !== 'normal' && <AlertTriangle className="w-2.5 h-2.5" />}
                                    {level.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
            {formData.last_followup_at && (
                <p className="text-xs text-amber-600 mt-1 font-medium flex items-center">
                    <span className="w-2 h-2 bg-amber-500 rounded-full mr-1.5"></span>
                    Relancé le {formatDate(formData.last_followup_at)}
                    {formData.follow_up_count > 0 && (
                        <span className="ml-1 text-amber-500">
                            (étape {formData.follow_up_count})
                        </span>
                    )}
                </p>
            )}
            {formData.status === 'sent' && (
                <button
                    type="button"
                    onClick={handleMarkAsFollowedUp}
                    disabled={markingFollowUp}
                    className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-60 rounded-lg transition-colors"
                >
                    <Check className="w-4 h-4" />
                    {markingFollowUp ? 'Enregistrement…' : (() => {
                        const nextStep = followUpSteps[formData.follow_up_count];
                        return nextStep
                            ? `Relancé — ${nextStep.label}`
                            : `Relancé — étape ${(formData.follow_up_count || 0) + 1}`;
                    })()}
                </button>
            )}
            {/* Accusé de réception : visible pour tous les devis envoyés */}
            {formData.status === 'sent' && id && id !== 'new' && (
                <button
                    type="button"
                    onClick={() => setShowViewHistory(true)}
                    className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors
                                    border-blue-200 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100"
                >
                    <Eye className="w-4 h-4" />
                    {viewCount === 0
                        ? 'Pas encore consulté'
                        : `Consulté ${viewCount} fois — voir l'historique`}
                </button>
            )}
        </div>
    );
};

export default QuoteStatusField;
