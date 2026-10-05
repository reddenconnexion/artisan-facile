import { useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { PAYMENT_METHODS, DEFAULT_PAYMENT_METHOD } from '../constants/paymentMethods';

/**
 * « Paiement reçu » : demande le mode de règlement avant de marquer une
 * facture payée. Le mode figure obligatoirement au livre de recettes d'un
 * micro-entrepreneur ; sans cette question, « Marquer payé » laissait la
 * colonne vide.
 *
 * Usage :
 *   const [askPaymentMethod, paymentPrompt] = usePaymentMethodPrompt();
 *   const method = await askPaymentMethod({ title, message });
 *   if (!method) return; // annulé
 *   …
 *   return <>{paymentPrompt}…</>;
 */
export const usePaymentMethodPrompt = () => {
    const [dialog, setDialog] = useState(null);
    const [method, setMethod] = useState(DEFAULT_PAYMENT_METHOD);

    const ask = useCallback(({ title = 'Paiement reçu', message = '', defaultMethod } = {}) =>
        new Promise((resolve) => {
            setMethod(defaultMethod || DEFAULT_PAYMENT_METHOD);
            setDialog({ title, message, resolve });
        }), []);

    const close = (value) => {
        dialog?.resolve(value);
        setDialog(null);
    };

    const element = dialog ? (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => close(null)}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label={dialog.title}
                className="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl p-5 safe-area-bottom"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3 mb-1">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{dialog.title}</h2>
                    <button type="button" onClick={() => close(null)} className="p-1 -mr-1 text-gray-400" aria-label="Fermer">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                {dialog.message && <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{dialog.message}</p>}
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Mode de règlement</p>
                <div className="grid grid-cols-2 gap-2">
                    {PAYMENT_METHODS.map(({ id, label }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setMethod(id)}
                            aria-pressed={method === id}
                            className={`px-3 py-3 rounded-xl border text-sm font-medium text-left transition-colors ${
                                method === id
                                    ? 'border-ios bg-ios/10 text-ios'
                                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <div className="flex justify-end gap-2 mt-5">
                    <button type="button" onClick={() => close(null)} className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800">
                        Annuler
                    </button>
                    <button type="button" onClick={() => close(method)} className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl">
                        Marquer payée
                    </button>
                </div>
            </div>
        </div>
    ) : null;

    return [ask, element];
};
