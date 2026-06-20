import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
    Scale, Upload, Loader2, FileText, Trash2, Plus, X, Check,
    Search, ExternalLink, Award, TrendingDown, Package, ChevronDown, ChevronRight,
} from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui';
import { extractTextFromPDF } from '../utils/documentParser';
import { extractSupplierInvoiceFromText } from '../utils/aiService';
import {
    parseSupplierInvoiceText,
    normalizeProductKey,
    toISODate,
} from '../utils/supplierInvoiceParser';
import { validateFileForUpload, UPLOAD_PRESETS } from '../utils/uploadValidation';

const BUCKET = 'quote_files';

const fmtMoney = (v, currency = 'EUR') =>
    v == null || isNaN(v) ? '—' : `${Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');

// Ligne vide pour la saisie/édition manuelle
const emptyLine = () => ({
    _id: crypto.randomUUID(),
    product_name: '',
    reference: '',
    quantity: 1,
    unit: 'u',
    unit_price: 0,
});

// ─────────────────────────────────────────────────────────────────────────────
// Modale de relecture / édition avant enregistrement
// ─────────────────────────────────────────────────────────────────────────────
const ReviewModal = ({ draft, onClose, onSave, saving }) => {
    const [header, setHeader] = useState({
        supplier_name: draft.supplier_name || '',
        invoice_number: draft.invoice_number || '',
        invoice_date: draft.invoice_date || '',
    });
    const [lines, setLines] = useState(
        draft.items?.length ? draft.items.map(it => ({ _id: crypto.randomUUID(), ...it })) : [emptyLine()]
    );

    const updateLine = (id, patch) =>
        setLines(prev => prev.map(l => (l._id === id ? { ...l, ...patch } : l)));
    const removeLine = (id) => setLines(prev => prev.filter(l => l._id !== id));

    const total = useMemo(
        () => lines.reduce((s, l) => s + (Number(l.unit_price) || 0) * (Number(l.quantity) || 0), 0),
        [lines]
    );

    const handleSave = () => {
        const cleaned = lines
            .map(l => ({
                product_name: (l.product_name || '').trim(),
                reference: (l.reference || '').trim(),
                quantity: Number(l.quantity) || 1,
                unit: l.unit || 'u',
                unit_price: Number(l.unit_price) || 0,
            }))
            .filter(l => l.product_name.length > 0);
        if (!header.supplier_name.trim()) {
            toast.error('Indiquez le nom du fournisseur.');
            return;
        }
        if (cleaned.length === 0) {
            toast.error('Ajoutez au moins un produit.');
            return;
        }
        onSave({ ...header, items: cleaned });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={saving ? undefined : onClose} />
            <div className="relative bg-white dark:bg-gray-900 w-full sm:max-w-3xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="font-bold text-gray-900 dark:text-white">Vérifier la facture</h3>
                    <button onClick={onClose} disabled={saving} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* En-tête */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <label className="text-sm sm:col-span-1">
                            <span className="text-gray-500">Fournisseur *</span>
                            <input
                                value={header.supplier_name}
                                onChange={e => setHeader(h => ({ ...h, supplier_name: e.target.value }))}
                                placeholder="Ex. Rexel, Point P…"
                                className="mt-1 w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400"
                            />
                        </label>
                        <label className="text-sm">
                            <span className="text-gray-500">N° facture</span>
                            <input
                                value={header.invoice_number}
                                onChange={e => setHeader(h => ({ ...h, invoice_number: e.target.value }))}
                                className="mt-1 w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400"
                            />
                        </label>
                        <label className="text-sm">
                            <span className="text-gray-500">Date</span>
                            <input
                                type="date"
                                value={toISODate(header.invoice_date) || ''}
                                onChange={e => setHeader(h => ({ ...h, invoice_date: e.target.value }))}
                                className="mt-1 w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400"
                            />
                        </label>
                    </div>

                    {/* Lignes */}
                    <div className="space-y-2">
                        <div className="hidden sm:grid grid-cols-[1fr_5rem_4rem_6rem_2rem] gap-2 px-1 text-xs font-semibold text-gray-400 uppercase">
                            <span>Produit</span><span>Qté</span><span>Unité</span><span>PU HT</span><span></span>
                        </div>
                        {lines.map(l => (
                            <div key={l._id} className="grid grid-cols-2 sm:grid-cols-[1fr_5rem_4rem_6rem_2rem] gap-2 items-center">
                                <input
                                    value={l.product_name}
                                    onChange={e => updateLine(l._id, { product_name: e.target.value })}
                                    placeholder="Désignation du produit"
                                    className="col-span-2 sm:col-span-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400"
                                />
                                <input
                                    type="number" step="any" min="0" value={l.quantity}
                                    onChange={e => updateLine(l._id, { quantity: e.target.value })}
                                    className="px-2 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400"
                                />
                                <input
                                    value={l.unit}
                                    onChange={e => updateLine(l._id, { unit: e.target.value })}
                                    className="px-2 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400"
                                />
                                <input
                                    type="number" step="any" min="0" value={l.unit_price}
                                    onChange={e => updateLine(l._id, { unit_price: e.target.value })}
                                    className="px-2 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400"
                                />
                                <button onClick={() => removeLine(l._id)} className="justify-self-end p-1.5 text-gray-300 hover:text-red-500">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                        <button
                            onClick={() => setLines(prev => [...prev, emptyLine()])}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 mt-1"
                        >
                            <Plus className="w-4 h-4" /> Ajouter une ligne
                        </button>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-sm text-gray-500">
                        Total HT estimé : <strong className="text-gray-900 dark:text-white">{fmtMoney(total)}</strong>
                    </span>
                    <div className="flex gap-2">
                        <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl">
                            Annuler
                        </button>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            Enregistrer
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Page principale
// ─────────────────────────────────────────────────────────────────────────────
const SupplierComparator = () => {
    const { user } = useAuth();
    const fileInputRef = useRef(null);

    const [tab, setTab] = useState('comparator'); // 'comparator' | 'invoices'
    const [invoices, setInvoices] = useState([]);
    const [purchases, setPurchases] = useState([]);
    const [loading, setLoading] = useState(true);
    const [importing, setImporting] = useState(false);
    const [draft, setDraft] = useState(null); // données en relecture
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [expanded, setExpanded] = useState(() => new Set()); // clés produits dépliées

    const toggleExpanded = (key) => setExpanded(prev => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
    });

    const fetchData = async () => {
        if (!user) return;
        setLoading(true);
        const [{ data: inv }, { data: pur }] = await Promise.all([
            supabase.from('supplier_invoices').select('*').eq('user_id', user.id).order('invoice_date', { ascending: false, nullsFirst: false }),
            supabase.from('supplier_purchases').select('*').eq('user_id', user.id),
        ]);
        setInvoices(inv || []);
        setPurchases(pur || []);
        setLoading(false);
    };

    useEffect(() => {
        if (user) fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    // ── Import d'un fichier PDF ───────────────────────────────────────────────
    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // permet de réimporter le même fichier
        if (!file || !user) return;

        const validation = await validateFileForUpload(file, UPLOAD_PRESETS.pdf);
        if (!validation.ok) { toast.error(validation.error); return; }

        setImporting(true);
        try {
            // 1. Upload du fichier
            const fileName = `${crypto.randomUUID()}.pdf`;
            const filePath = `${user.id}/supplier-invoices/${fileName}`;
            const { error: upErr } = await supabase.storage.from(BUCKET).upload(filePath, file, { contentType: 'application/pdf' });
            if (upErr) throw upErr;
            const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filePath);

            // 2. Extraction du texte
            const text = await extractTextFromPDF(file);

            // 3. Lecture regex (gratuite) puis affinage IA si le résultat est faible.
            // L'IA distingue mieux le fournisseur (émetteur) et le n° de facture
            // que les heuristiques regex : on la déclenche aussi quand l'en-tête
            // est incomplet, et on privilégie alors ses champs d'en-tête.
            let result = parseSupplierInvoiceText(text);
            const weak = result.items.length < 2 || !result.supplier_name || !result.invoice_number;
            if (weak && text && text.trim().length > 50) {
                try {
                    toast.info("Affinage de l'extraction par IA…");
                    const ai = await extractSupplierInvoiceFromText(text);
                    result = {
                        supplier_name: ai.supplier_name || result.supplier_name,
                        invoice_number: ai.invoice_number || result.invoice_number,
                        invoice_date: ai.invoice_date || result.invoice_date,
                        items: ai.items.length >= result.items.length ? ai.items : result.items,
                    };
                } catch (aiErr) {
                    console.warn('IA indisponible, on garde la lecture automatique:', aiErr);
                }
            }

            if (result.items.length === 0) {
                toast.warning("Aucun produit détecté — vous pouvez les saisir manuellement.");
            }

            setDraft({ ...result, file_path: filePath, file_url: publicUrl });
        } catch (err) {
            console.error(err);
            toast.error(`Import impossible : ${err.message}`);
        } finally {
            setImporting(false);
        }
    };

    // ── Enregistrement de la facture + des lignes ─────────────────────────────
    const saveInvoice = async (data) => {
        if (!user) return;
        setSaving(true);
        try {
            const isoDate = toISODate(data.invoice_date);
            const items = data.items;
            const totalHt = items.reduce((s, it) => s + (Number(it.unit_price) || 0) * (Number(it.quantity) || 0), 0);

            const { data: inv, error: invErr } = await supabase
                .from('supplier_invoices')
                .insert({
                    user_id: user.id,
                    supplier_name: data.supplier_name.trim(),
                    invoice_number: data.invoice_number?.trim() || null,
                    invoice_date: isoDate,
                    total_ht: Math.round(totalHt * 100) / 100,
                    file_path: draft?.file_path || null,
                    file_url: draft?.file_url || null,
                    item_count: items.length,
                    source: draft?.file_path ? 'upload' : 'manual',
                })
                .select()
                .single();
            if (invErr) throw invErr;

            const rows = items.map(it => {
                const qty = Number(it.quantity) || 1;
                const pu = Number(it.unit_price) || 0;
                return {
                    user_id: user.id,
                    invoice_id: inv.id,
                    supplier_name: data.supplier_name.trim(),
                    product_name: it.product_name,
                    product_key: normalizeProductKey(it.product_name, it.reference),
                    reference: it.reference || null,
                    quantity: qty,
                    unit: it.unit || 'u',
                    unit_price: pu,
                    total_price: Math.round(pu * qty * 100) / 100,
                    purchase_date: isoDate,
                };
            });
            const { error: rowsErr } = await supabase.from('supplier_purchases').insert(rows);
            if (rowsErr) throw rowsErr;

            toast.success(`Facture enregistrée — ${items.length} produit${items.length > 1 ? 's' : ''} ajouté${items.length > 1 ? 's' : ''} au comparateur`);
            setDraft(null);
            await fetchData();
            setTab('comparator');
        } catch (err) {
            console.error(err);
            toast.error(`Enregistrement impossible : ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const deleteInvoice = async (inv) => {
        const previous = { invoices, purchases };
        setInvoices(prev => prev.filter(i => i.id !== inv.id));
        setPurchases(prev => prev.filter(p => p.invoice_id !== inv.id));
        const { error } = await supabase.from('supplier_invoices').delete().eq('id', inv.id);
        if (error) {
            toast.error('Suppression impossible');
            setInvoices(previous.invoices);
            setPurchases(previous.purchases);
            return;
        }
        // Suppression best-effort du fichier (RLS limite au propriétaire)
        if (inv.file_path) supabase.storage.from(BUCKET).remove([inv.file_path]).catch(() => {});
        toast.success('Facture supprimée');
    };

    // Suppression d'une ligne enregistrée par erreur (sans toucher au reste).
    const deletePurchase = async (row) => {
        const previousPurchases = purchases;
        const previousInvoices = invoices;
        setPurchases(prev => prev.filter(p => p.id !== row.id));
        // Garder le compteur d'articles de la facture cohérent
        if (row.invoice_id) {
            setInvoices(prev => prev.map(i =>
                i.id === row.invoice_id ? { ...i, item_count: Math.max(0, (i.item_count || 1) - 1) } : i));
        }
        const { error } = await supabase.from('supplier_purchases').delete().eq('id', row.id);
        if (error) {
            toast.error('Suppression impossible');
            setPurchases(previousPurchases);
            setInvoices(previousInvoices);
            return;
        }
        if (row.invoice_id) {
            const remaining = previousPurchases.filter(p => p.invoice_id === row.invoice_id && p.id !== row.id).length;
            supabase.from('supplier_invoices').update({ item_count: remaining }).eq('id', row.invoice_id).then(() => {});
        }
        toast.success('Ligne supprimée');
    };

    // ── Construction du comparateur ───────────────────────────────────────────
    const groups = useMemo(() => {
        const map = new Map();
        for (const p of purchases) {
            const key = p.product_key || normalizeProductKey(p.product_name);
            if (!key) continue;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(p);
        }

        const out = [];
        for (const [key, rows] of map.entries()) {
            // Prix le plus récent par fournisseur
            const bySupplier = new Map();
            for (const r of rows) {
                const s = r.supplier_name || 'Inconnu';
                const date = r.purchase_date || r.created_at;
                const price = Number(r.unit_price) || 0;
                const cur = bySupplier.get(s);
                if (!cur || new Date(date) > new Date(cur.date)) {
                    bySupplier.set(s, { supplier: s, price, date, unit: r.unit, count: (cur?.count || 0) + 1 });
                } else {
                    cur.count += 1;
                }
            }
            const suppliers = Array.from(bySupplier.values())
                .filter(s => s.price > 0)
                .sort((a, b) => a.price - b.price);
            if (suppliers.length === 0) continue;

            // Libellé le plus fréquent comme nom représentatif
            const nameCount = new Map();
            for (const r of rows) nameCount.set(r.product_name, (nameCount.get(r.product_name) || 0) + 1);
            const name = [...nameCount.entries()].sort((a, b) => b[1] - a[1])[0][0];

            const best = suppliers[0];
            const worst = suppliers[suppliers.length - 1];
            out.push({
                key,
                name,
                unit: best.unit || 'u',
                suppliers,
                best,
                savings: worst.price - best.price,
                multiSupplier: suppliers.length > 1,
                // Lignes brutes enregistrées (pour suppression à l'unité), récentes d'abord
                rows: rows.slice().sort((a, b) =>
                    new Date(b.purchase_date || b.created_at) - new Date(a.purchase_date || a.created_at)),
            });
        }
        // Les produits avec un vrai choix (plusieurs fournisseurs) et les plus
        // d'économies potentielles en premier.
        out.sort((a, b) => Number(b.multiSupplier) - Number(a.multiSupplier) || b.savings - a.savings || a.name.localeCompare(b.name));
        return out;
    }, [purchases]);

    const filteredGroups = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return groups;
        return groups.filter(g => g.name.toLowerCase().includes(q) || g.suppliers.some(s => s.supplier.toLowerCase().includes(q)));
    }, [groups, search]);

    return (
        <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="ios-title flex items-center gap-2">
                        <Scale className="w-7 h-7 text-blue-600" />
                        Comparateur achats fournisseurs
                    </h1>
                    <p className="text-sm text-gray-500 mt-1 max-w-xl">
                        Importez vos factures de matériel : chaque produit est rangé pour comparer vos fournisseurs et trouver le meilleur prix à la commande.
                    </p>
                </div>
                <div className="flex gap-2">
                    <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFile} />
                    <Button onClick={() => fileInputRef.current?.click()} disabled={importing}>
                        {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        Importer une facture
                    </Button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-1 w-full md:w-fit">
                {[
                    { id: 'comparator', label: 'Comparateur', count: groups.length },
                    { id: 'invoices', label: 'Factures', count: invoices.length },
                ].map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`flex-1 md:flex-initial px-4 py-2 text-sm font-semibold rounded-2xl transition-colors ${
                            tab === t.id ? 'bg-gray-100 dark:bg-gray-800 text-blue-700 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        {t.label}
                        <span className="ml-2 inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 text-xs rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600">
                            {t.count}
                        </span>
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
            ) : tab === 'comparator' ? (
                <>
                    {groups.length > 0 && (
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Rechercher un produit ou un fournisseur…"
                                className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    )}

                    {filteredGroups.length === 0 ? (
                        <EmptyState onImport={() => fileInputRef.current?.click()} hasData={groups.length > 0} />
                    ) : (
                        <div className="space-y-3">
                            {filteredGroups.map(g => (
                                <div key={g.key} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                                    <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                                        <div className="flex items-start gap-2.5 min-w-0">
                                            <Package className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                                            <div className="min-w-0">
                                                <p className="font-semibold text-gray-900 dark:text-white truncate">{g.name}</p>
                                                <p className="text-xs text-gray-400">
                                                    {g.suppliers.length} fournisseur{g.suppliers.length > 1 ? 's' : ''} · prix /{g.unit}
                                                </p>
                                            </div>
                                        </div>
                                        {g.multiSupplier && g.savings > 0 && (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold shrink-0">
                                                <TrendingDown className="w-3.5 h-3.5" />
                                                jusqu'à {fmtMoney(g.savings)}/{g.unit}
                                            </span>
                                        )}
                                    </div>
                                    <ul className="divide-y divide-gray-50 dark:divide-gray-800">
                                        {g.suppliers.map((s, i) => {
                                            const isBest = i === 0;
                                            return (
                                                <li key={s.supplier} className={`flex items-center justify-between gap-3 px-4 py-2.5 ${isBest ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''}`}>
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        {isBest && <Award className="w-4 h-4 text-emerald-500 shrink-0" />}
                                                        <span className={`text-sm truncate ${isBest ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}>
                                                            {s.supplier}
                                                        </span>
                                                        {isBest && <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">Meilleur prix</span>}
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <span className={`text-sm ${isBest ? 'font-bold text-emerald-700 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                                            {fmtMoney(s.price)}
                                                        </span>
                                                        <span className="text-xs text-gray-400 ml-1">le {fmtDate(s.date)}</span>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>

                                    {/* Détail des lignes enregistrées + suppression à l'unité */}
                                    <button
                                        onClick={() => toggleExpanded(g.key)}
                                        className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border-t border-gray-100 dark:border-gray-800"
                                    >
                                        {expanded.has(g.key) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                        {g.rows.length} ligne{g.rows.length > 1 ? 's' : ''} enregistrée{g.rows.length > 1 ? 's' : ''}
                                    </button>
                                    {expanded.has(g.key) && (
                                        <ul className="divide-y divide-gray-50 dark:divide-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                                            {g.rows.map(row => (
                                                <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-2 text-xs">
                                                    <div className="min-w-0">
                                                        <span className="font-medium text-gray-700 dark:text-gray-300">{row.supplier_name || 'Inconnu'}</span>
                                                        <span className="text-gray-400"> · {fmtDate(row.purchase_date || row.created_at)} · {Number(row.quantity)} {row.unit || 'u'} × {fmtMoney(row.unit_price)}</span>
                                                    </div>
                                                    <button
                                                        onClick={() => deletePurchase(row)}
                                                        className="p-1 text-gray-300 hover:text-red-500 rounded shrink-0"
                                                        aria-label="Supprimer cette ligne"
                                                        title="Supprimer cette ligne"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </>
            ) : (
                // ── Onglet Factures ──────────────────────────────────────────────
                invoices.length === 0 ? (
                    <EmptyState onImport={() => fileInputRef.current?.click()} hasData={false} />
                ) : (
                    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl divide-y divide-gray-100 dark:divide-gray-800">
                        {invoices.map(inv => (
                            <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                                <FileText className="w-5 h-5 text-gray-400 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-gray-900 dark:text-white truncate">{inv.supplier_name || 'Fournisseur inconnu'}</p>
                                    <p className="text-xs text-gray-400">
                                        {inv.invoice_number ? `N° ${inv.invoice_number} · ` : ''}{fmtDate(inv.invoice_date)} · {inv.item_count} produit{inv.item_count > 1 ? 's' : ''}
                                    </p>
                                </div>
                                <span className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">{fmtMoney(inv.total_ht, inv.currency)}</span>
                                {inv.file_url && (
                                    <a href={inv.file_url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg" title="Ouvrir le PDF">
                                        <ExternalLink className="w-4 h-4" />
                                    </a>
                                )}
                                <button onClick={() => deleteInvoice(inv)} className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg" aria-label="Supprimer">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )
            )}

            {draft && (
                <ReviewModal
                    draft={draft}
                    saving={saving}
                    onClose={() => !saving && setDraft(null)}
                    onSave={saveInvoice}
                />
            )}
        </div>
    );
};

const EmptyState = ({ onImport, hasData }) => (
    <div className="bg-white dark:bg-gray-900 border border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-10 text-center">
        <div className="w-14 h-14 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <Upload className="w-7 h-7 text-blue-500" />
        </div>
        <p className="font-semibold text-gray-700 dark:text-gray-200">
            {hasData ? 'Aucun produit ne correspond' : 'Importez votre première facture'}
        </p>
        <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
            {hasData
                ? 'Modifiez votre recherche pour retrouver un produit.'
                : "Chargez une facture de matériel (PDF). Les produits seront triés automatiquement par fournisseur pour comparer les prix."}
        </p>
        {!hasData && (
            <button onClick={onImport} className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold text-blue-600 hover:text-blue-700">
                <Upload className="w-4 h-4" /> Importer une facture PDF
            </button>
        )}
    </div>
);

export default SupplierComparator;
