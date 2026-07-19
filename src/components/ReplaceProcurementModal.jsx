import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Repeat, Loader2, Package, ArrowRight } from 'lucide-react';

const CATEGORIES = [
    { id: 'materiel', label: 'Matériel' },
    { id: 'outillage', label: 'Outillage' },
    { id: 'consommable', label: 'Consommable' },
];

const formatPrice = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
};

const lineSale = (item) => {
    const sp = parseFloat(item?.sale_price);
    const q = parseFloat(item?.quantity) || 1;
    return Number.isFinite(sp) ? sp * q : 0;
};

/**
 * « Remplacer par un article » depuis la liste de matériel à commander.
 *
 * Cas d'usage type : le devis détaille tous les modules d'un tableau électrique,
 * mais l'artisan commande finalement un coffret précâblé. Il sélectionne les
 * lignes détaillées et les remplace par une seule ligne « Coffret précâblé ».
 *
 * La valeur vendue cumulée des lignes remplacées est reportée sur le nouvel
 * article (prix de vente) : l'indicateur de marge matériel du devis reste juste,
 * il suffira de saisir le prix d'achat réel du coffret. Le devis n'est pas modifié.
 */
const ReplaceProcurementModal = ({ open, onClose, onConfirm, selectedItems }) => {
    const [description, setDescription] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [category, setCategory] = useState('materiel');
    const [saving, setSaving] = useState(false);

    const totalSale = useMemo(
        () => (selectedItems || []).reduce((sum, i) => sum + lineSale(i), 0),
        [selectedItems]
    );

    useEffect(() => {
        if (open) {
            setDescription('');
            setQuantity(1);
            setCategory('materiel');
            setSaving(false);
        }
    }, [open]);

    if (!open) return null;

    const count = selectedItems?.length || 0;
    const canConfirm = description.trim().length > 0 && count > 0 && !saving;

    const handleConfirm = async () => {
        if (!canConfirm) return;
        setSaving(true);
        try {
            await onConfirm({
                description: description.trim(),
                quantity: Number(quantity) || 1,
                category,
            });
        } finally {
            setSaving(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60] sm:p-4" onClick={onClose}>
            <div
                className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* En-tête */}
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <Repeat className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                            Remplacer par un article
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                            {count} article{count > 1 ? 's' : ''} détaillé{count > 1 ? 's' : ''} → un seul article
                            (ex. modules d'un tableau → coffret précâblé).
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg shrink-0">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Corps */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {/* Articles remplacés */}
                    <div>
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                            Articles remplacés
                        </p>
                        <ul className="space-y-1 max-h-40 overflow-y-auto pr-1">
                            {(selectedItems || []).map((i) => (
                                <li key={i.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                    <Package className="w-3.5 h-3.5 shrink-0 text-gray-300 dark:text-gray-600" />
                                    <span className="flex-1 min-w-0 truncate">{i.description}</span>
                                    <span className="shrink-0 text-xs text-gray-400">{i.quantity} {i.unit || 'u'}</span>
                                </li>
                            ))}
                        </ul>
                        {totalSale > 0 && (
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                Valeur vendue cumulée : <span className="font-semibold text-gray-700 dark:text-gray-200">{formatPrice(totalSale)}</span>
                                {' '}— reportée sur le nouvel article pour préserver le calcul de marge.
                            </p>
                        )}
                    </div>

                    <div className="flex items-center gap-2 text-gray-300 dark:text-gray-600">
                        <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
                        <ArrowRight className="w-4 h-4" />
                        <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
                    </div>

                    {/* Nouvel article */}
                    <div className="space-y-3">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                            Nouvel article
                        </p>
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
                            autoFocus
                            placeholder="Ex. Coffret précâblé 3 rangées 13 modules"
                            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                            <label className="text-xs text-gray-500 dark:text-gray-400">Quantité</label>
                            <input
                                type="number"
                                min="1"
                                step="0.01"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                className="w-24 px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                            >
                                {CATEGORIES.map((c) => (
                                    <option key={c.id} value={c.id}>{c.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Pied */}
                <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                    >
                        Annuler
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!canConfirm}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Repeat className="w-4 h-4" />}
                        Remplacer
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ReplaceProcurementModal;
