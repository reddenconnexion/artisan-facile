import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Link2, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { findUnlinkedPairs, linkInvoiceToQuote } from '../utils/quoteLinker';
import { useInvalidateCache } from '../hooks/useDataCache';

const CONFIDENCE_STYLES = {
    high:   { label: 'Forte',   color: 'text-green-700 bg-green-50 border-green-200 dark:text-green-300 dark:bg-green-900/30 dark:border-green-800' },
    medium: { label: 'Moyenne', color: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-900/30 dark:border-amber-800' },
    low:    { label: 'Faible',  color: 'text-orange-700 bg-orange-50 border-orange-200 dark:text-orange-300 dark:bg-orange-900/30 dark:border-orange-800' },
};

const fmt = (n) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0);

const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';

/**
 * Modal de rapprochement devis ⇄ factures non liées.
 *
 * Props:
 *   open       boolean
 *   onClose    () => void
 *   devisList  liste complète (quotes + invoices) du user
 */
const AutoLinkModal = ({ open, onClose, devisList }) => {
    const [pairs, setPairs] = useState([]);
    const [linking, setLinking] = useState(new Set());
    const [linkingAll, setLinkingAll] = useState(false);
    const { invalidateQuotes } = useInvalidateCache();

    const detected = useMemo(
        () => (open ? findUnlinkedPairs(devisList) : []),
        [open, devisList],
    );

    useEffect(() => {
        if (open) setPairs(detected);
    }, [open, detected]);

    const removePair = (quoteId) => setPairs(prev => prev.filter(p => p.quote.id !== quoteId));

    const handleLink = async (pair) => {
        const key = `${pair.quote.id}-${pair.invoice.id}`;
        setLinking(prev => new Set(prev).add(key));
        try {
            await linkInvoiceToQuote(pair.invoice.id, pair.quote.id);
            removePair(pair.quote.id);
            invalidateQuotes();
            toast.success('Devis et facture liés');
        } catch (err) {
            toast.error(err.message || 'Erreur lors de la liaison');
        } finally {
            setLinking(prev => {
                const next = new Set(prev);
                next.delete(key);
                return next;
            });
        }
    };

    const handleLinkAll = async () => {
        if (pairs.length === 0) return;
        setLinkingAll(true);
        let ok = 0;
        let failed = 0;
        for (const pair of pairs) {
            try {
                await linkInvoiceToQuote(pair.invoice.id, pair.quote.id);
                ok++;
            } catch {
                failed++;
            }
        }
        invalidateQuotes();
        if (ok > 0) toast.success(`${ok} paire(s) liée(s)`);
        if (failed > 0) toast.error(`${failed} échec(s)`);
        setPairs([]);
        setLinkingAll(false);
    };

    if (!open) return null;

    return createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4">
            <div className="bg-white dark:bg-gray-900 rounded-t-xl sm:rounded-xl shadow-xl w-full max-w-3xl flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Link2 className="w-5 h-5 text-blue-600" />
                        Lier devis et factures
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {pairs.length === 0 ? (
                        <div className="text-center py-12">
                            <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-400" />
                            <p className="text-gray-600 dark:text-gray-400">
                                Aucune paire à rattacher — vos devis et factures sont déjà liés.
                            </p>
                        </div>
                    ) : (
                        <>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                <strong>{pairs.length}</strong> paire(s) détectée(s) :
                                même client, même montant TTC (±2 %), facture postérieure au devis (≤ 180 j).
                                Vérifiez avant de lier.
                            </p>
                            <div className="space-y-3">
                                {pairs.map(pair => {
                                    const key = `${pair.quote.id}-${pair.invoice.id}`;
                                    const isLinking = linking.has(key);
                                    const style = CONFIDENCE_STYLES[pair.confidence];
                                    return (
                                        <div
                                            key={key}
                                            className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50/40 dark:bg-gray-800/40"
                                        >
                                            <div className="flex items-center justify-between mb-3">
                                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${style.color}`}>
                                                    Confiance {style.label}
                                                </span>
                                                <span className="text-xs text-gray-400">
                                                    {Math.round(pair.daysDiff)} jour(s) d'écart
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 sm:gap-3 items-center">
                                                <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-md p-2.5">
                                                    <div className="text-[10px] uppercase font-bold text-gray-400 mb-1">
                                                        Devis signé
                                                    </div>
                                                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                        {pair.quote.title || `Devis #${pair.quote.quote_number || pair.quote.id}`}
                                                    </div>
                                                    <div className="text-xs text-gray-500 truncate">
                                                        {pair.quote.client_name || '—'} · {formatDate(pair.quote.date)}
                                                    </div>
                                                    <div className="text-sm font-bold text-gray-800 dark:text-gray-100 mt-1">
                                                        {fmt(pair.quote.total_ttc)}
                                                    </div>
                                                </div>

                                                <ArrowRight className="hidden sm:block w-4 h-4 text-gray-400 mx-auto" />

                                                <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-md p-2.5">
                                                    <div className="text-[10px] uppercase font-bold text-gray-400 mb-1">
                                                        Facture
                                                    </div>
                                                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                        {pair.invoice.title || `Facture #${pair.invoice.quote_number || pair.invoice.id}`}
                                                    </div>
                                                    <div className="text-xs text-gray-500 truncate">
                                                        {pair.invoice.client_name || '—'} · {formatDate(pair.invoice.date)}
                                                    </div>
                                                    <div className="text-sm font-bold text-gray-800 dark:text-gray-100 mt-1">
                                                        {fmt(pair.invoice.total_ttc)}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex gap-2 mt-3">
                                                <button
                                                    onClick={() => removePair(pair.quote.id)}
                                                    disabled={isLinking}
                                                    className="flex-1 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                                                >
                                                    Ignorer
                                                </button>
                                                <button
                                                    onClick={() => handleLink(pair)}
                                                    disabled={isLinking || linkingAll}
                                                    className="flex-1 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50 flex items-center justify-center gap-1"
                                                >
                                                    {isLinking
                                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                                        : <Link2 className="w-3 h-3" />}
                                                    Lier
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>

                <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 flex-shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                    >
                        Fermer
                    </button>
                    {pairs.length > 1 && (
                        <button
                            onClick={handleLinkAll}
                            disabled={linkingAll}
                            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {linkingAll && <Loader2 className="w-4 h-4 animate-spin" />}
                            Tout lier ({pairs.length})
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default AutoLinkModal;
