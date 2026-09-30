import { X, Info, HelpCircle } from 'lucide-react';
import { amendmentProjectTotals } from '../../utils/amendmentBilling';
import QuoteMarginSummary from './QuoteMarginSummary';

/**
 * Totaux du devis : TVA, acomptes, marges, total TTC et récapitulatif
 * « nouveau total projet » d'un avenant.
 */
const QuoteTotalsPanel = ({
    dismissHelp,
    dismissedHelps,
    formData,
    isLocked,
    navigate,
    quoteMargins,
    setFormData,
    setShowMaterialDepositHelp,
    showMaterialDepositHelp,
    subtotal,
    total,
    tva,
}) => {
    return (
        <div className="flex justify-end pt-6 border-t border-gray-100 dark:border-gray-800">
            <div className="w-72 space-y-4">
                {/* MarginGauge removed here as it was used with incorrect props causing crash */}

                <div className="space-y-3">
                    <div className="flex items-center justify-end mb-4">
                        <input
                            type="checkbox"
                            id="include_tva"
                            className="h-4 w-4 text-blue-600 focus:ring-ios border-gray-300 rounded dark:border-gray-700 bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500"
                            checked={formData.include_tva}
                            onChange={(e) => setFormData({ ...formData, include_tva: e.target.checked })}
                            disabled={isLocked}
                        />
                        <label htmlFor="include_tva" className="ml-2 block text-sm text-gray-900 dark:text-white">
                            Appliquer la TVA (20%)
                        </label>
                    </div>
                    <div className="flex items-center justify-end mb-4">
                        <input
                            type="checkbox"
                            id="has_material_deposit"
                            className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded dark:border-gray-700 bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500"
                            checked={formData.has_material_deposit}
                            onChange={(e) => setFormData({ ...formData, has_material_deposit: e.target.checked })}
                            disabled={isLocked}
                        />
                        <label htmlFor="has_material_deposit" className="ml-2 block text-sm text-gray-900 dark:text-white">
                            Demander un acompte matériel
                        </label>
                        {!dismissedHelps.material_deposit && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setShowMaterialDepositHelp(prev => !prev)}
                                    aria-expanded={showMaterialDepositHelp}
                                    aria-label="Aide sur l'acompte matériel"
                                    title="À quoi sert l'acompte matériel ?"
                                    className={`ml-1.5 p-0.5 rounded-full transition-colors ${showMaterialDepositHelp ? 'text-ios' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                                >
                                    <HelpCircle className="w-4 h-4" />
                                </button>
                                {showMaterialDepositHelp && (
                                    <button
                                        type="button"
                                        onClick={() => dismissHelp('material_deposit')}
                                        aria-label="Ne plus afficher cette aide"
                                        title="J'ai compris — ne plus afficher cette aide"
                                        className="p-0.5 rounded-full text-gray-300 hover:text-red-500 transition-colors"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                    {showMaterialDepositHelp && !dismissedHelps.material_deposit && (
                        <p className="text-xs text-gray-400 -mt-3 mb-4 text-right">
                            Ajoute au PDF une mention demandant, à la signature, un acompte couvrant la totalité du matériel du devis.
                            Le client finance les fournitures avant la commande : vous n'avancez pas leur coût.
                        </p>
                    )}
                    <div className="flex items-center justify-end gap-2 mb-4">
                        <label htmlFor="deposit_percentage" className="block text-sm text-gray-900 dark:text-white">
                            Acompte à la signature
                        </label>
                        <div className="relative w-20">
                            <input
                                type="number"
                                id="deposit_percentage"
                                min="0"
                                max="100"
                                step="1"
                                className="h-8 w-full text-right pr-6 text-sm rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                                value={formData.deposit_percentage || ''}
                                placeholder="0"
                                onChange={(e) => {
                                    const v = e.target.value === '' ? 0 : Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                                    setFormData({ ...formData, deposit_percentage: v });
                                }}
                                disabled={isLocked}
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">%</span>
                        </div>
                    </div>
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                        <span>Total HT</span>
                        <span>{subtotal.toFixed(2)} €</span>
                    </div>
                    {formData.include_tva && (
                        <div className="flex justify-between text-gray-600 dark:text-gray-400">
                            <span>TVA (20%)</span>
                            <span>{tva.toFixed(2)} €</span>
                        </div>
                    )}
                    {!formData.include_tva && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 text-right italic">
                            TVA non applicable, art. 293 B du CGI
                        </div>
                    )}
                    {/* Marge — nette (main d'œuvre incluse) si le coût horaire
                        est renseigné, sinon marge matière. Invite contextuelle
                        pour renseigner le coût horaire quand il manque. */}
                    <QuoteMarginSummary
                        formData={formData}
                        navigate={navigate}
                        quoteMargins={quoteMargins}
                        subtotal={subtotal}
                    />
                    <div className="flex justify-between text-lg font-bold text-gray-900 dark:text-white pt-3 border-t border-gray-200 dark:border-gray-700">
                        <span>{formData.type === 'amendment' ? "Montant de l'avenant TTC" : 'Total TTC'}</span>
                        <span>{total.toFixed(2)} €</span>
                    </div>
                    {/* Avenant : le total ci-dessus n'est QUE le delta (+/− travaux).
                        Le nouveau total projet est calculé automatiquement (identique au
                        PDF : devis initial — ou situations déjà facturées — + montant de
                        l'avenant). On invite donc à ne PAS saisir de ligne « nouveau total »
                        ni « moins-value totale », qui feraient double emploi. */}
                    {formData.type === 'amendment' && (() => {
                        // total = montant de l'avenant (delta, peut être négatif).
                        const { progressTotal, depositTotal, previousAmendmentsTTC, previousAmendmentsBilledTTC, previousAmendmentsCount, baseline, amendmentTTC, newTotal, showDeposit, showPreviousBilled, showRemaining, remaining } =
                            amendmentProjectTotals(formData.parent_quote_data, total);
                        return (
                            <div className="mt-3 space-y-2">
                                <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                                    <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-orange-500" />
                                    <span>
                                        Ne saisissez que les lignes <strong>ajoutées ou retirées</strong> (le delta).
                                        Inutile d'ajouter une ligne « Nouveau total » ou « Moins-value totale » :
                                        le nouveau total du projet est calculé automatiquement ci-dessous.
                                    </span>
                                </div>
                                <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3 space-y-1.5 text-sm">
                                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                                        <span>{progressTotal > 0 ? 'Déjà facturé (situations)' : 'Devis initial TTC'}</span>
                                        <span>{baseline.toFixed(2)} €</span>
                                    </div>
                                    {previousAmendmentsCount > 0 && (
                                        <div className="flex justify-between text-gray-600 dark:text-gray-400">
                                            <span>{previousAmendmentsCount > 1 ? `Avenants précédents signés (${previousAmendmentsCount})` : 'Avenant précédent signé'}</span>
                                            <span>{previousAmendmentsTTC >= 0 ? '+' : ''}{previousAmendmentsTTC.toFixed(2)} €</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                                        <span>Montant de l'avenant TTC</span>
                                        <span className={amendmentTTC < 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-blue-600 dark:text-blue-400 font-medium'}>
                                            {amendmentTTC >= 0 ? '+' : ''}{amendmentTTC.toFixed(2)} €
                                        </span>
                                    </div>
                                    <div className={`flex justify-between font-bold text-gray-900 dark:text-white pt-1.5 border-t border-orange-200 dark:border-orange-800`}>
                                        <span>Nouveau Total Projet</span>
                                        <span>{newTotal.toFixed(2)} €</span>
                                    </div>
                                    {showRemaining && (
                                        <>
                                            {showDeposit && (
                                                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                                                    <span>Acompte déjà versé</span>
                                                    <span className="text-red-600 dark:text-red-400 font-medium">−{depositTotal.toFixed(2)} €</span>
                                                </div>
                                            )}
                                            {showPreviousBilled && (
                                                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                                                    <span>Avenants précédents déjà facturés</span>
                                                    <span className="text-red-600 dark:text-red-400 font-medium">−{previousAmendmentsBilledTTC.toFixed(2)} €</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between font-bold text-gray-900 dark:text-white pt-1.5 border-t border-orange-200 dark:border-orange-800">
                                                <span>Reste à régler</span>
                                                <span>{remaining.toFixed(2)} €</span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
};

export default QuoteTotalsPanel;
