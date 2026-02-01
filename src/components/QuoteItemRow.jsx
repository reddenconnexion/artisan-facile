import React, { memo, useState, useRef, useEffect } from 'react';
import { Trash2, ArrowUp, ArrowDown, Calculator, Mic, Copy } from 'lucide-react';

/**
 * Composant pour une ligne d'item dans un devis
 * Mémorisé pour éviter les re-renders inutiles
 */
const QuoteItemRow = memo(function QuoteItemRow({
    item,
    index,
    tradeConfig,
    priceLibrary,
    onUpdate,
    onRemove,
    onMoveUp,
    onMoveDown,
    onOpenCalculator,
    onOpenVoice,
    onDuplicate,
    canMoveUp,
    canMoveDown,
    focusedInput,
    onFocus,
    onBlur
}) {
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [filteredSuggestions, setFilteredSuggestions] = useState([]);
    const descriptionRef = useRef(null);

    const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0);
    const lineCost = (parseFloat(item.quantity) || 0) * (parseFloat(item.buying_price) || 0);
    const lineMargin = lineTotal > 0 ? ((lineTotal - lineCost) / lineTotal) * 100 : 0;

    // Filtrer les suggestions de la bibliothèque
    useEffect(() => {
        if (item.description && item.description.length >= 2 && focusedInput === `item-description-${index}`) {
            const filtered = priceLibrary.filter(lib =>
                lib.description?.toLowerCase().includes(item.description.toLowerCase())
            ).slice(0, 5);
            setFilteredSuggestions(filtered);
            setShowSuggestions(filtered.length > 0);
        } else {
            setShowSuggestions(false);
        }
    }, [item.description, priceLibrary, focusedInput, index]);

    const handleSuggestionClick = (suggestion) => {
        onUpdate(item.id, 'description', suggestion.description);
        onUpdate(item.id, 'price', suggestion.price);
        onUpdate(item.id, 'unit', suggestion.unit || 'u');
        onUpdate(item.id, 'type', suggestion.type || 'service');
        setShowSuggestions(false);
    };

    return (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3 relative group">
            {/* Actions de la ligne */}
            <div className="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {canMoveUp && (
                    <button
                        type="button"
                        onClick={() => onMoveUp(index)}
                        className="p-1 bg-white dark:bg-gray-700 rounded-full shadow-sm hover:bg-gray-100 dark:hover:bg-gray-600"
                        title="Monter"
                    >
                        <ArrowUp className="w-3 h-3 text-gray-500" />
                    </button>
                )}
                {canMoveDown && (
                    <button
                        type="button"
                        onClick={() => onMoveDown(index)}
                        className="p-1 bg-white dark:bg-gray-700 rounded-full shadow-sm hover:bg-gray-100 dark:hover:bg-gray-600"
                        title="Descendre"
                    >
                        <ArrowDown className="w-3 h-3 text-gray-500" />
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => onDuplicate(item)}
                    className="p-1 bg-white dark:bg-gray-700 rounded-full shadow-sm hover:bg-gray-100 dark:hover:bg-gray-600"
                    title="Dupliquer"
                >
                    <Copy className="w-3 h-3 text-gray-500" />
                </button>
                <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="p-1 bg-white dark:bg-gray-700 rounded-full shadow-sm hover:bg-red-100 dark:hover:bg-red-900/30"
                    title="Supprimer"
                >
                    <Trash2 className="w-3 h-3 text-red-500" />
                </button>
            </div>

            {/* Description avec suggestions */}
            <div className="relative">
                <div className="flex gap-2">
                    <input
                        ref={descriptionRef}
                        type="text"
                        placeholder="Description du poste"
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        value={item.description || ''}
                        onChange={(e) => onUpdate(item.id, 'description', e.target.value)}
                        onFocus={() => onFocus(`item-description-${index}`)}
                        onBlur={() => setTimeout(() => onBlur(), 200)}
                    />
                    {onOpenVoice && (
                        <button
                            type="button"
                            onClick={() => onOpenVoice(index)}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                            title="Dictée vocale"
                        >
                            <Mic className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Suggestions de la bibliothèque */}
                {showSuggestions && (
                    <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 max-h-48 overflow-y-auto">
                        {filteredSuggestions.map((suggestion, idx) => (
                            <button
                                key={idx}
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex justify-between items-center"
                                onClick={() => handleSuggestionClick(suggestion)}
                            >
                                <span className="truncate dark:text-white">{suggestion.description}</span>
                                <span className="text-gray-500 dark:text-gray-400 ml-2 shrink-0">{suggestion.price}€/{suggestion.unit || 'u'}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Ligne quantité / unité / prix */}
            <div className="grid grid-cols-12 gap-2">
                <div className="col-span-3">
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Quantité</label>
                    <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 dark:text-white"
                        value={item.quantity || ''}
                        onChange={(e) => onUpdate(item.id, 'quantity', e.target.value)}
                    />
                </div>

                <div className="col-span-2">
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Unité</label>
                    <select
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 dark:text-white"
                        value={item.unit || tradeConfig?.defaultUnit || 'u'}
                        onChange={(e) => onUpdate(item.id, 'unit', e.target.value)}
                    >
                        {(tradeConfig?.units || ['u', 'h', 'm', 'm²', 'm³', 'kg', 'forfait']).map(unit => (
                            <option key={unit} value={unit}>{unit}</option>
                        ))}
                    </select>
                </div>

                <div className="col-span-3">
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Prix unit. HT</label>
                    <div className="flex gap-1">
                        <input
                            type="number"
                            step="0.01"
                            className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 dark:text-white"
                            value={item.price || ''}
                            onChange={(e) => onUpdate(item.id, 'price', e.target.value)}
                        />
                        {onOpenCalculator && (
                            <button
                                type="button"
                                onClick={() => onOpenCalculator(item)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg"
                                title="Calculatrice"
                            >
                                <Calculator className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="col-span-2">
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Type</label>
                    <select
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 dark:text-white"
                        value={item.type || 'service'}
                        onChange={(e) => onUpdate(item.id, 'type', e.target.value)}
                    >
                        <option value="service">Service</option>
                        <option value="material">Matériel</option>
                    </select>
                </div>

                <div className="col-span-2">
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Total HT</label>
                    <div className="px-2 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm font-medium text-gray-900 dark:text-white">
                        {lineTotal.toFixed(2)} €
                    </div>
                </div>
            </div>

            {/* Prix d'achat (pour calcul marge) */}
            <div className="flex items-center gap-4 pt-2 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Coût d'achat:</label>
                    <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0"
                        className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-900 dark:text-white"
                        value={item.buying_price || ''}
                        onChange={(e) => onUpdate(item.id, 'buying_price', e.target.value)}
                    />
                    <span className="text-xs text-gray-400">€/unité</span>
                </div>
                {lineCost > 0 && (
                    <div className={`text-xs px-2 py-1 rounded-full ${lineMargin >= 30 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : lineMargin >= 15 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                        Marge: {lineMargin.toFixed(0)}%
                    </div>
                )}
            </div>
        </div>
    );
});

export default QuoteItemRow;
