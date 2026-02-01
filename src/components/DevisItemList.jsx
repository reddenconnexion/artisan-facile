import React, { useState, memo } from 'react';
import { Trash2, ArrowUp, ArrowDown, Calculator, Plus, Sparkles, Mic } from 'lucide-react';

/**
 * Composant pour la liste des items d'un devis
 * Extrait de DevisForm.jsx pour réduire sa taille
 */
const DevisItemList = memo(function DevisItemList({
    items,
    tradeConfig,
    priceLibrary,
    userProfile,
    onUpdateItem,
    onRemoveItem,
    onMoveItem,
    onAddItem,
    onOpenCalculator,
    onOpenVoice,
    onOpenAI,
    onFullScreenEdit,
    focusedInput,
    setFocusedInput
}) {
    return (
        <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Détails : {tradeConfig?.terms?.task || 'Prestation'}s ({tradeConfig?.terms?.materials || 'Fournitures'})
            </h3>

            <div className="space-y-4">
                {items.map((item, index) => (
                    <DevisItemRow
                        key={item.id}
                        item={item}
                        index={index}
                        isFirst={index === 0}
                        isLast={index === items.length - 1}
                        priceLibrary={priceLibrary}
                        userProfile={userProfile}
                        onUpdate={onUpdateItem}
                        onRemove={onRemoveItem}
                        onMove={onMoveItem}
                        onOpenCalculator={onOpenCalculator}
                        onFullScreenEdit={onFullScreenEdit}
                        focusedInput={focusedInput}
                        setFocusedInput={setFocusedInput}
                    />
                ))}
            </div>

            {/* Boutons d'ajout */}
            <div className="mt-4 flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={onAddItem}
                    className="flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                >
                    <Plus className="w-5 h-5 mr-1" />
                    Ajouter une ligne
                </button>

                {onOpenVoice && (
                    <button
                        type="button"
                        onClick={onOpenVoice}
                        className="flex items-center text-sm font-medium text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300"
                    >
                        <Mic className="w-5 h-5 mr-1" />
                        Dictée vocale
                    </button>
                )}

                {onOpenAI && (
                    <button
                        type="button"
                        onClick={onOpenAI}
                        className="flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                        <Sparkles className="w-5 h-5 mr-1" />
                        Générer avec l'IA
                    </button>
                )}
            </div>
        </div>
    );
});

/**
 * Composant pour une ligne d'item
 */
