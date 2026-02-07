import React from 'react';
import { AlertCircle, ArrowRight, ClipboardList, PenTool } from 'lucide-react';

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
        <div className="space-y-6 bg-orange-50 dark:bg-orange-900/10 p-6 rounded-xl border border-orange-100 dark:border-orange-800/30">
            <div className="flex items-center gap-3 text-orange-800 dark:text-orange-200 mb-4">
                <ClipboardList className="w-6 h-6" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Détails de l'Avenant</h3>
            </div>

            {/* CONSTAT TERRAIN */}
            <div className="space-y-4">
                <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-200 flex items-center justify-center text-sm">1</span>
                    Constat Terrain
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">
                            Date du constat
                        </label>
                        <input
                            type="date"
                            value={details.constat_date || ''}
                            onChange={(e) => handleChange('constat_date', e.target.value)}
                            className="w-full rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">
                            Raison technique / Norme
                        </label>
                        <input
                            type="text"
                            placeholder="Ex: Impossibilité technique, Non-conformité..."
                            value={details.constat_reason || ''}
                            onChange={(e) => handleChange('constat_reason', e.target.value)}
                            className="w-full rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Description factuelle
                    </label>
                    <textarea
                        rows={3}
                        placeholder="Décrivez ce qui a été découvert lors de l'intervention..."
                        value={details.constat_description || ''}
                        onChange={(e) => handleChange('constat_description', e.target.value)}
                        className="w-full rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    />
                </div>
            </div>

            {/* NOUVELLE SOLUTION */}
            <div className="space-y-4 pt-4 border-t border-orange-200 dark:border-orange-800/30">
                <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 flex items-center justify-center text-sm">2</span>
                    Nouvelle Solution
                </h4>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Description de la solution
                    </label>
                    <textarea
                        rows={2}
                        placeholder="Décrivez simplement la nouvelle solution technique..."
                        value={details.solution_description || ''}
                        onChange={(e) => handleChange('solution_description', e.target.value)}
                        className="w-full rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Plus-value technique (Optionnel)
                    </label>
                    <input
                        type="text"
                        placeholder="Ex: Meilleure durabilité, performance accrue..."
                        value={details.solution_technical_value || ''}
                        onChange={(e) => handleChange('solution_technical_value', e.target.value)}
                        className="w-full rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    />
                </div>
            </div>
        </div>
    );
};

export default AmendmentFields;
