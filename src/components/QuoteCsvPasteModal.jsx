import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ClipboardPaste, AlertTriangle, Info, Table2 } from 'lucide-react';
import { toast } from 'sonner';
import { parseQuoteCsv } from '../utils/quoteCsvImport';

/**
 * « Coller un tableau » : import des lignes d'un devis sans passer par un
 * fichier. L'artisan sélectionne ses cellules dans Excel (ou copie un CSV reçu
 * par mail), colle ici, et voit tout de suite ce qui entrera dans le devis.
 *
 * Pourquoi un aperçu plutôt qu'un import direct : un tableau collé n'a souvent
 * pas de ligne d'en-têtes, les colonnes sont alors devinées d'après leur
 * contenu (voir quoteCsvImport). L'aperçu rend cette lecture vérifiable d'un
 * coup d'œil — quantité, unité, prix — avant que quoi que ce soit ne touche au
 * devis.
 */

const PREVIEW_ROWS = 12;
const MAX_CHARS = 2 * 1024 * 1024; // même garde-fou que l'import de fichier (2 MB)

const formatPrice = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
};

const formatQuantity = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    return n.toLocaleString('fr-FR', { maximumFractionDigits: 3 });
};

const PLACEHOLDER = `Collez ici (Ctrl+V) vos cellules copiées depuis Excel, ou un CSV :

Description;Quantité;Unité;Prix unitaire
Dépose ancien tableau;1;forfait;150
Tableau 3 rangées;1;u;280,50
Tirage de câbles;45;ml;4,20`;

