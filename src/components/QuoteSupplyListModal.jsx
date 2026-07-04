import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, ShoppingCart, CheckSquare, Square, Loader2, Package } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { supplyEntries } from '../utils/quoteInternalDetail';

// Mémorise, par devis, les fournitures déjà envoyées vers la liste d'achats
// pour éviter les doublons quand on rouvre la modale plus tard.
const storageKey = (quoteId) => `devis-supply-sent:${quoteId || 'nouveau'}`;

/**
 * « Commander le matériel » depuis un devis.
 *
 * Rassemble en une liste toutes les fournitures du devis — les lignes de type
 * « Matériel » et les fournitures du chiffrage interne des lignes groupées —
 * et les envoie en un clic vers la liste d'achats (page Approvisionnement).
 * Fini la chasse aux notes au moment de passer commande.
 */
const QuoteSupplyListModal = ({ open, onClose, quoteId, quoteLabel, clientId, items }) => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [checked, setChecked] = useState({});
    const [alreadySent, setAlreadySent] = useState({});
    const [sending, setSending] = useState(false);

    const entries = useMemo(() => supplyEntries(items), [items]);

    // À l'ouverture : tout cocher, sauf ce qui a déjà été envoyé.
    useEffect(() => {
        if (!open) return;
        let sent = {};
        try {
            sent = JSON.parse(localStorage.getItem(storageKey(quoteId)) || '{}');
        } catch { /* stockage corrompu : on repart de zéro */ }
        setAlreadySent(sent);
        const next = {};
        entries.forEach((e) => { next[e.key] = !sent[e.key]; });
        setChecked(next);
    }, [open, quoteId, entries]);

    if (!open) return null;

    const selected = entries.filter((e) => checked[e.key]);
    const toggle = (key) => setChecked((prev) => ({ ...prev, [key]: !prev[key] }));

    const send = async () => {
        if (!user || selected.length === 0) return;
        setSending(true);
        try {
            const parsedClientId = parseInt(clientId, 10);
            const rows = selected.map((e) => ({
                user_id: user.id,
                client_id: Number.isNaN(parsedClientId) ? null : parsedClientId,
                site_label: quoteLabel || null,
                description: e.description,
                quantity: e.quantity,
                unit: e.unit,
                category: 'materiel',
                notes: e.context ? `Ligne du devis : ${e.context}` : null,
                source: 'manual',
            }));
            const { error } = await supabase.from('procurement_items').insert(rows);
            if (error) throw error;

            const sent = { ...alreadySent };
            selected.forEach((e) => { sent[e.key] = true; });
            setAlreadySent(sent);
            try {
                localStorage.setItem(storageKey(quoteId), JSON.stringify(sent));
            } catch { /* quota plein : on ignore */ }

            toast.success(`${selected.length} fourniture${selected.length > 1 ? 's' : ''} ajoutée${selected.length > 1 ? 's' : ''} à la liste d'achats`, {
                action: {
                    label: 'Voir la liste',
                    onClick: () => navigate('/app/procurement'),
                },
            });
            onClose();
        } catch (err) {
            console.error('Erreur envoi vers la liste d\'achats:', err);
            toast.error("Impossible d'ajouter à la liste d'achats");
        } finally {
            setSending(false);
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
                            <ShoppingCart className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                            Commander le matériel
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                            Fournitures du devis (lignes matériel + chiffrage interne) à envoyer vers votre liste d'achats.
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
                            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Aucune fourniture détectée sur ce devis</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                Ajoutez des lignes « Matériel » ou détaillez vos lignes groupées via le chiffrage interne (🔒).
                            </p>
                        </div>
                    ) : (
                        <ul className="space-y-0.5">
                            {entries.map((e) => {
                                const isChecked = !!checked[e.key];
                                return (
                                    <li key={e.key}>
                                        <button
                                            type="button"
                                            onClick={() => toggle(e.key)}
                                            className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                                                isChecked ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                                            }`}
                                        >
                                            {isChecked
                                                ? <CheckSquare className="w-5 h-5 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
                                                : <Square className="w-5 h-5 mt-0.5 shrink-0 text-gray-300 dark:text-gray-600" />}
                                            <span className="flex-1 min-w-0">
                                                <span className="block text-sm text-gray-900 dark:text-gray-100">
                                                    {e.description}
                                                </span>
                                                <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                                    {e.quantity} {e.unit}
                                                    {e.context ? ` · dans « ${e.context} »` : ''}
                                                </span>
                                            </span>
                                            {alreadySent[e.key] && (
                                                <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-300">
                                                    Déjà envoyé
                                                </span>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                {/* Pied */}
                {entries.length > 0 && (
                    <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800">
                        <button
                            onClick={send}
                            disabled={sending || selected.length === 0}
                            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                            {sending
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <ShoppingCart className="w-4 h-4" />}
                            Ajouter {selected.length > 0 ? `${selected.length} ` : ''}à la liste d'achats
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};

export default QuoteSupplyListModal;
