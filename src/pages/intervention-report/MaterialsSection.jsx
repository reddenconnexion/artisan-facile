import React from 'react';
import { Plus, Trash2, Package } from 'lucide-react';

export const MaterialsSection = ({
    formData, isSiteVisit, materialsTotal,
    addMaterial, updateMaterial, removeMaterial,
}) => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-500" />
                {isSiteVisit ? 'Prestations estimées' : 'Matériaux utilisés'}
            </h2>
            <button
                onClick={addMaterial}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
            >
                <Plus className="w-4 h-4" />
                Ajouter
            </button>
        </div>

        {formData.materials_used.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic">Aucun matériau renseigné</p>
        ) : (
            <div className="space-y-2">
                {/* Header row - desktop only */}
                <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 px-2">
                    <span className="col-span-5">Désignation</span>
                    <span className="col-span-2">Qté</span>
                    <span className="col-span-2">Unité</span>
                    <span className="col-span-2">P.U. (€)</span>
                    <span className="col-span-1"></span>
                </div>
                {formData.materials_used.map(material => (
                    <div key={material.id} className="grid grid-cols-12 gap-2 items-center">
                        <input
                            type="text"
                            value={material.description}
                            onChange={e => updateMaterial(material.id, 'description', e.target.value)}
                            placeholder="Désignation du matériau"
                            className="col-span-12 md:col-span-5 px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-ios focus:border-transparent"
                        />
                        <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={material.quantity}
                            onChange={e => updateMaterial(material.id, 'quantity', e.target.value)}
                            className="col-span-4 md:col-span-2 px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-ios"
                        />
                        <input
                            type="text"
                            value={material.unit}
                            onChange={e => updateMaterial(material.id, 'unit', e.target.value)}
                            placeholder="unité"
                            className="col-span-4 md:col-span-2 px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-ios focus:border-transparent"
                        />
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={material.price}
                            onChange={e => updateMaterial(material.id, 'price', e.target.value)}
                            placeholder="0.00"
                            className="col-span-3 md:col-span-2 px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-ios"
                        />
                        <button
                            onClick={() => removeMaterial(material.id)}
                            className="col-span-1 flex items-center justify-center min-h-[44px] text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            title="Supprimer cette ligne"
                            aria-label="Supprimer cette ligne de matériel"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    </div>
                ))}
                {materialsTotal > 0 && (
                    <div className="flex justify-end pt-2 border-t border-gray-100 dark:border-gray-700">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                            Total matériaux : {materialsTotal.toFixed(2)} €
                        </span>
                    </div>
                )}
            </div>
        )}
    </div>
);