// Monté uniquement à l'ouverture (le parent conditionne son rendu) : l'état
// part donc toujours propre, sans effet de remise à zéro.
const QuoteCsvPasteModal = ({ onClose, onImport, hasExistingItems = false, initialText = '' }) => {
    // `initialText` : le tableau déjà collé au clavier sur le formulaire — la
    // modale s'ouvre alors avec son aperçu, sans avoir à recoller.
    const [text, setText] = useState(() => String(initialText || '').slice(0, MAX_CHARS));
    // Devis déjà commencé : on ajoute par défaut, écraser un chiffrage en cours
    // serait la mauvaise surprise.
    const [mode, setMode] = useState(hasExistingItems ? 'append' : 'replace');
    const textareaRef = useRef(null);

    useEffect(() => {
        const timer = setTimeout(() => textareaRef.current?.focus(), 50);
        return () => clearTimeout(timer);
    }, []);

    const parsed = useMemo(() => (text.trim() ? parseQuoteCsv(text) : null), [text]);

    const lines = parsed?.items?.filter((i) => i.type !== 'section') || [];
    const sections = parsed?.items?.filter((i) => i.type === 'section') || [];
    const totalHt = lines
        .filter((i) => !i.is_optional)
        .reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.price) || 0), 0);
    const canImport = Boolean(parsed && !parsed.error && lines.length > 0);

    // Bouton « Coller » : dépanne là où le clavier n'a pas de Ctrl+V (mobile).
    const pasteFromClipboard = async () => {
        if (!navigator.clipboard?.readText) {
            toast.error('Ce navigateur ne permet pas le collage automatique. Utilisez Ctrl/⌘+V.');
            textareaRef.current?.focus();
            return;
        }
        try {
            const clipboard = await navigator.clipboard.readText();
            if (!clipboard.trim()) {
                toast.error('Le presse-papiers est vide.');
                return;
            }
            setText(clipboard.slice(0, MAX_CHARS));
        } catch {
            toast.error('Collage refusé par le navigateur. Utilisez Ctrl/⌘+V dans la zone de texte.');
            textareaRef.current?.focus();
        }
    };

    const handleImport = () => {
        if (!canImport) return;
        onImport({
            items: parsed.items,
            notes: parsed.notes,
            skipped: parsed.skipped,
            headerless: parsed.headerless,
            mode,
        });
    };

    return createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60] sm:p-4" onClick={onClose}>
            <div
                className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl max-w-2xl w-full max-h-[92vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* En-tête */}
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <ClipboardPaste className="w-5 h-5 text-blue-600" />
                            Coller un tableau
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                            Copiez vos cellules dans Excel ou un CSV, collez-les ici — aucun fichier à enregistrer.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        aria-label="Fermer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Corps */}
                <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label htmlFor="csv-paste-area" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Votre tableau
                            </label>
                            <button
                                type="button"
                                onClick={pasteFromClipboard}
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400"
                            >
                                <ClipboardPaste className="w-3.5 h-3.5" />
                                Coller depuis le presse-papiers
                            </button>
                        </div>
                        <textarea
                            id="csv-paste-area"
                            ref={textareaRef}
                            value={text}
                            onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
                            rows={7}
                            spellCheck={false}
                            placeholder={PLACEHOLDER}
                            className="w-full px-3 py-2 font-mono text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                        />
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            Une ligne par prestation. Avec ou sans ligne d'en-têtes : sans en-têtes, les colonnes sont
                            devinées dans l'ordre <strong>Désignation, Quantité, Unité, Prix HT</strong> — vérifiez l'aperçu.
                        </p>
                    </div>

                    {parsed?.error && (
                        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span>{parsed.error}</span>
                        </div>
                    )}

                    {canImport && (
                        <>
                            {parsed.headerless && (
                                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-800 dark:text-amber-300">
                                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                    <span>
                                        Aucune ligne d'en-têtes reconnue : les colonnes ont été devinées d'après leur
                                        contenu. Contrôlez les quantités et les prix ci-dessous avant d'importer.
                                    </span>
                                </div>
                            )}

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                                        <Table2 className="w-4 h-4 text-gray-400" />
                                        Aperçu — {lines.length} ligne{lines.length > 1 ? 's' : ''}
                                        {sections.length > 0 && ` · ${sections.length} section${sections.length > 1 ? 's' : ''}`}
                                    </h4>
                                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                        {formatPrice(totalHt)} HT
                                    </span>
                                </div>
                                <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                                                <tr>
                                                    <th className="text-left font-medium px-3 py-2">Désignation</th>
                                                    <th className="text-right font-medium px-2 py-2">Qté</th>
                                                    <th className="text-left font-medium px-2 py-2">Unité</th>
                                                    <th className="text-right font-medium px-3 py-2">PU HT</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                                {parsed.items.slice(0, PREVIEW_ROWS).map((item) => (
                                                    item.type === 'section' ? (
                                                        <tr key={item.id} className="bg-gray-50/60 dark:bg-gray-800/40">
                                                            <td colSpan={4} className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">
                                                                {item.description}
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        <tr key={item.id} className="text-gray-700 dark:text-gray-300">
                                                            <td className="px-3 py-2">
                                                                {item.description}
                                                                {item.is_optional && (
                                                                    <span className="ml-1.5 text-[10px] uppercase tracking-wide text-purple-600 dark:text-purple-400">option</span>
                                                                )}
                                                            </td>
                                                            <td className="px-2 py-2 text-right tabular-nums">{formatQuantity(item.quantity)}</td>
                                                            <td className="px-2 py-2 text-gray-500 dark:text-gray-400">{item.unit}</td>
                                                            <td className="px-3 py-2 text-right tabular-nums">{formatPrice(item.price)}</td>
                                                        </tr>
                                                    )
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    {parsed.items.length > PREVIEW_ROWS && (
                                        <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/60 border-t border-gray-100 dark:border-gray-800">
                                            + {parsed.items.length - PREVIEW_ROWS} autre{parsed.items.length - PREVIEW_ROWS > 1 ? 's' : ''} ligne{parsed.items.length - PREVIEW_ROWS > 1 ? 's' : ''}…
                                        </div>
                                    )}
                                </div>
                            </div>

                            {parsed.skipped > 0 && (
                                <p className="text-xs text-gray-400 dark:text-gray-500">
                                    {parsed.skipped} ligne{parsed.skipped > 1 ? 's' : ''} sans désignation
                                    {parsed.skipped > 1 ? ' seront ignorées' : ' sera ignorée'}.
                                </p>
                            )}

                            {parsed.notes && (
                                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20">
                                    <p className="text-xs font-medium text-blue-800 dark:text-blue-300 mb-1">
                                        Réserves et notes reprises dans « Notes / Conditions »
                                    </p>
                                    <p className="text-xs text-blue-700 dark:text-blue-300/80 whitespace-pre-line line-clamp-4">
                                        {parsed.notes}
                                    </p>
                                </div>
                            )}

                            {hasExistingItems && (
                                <div>
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Le devis contient déjà des lignes
                                    </p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            { id: 'append', label: 'Ajouter à la suite', hint: 'Les lignes existantes sont conservées' },
                                            { id: 'replace', label: 'Remplacer', hint: 'Le tableau collé prend leur place' },
                                        ].map((option) => (
                                            <button
                                                key={option.id}
                                                type="button"
                                                onClick={() => setMode(option.id)}
                                                className={`text-left px-3 py-2 rounded-xl border transition-colors ${
                                                    mode === option.id
                                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                                                }`}
                                            >
                                                <span className="block text-sm font-medium text-gray-900 dark:text-white">{option.label}</span>
                                                <span className="block text-xs text-gray-500 dark:text-gray-400">{option.hint}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Pied */}
                <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                        Annuler
                    </button>
                    <button
                        type="button"
                        onClick={handleImport}
                        disabled={!canImport}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {canImport
                            ? `Importer ${lines.length} ligne${lines.length > 1 ? 's' : ''}`
                            : 'Importer'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default QuoteCsvPasteModal;
