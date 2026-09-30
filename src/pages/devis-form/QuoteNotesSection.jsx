import { Star, Sparkles } from 'lucide-react';
import { Input } from '../../components/ui';
import { materialDepositAmounts } from '../../utils/materialDeposit';
import { autoGrow } from './quoteHelpers';

/**
 * Notes / conditions du devis et mentions d'acompte ajoutées au PDF.
 */
const QuoteNotesSection = ({
    formData,
    isLocked,
    setFormData,
    setShowSmartVoice,
    setVoiceContext,
    subtotal,
    total,
    tva,
}) => {
    return (
        <div>
            <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Notes / Conditions</label>
                <button
                    type="button"
                    onClick={() => {
                        setVoiceContext('note');
                        setShowSmartVoice(true);
                    }}
                    className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-indigo-500 hover:text-indigo-700 disabled:opacity-50"
                    title="Dicter une note"
                    disabled={isLocked}
                >
                    <Sparkles className="w-4 h-4" />
                </button>
            </div>
            <Input
                as="textarea"
                rows={3}
                className="disabled:bg-gray-100 disabled:text-gray-500"
                placeholder="Conditions de paiement, validité du devis..."
                value={formData.notes}
                onChange={(e) => {
                    setFormData({ ...formData, notes: e.target.value });
                    // Déplie le champ au fil de la saisie pour tout afficher.
                    autoGrow(e.target);
                }}
                onFocus={(e) => {
                    // Au clic, déplie le champ pour avoir une vue complète
                    // des notes/conditions (plus de scroll interne).
                    autoGrow(e.target);
                }}
                onBlur={(e) => {
                    // Revient à la hauteur compacte (3 lignes) une fois désélectionné.
                    e.target.style.height = '';
                }}
                disabled={isLocked}
            />
            {/* Auto-calculate Material Deposit Hint — ligne compacte, phrase complète en infobulle.
                Même calcul et mêmes conditions que le PDF (materialDeposit.js) : options
                exclues, case « acompte matériel » cochée — sinon le montant annoncé ici
                divergerait de la mention réellement imprimée. */}
            {formData.type !== 'invoice' && formData.has_material_deposit && (() => {
                const deposit = materialDepositAmounts({
                    items: formData.items,
                    include_tva: formData.include_tva,
                    total_ht: subtotal,
                    total_tva: tva,
                    total_ttc: total,
                });
                if (!deposit) return null;
                const mTTC = deposit.materialTTC;
                return (
                    <p
                        className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1.5 cursor-help"
                        title={`Mention ajoutée au PDF : "Un acompte correspondant à la totalité du matériel (${mTTC.toFixed(2)} € TTC) est requis à la signature."`}
                    >
                        <Star className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-blue-400" />
                        <span>Mention « Acompte matériel » ({mTTC.toFixed(2)} € TTC à la signature) ajoutée automatiquement au PDF.</span>
                    </p>
                );
            })()}
            {/* Aperçu acompte en % du total (devis sans acompte matériel actif).
                Même règle d'exclusivité que le PDF : le bloc % ne s'affiche que si
                le tableau d'acompte matériel n'est pas rendu (fournitures FERMES +
                case cochée) — les options seules ne comptent pas. */}
            {formData.type !== 'invoice' && (Number(formData.deposit_percentage) || 0) > 0 &&
                !(formData.has_material_deposit && materialDepositAmounts({ items: formData.items }) != null) && (() => {
                const pct = Number(formData.deposit_percentage) || 0;
                const dep = total * pct / 100;
                const solde = Math.max(total - dep, 0);
                return (
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1.5">
                        <Star className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-blue-400" />
                        <span>Mention ajoutée au PDF : acompte à la signature ({pct} %) {dep.toFixed(2)} € TTC — solde à la fin des travaux {solde.toFixed(2)} € TTC.</span>
                    </p>
                );
            })()}
        </div>
    );
};

export default QuoteNotesSection;
