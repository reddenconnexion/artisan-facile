import AmendmentDeductionModal from '../../components/AmendmentDeductionModal';
import SituationModal from '../../components/SituationModal';

/**
 * Modales ouvertes par les entrées « Documents liés » (avoir, situation de
 * travaux, déduction d'avenant) — rendues dans l'éditeur comme dans l'aperçu.
 */
const DocumentActionModals = ({
    creditNoteModal,
    formData,
    handleAddDeductionItems,
    handleCreateCreditNote,
    handleSaveSituation,
    id,
    setCreditNoteModal,
    setShowDeductionModal,
    setShowSituationModal,
    showDeductionModal,
    showSituationModal,
    total,
}) => {
    return (
        <>
            {/* Fenêtre explicative du bouton « Facturer » — affichée au premier
                clic seulement, puis mémorisée (dismissedHelps) par navigateur. */}
            {creditNoteModal && (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    onClick={() => !creditNoteModal.saving && setCreditNoteModal(null)}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="credit-note-title"
                >
                    <div
                        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 id="credit-note-title" className="font-bold text-gray-900 dark:text-white text-base mb-1">
                            Créer un avoir sur la facture {formData.invoice_number}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
                            Une facture émise ne peut être ni modifiée ni supprimée : l'avoir est le
                            document légal qui l'annule ou la corrige. Il sera émis immédiatement,
                            avec un numéro AV-… définitif.
                        </p>

                        {creditNoteModal.existing.length > 0 && (
                            <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
                                Déjà émis sur cette facture :{' '}
                                {creditNoteModal.existing.map(cn => `${cn.invoice_number || `#${cn.id}`} (${(Number(cn.total_ttc) || 0).toFixed(2)} €)`).join(', ')}
                            </div>
                        )}

                        <div className="space-y-3 mb-5">
                            <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${creditNoteModal.mode === 'total' ? 'border-red-300 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                                <input
                                    type="radio"
                                    name="credit-note-mode"
                                    className="mt-0.5"
                                    checked={creditNoteModal.mode === 'total'}
                                    onChange={() => setCreditNoteModal(p => ({ ...p, mode: 'total' }))}
                                />
                                <span className="text-sm">
                                    <span className="font-semibold text-gray-900 dark:text-white block">Avoir total (annulation)</span>
                                    <span className="text-gray-500 dark:text-gray-400 text-xs">Toutes les lignes de la facture reprises en négatif ({total.toFixed(2)} €).</span>
                                </span>
                            </label>
                            <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${creditNoteModal.mode === 'partial' ? 'border-red-300 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                                <input
                                    type="radio"
                                    name="credit-note-mode"
                                    className="mt-0.5"
                                    checked={creditNoteModal.mode === 'partial'}
                                    onChange={() => setCreditNoteModal(p => ({ ...p, mode: 'partial' }))}
                                />
                                <span className="text-sm flex-1">
                                    <span className="font-semibold text-gray-900 dark:text-white block">Avoir partiel</span>
                                    <span className="text-gray-500 dark:text-gray-400 text-xs block mb-2">Une remise ou correction d'un montant donné.</span>
                                    {creditNoteModal.mode === 'partial' && (
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            placeholder={`Montant TTC (max ${total.toFixed(2)} €)`}
                                            value={creditNoteModal.amountTTC}
                                            onChange={e => setCreditNoteModal(p => ({ ...p, amountTTC: e.target.value }))}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900"
                                        />
                                    )}
                                </span>
                            </label>
                            <input
                                type="text"
                                placeholder="Motif (recommandé) : erreur de facturation, geste commercial…"
                                value={creditNoteModal.reason}
                                onChange={e => setCreditNoteModal(p => ({ ...p, reason: e.target.value }))}
                                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900"
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setCreditNoteModal(null)}
                                disabled={creditNoteModal.saving}
                                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200"
                            >
                                Annuler
                            </button>
                            <button
                                type="button"
                                onClick={handleCreateCreditNote}
                                disabled={creditNoteModal.saving || (creditNoteModal.mode === 'partial' && !(parseFloat(String(creditNoteModal.amountTTC).replace(',', '.')) > 0))}
                                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
                            >
                                {creditNoteModal.saving ? 'Émission…' : "Émettre l'avoir"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <SituationModal
                isOpen={showSituationModal}
                onClose={() => setShowSituationModal(false)}
                quote={{ ...formData, id: id }}
                onSave={handleSaveSituation}
            />

            {formData.type === 'amendment' && (
                <AmendmentDeductionModal
                    isOpen={showDeductionModal}
                    onClose={() => setShowDeductionModal(false)}
                    parentQuote={formData.parent_quote_data}
                    existingItems={formData.items}
                    onAdd={handleAddDeductionItems}
                />
            )}
        </>
    );
};

export default DocumentActionModals;
