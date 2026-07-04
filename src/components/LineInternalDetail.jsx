import React from 'react';
import { Plus, Trash2, Lock } from 'lucide-react';
import { componentsCost } from '../utils/quoteInternalDetail';

/**
 * Panneau « Chiffrage interne » d'une ligne de devis.
 *
 * Permet de détailler, pour soi uniquement, ce que recouvre une ligne groupée
 * (forfait) : la liste des fournitures à commander et une note libre. Rien de
 * tout cela n'apparaît sur le PDF ni sur le lien public / portail client.
 *
 * @param {object}   item     La ligne du devis (item.components, item.internal_note)
 * @param {function} onChange (field, value) => void — délègue à updateItem du formulaire
 * @param {boolean}  disabled Devis verrouillé : lecture seule (utile en revue client)
 */
const LineInternalDetail = ({ item, onChange, disabled }) => {
    const components = Array.isArray(item.components) ? item.components : [];
    const total = componentsCost(item);

    const updateComponent = (compId, field, value) => {
        onChange('components', components.map((c) => (c.id === compId ? { ...c, [field]: value } : c)));
    };
    const addComponent = () => {
        onChange('components', [
            ...components,
            { id: Date.now(), description: '', quantity: 1, unit: 'u', buying_price: 0 },
        ]);
    };
    const removeComponent = (compId) => {
        onChange('components', components.filter((c) => c.id !== compId));
    };

    return (
        <div className="mt-1 mb-3 p-3 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-900/10">
            <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                Chiffrage interne — jamais visible par le client (ni PDF, ni lien public)
            </div>

            {/* Fournitures composant la ligne */}
            {components.length > 0 && (
                <div className="space-y-1.5 mb-2">
                    <div className="hidden sm:flex gap-2 text-[10px] font-semibold text-amber-600/70 dark:text-amber-400/70 uppercase tracking-wider select-none">
                        <div className="flex-1">Fourniture</div>
                        <div className="w-16 text-right">Qté</div>
                        <div className="w-14">Unité</div>
                        <div className="w-24 text-right">Achat U. €</div>
                        <div className="w-20 text-right">Total</div>
                        <div className="w-7"></div>
                    </div>
                    {components.map((c) => (
                        <div key={c.id} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                            <input
                                type="text"
                                placeholder="Ex : Câble 3G2.5, disjoncteur 16A…"
                                className="flex-1 min-w-[10rem] px-2 py-1.5 text-sm border border-amber-200 dark:border-amber-800/60 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 disabled:bg-gray-100 disabled:text-gray-500"
                                value={c.description}
                                onChange={(e) => updateComponent(c.id, 'description', e.target.value)}
                                disabled={disabled}
                            />
                            <input
                                type="number"
                                step="0.01"
                                placeholder="Qté"
                                className="w-16 px-2 py-1.5 text-sm text-right border border-amber-200 dark:border-amber-800/60 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:bg-gray-100 disabled:text-gray-500"
                                value={c.quantity}
                                onChange={(e) => updateComponent(c.id, 'quantity', e.target.value)}
                                disabled={disabled}
                            />
                            <input
                                type="text"
                                placeholder="u"
                                className="w-14 px-2 py-1.5 text-sm border border-amber-200 dark:border-amber-800/60 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:bg-gray-100 disabled:text-gray-500"
                                value={c.unit || ''}
                                onChange={(e) => updateComponent(c.id, 'unit', e.target.value)}
                                disabled={disabled}
                            />
                            <input
                                type="number"
                                step="0.01"
                                placeholder="Achat U."
                                className="w-24 px-2 py-1.5 text-sm text-right border border-amber-200 dark:border-amber-800/60 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:bg-gray-100 disabled:text-gray-500"
                                value={c.buying_price}
                                onChange={(e) => updateComponent(c.id, 'buying_price', e.target.value)}
                                disabled={disabled}
                            />
                            <div className="w-20 text-right text-sm text-gray-700 dark:text-gray-300 tabular-nums">
                                {((parseFloat(c.quantity) || 0) * (parseFloat(c.buying_price) || 0)).toFixed(2)} €
                            </div>
                            <button
                                type="button"
                                onClick={() => removeComponent(c.id)}
                                className="p-1 text-gray-400 hover:text-red-600 rounded disabled:opacity-30"
                                disabled={disabled}
                                title="Retirer cette fourniture"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={addComponent}
                    className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-200 border border-amber-300 dark:border-amber-700 rounded px-2 py-1 hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-50"
                    disabled={disabled}
                >
                    <Plus className="w-3.5 h-3.5" /> Fourniture
                </button>
                {total > 0 && (
                    <span
                        className="text-xs text-amber-700 dark:text-amber-300"
                        title="Pris en compte dans votre marge si le prix d'achat de la ligne n'est pas renseigné"
                    >
                        Coût fournitures : <strong className="tabular-nums">{total.toFixed(2)} €</strong>
                    </span>
                )}
            </div>

            <textarea
                rows={2}
                placeholder="Note interne : repères chantier, référence fournisseur, ce qui a été convenu avec le client…"
                className="mt-2 w-full px-2 py-1.5 text-sm border border-amber-200 dark:border-amber-800/60 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-y disabled:bg-gray-100 disabled:text-gray-500"
                value={item.internal_note || ''}
                onChange={(e) => onChange('internal_note', e.target.value)}
                disabled={disabled}
            />
        </div>
    );
};

export default LineInternalDetail;
