import React from 'react';
import { AlertTriangle, Calendar, FileSearch, Lightbulb, Sparkles, Tag, ArrowDown } from 'lucide-react';

const AmendmentFields = ({ formData, setFormData }) => {
    const handleChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            amendment_details: {
                ...prev.amendment_details,
                [field]: value
            }
        }));
    };

    const details = formData.amendment_details || {};

    return (
        <div className="space-y-0">
            {/* Header */}
            <div className="flex items-center gap-3 bg-orange-600 dark:bg-orange-700 px-5 py-3.5 rounded-t-xl">
                <AlertTriangle className="w-5 h-5 text-white/90" />
                <h3 className="text-base font-semibold text-white tracking-wide">Détails de l'Avenant</h3>
            </div>

            {/* SECTION 1 — Constat Terrain */}
            <div className="bg-white dark:bg-gray-800 border-x border-gray-200 dark:border-gray-700 px-5 pt-5 pb-6">
                <div className="flex items-start gap-3 mb-4">
                    <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 flex items-center justify-center text-xs font-bold">
                        1
                    </span>
                    <div>
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">
                            Constat Terrain
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            Décrivez le problème découvert lors de l'intervention sur site.
                        </p>
                    </div>
                </div>

                <div className="space-y-4 pl-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                <Calendar className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                                Date du constat
                            </label>
                            <input
                                type="date"
                                value={details.constat_date || ''}
                                onChange={(e) => handleChange('constat_date', e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 transition-colors"
                            />
                        </div>
                        <div>
                            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                <Tag className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                                Raison technique / Norme
                            </label>
                            <input
                                type="text"
                                placeholder="Ex: Impossibilité technique, Non-conformité..."
                                value={details.constat_reason || ''}
                                onChange={(e) => handleChange('constat_reason', e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 transition-colors"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            <FileSearch className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                            Description factuelle
                        </label>
                        <textarea
                            rows={3}
                            placeholder="Décrivez ce qui a été découvert lors de l'intervention..."
                            value={details.constat_description || ''}
                            onChange={(e) => handleChange('constat_description', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 transition-colors resize-y"
                        />
                    </div>
                </div>
            </div>

            {/* Visual separator with arrow */}
            <div className="relative border-x border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <div className="flex items-center justify-center py-2">
                    <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    <div className="mx-3 w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                        <ArrowDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                </div>
            </div>

            {/* SECTION 2 — Nouvelle Solution */}
            <div className="bg-white dark:bg-gray-800 border-x border-b border-gray-200 dark:border-gray-700 px-5 pt-5 pb-6 rounded-b-xl">
                <div className="flex items-start gap-3 mb-4">
                    <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center justify-center text-xs font-bold">
                        2
                    </span>
                    <div>
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">
                            Nouvelle Solution
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            Détaillez la solution technique proposée en remplacement.
                        </p>
                    </div>
                </div>

                <div className="space-y-4 pl-10">
                    <div>
                        <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            <Lightbulb className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                            Description de la solution
                        </label>
                        <textarea
                            rows={3}
                            placeholder="Décrivez simplement la nouvelle solution technique..."
                            value={details.solution_description || ''}
                            onChange={(e) => handleChange('solution_description', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors resize-y"
                        />
                    </div>

                    <div>
                        <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                            Plus-value technique
                            <span className="text-xs font-normal text-gray-400 dark:text-gray-500">(Optionnel)</span>
                        </label>
                        <input
                            type="text"
                            placeholder="Ex: Meilleure durabilité, performance accrue..."
                            value={details.solution_technical_value || ''}
                            onChange={(e) => handleChange('solution_technical_value', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AmendmentFields;
