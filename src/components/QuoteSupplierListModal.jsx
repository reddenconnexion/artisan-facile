import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Truck, Copy, Download, Check, Package } from 'lucide-react';
import { toast } from 'sonner';
import { supplierList, buildSupplierListText, formatQuantity } from '../utils/quoteInternalDetail';
import { exportToCSV } from '../utils/csvExport';

/**
 * « Liste fournisseur » d'un devis validé.
 *
 * Rassemble le matériel du devis (lignes « Matériel » + fournitures du chiffrage
 * interne) SANS AUCUN PRIX facturé, pour le transmettre tel quel au fournisseur.
 * L'artisan peut afficher la liste, la copier (e-mail / SMS / WhatsApp) ou la
 * télécharger en CSV.
 */
const QuoteSupplierListModal = ({ open, onClose, quoteLabel, items }) => {
    const [copied, setCopied] = useState(false);

    const entries = useMemo(() => supplierList(items), [items]);
    const title = (quoteLabel || '').trim();

    if (!open) return null;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(buildSupplierListText(entries, { title }));
            setCopied(true);
            toast.success('Liste copiée !');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Copie impossible sur cet appareil.');
        }
    };

    const handleDownload = () => {
        exportToCSV(
            entries,
            [
                { key: 'description', label: 'Désignation' },
                { key: (r) => formatQuantity(r.quantity), label: 'Quantité' },
                { key: 'unit', label: 'Unité' },
            ],
            title ? `liste-fournisseur_${title.replace(/[^\w-]+/g, '-').slice(0, 40)}` : 'liste-fournisseur'
        );
        toast.success('Liste téléchargée (CSV)');
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
                            <Truck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                            Liste fournisseur
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                            Le matériel du devis, sans les prix facturés, à transmettre à votre fournisseur.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg shrink-0">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Corps */}
                <div className="flex-1 overflow-y-auto px-5 py-4">
                    {entries.length === 0 ? (
                        <div className="text-center py-10">
                            <Package className="w-10 h-10 mx-auto mb-3 text-gray-200 dark:text-gray-700" />
                            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Aucun matériel détecté sur ce devis</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                Ajoutez des lignes « Matériel » ou détaillez vos lignes groupées via le chiffrage interne (🔒).
                            </p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                            {entries.map((e, i) => (
                                <li key={`${e.description}-${e.unit}-${i}`} className="flex items-baseline justify-between gap-3 py-2">
                                    <span className="text-sm text-gray-900 dark:text-gray-100 min-w-0">
                                        {e.description}
                                    </span>
                                    <span className="shrink-0 text-sm font-medium text-gray-600 dark:text-gray-300 tabular-nums">
                                        {formatQuantity(e.quantity)} {e.unit}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Pied */}
                {entries.length > 0 && (
                    <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex gap-2">
                        <button
                            onClick={handleCopy}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            {copied ? 'Copié' : 'Copier'}
                        </button>
                        <button
                            onClick={handleDownload}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-sm font-semibold rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        >
                            <Download className="w-4 h-4" />
                            Télécharger
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};

export default QuoteSupplierListModal;