const DevisItemRow = memo(function DevisItemRow({
    item,
    index,
    isFirst,
    isLast,
    priceLibrary,
    userProfile,
    onUpdate,
    onRemove,
    onMove,
    onOpenCalculator,
    onFullScreenEdit,
    focusedInput,
    setFocusedInput
}) {
    const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0);

    // Suggestions de la bibliothèque de prix
    const showSuggestions = focusedInput === `item-${item.id}` &&
        item.description &&
        item.description.length > 1 &&
        !priceLibrary.some(p => p.description === item.description);

    const suggestions = showSuggestions
        ? priceLibrary.filter(lib =>
            lib.description.toLowerCase().includes(item.description.toLowerCase())
        ).slice(0, 5)
        : [];

    const handleDescriptionChange = (e) => {
        const val = e.target.value;
        onUpdate(item.id, 'description', val);

        // Auto-détection du type
        if (val.toLowerCase().match(/fourniture|matériel|materiel|pièce|consommable/)) {
            if ((item.type || 'service') === 'service') {
                onUpdate(item.id, 'type', 'material');
            }
        }

        // Auto-prix depuis la bibliothèque
        const libraryItem = priceLibrary.find(lib => lib.description === val);
        if (libraryItem) {
            onUpdate(item.id, 'price', libraryItem.price);
            if (libraryItem.type) {
                onUpdate(item.id, 'type', libraryItem.type);
            }
        }
    };

    const handleFocus = (e) => {
        if (window.innerWidth < 1024) {
            e.target.blur();
            onFullScreenEdit?.(item.id);
        } else {
            setFocusedInput(`item-${item.id}`);
        }
    };

    const handleSuggestionClick = (lib) => {
        onUpdate(item.id, 'description', lib.description);
        onUpdate(item.id, 'price', lib.price);
        setFocusedInput(null);
    };

    return (
        <div className="flex flex-col sm:flex-row gap-4 items-start border-b border-gray-100 dark:border-gray-800 pb-4 last:border-0">
            <div className="flex-1 w-full space-y-2">
                <div className="flex flex-col sm:flex-row gap-2">
                    {/* Type */}
                    <select
                        className="w-full sm:w-32 px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-gray-50 dark:bg-gray-800 dark:text-white"
                        value={item.type || 'service'}
                        onChange={(e) => onUpdate(item.id, 'type', e.target.value)}
                    >
                        <option value="service">Main d'oeuvre</option>
                        <option value="material">Matériel</option>
                    </select>

                    {/* Description */}
                    <div className="flex-1 relative">
                        <textarea
                            placeholder="Description"
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg pr-8 resize-y text-sm dark:bg-gray-900 dark:text-white"
                            value={item.description}
                            onChange={handleDescriptionChange}
                            onFocus={handleFocus}
                            onBlur={() => setTimeout(() => setFocusedInput(null), 200)}
                            required
                        />

                        {/* Suggestions */}
                        {suggestions.length > 0 && (
                            <div className="absolute z-20 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg rounded-b-lg mt-1 overflow-hidden">
                                {suggestions.map(lib => (
                                    <button
                                        key={lib.id}
                                        type="button"
                                        className="block w-full text-left px-4 py-2 hover:bg-blue-50 dark:hover:bg-gray-700 text-sm border-b border-gray-50 dark:border-gray-700 last:border-0"
                                        onClick={() => handleSuggestionClick(lib)}
                                    >
                                        <span className="font-medium text-gray-900 dark:text-white">{lib.description}</span>
                                        <span className="text-gray-500 dark:text-gray-400 ml-2 text-xs">{lib.price} €</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Prix d'achat */}
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>Coût unitaire (interne) :</span>
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-24 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-right dark:bg-gray-900 dark:text-white"
                        placeholder="0.00"
                        value={item.buying_price || ''}
                        onChange={(e) => onUpdate(item.id, 'buying_price', e.target.value)}
                    />
                    <span>€</span>
                </div>
            </div>

            {/* Quantité, Prix, Total */}
            <div className="flex gap-2 w-full sm:w-auto">
                <div className="w-20 relative">
                    <input
                        type="number"
                        placeholder="Qté"
                        min="0"
                        step="0.01"
                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-right pr-2 dark:bg-gray-900 dark:text-white"
                        value={item.quantity}
                        onChange={(e) => onUpdate(item.id, 'quantity', e.target.value)}
                    />
                    {userProfile?.enable_calculator !== false && onOpenCalculator && (
                        <button
                            type="button"
                            onClick={() => onOpenCalculator(item.id)}
                            className="absolute -top-3 -right-2 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 rounded-full p-1 shadow-sm hover:bg-blue-200 dark:hover:bg-blue-800"
                            title="Calculatrice Matériaux"
                        >
                            <Calculator className="w-3 h-3" />
                        </button>
                    )}
                </div>

                <div className="w-28">
                    <input
                        type="number"
                        placeholder="Prix U."
                        min="0"
                        step="0.01"
                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-right dark:bg-gray-900 dark:text-white"
                        value={item.price}
                        onChange={(e) => onUpdate(item.id, 'price', e.target.value)}
                    />
                </div>

                <div className="w-28 py-2 text-right font-medium text-gray-900 dark:text-white">
                    {lineTotal.toFixed(2)} €
                </div>

                {/* Boutons monter/descendre */}
                <div className="flex flex-col gap-1">
                    <button
                        type="button"
                        onClick={() => onMove(index, 'up')}
                        disabled={isFirst}
                        className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:opacity-30 disabled:hover:bg-transparent"
                        title="Monter"
                    >
                        <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={() => onMove(index, 'down')}
                        disabled={isLast}
                        className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:opacity-30 disabled:hover:bg-transparent"
                        title="Descendre"
                    >
                        <ArrowDown className="w-4 h-4" />
                    </button>
                </div>

                {/* Bouton supprimer */}
                <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30"
                >
                    <Trash2 className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
});

export default DevisItemList;
