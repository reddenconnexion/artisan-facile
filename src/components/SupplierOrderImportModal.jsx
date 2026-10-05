import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { X, Loader2, Mail, FileUp, Trash2, AlertTriangle, CheckCircle, Sparkles } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui';
import { extractSupplierOrder } from '../utils/aiService';
import { formatPrice } from '../utils/format';
import { useProcurementItems } from '../hooks/useDataCache';
import {
    useOpenChantiers, useSupplierPurchases, useInvalidateSupplierOrders, linkedItemIds,
} from '../hooks/useSupplierOrders';
import {
    normalizeParsedOrder, orderTotals, suggestItemMatches, suggestQuoteForLine, guessQuoteFromText,
    buildPurchaseRows, buildOrderHeader, buildLibraryCostUpdates, chantierLabel, STOCK,
} from '../utils/supplierOrder';

const NONE = '';
const inputCls = 'w-full px-2.5 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white';

const quoteValue = (v) => (v === STOCK ? STOCK : typeof v === 'number' ? String(v) : NONE);
const parseQuoteValue = (s) => (s === STOCK ? STOCK : s ? Number(s) : null);

/**
 * « Importer une commande » : le mail de confirmation d'une commande web est
 * collé (ou son PDF déposé), l'IA en sort les lignes, l'artisan impute chaque
 * ligne à un chantier — et, quand elle existe, à la ligne « à commander » du
 * devis qu'elle règle, pour ne pas compter deux fois le même matériel.
 * L'enregistrement met à jour le prix d'achat réel, donc la marge du chantier.
 */
