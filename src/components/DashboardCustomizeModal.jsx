import React from 'react';
import { Settings2, X, RotateCcw, Loader2, Check } from 'lucide-react';
import { DASHBOARD_WIDGETS, useDashboardSettings } from '../hooks/useDashboardSettings';
import { useAuth } from '../context/AuthContext';
import { clearAdaptiveOrder } from '../hooks/useAdaptiveOrder';
import { toast } from 'sonner';

/**
 * Modal de personnalisation du tableau de bord :
 * - Toggle de visibilité par widget
 * - Bouton "Réinitialiser" (remet aux défauts)
 * - Sauvegarde dans user_metadata
 */
const DashboardCustomizeModal = ({ open, onClose }) => {
    const { isVisible, toggle, reset, save, saving } = useDashboardSettings();
    const { user } = useAuth();

    if (!open) return null;

    // Réinitialise visibilité ET ordre adaptatif (recalculé au prochain montage).
    const handleReset = () => {
        reset();
        clearAdaptiveOrder('dashboard', user?.id);
    };

    const visibleCount = DASHBOARD_WIDGETS.filter(w => isVisible(w.id)).length;

    const handleSave = async () => {
        const result = await save();
        if (result.success) {
            toast.success('Tableau de bord personnalisé', {
                description: 'Vos préférences seront conservées sur tous vos appareils.',
            });
            onClose();
        }
    };

    return (
        <div onClick={onClose} className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div onClick={e => e.stopPropagation()} className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                            <Settings2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <h2 className="font-bold text-gray-900 dark:text-white text-base">Personnaliser le tableau de bord</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {visibleCount} sur {DASHBOARD_WIDGETS.length} widgets affichés
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Liste */}
                <div className="flex-1 overflow-y-auto p-2">
                    {DASHBOARD_WIDGETS.map(widget => {
                        const visible = isVisible(widget.id);
                        const locked = !!widget.alwaysOn;
                        return (
                            <button
                                key={widget.id}
                                type="button"
                                onClick={() => !locked && toggle(widget.id)}
                                disabled={locked}
                                className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-colors ${
                                    locked
                                        ? 'cursor-default opacity-70'
                                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                }`}
                            >
                                {/* Toggle visuel */}
                                <div
                                    role="switch"
                                    aria-checked={visible}
                                    className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors mt-0.5 ${
                                        visible ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'
                                    } ${locked ? '' : 'cursor-pointer'}`}
                                >
                                    <span
                                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                            visible ? 'translate-x-5' : 'translate-x-1'
                                        }`}
                                    />
                                </div>

                                {/* Texte */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className={`text-sm font-semibold ${visible ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                                            {widget.label}
                                        </p>
                                        {locked && (
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                                                Toujours visible
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                        {widget.description}
                                    </p>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2 flex-shrink-0">
                    <button
                        type="button"
                        onClick={handleReset}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
                        title="Remettre tous les widgets visibles et l'ordre par défaut"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Réinitialiser
                    </button>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                        >
                            Annuler
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            Enregistrer
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DashboardCustomizeModal;
