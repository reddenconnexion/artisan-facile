import React from 'react';
import { Plus, Trash2, Calculator, Layers, Eye, Star, ArrowUp, ArrowDown, MoreHorizontal, Lock } from 'lucide-react';
import { isPerUnit } from '../../utils/clientView';
import LineInternalDetail from '../../components/LineInternalDetail';
import { lineComponents } from '../../utils/quoteInternalDetail';
import LineMenuItem from './LineMenuItem';
import { autoGrow } from './quoteHelpers';

/**
 * Une ligne du devis (section ou prestation), son chiffrage interne
 * éventuel et la zone d'insertion qui la suit.
 */
const QuoteItemRow = ({
    applyLibraryItem,
    focusedInput,
    formData,
    index,
    insertItemAfter,
    internalDetailItemId,
    isLocked,
    item,
    lineMenuId,
    moveItem,
    priceLibrary,
    removeItem,
    sectionTitleByIndex,
    setActiveCalculatorItem,
    setFocusedInput,
    setFullScreenEditItem,
    setInternalDetailItemId,
    setLineMenuId,
    setOptionGroupRequired,
    setShowCalculator,
    updateItem,
    userProfile,
}) => {
    return (
        <React.Fragment key={item.id}>
        {item.type === 'section' ? (
            <div key={item.id} className="flex items-center gap-2 pt-2 pb-1 border-b-2 border-blue-200">
                <Layers className="w-4 h-4 text-blue-500 shrink-0" />
                <input
                    type="text"
                    placeholder="Titre de la section (ex: Création prise de terre)"
                    className="flex-1 px-3 py-1.5 text-sm font-semibold border-0 border-b border-blue-300 focus:outline-none focus:border-ios bg-transparent text-blue-700 dark:text-blue-300 placeholder-blue-300"
                    value={item.description}
                    onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                    disabled={isLocked}
                />
                <div className="flex gap-1">
                    <button
                        type="button"
                        onClick={() => moveItem(index, 'up')}
                        disabled={index === 0 || isLocked}
                        className="p-1 text-gray-400 hover:text-blue-600 rounded disabled:opacity-30"
                        title="Monter"
                    >
                        <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={() => moveItem(index, 'down')}
                        disabled={index === formData.items.length - 1 || isLocked}
                        className="p-1 text-gray-400 hover:text-blue-600 rounded disabled:opacity-30"
                        title="Descendre"
                    >
                        <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="ml-3 p-1 text-gray-400 hover:text-red-600 rounded disabled:opacity-30"
                        disabled={isLocked}
                        title="Supprimer la section"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
        ) : (
        <div key={item.id} className={`flex flex-col lg:flex-row gap-4 items-start border-b pb-4 last:border-0 ${item.is_optional ? 'border-purple-100 border-l-2 border-l-purple-300 pl-2 -ml-2' : 'border-gray-100 dark:border-gray-800'}`}>
            <div className="flex-1 w-full space-y-2">
                <div className="flex flex-col sm:flex-row gap-2">
                    <select
                        className="w-full sm:w-32 px-2 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 dark:bg-gray-800 disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 placeholder-gray-400 dark:placeholder-gray-500 text-gray-900 dark:text-gray-100"
                        value={item.type || 'service'}
                        onChange={(e) => updateItem(item.id, 'type', e.target.value)}
                        disabled={isLocked}
                    >
                        <option value="service">Main d'oeuvre</option>
                        <option value="material">Matériel</option>
                    </select>
                    <div className="flex-1 relative">
                        <textarea
                            placeholder="Description"
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg pr-8 resize-y text-sm dark:border-gray-700 bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 text-gray-900 dark:text-gray-100"
                            value={item.description}
                            onChange={(e) => {
                                const val = e.target.value;
                                // Auto-agrandit le champ pour afficher toute la
                                // description sans scroll interne pendant la saisie.
                                autoGrow(e.target);
                                updateItem(item.id, 'description', val);

                                // Auto-detect type
                                if (val.toLowerCase().match(/fourniture|matériel|materiel|pièce|consommable/)) {
                                    const currentType = item.type || 'service';
                                    if (currentType === 'service') {
                                        updateItem(item.id, 'type', 'material');
                                    }
                                }

                                // Auto-price logic (Exact Match)
                                const libraryItem = priceLibrary.find(lib => lib.description === val);
                                if (libraryItem) {
                                    applyLibraryItem(item.id, libraryItem);
                                }
                            }}
                            onFocus={(e) => {
                                if (window.innerWidth < 1024) {
                                    e.target.blur();
                                    setFullScreenEditItem(item.id);
                                } else {
                                    // Au clic, déplie le champ pour montrer toute la
                                    // ligne d'un coup (plus de scroll interne).
                                    autoGrow(e.target);
                                    setFocusedInput(`item-${item.id}`);
                                }
                            }}
                            onBlur={(e) => {
                                // Revient à la hauteur compacte (2 lignes) une fois
                                // la ligne désélectionnée pour garder la liste lisible.
                                e.target.style.height = '';
                                setTimeout(() => setFocusedInput(null), 200);
                            }}
                            required
                            disabled={isLocked}
                        />

                        {/* Custom Suggestions (Price Library) */}
                        {focusedInput === `item-${item.id}` && item.description && item.description.length > 1 && !priceLibrary.some(p => p.description === item.description) && (
                            (() => {
                                const matches = priceLibrary.filter(lib =>
                                    lib.description.toLowerCase().includes(item.description.toLowerCase())
                                ).slice(0, 5);

                                if (matches.length === 0) return null;

                                return (
                                    <div className="absolute z-20 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-lg rounded-b-lg mt-1 overflow-hidden">
                                        {matches.map(lib => (
                                            <button
                                                key={lib.id}
                                                type="button"
                                                className="block w-full text-left px-4 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-sm border-b border-gray-50 last:border-0"
                                                onClick={() => applyLibraryItem(item.id, lib, { withDescription: true })}
                                            >
                                                <span className="font-medium text-gray-900 dark:text-white">{lib.description}</span>
                                                <span className="text-gray-500 dark:text-gray-400 ml-2 text-xs">{lib.price} €</span>
                                            </button>
                                        ))}
                                    </div>
                                );
                            })()
                        )}

                        <button
                            type="button"
                            onClick={() => {
                                // For inline editing of existing item, we might need a different context 
                                // or just use generic "update item" logic? 
                                // For now, let's keep it simple: Add New Item via Voice is better supported.
                                // If user wants to replace description, they can type.
                                // Or we can open modal to "Replace Description"?
                                // Let's remove the inline mic for now as per request "replace mic button" 
                                // and rely on the big "Add Item via Voice" button we will add.
                                // OR: Use modal to set description only.
                                // Let's try to map it to "note" context but applied to this item?
                                // Complex. Let's just remove the inline mic to declutter, 
                                // or replace with a small "Sparkles" that opens modal for this specific item?
                                // User said "replace mic button".
                                // Let's replace with a small button that says "IA" or Sparkles icon
                                // and opens modal with context 'item_description_update' -> updateItem?
                                // For MVP "Free AI", adding new lines is the main feature.
                                // I will remove this inline mic to simplify UI as requested.
                            }}
                            className="hidden" // Hiding inline mic
                            title="Dicter"
                        >
                            {/* <Mic className="w-4 h-4" /> */}
                        </button>
                    </div>
                </div>
                {item.is_optional && (
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                        <input
                            type="text"
                            placeholder="Groupe d'exclusivité (ex: Revêtement)"
                            className="px-2 py-1 border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/20 rounded text-xs w-56 text-gray-900 dark:text-purple-100 placeholder-purple-400 dark:placeholder-purple-500 focus:ring-purple-400 focus:border-purple-400"
                            value={item.option_group || ''}
                            onChange={(e) => updateItem(item.id, 'option_group', e.target.value)}
                            disabled={isLocked}
                            title="Les options partageant le même nom de groupe deviennent mutuellement exclusives côté client (un seul choix possible)."
                        />
                        {item.option_group && (
                            <label className="flex items-center gap-1.5 text-xs text-purple-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={!!item.option_group_required}
                                    onChange={(e) => setOptionGroupRequired(item.option_group, e.target.checked)}
                                    disabled={isLocked}
                                    className="w-3.5 h-3.5 accent-purple-600"
                                />
                                Choix nécessaire
                            </label>
                        )}
                    </div>
                )}
            </div>
            <div className="flex gap-2 w-full lg:w-auto">
                <div className="w-20 relative">
                    <input
                        type="number"
                        placeholder="Qté"
                        step="0.01"
                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-ios focus:border-ios text-right pr-2 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                        disabled={isLocked}
                    />
                </div>
                <div className="w-28">
                    <input
                        type="number"
                        placeholder="Prix U."
                        step="0.01"
                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-ios focus:border-ios text-right dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                        value={item.price}
                        onChange={(e) => updateItem(item.id, 'price', e.target.value)}
                        disabled={isLocked}
                    />
                </div>
                <div className="w-28 py-2 text-right font-medium text-gray-900 dark:text-white">
                    {((parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0)).toFixed(2)} €
                </div>
                {/* Indicateurs discrets : option, chiffrage interne renseigné */}
                {item.is_optional && (
                    <span className="self-center text-[10px] px-1.5 py-0.5 rounded border font-semibold bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800" title="Ligne optionnelle (le client choisit)">
                        OPT
                    </span>
                )}
                {(lineComponents(item).length > 0 || (item.internal_note || '').trim()) && (
                    <button
                        type="button"
                        onClick={() => setInternalDetailItemId(prev => prev === item.id ? null : item.id)}
                        className={`relative self-center flex items-center justify-center px-1.5 py-1 rounded border transition-colors ${
                            internalDetailItemId === item.id
                                ? 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700'
                                : 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800'
                        }`}
                        title="Chiffrage interne : fournitures et note privées de cette ligne (jamais visibles par le client)"
                    >
                        <Lock className="w-3.5 h-3.5" />
                        {lineComponents(item).length > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 min-w-[1rem] h-4 px-0.5 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
                                {lineComponents(item).length}
                            </span>
                        )}
                    </button>
                )}
                {/* Menu « ⋯ » : tout ce qui n'est pas quotidien (déplacer,
                    option, affichage, calculatrice, chiffrage interne). */}
                <div className="relative self-center">
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setLineMenuId(prev => prev === item.id ? null : item.id); }}
                        className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                        title="Plus d'options pour cette ligne"
                        aria-haspopup="menu"
                        aria-expanded={lineMenuId === item.id}
                    >
                        <MoreHorizontal className="w-5 h-5" />
                    </button>
                    {lineMenuId === item.id && (
                        <div
                            className="absolute right-0 top-full mt-1 z-30 w-64 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1"
                            role="menu"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <LineMenuItem icon={ArrowUp} label="Monter" disabled={index === 0 || isLocked}
                                onClick={() => { moveItem(index, 'up'); setLineMenuId(null); }} />
                            <LineMenuItem icon={ArrowDown} label="Descendre" disabled={index === formData.items.length - 1 || isLocked}
                                onClick={() => { moveItem(index, 'down'); setLineMenuId(null); }} />
                            <LineMenuItem icon={Star} label="Ligne optionnelle (au choix du client)" disabled={isLocked} active={!!item.is_optional}
                                onClick={() => { updateItem(item.id, 'is_optional', !item.is_optional); setLineMenuId(null); }} />
                            {formData.client_display_mode === 'poste_global' && item.type === 'material' && (
                                <LineMenuItem icon={Eye} label="Afficher à l'unité (quantité visible)" disabled={isLocked}
                                    active={isPerUnit(item, sectionTitleByIndex[index])}
                                    onClick={() => { updateItem(item.id, 'display_per_unit', !isPerUnit(item, sectionTitleByIndex[index])); setLineMenuId(null); }} />
                            )}
                            {userProfile?.enable_calculator !== false && (
                                <LineMenuItem icon={Calculator} label="Calculatrice matériaux" disabled={isLocked}
                                    onClick={() => { setActiveCalculatorItem(item.id); setShowCalculator(true); setLineMenuId(null); }} />
                            )}
                            <LineMenuItem icon={Lock} label="Chiffrage interne (privé)" active={internalDetailItemId === item.id}
                                onClick={() => { setInternalDetailItemId(prev => prev === item.id ? null : item.id); setLineMenuId(null); }} />
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="self-center p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30"
                    disabled={isLocked}
                    title="Supprimer la ligne"
                >
                    <Trash2 className="w-5 h-5" />
                </button>
            </div>
        </div>
        )}
        {item.type !== 'section' && internalDetailItemId === item.id && (
            <LineInternalDetail
                item={item}
                onChange={(field, value) => updateItem(item.id, field, value)}
                disabled={isLocked}
            />
        )}
        {/* Zone d'insertion entre lignes */}
        {!isLocked && index < formData.items.length - 1 && (
            <div className="group relative flex items-center my-1 -mx-1">
                <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800 group-hover:bg-blue-200 transition-colors" />
                <button
                    type="button"
                    onClick={() => insertItemAfter(index)}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity mx-2 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 bg-white dark:bg-gray-900 border border-blue-200 hover:border-blue-400 rounded px-2 py-0.5 shadow-sm"
                    title="Insérer une ligne ici"
                >
                    <Plus className="w-3 h-3" /> Insérer ici
                </button>
                <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800 group-hover:bg-blue-200 transition-colors" />
            </div>
        )}
        </React.Fragment>
    );
};

export default QuoteItemRow;