const SupplierOrderImportModal = ({ open, onClose, defaultQuoteId = null, onSaved }) => {
    const { user } = useAuth();
    const invalidate = useInvalidateSupplierOrders();
    const { data: chantiers = [] } = useOpenChantiers();
    const { data: procItems = [] } = useProcurementItems();
    const { data: purchases = [] } = useSupplierPurchases();
    const fileRef = useRef(null);

    const [step, setStep] = useState('input');
    const [rawText, setRawText] = useState('');
    const [order, setOrder] = useState(null);
    const [busy, setBusy] = useState(false);
    const [updateLibrary, setUpdateLibrary] = useState(true);

    useEffect(() => {
        if (!open) return;
        setStep('input');
        setRawText('');
        setOrder(null);
        setBusy(false);
    }, [open]);

    const linked = useMemo(() => linkedItemIds(purchases), [purchases]);
    const chantierById = useMemo(() => new Map(chantiers.map((q) => [q.id, q])), [chantiers]);
    // Un chantier ouvert depuis la fiche Affaire peut être hors de la liste
    // (devis ancien, statut particulier) : on le garde sélectionnable.
    const defaultId = defaultQuoteId != null ? Number(defaultQuoteId) : null;

    // Lignes « à commander » encore à régler, par chantier.
    const openItemsByQuote = useMemo(() => {
        const map = new Map();
        for (const it of procItems) {
            if (it.quote_id == null || it.status === 'cancelled' || linked.has(it.id)) continue;
            const k = Number(it.quote_id);
            if (!map.has(k)) map.set(k, []);
            map.get(k).push(it);
        }
        return map;
    }, [procItems, linked]);

    const suggestions = useMemo(
        () => (order ? suggestItemMatches(order.lines, procItems, linked) : new Map()),
        [order, procItems, linked],
    );
    const effectiveItemId = (line) => (line.itemId !== undefined ? line.itemId : (suggestions.get(line.key) ?? null));
    const totals = order ? orderTotals(order) : null;

    if (!open) return null;

    const analyse = async () => {
        setBusy(true);
        try {
            const parsed = await extractSupplierOrder(rawText);
            const o = normalizeParsedOrder(parsed);
            if (o.lines.length === 0) throw new Error('Aucun article trouvé dans ce mail.');
            const guessed = defaultId ?? guessQuoteFromText(rawText, chantiers);
            o.lines = o.lines.map((l) => ({ ...l, quoteId: suggestQuoteForLine(l, procItems) ?? guessed ?? null }));
            setOrder(o);
            setStep('review');
        } catch (err) {
            toast.error(err.message || 'Lecture impossible');
        } finally {
            setBusy(false);
        }
    };

    const onFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
                const { extractTextFromPDF } = await import('../utils/documentParser');
                setRawText(await extractTextFromPDF(file));
            } else {
                setRawText(await file.text());
            }
        } catch {
            toast.error('Fichier illisible');
        }
    };

    const patch = (fields) => setOrder((o) => ({ ...o, ...fields }));
    const patchLine = (key, fields) => setOrder((o) => ({
        ...o,
        lines: o.lines.map((l) => (l.key === key ? { ...l, ...fields } : l)),
    }));
    const removeLine = (key) => setOrder((o) => ({ ...o, lines: o.lines.filter((l) => l.key !== key) }));
    const assignAll = (value) => setOrder((o) => ({
        ...o,
        lines: o.lines.map((l) => ({ ...l, quoteId: parseQuoteValue(value), itemId: undefined })),
    }));

    const save = async () => {
        if (!user || !order) return;
        if (!order.supplier.trim()) { toast.error('Indiquez le fournisseur'); return; }
        setBusy(true);
        try {
            if (order.orderRef) {
                const { data: dup } = await supabase
                    .from('supplier_invoices')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('order_ref', order.orderRef)
                    .limit(1);
                if (dup?.length) throw new Error(`La commande ${order.orderRef} est déjà enregistrée.`);
            }

            // Une ligne prévue ne se règle qu'une fois : en cas de doublon,
            // la seconde ligne de commande devient une ligne en plus.
            const used = new Set();
            const final = {
                ...order,
                lines: order.lines.map((l) => {
                    let itemId = effectiveItemId(l);
                    if (itemId && used.has(itemId)) itemId = null;
                    if (itemId) used.add(itemId);
                    return { ...l, itemId };
                }),
            };
            const { data: header, error: hErr } = await supabase
                .from('supplier_invoices')
                .insert(buildOrderHeader(final, { userId: user.id }))
                .select('id')
                .single();
            if (hErr) throw hErr;

            const rows = buildPurchaseRows(final, { userId: user.id, invoiceId: header.id });
            const toLink = rows.filter((r) => r.itemId);
            const plain = rows.filter((r) => !r.itemId).map((r) => r.row);

            if (plain.length) {
                const { error } = await supabase.from('supplier_purchases').insert(plain);
                if (error) throw error;
            }
            for (const { row, itemId } of toLink) {
                const { data: p, error } = await supabase.from('supplier_purchases').insert(row).select('id').single();
                if (error) throw error;
                const { error: lErr } = await supabase.rpc('link_supplier_purchase', { p_purchase_id: p.id, p_item_id: itemId });
                if (lErr) throw lErr;
                // Le coût réel, c'est ce qui a été acheté : la quantité suit l'achat.
                const item = procItems.find((it) => it.id === itemId);
                if (item && Math.abs((parseFloat(item.quantity) || 0) - row.quantity) > 0.001) {
                    await supabase.from('procurement_items').update({ quantity: row.quantity }).eq('id', itemId).eq('user_id', user.id);
                }
            }

            let libraryCount = 0;
            if (updateLibrary) {
                const { data: library } = await supabase
                    .from('price_library')
                    .select('id, description, reference, buying_price, supplier')
                    .eq('user_id', user.id);
                const firstQuote = final.lines.map((l) => chantierById.get(l.quoteId)).find(Boolean);
                const costIncludesVat = firstQuote ? firstQuote.include_tva === false : chantiers.some((q) => q.include_tva === false);
                const updates = buildLibraryCostUpdates(final.lines, library, {
                    pricesIncludeVat: final.pricesIncludeVat,
                    costIncludesVat,
                    supplier: final.supplier,
                });
                for (const u of updates) {
                    const { error } = await supabase
                        .from('price_library')
                        .update({ buying_price: u.buying_price, supplier: u.supplier, updated_at: new Date() })
                        .eq('id', u.id)
                        .eq('user_id', user.id);
                    if (!error) libraryCount += 1;
                }
            }

            invalidate();
            const sites = new Set(final.lines.filter((l) => typeof l.quoteId === 'number').map((l) => l.quoteId));
            const pending = final.lines.filter((l) => l.quoteId == null).length;
            toast.success(
                `Commande enregistrée : ${sites.size} chantier${sites.size > 1 ? 's' : ''}`
                + (pending ? `, ${pending} ligne${pending > 1 ? 's' : ''} à rattacher` : '')
                + (libraryCount ? `, ${libraryCount} prix d'achat mis à jour` : ''),
            );
            onSaved?.();
            onClose();
        } catch (err) {
            console.error('Import commande fournisseur:', err);
            toast.error(err.message || "Enregistrement impossible");
        } finally {
            setBusy(false);
        }
    };

    const chantierOptions = (
        <>
            {defaultId != null && !chantierById.has(defaultId) && <option value={String(defaultId)}>Ce chantier</option>}
            {chantiers.map((q) => <option key={q.id} value={String(q.id)}>{chantierLabel(q)}</option>)}
        </>
    );

    return createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60] sm:p-4" onClick={onClose}>
            <div
                className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl max-w-2xl w-full max-h-[92vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <Mail className="w-5 h-5 text-ios shrink-0" />
                            Importer une commande
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                            {step === 'input'
                                ? 'Collez le mail de confirmation de commande : les prix payés iront sur les chantiers.'
                                : 'Vérifiez les lignes et le chantier de chacune avant d’enregistrer.'}
                        </p>
                    </div>
                    <button onClick={onClose} aria-label="Fermer" className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg shrink-0">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {step === 'input' && (
                        <>
                            <textarea
                                value={rawText}
                                onChange={(e) => setRawText(e.target.value)}
                                rows={12}
                                placeholder={'Dans votre messagerie, ouvrez le mail « Confirmation de commande », sélectionnez tout (Ctrl+A) puis copiez-collez ici.'}
                                className={`${inputCls} font-mono text-xs`}
                            />
                            <div className="flex flex-wrap items-center gap-2">
                                <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                                    <FileUp className="w-4 h-4" /> PDF ou fichier texte
                                </Button>
                                <input ref={fileRef} type="file" accept=".pdf,.txt,.eml,.html,text/plain,application/pdf" className="hidden" onChange={onFile} />
                                <span className="text-xs text-gray-400">La facture PDF du site marche aussi.</span>
                            </div>
                        </>
                    )}

                    {step === 'review' && order && (
                        <>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <label className="text-xs text-gray-500 col-span-2 sm:col-span-1">Fournisseur
                                    <input className={inputCls} value={order.supplier} onChange={(e) => patch({ supplier: e.target.value })} />
                                </label>
                                <label className="text-xs text-gray-500">N° de commande
                                    <input className={inputCls} value={order.orderRef || ''} onChange={(e) => patch({ orderRef: e.target.value || null })} />
                                </label>
                                <label className="text-xs text-gray-500">Date
                                    <input type="date" className={inputCls} value={order.orderDate} onChange={(e) => patch({ orderDate: e.target.value })} />
                                </label>
                                <label className="text-xs text-gray-500">Prix affichés
                                    <select className={inputCls} value={order.pricesIncludeVat ? 'ttc' : 'ht'} onChange={(e) => patch({ pricesIncludeVat: e.target.value === 'ttc' })}>
                                        <option value="ttc">TTC</option>
                                        <option value="ht">HT</option>
                                    </select>
                                </label>
                            </div>

                            <label className="block text-xs text-gray-500">Tout imputer à
                                <select className={inputCls} value="" onChange={(e) => e.target.value !== '__' && assignAll(e.target.value)}>
                                    <option value="__">Choisir un chantier pour toutes les lignes…</option>
                                    <option value={NONE}>À rattacher plus tard</option>
                                    <option value={STOCK}>Stock / atelier (hors chantier)</option>
                                    {chantierOptions}
                                </select>
                            </label>

                            <ul className="space-y-2">
                                {order.lines.map((l) => {
                                    const candidates = typeof l.quoteId === 'number' ? (openItemsByQuote.get(l.quoteId) || []) : [];
                                    const itemId = effectiveItemId(l);
                                    return (
                                        <li key={l.key} className="rounded-xl border border-gray-100 dark:border-gray-800 p-3 space-y-2">
                                            <div className="flex items-start gap-2">
                                                <input className={`${inputCls} flex-1`} value={l.label} onChange={(e) => patchLine(l.key, { label: e.target.value })} aria-label="Désignation" />
                                                <button onClick={() => removeLine(l.key)} aria-label="Retirer la ligne" className="p-1.5 text-gray-400 hover:text-red-500">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2">
                                                <label className="text-[11px] text-gray-500">Réf.
                                                    <input className={inputCls} value={l.reference || ''} onChange={(e) => patchLine(l.key, { reference: e.target.value || null, itemId: undefined })} />
                                                </label>
                                                <label className="text-[11px] text-gray-500">Qté
                                                    <input type="number" step="any" min="0" className={inputCls} value={l.quantity} onChange={(e) => patchLine(l.key, { quantity: parseFloat(e.target.value) || 0 })} />
                                                </label>
                                                <label className="text-[11px] text-gray-500">PU {order.pricesIncludeVat ? 'TTC' : 'HT'}
                                                    <input type="number" step="0.01" className={inputCls} value={l.unitPrice} onChange={(e) => patchLine(l.key, { unitPrice: parseFloat(e.target.value) || 0 })} />
                                                </label>
                                            </div>
                                            <select
                                                className={inputCls}
                                                value={quoteValue(l.quoteId)}
                                                onChange={(e) => patchLine(l.key, { quoteId: parseQuoteValue(e.target.value), itemId: undefined })}
                                                aria-label="Chantier"
                                            >
                                                <option value={NONE}>Chantier : à rattacher plus tard</option>
                                                <option value={STOCK}>Stock / atelier (hors chantier)</option>
                                                {chantierOptions}
                                            </select>
                                            {typeof l.quoteId === 'number' && (
                                                <select
                                                    className={inputCls}
                                                    value={itemId ? String(itemId) : NONE}
                                                    onChange={(e) => patchLine(l.key, { itemId: e.target.value ? Number(e.target.value) : null })}
                                                    aria-label="Ligne prévue au devis"
                                                >
                                                    <option value={NONE}>
                                                        {candidates.length ? 'Ligne en plus (pas prévue dans la liste du devis)' : 'Nouvelle ligne d’achat sur ce chantier'}
                                                    </option>
                                                    {candidates.map((it) => (
                                                        <option key={it.id} value={String(it.id)}>
                                                            Règle : {it.description} ×{it.quantity}{it.buying_price != null ? ` (prévu ${formatPrice(it.buying_price)})` : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>

                            <div className="grid grid-cols-3 gap-2">
                                <label className="text-xs text-gray-500">Port
                                    <input type="number" step="0.01" min="0" className={inputCls} value={order.shipping} onChange={(e) => patch({ shipping: parseFloat(e.target.value) || 0 })} />
                                </label>
                                <label className="text-xs text-gray-500">Remise
                                    <input type="number" step="0.01" min="0" className={inputCls} value={order.discount} onChange={(e) => patch({ discount: parseFloat(e.target.value) || 0 })} />
                                </label>
                                <label className="text-xs text-gray-500">Total payé
                                    <input type="number" step="0.01" className={inputCls} value={order.total ?? ''} onChange={(e) => patch({ total: e.target.value === '' ? null : parseFloat(e.target.value) })} />
                                </label>
                            </div>

                            {totals && (totals.balanced ? (
                                <p className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                                    <CheckCircle className="w-4 h-4" /> Lignes + port − remise = {formatPrice(totals.computed)} {order.pricesIncludeVat ? 'TTC' : 'HT'}
                                </p>
                            ) : (
                                <p className="text-sm text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                    Écart de {formatPrice(totals.gap)} avec le total du mail ({formatPrice(totals.computed)} calculé). Vérifiez une quantité ou un prix.
                                </p>
                            ))}

                            <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                                <input type="checkbox" className="mt-1" checked={updateLibrary} onChange={(e) => setUpdateLibrary(e.target.checked)} />
                                <span>Mettre à jour mes prix d'achat dans la bibliothèque de prix (articles déjà connus) pour chiffrer les prochains devis au prix réel</span>
                            </label>
                        </>
                    )}
                </div>

                <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex justify-between gap-2">
                    {step === 'review'
                        ? <Button variant="plain" onClick={() => setStep('input')} disabled={busy}>Retour</Button>
                        : <span />}
                    {step === 'input' ? (
                        <Button onClick={analyse} disabled={busy || rawText.trim().length < 20}>
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            Lire la commande
                        </Button>
                    ) : (
                        <Button onClick={save} disabled={busy || !order?.lines.length}>
                            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                            Enregistrer ({order?.lines.length} ligne{order?.lines.length > 1 ? 's' : ''})
                        </Button>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default SupplierOrderImportModal;
