import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2, Receipt, Info } from 'lucide-react';

const fmt = (n) => `${(Number(n) || 0).toFixed(2)} €`;

/**
 * « Prochaine étape » de facturation d'un chantier au modèle
 * « matériel d'avance, main d'œuvre au solde ».
 *
 * Après la signature d'un avenant, l'artisan n'a pas à savoir que l'acompte
 * se génère depuis le devis parent, ni à retrouver ce devis et son menu :
 * la carte dit ce qu'il reste à facturer et le fait en un clic, ici même.
 */
const DepositNextStepCard = ({
    variant = 'amendment',        // 'amendment' : sur l'avenant signé ; 'root' : sur le devis
    rootId,
    rootRef,
    amountTTC = 0,
    alreadyIssuedTTC = 0,
    previousLabels = [],
    amendmentLabels = [],
    onGenerate,
    loading = false,
}) => {
    const nothingToBill = amountTTC <= 0.005;
    const previous = previousLabels.length > 0 ? previousLabels.join(', ') : null;
    const amendments = amendmentLabels.length > 0 ? amendmentLabels.join(', ') : null;

    if (nothingToBill) {
        return (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 mb-6 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                    <p className="font-semibold text-green-900 dark:text-green-200">
                        {variant === 'amendment' ? 'Avenant signé : rien à facturer pour le moment' : 'Matériel entièrement réglé'}
                    </p>
                    <p className="text-green-800 dark:text-green-300/90 mt-1">
                        Le matériel est déjà couvert{previous ? ` par l'acompte ${previous}` : ''}.
                        Le solde (main d'œuvre) sera facturé à la fin du chantier, avec la « Facture de clôture » du devis n°{rootRef}.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
                <Receipt className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 text-sm">
                    <p className="font-semibold text-blue-900 dark:text-blue-200">
                        {variant === 'amendment'
                            ? 'Avenant signé : matériel à facturer avant commande'
                            : `Un avenant signé ajoute du matériel non encore facturé`}
                    </p>
                    <p className="text-blue-800 dark:text-blue-300/90 mt-1">
                        Acompte matériel à facturer au client : <strong>{fmt(amountTTC)} TTC</strong>
                        {amendments ? ` (fournitures ${amendmentLabels.length > 1 ? 'des' : 'de l\''}${amendments})` : ''}.
                        {alreadyIssuedTTC > 0 && (
                            <> Le matériel déjà réglé ({fmt(alreadyIssuedTTC)}{previous ? `, ${previous}` : ''}) n'est pas refacturé.</>
                        )}
                    </p>
                    <p className="flex items-start gap-1.5 text-xs text-blue-700/80 dark:text-blue-300/70 mt-2">
                        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span>
                            La main d'œuvre sera facturée au solde, avec la « Facture de clôture » du devis n°{rootRef}
                            {variant === 'amendment' && rootId ? (
                                <> (<Link to={`/app/devis/${rootId}`} className="underline hover:text-blue-900 dark:hover:text-blue-100">ouvrir le devis</Link>)</>
                            ) : null}.
                        </span>
                    </p>
                </div>
            </div>
            <div className="mt-3 sm:pl-8">
                <button
                    type="button"
                    onClick={onGenerate}
                    disabled={loading}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
                    Facturer l'acompte matériel de {fmt(amountTTC)}
                </button>
            </div>
        </div>
    );
};

export default DepositNextStepCard;
