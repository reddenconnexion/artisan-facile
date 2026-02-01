import React, { memo } from 'react';
import MarginGauge from './MarginGauge';

/**
 * Composant pour afficher les totaux d'un devis
 * Mémorisé pour éviter les re-renders inutiles
 */
const QuoteTotals = memo(function QuoteTotals({
    subtotal,
    tva,
    total,
    totalCost,
    includeTva,
    onToggleTva,
    operationCategory,
    onOperationCategoryChange,
    vatOnDebits,
    onVatOnDebitsChange
}) {
    const margin = subtotal > 0 ? ((subtotal - totalCost) / subtotal) * 100 : 0;
    const netIncome = subtotal - totalCost;

    return (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">Récapitulatif</h3>

            {/* Options TVA */}
            <div className="space-y-3 pb-4 border-b border-gray-200 dark:border-gray-700">
                <label className="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={includeTva}
                        onChange={(e) => onToggleTva(e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Appliquer la TVA (20%)</span>
                </label>

                {includeTva && (
                    <>
                        <div className="ml-7">
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Catégorie d'opération</label>
                            <select
                                value={operationCategory}
                                onChange={(e) => onOperationCategoryChange(e.target.value)}
                                className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 dark:text-white"
                            >
                                <option value="service">Prestations de services</option>
                                <option value="goods">Livraison de biens</option>
                                <option value="mixed">Mixte (biens et services)</option>
                            </select>
                        </div>

                        <label className="flex items-center gap-3 cursor-pointer ml-7">
                            <input
                                type="checkbox"
                                checked={vatOnDebits}
                                onChange={(e) => onVatOnDebitsChange(e.target.checked)}
                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-xs text-gray-600 dark:text-gray-400">TVA sur les débits</span>
                        </label>
                    </>
                )}
            </div>

            {/* Totaux */}
            <div className="space-y-2">
                <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Total HT</span>
                    <span className="font-medium text-gray-900 dark:text-white">{subtotal.toFixed(2)} €</span>
                </div>

                {includeTva && (
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">TVA (20%)</span>
                        <span className="font-medium text-gray-900 dark:text-white">{tva.toFixed(2)} €</span>
                    </div>
                )}

                <div className="flex justify-between text-lg pt-2 border-t border-gray-200 dark:border-gray-700">
                    <span className="font-semibold text-gray-900 dark:text-white">Total TTC</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">{total.toFixed(2)} €</span>
                </div>
            </div>

            {/* Marge */}
            {totalCost > 0 && (
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Coût total</span>
                        <span className="text-gray-900 dark:text-white">{totalCost.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Résultat net</span>
                        <span className={`font-semibold ${netIncome >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {netIncome.toFixed(2)} €
                        </span>
                    </div>
                    <MarginGauge margin={margin} />
                </div>
            )}
        </div>
    );
});

export default QuoteTotals;
