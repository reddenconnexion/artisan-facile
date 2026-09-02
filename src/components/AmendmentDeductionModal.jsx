import React, { useMemo, useState } from 'react';
import { X, MinusCircle, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useModalA11y } from '../hooks/useModalA11y';
import { deductibleParentLines, buildDeductionItems, parentQuoteRef } from '../utils/amendmentDeduction';

// Sélection, sur un avenant, des prestations du devis initial qui ne seront
// pas réalisées : chaque ligne cochée est reprise en négatif sur l'avenant
// (quantité totale par défaut, ajustable pour un retrait partiel).
//
// Le dialogue n'est monté que lorsqu'il est ouvert : sa sélection repart
// donc vierge à chaque ouverture, sans effet de synchronisation.
const AmendmentDeductionModal = ({ isOpen, ...props }) => {
    if (!isOpen) return null;
    return <DeductionDialog {...props} />;
};

const DeductionDialog = ({ onClose, parentQuote, existingItems, onAdd }) => {
    const [selected, setSelected] = useState({}); // { [itemId]: quantité à déduire (string) }
    const containerRef = useModalA11y(true, onClose);

    const lines = useMemo(
        () => deductibleParentLines(parentQuote, existingItems),
        [parentQuote, existingItems]
    );

    const fmt = (n) => `${(n || 0).toFixed(2)} €`;

    const toggle = (line) => {
        setSelected((prev) => {
            const next = { ...prev };
            if (Object.prototype.hasOwnProperty.call(next, line.id)) delete next[line.id];
            else next[line.id] = String(line.remainingQuantity);
            return next;
        });
    };

    const setQuantity = (line, value) => {
        setSelected((prev) => ({ ...prev, [line.id]: value }));
    };

    const available = lines.filter((l) => l.remainingQuantity > 0);
    const allSelected = available.length > 0 && available.every((l) => Object.prototype.hasOwnProperty.call(selected, l.id));
    const toggleAll = () => {
        if (allSelected) { setSelected({}); return; }
        const next = {};
        available.forEach((l) => { next[l.id] = String(l.remainingQuantity); });
        setSelected(next);
    };

    const selectedCount = Object.keys(selected).length;
    const previewHT = lines.reduce((sum, l) => {
        if (!Object.prototype.hasOwnProperty.call(selected, l.id)) return sum;
        const q = parseFloat(selected[l.id]);
        return sum + (Number.isFinite(q) ? -q * l.price : 0);
    }, 0);

    const handleConfirm = () => {
        try {
            const selections = Object.entries(selected).map(([itemId, quantity]) => ({ itemId, quantity }));
            const result = buildDeductionItems(parentQuote, selections, { existingItems });
            onAdd(result);
            onClose();
        } catch (err) {
            toast.error(err.message || 'Impossible de déduire ces prestations.');
        }
    };

    // Regroupe par section (Lot) du devis initial pour s'y retrouver.
    const groups = [];
    lines.forEach((l) => {
        const last = groups[groups.length - 1];
        if (last && last.section === l.section) last.lines.push(l);
        else groups.push({ section: l.section, lines: [l] });
    });

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div
                ref={containerRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="amendment-deduction-title"
                className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
            >
                <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-start gap-4">
                    <div>
                        <h2 id="amendment-deduction-title" className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <MinusCircle className="w-5 h-5 text-red-500" />
                            Déduire des prestations non réalisées
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Cochez les lignes du devis n°{parentQuoteRef(parentQuote)} qui ne seront pas réalisées :
                            elles seront reprises en négatif sur cet avenant. Ajustez la quantité pour un retrait partiel.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Fermer"
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 dark:text-gray-400 flex-shrink-0"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {lines.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                            Le devis initial ne contient aucune ligne ferme à déduire.
                        </p>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase border-b border-gray-200 dark:border-gray-700">
                                    <th className="py-3 pl-2 w-10">
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            onChange={toggleAll}
                                            disabled={available.length === 0}
                                            aria-label="Tout sélectionner"
                                            className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                                        />
                                    </th>
                                    <th className="py-3">Prestation du devis initial</th>
                                    <th className="py-3 text-right whitespace-nowrap">Montant HT</th>
                                    <th className="py-3 text-right w-32 whitespace-nowrap">Qté à déduire</th>
                                    <th className="py-3 text-right w-32 whitespace-nowrap">Déduction HT</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {groups.map((group, gi) => (
                                    <React.Fragment key={`${group.section}-${gi}`}>
                                        {group.section && (
                                            <tr className="bg-blue-50/60 dark:bg-blue-900/10">
                                                <td colSpan={5} className="py-1.5 pl-2 text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                                                    {group.section}
                                                </td>
                                            </tr>
                                        )}
                                        {group.lines.map((line) => {
                                            const isSelected = Object.prototype.hasOwnProperty.call(selected, line.id);
                                            const exhausted = line.remainingQuantity <= 0;
                                            const q = parseFloat(selected[line.id]);
                                            const deductionHT = isSelected && Number.isFinite(q) ? -q * line.price : 0;
                                            const overflow = isSelected && Number.isFinite(q) && q > line.remainingQuantity + 0.0001;
                                            return (
                                                <tr
                                                    key={line.id}
                                                    className={`transition-colors ${exhausted ? 'opacity-50' : 'hover:bg-gray-50 dark:hover:bg-gray-800'} ${isSelected ? 'bg-red-50/40 dark:bg-red-900/10' : ''}`}
                                                >
                                                    <td className="py-3 pl-2 align-top">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            disabled={exhausted}
                                                            onChange={() => toggle(line)}
                                                            className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                                                        />
                                                    </td>
                                                    <td className="py-3 text-sm text-gray-900 dark:text-gray-100">
                                                        <div className="font-medium">{line.description || <span className="italic text-gray-400">Sans désignation</span>}</div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                                            {line.type === 'material' ? 'Matériel' : "Main d'œuvre"} · Qté {line.quantity} {line.unit} · PU {fmt(line.price)}
                                                            {line.deductedQuantity > 0 && (
                                                                <span className="ml-2 text-red-600 dark:text-red-400 font-medium">
                                                                    {exhausted ? 'Entièrement déduite' : `${line.deductedQuantity} déjà déduite${line.deductedQuantity > 1 ? 's' : ''}`}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="py-3 text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap align-top">
                                                        {fmt(line.amountHT)}
                                                    </td>
                                                    <td className="py-3 text-right align-top">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max={line.remainingQuantity}
                                                            step="0.01"
                                                            value={isSelected ? selected[line.id] : ''}
                                                            disabled={!isSelected}
                                                            onChange={(e) => setQuantity(line, e.target.value)}
                                                            aria-label={`Quantité à déduire pour ${line.description || 'la ligne'}`}
                                                            className={`w-24 px-2 py-1.5 text-right text-sm rounded-md border bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-800/50 disabled:text-gray-400 ${overflow ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 dark:border-gray-700 focus:ring-blue-500 focus:border-blue-500'}`}
                                                        />
                                                        {overflow && (
                                                            <div className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">max {line.remainingQuantity}</div>
                                                        )}
                                                    </td>
                                                    <td className={`py-3 text-sm text-right font-medium whitespace-nowrap align-top ${isSelected ? 'text-red-600 dark:text-red-400' : 'text-gray-300 dark:text-gray-600'}`}>
                                                        {isSelected ? fmt(deductionHT) : '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 rounded-b-xl">
                    <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 mb-3">
                        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-orange-500" />
                        <span>
                            Les lignes ajoutées restent modifiables sur l'avenant. Le « Nouveau Total Projet » se recalcule
                            automatiquement (devis initial − prestations retirées + travaux ajoutés).
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm text-gray-700 dark:text-gray-300">
                            {selectedCount > 0 ? (
                                <>
                                    <span className="font-semibold">{selectedCount}</span> prestation{selectedCount > 1 ? 's' : ''} ·
                                    déduction <span className="font-bold text-red-600 dark:text-red-400">{fmt(previewHT)} HT</span>
                                </>
                            ) : (
                                'Aucune prestation sélectionnée'
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                                Annuler
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirm}
                                disabled={selectedCount === 0}
                                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <MinusCircle className="w-4 h-4" />
                                Déduire de l'avenant
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AmendmentDeductionModal;
