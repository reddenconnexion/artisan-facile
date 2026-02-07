import React, { useState, useEffect } from 'react';
import { X, Check, Calculator } from 'lucide-react';

const SituationModal = ({ isOpen, onClose, quote, onSave }) => {
    const [title, setTitle] = useState("Situation de travaux n°1");
    const [selectedItems, setSelectedItems] = useState({}); // { itemId: percentage }
    const [globalPercentage, setGlobalPercentage] = useState("");

    // Initialize/Reset when opening
    useEffect(() => {
        if (isOpen && quote) {
            setTitle(`Situation - ${quote.title || 'Travaux'}`);
            // Default: nothing selected
            setSelectedItems({});
            setGlobalPercentage("");
        }
    }, [isOpen, quote]);

    if (!isOpen || !quote) return null;

    const handleItemChange = (itemId, percentage) => {
        // Allow negative up to -100 for refunds, effectively
        const val = Math.max(-100, Math.min(100, parseFloat(percentage) || 0));
        setSelectedItems(prev => {
            const next = { ...prev };
            if (val !== 0) next[itemId] = val; // Store if not strictly 0. Negative is allow.
            else delete next[itemId];
            return next;
        });
    };

    const handleToggleItem = (itemId) => {
        setSelectedItems(prev => {
            const next = { ...prev };
            if (next[itemId]) delete next[itemId];
            else next[itemId] = 100; // Default to 100% if checked
            return next;
        });
    };

    const applyGlobal = () => {
        const val = parseFloat(globalPercentage);
        if (!isNaN(val) && val > 0 && val <= 100) {
            const newSelection = {};
            quote.items.forEach(item => {
                // Skip if material item and material deposit is active
                if (item.type === 'material' && quote.has_material_deposit) return;

                newSelection[item.id] = val;
            });
            setSelectedItems(newSelection);
        }
    };

    const calculateTotal = () => {
        let total = 0;
        quote.items.forEach(item => {
            if (selectedItems[item.id]) {
                const itemTotal = (item.price * item.quantity);
                total += itemTotal * (selectedItems[item.id] / 100);
            }
        });
        return total;
    };

    const handleSave = () => {
        // Filter and prepare items
        const invoiceItems = quote.items
            .filter(item => selectedItems[item.id] && selectedItems[item.id] !== 0)
            .map(item => {
                const pct = selectedItems[item.id];
                const amount = (item.price * item.quantity) * (pct / 100);

                // We create a line item that represents this progress
                // Strategy: Quantity = 1, Price = Amount. Description includes detail.
                return {
                    id: Date.now() + Math.random(),
                    description: `${item.description} (Avancement: ${pct}%)`,
                    quantity: 1,
                    unit: 'forfait',
                    price: amount,
                    buying_price: 0, // Situation doesn't re-count buying price usually? Or proportional? Let's say 0 for invoice simplicity or proportional if needed for margin. Let's keep 0 as it's billing.
                    type: item.type
                };
            });

        if (invoiceItems.length === 0) {
            alert("Aucun élément sélectionné");
            return;
        }

        onSave(title, invoiceItems);
        onClose();
    };

    const totalAmount = calculateTotal();
    const totalTVA = quote.include_tva ? totalAmount * 0.20 : 0;
    const totalTTC = totalAmount + totalTVA;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Nouvelle Situation</h2>
                        <p className="text-sm text-gray-500">Sélectionnez les ouvrages réalisés pour facturation</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="p-4 bg-gray-50 border-b border-gray-100 flex flex-wrap gap-4 items-center">
                    <div className="flex-1">
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Titre du document</label>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                    </div>
                    <div className="flex items-end gap-2">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Appliquer % à tout</label>
                            <input
                                type="number"
                                min="0" max="100"
                                value={globalPercentage}
                                onChange={e => setGlobalPercentage(e.target.value)}
                                className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                placeholder="ex: 30"
                            />
                        </div>
                        <button
                            onClick={applyGlobal}
                            className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition-colors"
                        >
                            Appliquer
                        </button>
                    </div>
                </div>

                {/* Items List */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">
                                <th className="py-3 pl-2 w-10">
                                    <input
                                        type="checkbox"
                                        onChange={(e) => {
                                            if (e.target.checked) applyGlobal(100); // Select all 100%? Or just Select All? 
                                            // Simpler: Just individual select for now or use the Global % input for bulk
                                            // Let's leave header checkbox empty to avoid confusion with logic
                                        }}
                                        className="rounded border-gray-300"
                                    />
                                </th>
                                <th className="py-3">Description</th>
                                <th className="py-3 text-right">Montant Devis</th>
                                <th className="py-3 text-right w-32">% À Facturer</th>
                                <th className="py-3 text-right w-32">Montant HT</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {quote.items.map((item) => {
                                const isSelected = !!selectedItems[item.id];
                                const percentage = selectedItems[item.id] || 0;
                                const itemTotal = (item.price * item.quantity);
                                const itemBilled = itemTotal * (percentage / 100);

                                const isMaterial = item.type === 'material';
                                const isMaterialDepositPaid = isMaterial && quote.has_material_deposit;

                                return (
                                    <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50/30' : ''}`}>
                                        <td className="py-3 pl-2">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => handleToggleItem(item.id)}
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                        </td>
                                        <td className="py-3 text-sm text-gray-900">
                                            <div className="font-medium">
                                                {item.description}
                                                {isMaterialDepositPaid && (
                                                    <span className="ml-2 text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
                                                        Déjà réglé
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                Qté: {item.quantity} | PU: {item.price}€
                                                {isMaterialDepositPaid && <span className="ml-1 text-xs text-gray-400 italic">(Saisir % négatif pour remboursement)</span>}
                                            </div>
                                        </td>
                                        <td className="py-3 text-right text-sm text-gray-500">
                                            {itemTotal.toFixed(2)}€
                                        </td>
                                        <td className="py-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <input
                                                    type="number"
                                                    min={isMaterialDepositPaid ? "-100" : "0"}
                                                    max="100"
                                                    value={isSelected ? percentage : ''}
                                                    onChange={(e) => handleItemChange(item.id, e.target.value)}
                                                    disabled={!isSelected}
                                                    className={`w-20 px-2 py-1 text-right text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${!isSelected ? 'bg-gray-50 text-gray-300' : 'border-gray-300'}`}
                                                    placeholder="0"
                                                />
                                                <span className="text-sm text-gray-500">%</span>
                                            </div>
                                        </td>
                                        <td className="py-3 text-right font-medium text-gray-900">
                                            {isSelected ? itemBilled.toFixed(2) : '0.00'}€
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="p-6 bg-gray-50 border-t border-gray-200">
                    <div className="flex justify-between items-center mb-4">
                        <div className="text-sm text-gray-500">
                            {Object.keys(selectedItems).length} élément(s) sélectionné(s)
                        </div>
                        <div className="text-right">
                            <div className="text-gray-600">Total HT: <span className="font-medium">{totalAmount.toFixed(2)}€</span></div>
                            <div className="text-gray-600">TVA (20%): <span className="font-medium">{totalTVA.toFixed(2)}€</span></div>
                            <div className="text-2xl font-bold text-gray-900 mt-1">Total TTC: {totalTTC.toFixed(2)}€</div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-white transition-all shadow-sm"
                        >
                            Annuler
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={Object.keys(selectedItems).length === 0}
                            className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                        >
                            <Check className="w-5 h-5 mr-2" />
                            Générer la facture
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SituationModal;
