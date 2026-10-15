import { useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { formatCurrency } from '../utils/format';

const PRESETS = [30, 40, 50];

/**
 * « Facture d'acompte » : une seule fenêtre pour le pourcentage (30 / 40 /
 * 50 % ou autre) et le type d'acompte (main d'œuvre ou matériel), avec le
 * montant calculé sous les yeux. Remplace la fenêtre système window.prompt
 * suivie d'une seconde question Oui/Non.
 *
 * Usage :
 *   const [askDeposit, depositPrompt] = useDepositPrompt();
 *   const choice = await askDeposit({ baseLabel, base });
 *   if (!choice) return; // annulé
 *   const { percentage, isForMaterial } = choice;
 */
export const useDepositPrompt = () => {
    const [dialog, setDialog] = useState(null);
    const [preset, setPreset] = useState(30);
    const [custom, setCustom] = useState('');
    const [isForMaterial, setIsForMaterial] = useState(false);

    const ask = useCallback(({ baseLabel = '', base = 0 } = {}) =>
        new Promise((resolve) => {
            setPreset(30);
            setCustom('');
            setIsForMaterial(false);
            setDialog({ baseLabel, base, resolve });
        }), []);

    const close = (value) => {
        dialog?.resolve(value);
        setDialog(null);
    };

    const percentage = preset === 'custom' ? parseFloat(String(custom).replace(',', '.')) : preset;
    const valid = !isNaN(percentage) && percentage > 0 && percentage <= 100;

    const chip = (active) => `px-3 py-3 rounded-xl border text-sm font-semibold transition-colors ${
        active
            ? 'border-ios bg-ios/10 text-ios'
            : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200'
    }`;

    const element = dialog ? (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => close(null)}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Facture d'acompte"
                className="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl p-5 safe-area-bottom"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3 mb-1">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Facture d'acompte</h2>
                    <button type="button" onClick={() => close(null)} className="p-1 -mr-1 text-gray-400" aria-label="Fermer">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                {dialog.baseLabel && <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{dialog.baseLabel}</p>}

                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Pourcentage</p>
                <div className="grid grid-cols-4 gap-2">
                    {PRESETS.map(p => (
                        <button key={p} type="button" onClick={() => setPreset(p)} aria-pressed={preset === p} className={chip(preset === p)}>
                            {p} %
                        </button>
                    ))}
                    <button type="button" onClick={() => setPreset('custom')} aria-pressed={preset === 'custom'} className={chip(preset === 'custom')}>
                        Autre
                    </button>
                </div>
                {preset === 'custom' && (
                    <div className="mt-2 flex items-center gap-2">
                        <input
                            type="text"
                            inputMode="decimal"
                            autoFocus
                            value={custom}
                            onChange={(e) => setCustom(e.target.value)}
                            placeholder="ex : 25"
                            aria-label="Pourcentage d'acompte"
                            className="tap-target w-28 px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-ios"
                        />
                        <span className="text-sm text-gray-500">%</span>
                    </div>
                )}

                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-4 mb-2">L'acompte sert surtout à…</p>
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setIsForMaterial(false)} aria-pressed={!isForMaterial} className={`${chip(!isForMaterial)} text-left`}>
                        Main d'œuvre
                        <span className="block text-xs font-normal opacity-75">Compté en service</span>
                    </button>
                    <button type="button" onClick={() => setIsForMaterial(true)} aria-pressed={isForMaterial} className={`${chip(isForMaterial)} text-left`}>
                        Acheter le matériel
                        <span className="block text-xs font-normal opacity-75">Exclu du résultat net</span>
                    </button>
                </div>

                <div className="flex items-center justify-between gap-3 mt-5">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        {valid ? <>Montant : <strong className="text-gray-900 dark:text-white">{formatCurrency(dialog.base * percentage / 100)} TTC</strong></> : 'Pourcentage entre 1 et 100'}
                    </p>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => close(null)} className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800">
                            Annuler
                        </button>
                        <button
                            type="button"
                            disabled={!valid}
                            onClick={() => close({ percentage, isForMaterial })}
                            className="px-5 py-2.5 text-sm font-semibold text-white bg-ios hover:opacity-90 rounded-xl disabled:opacity-50"
                        >
                            Créer
                        </button>
                    </div>
                </div>
            </div>
        </div>
    ) : null;

    return [ask, element];
};
