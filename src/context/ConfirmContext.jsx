import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertTriangle, Trash2, HelpCircle } from 'lucide-react';

const ConfirmContext = createContext(null);

/**
 * Global confirm dialog — drop-in replacement for window.confirm().
 * Usage:
 *   const confirm = useConfirm();
 *   const ok = await confirm({ title: 'Supprimer ?', message: '...', confirmLabel: 'Supprimer', danger: true });
 *   if (!ok) return;
 */
export const ConfirmProvider = ({ children }) => {
    const [dialog, setDialog] = useState({ open: false });

    const confirm = useCallback((options) => {
        return new Promise((resolve) => {
            setDialog({ open: true, ...options, resolve });
        });
    }, []);

    const handleConfirm = () => {
        dialog.resolve(true);
        setDialog({ open: false });
    };

    const handleCancel = () => {
        dialog.resolve(false);
        setDialog({ open: false });
    };

    const Icon = dialog.danger ? Trash2 : dialog.info ? HelpCircle : AlertTriangle;
    const iconBg = dialog.danger
        ? 'bg-red-100 dark:bg-red-900/30'
        : dialog.info
            ? 'bg-blue-100 dark:bg-blue-900/30'
            : 'bg-amber-100 dark:bg-amber-900/30';
    const iconColor = dialog.danger
        ? 'text-red-600 dark:text-red-400'
        : dialog.info
            ? 'text-blue-600 dark:text-blue-400'
            : 'text-amber-600 dark:text-amber-400';

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            {dialog.open && (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    onClick={handleCancel}
                >
                    <div
                        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-150"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-4 mb-5">
                            <div className={`p-2.5 rounded-xl flex-shrink-0 ${iconBg}`}>
                                <Icon className={`w-5 h-5 ${iconColor}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-gray-900 dark:text-white text-base leading-snug">
                                    {dialog.title || 'Confirmation'}
                                </h3>
                                {dialog.message && (
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1.5 whitespace-pre-line leading-relaxed">
                                        {dialog.message}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={handleCancel}
                                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                            >
                                {dialog.cancelLabel || 'Annuler'}
                            </button>
                            <button
                                autoFocus={!dialog.danger}
                                onClick={handleConfirm}
                                className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors ${
                                    dialog.danger
                                        ? 'bg-red-600 hover:bg-red-700 text-white focus:ring-2 focus:ring-red-500 focus:ring-offset-2'
                                        : 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
                                }`}
                            >
                                {dialog.confirmLabel || 'Confirmer'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmContext.Provider>
    );
};

export const useConfirm = () => {
    const ctx = useContext(ConfirmContext);
    if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
    return ctx;
};
