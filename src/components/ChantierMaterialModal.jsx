import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
    X, Package, Wrench, FileText, ExternalLink, Loader2,
    CheckSquare, Square, RotateCcw, Truck, ChevronRight,
} from 'lucide-react';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';

// Clé de stockage local pour mémoriser les lignes déjà chargées dans le camion,
// par couple (rendez-vous, devis). Permet de cocher la veille et de retrouver
// l'état le matin de l'intervention.
const storageKey = (eventId, quoteId) => `chantier-material:${eventId}:${quoteId}`;

const lineKey = (item, idx) => String(item.id ?? idx);

// Ne garde que les lignes chiffrables (on ignore les titres de section) et on
// met le matériel en avant : c'est lui qu'on charge dans le camion.
const usableLines = (items) =>
    (Array.isArray(items) ? items : [])
        .filter((it) => it && it.type !== 'section' && (it.description || it.price))
        .map((it, idx) => ({ ...it, _key: lineKey(it, idx) }));

const ChantierMaterialModal = ({ event, onClose }) => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [quotes, setQuotes] = useState([]);        // devis candidats (repli par client)
    const [quote, setQuote] = useState(null);        // devis sélectionné
    const [checked, setChecked] = useState({});      // { [lineKey]: true }

    // Charge le devis lié au RDV, sinon les devis du client (repli automatique).
    useEffect(() => {
        let active = true;
        const load = async () => {
            setLoading(true);
            try {
                if (event.quote_id) {
                    const { data } = await supabase
                        .from('quotes')
                        .select('*')
                        .eq('id', event.quote_id)
                        .maybeSingle();
                    if (active && data) {
                        setQuote(data);
                        setQuotes([data]);
                        return;
                    }
                }
                if (event.client_id) {
                    const { data } = await supabase
                        .from('quotes')
                        .select('*')
                        .eq('client_id', event.client_id)
                        .neq('type', 'invoice')
                        .order('date', { ascending: false });
                    if (active) {
                        const list = data || [];
                        setQuotes(list);
                        // Auto-sélection : un devis accepté en priorité, sinon le plus récent.
                        const accepted = list.find((q) => q.status === 'accepted');
                        setQuote(accepted || list[0] || null);
                    }
                }
            } catch (err) {
                console.error('Erreur chargement matériel chantier:', err);
                toast.error('Impossible de charger le devis du chantier');
            } finally {
                if (active) setLoading(false);
            }
        };
        load();
        return () => { active = false; };
    }, [event.quote_id, event.client_id]);

    // Restaure l'état des cases cochées quand le devis change.
    useEffect(() => {
        if (!quote) { setChecked({}); return; }
        try {
            const raw = localStorage.getItem(storageKey(event.id, quote.id));
            setChecked(raw ? JSON.parse(raw) : {});
        } catch {
            setChecked({});
        }
    }, [event.id, quote]);

    const persist = (next) => {
        setChecked(next);
        if (quote) {
            try {
                localStorage.setItem(storageKey(event.id, quote.id), JSON.stringify(next));
            } catch { /* quota plein : on ignore */ }
        }
    };

    const lines = useMemo(() => usableLines(quote?.items), [quote]);
    const materialLines = lines.filter((l) => l.type === 'material');
    const labourLines = lines.filter((l) => l.type !== 'material');
    const doneCount = lines.filter((l) => checked[l._key]).length;

    const toggle = (key) => persist({ ...checked, [key]: !checked[key] });
    const reset = () => persist({});
    const checkAll = () => {
        const next = {};
        lines.forEach((l) => { next[l._key] = true; });
        persist(next);
    };

    const openPdf = () => {
        if (quote?.original_pdf_url) {
            window.open(quote.original_pdf_url, '_blank', 'noopener,noreferrer');
        } else {
            navigate(`/app/devis/${quote.id}`);
            onClose();
        }
    };

    const renderLine = (line) => {
        const isChecked = !!checked[line._key];
        const isMaterial = line.type === 'material';
        return (
            <li key={line._key}>
                <button
                    type="button"
                    onClick={() => toggle(line._key)}
                    className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                        isChecked
                            ? 'bg-green-50 dark:bg-green-900/20'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                >
                    {isChecked
                        ? <CheckSquare className="w-5 h-5 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
                        : <Square className="w-5 h-5 mt-0.5 shrink-0 text-gray-300 dark:text-gray-600" />}
                    <span className="flex-1 min-w-0">
                        <span className={`block text-sm ${isChecked ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
                            {line.is_optional ? '(Option) ' : ''}{line.description || 'Ligne sans description'}
                        </span>
                        {(line.quantity || line.unit) && (
                            <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {line.quantity ?? ''} {line.unit || ''}
                            </span>
                        )}
                    </span>
                    <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        isMaterial
                            ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'
                    }`}>
                        {isMaterial ? <Package className="w-3 h-3" /> : <Wrench className="w-3 h-3" />}
                        {isMaterial ? 'Matériel' : "Main d'œuvre"}
                    </span>
                </button>
            </li>
        );
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
                            Matériel à charger
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5">
                            {event.title}{event.client_name ? ` · ${event.client_name}` : ''}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg shrink-0">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Corps */}
                <div className="flex-1 overflow-y-auto px-5 py-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-12 text-gray-400">
                            <Loader2 className="w-6 h-6 animate-spin" />
                        </div>
                    ) : !quote ? (
                        <div className="text-center py-10">
                            <FileText className="w-10 h-10 mx-auto mb-3 text-gray-200 dark:text-gray-700" />
                            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Aucun devis associé à ce chantier</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                Associez un devis depuis l'agenda pour retrouver la liste du matériel ici.
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Sélecteur si plusieurs devis pour le client (repli) */}
                            {quotes.length > 1 && (
                                <div className="mb-4">
                                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                        Devis du client
                                    </label>
                                    <select
                                        value={quote.id}
                                        onChange={(e) => setQuote(quotes.find((q) => String(q.id) === e.target.value))}
                                        className="block w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                    >
                                        {quotes.map((q) => (
                                            <option key={q.id} value={q.id}>
                                                {(q.title || `Devis #${q.id}`)} · {q.date || ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Progression + actions */}
                            {lines.length > 0 && (
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                        {doneCount}/{lines.length} chargé{doneCount > 1 ? 's' : ''}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={checkAll}
                                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                        >
                                            <CheckSquare className="w-3.5 h-3.5" /> Tout cocher
                                        </button>
                                        {doneCount > 0 && (
                                            <button
                                                onClick={reset}
                                                className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                            >
                                                <RotateCcw className="w-3.5 h-3.5" /> Réinitialiser
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {lines.length === 0 ? (
                                <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
                                    Ce devis ne contient pas de lignes détaillées. Ouvrez le PDF pour le consulter.
                                </p>
                            ) : (
                                <>
                                    {materialLines.length > 0 && (
                                        <div className="mb-4">
                                            <h4 className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider mb-1.5">
                                                Matériel / Fournitures
                                            </h4>
                                            <ul className="space-y-0.5">{materialLines.map(renderLine)}</ul>
                                        </div>
                                    )}
                                    {labourLines.length > 0 && (
                                        <div>
                                            <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                                                Autres prestations
                                            </h4>
                                            <ul className="space-y-0.5">{labourLines.map(renderLine)}</ul>
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </div>

                {/* Pied : accès PDF / devis */}
                {quote && (
                    <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
                        <button
                            onClick={openPdf}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            {quote.original_pdf_url
                                ? <><ExternalLink className="w-4 h-4" /> Ouvrir le PDF</>
                                : <><FileText className="w-4 h-4" /> Voir le devis</>}
                        </button>
                        <button
                            onClick={() => { navigate(`/app/devis/${quote.id}`); onClose(); }}
                            className="inline-flex items-center gap-1 px-3 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg"
                            title="Ouvrir la fiche du devis"
                        >
                            Détails <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};

export default ChantierMaterialModal;
