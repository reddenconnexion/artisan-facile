import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Repeat, Plus, Edit2, Trash2, Calendar, Pause, Play, Loader2,
    X, Save, Zap, ChevronRight, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useClients } from '../hooks/useDataCache';
import { useConfirm } from '../context/ConfirmContext';
import { toastError } from '../utils/supabaseErrorHandler';

const FREQUENCY_LABELS = {
    weekly:    'Hebdomadaire',
    monthly:   'Mensuelle',
    quarterly: 'Trimestrielle',
    biannual:  'Semestrielle',
    annual:    'Annuelle',
};

const FREQUENCY_OPTIONS = Object.entries(FREQUENCY_LABELS).map(([v, l]) => ({ value: v, label: l }));

const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const formatMoney = (n) =>
    Number(n || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

/* ─── Modal de création/édition ─────────────────────────────────────────────── */
const RecurringForm = ({ initial, onClose, onSaved }) => {
    const { user } = useAuth();
    const { data: clients = [] } = useClients();

    const [form, setForm] = useState(() => initial || {
        client_id: '',
        title: '',
        description: '',
        items: [{ description: '', quantity: 1, price: 0, tva_rate: 20 }],
        include_tva: true,
        intervention_address: '',
        intervention_postal_code: '',
        intervention_city: '',
        frequency: 'monthly',
        next_due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        end_date: '',
        active: true,
    });
    const [saving, setSaving] = useState(false);

    const totals = useMemo(() => {
        const ht = form.items.reduce(
            (s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 1),
            0,
        );
        const tva = form.include_tva
            ? form.items.reduce(
                (s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 1) * (Number(it.tva_rate) || 20) / 100,
                0,
              )
            : 0;
        return { ht, tva, ttc: ht + tva };
    }, [form.items, form.include_tva]);

    const updateItem = (idx, field, value) => {
        setForm(f => {
            const items = [...f.items];
            items[idx] = { ...items[idx], [field]: value };
            return { ...f, items };
        });
    };

    const addItem = () => {
        setForm(f => ({
            ...f,
            items: [...f.items, { description: '', quantity: 1, price: 0, tva_rate: 20 }],
        }));
    };

    const removeItem = (idx) => {
        setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!form.client_id) return toast.error('Sélectionnez un client');
        if (!form.title.trim()) return toast.error('Donnez un titre au modèle');
        if (form.items.length === 0 || !form.items.some(i => i.description?.trim())) {
            return toast.error('Ajoutez au moins une ligne');
        }

        setSaving(true);
        const payload = {
            ...form,
            user_id: user.id,
            client_id: parseInt(form.client_id, 10),
            end_date: form.end_date || null,
        };

        const { error } = initial?.id
            ? await supabase.from('recurring_invoices').update(payload).eq('id', initial.id)
            : await supabase.from('recurring_invoices').insert(payload);

        setSaving(false);
        if (error) return toastError(error, 'Impossible d\'enregistrer le modèle');
        toast.success(initial?.id ? 'Modèle mis à jour' : 'Modèle créé');
        onSaved();
    };

    return (
        <div onClick={onClose} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div onClick={e => e.stopPropagation()} className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between flex-shrink-0">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Repeat className="w-5 h-5 text-blue-600" />
                        {initial?.id ? 'Modifier le modèle' : 'Nouveau modèle de facture récurrente'}
                    </h2>
                    <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-5">

                    {/* Client + titre */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Client *</label>
                            <select
                                value={form.client_id}
                                onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-white"
                                required
                            >
                                <option value="">Sélectionner…</option>
                                {clients.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Titre *</label>
                            <input
                                type="text"
                                value={form.title}
                                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                placeholder="Ex: Maintenance chaudière"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-white"
                                required
                            />
                        </div>
                    </div>

                    {/* Fréquence + dates */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fréquence *</label>
                            <select
                                value={form.frequency}
                                onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-white"
                            >
                                {FREQUENCY_OPTIONS.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Prochaine échéance *</label>
                            <input
                                type="date"
                                value={form.next_due_date}
                                onChange={e => setForm(f => ({ ...f, next_due_date: e.target.value }))}
                                min={new Date().toISOString().slice(0, 10)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-white"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                Date de fin <span className="text-gray-400 font-normal">(optionnel)</span>
                            </label>
                            <input
                                type="date"
                                value={form.end_date}
                                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-white"
                            />
                        </div>
                    </div>

                    {/* Items */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Lignes de facturation</label>
                            <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                                <input
                                    type="checkbox"
                                    checked={form.include_tva}
                                    onChange={e => setForm(f => ({ ...f, include_tva: e.target.checked }))}
                                    className="w-3.5 h-3.5"
                                />
                                Inclure la TVA
                            </label>
                        </div>
                        <div className="space-y-2">
                            {form.items.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={item.description}
                                        onChange={e => updateItem(idx, 'description', e.target.value)}
                                        placeholder="Description"
                                        className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded text-sm bg-white dark:bg-gray-800 dark:text-white"
                                    />
                                    <input
                                        type="number"
                                        value={item.quantity}
                                        onChange={e => updateItem(idx, 'quantity', e.target.value)}
                                        placeholder="Qté"
                                        step="0.01"
                                        className="w-16 px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded text-sm text-right bg-white dark:bg-gray-800 dark:text-white"
                                    />
                                    <input
                                        type="number"
                                        value={item.price}
                                        onChange={e => updateItem(idx, 'price', e.target.value)}
                                        placeholder="Prix HT"
                                        step="0.01"
                                        className="w-24 px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded text-sm text-right bg-white dark:bg-gray-800 dark:text-white"
                                    />
                                    {form.include_tva && (
                                        <select
                                            value={item.tva_rate}
                                            onChange={e => updateItem(idx, 'tva_rate', Number(e.target.value))}
                                            className="px-1 py-1.5 border border-gray-300 dark:border-gray-700 rounded text-xs bg-white dark:bg-gray-800 dark:text-white"
                                        >
                                            <option value={20}>20%</option>
                                            <option value={10}>10%</option>
                                            <option value={5.5}>5.5%</option>
                                            <option value={0}>0%</option>
                                        </select>
                                    )}
                                    {form.items.length > 1 && (
                                        <button type="button" onClick={() => removeItem(idx)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        <button type="button" onClick={addItem} className="mt-2 text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                            <Plus className="w-3 h-3" /> Ajouter une ligne
                        </button>
                    </div>

                    {/* Totaux */}
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm space-y-1">
                        <div className="flex justify-between text-gray-600 dark:text-gray-400">
                            <span>Total HT</span><span>{formatMoney(totals.ht)}</span>
                        </div>
                        {form.include_tva && (
                            <div className="flex justify-between text-gray-600 dark:text-gray-400">
                                <span>TVA</span><span>{formatMoney(totals.tva)}</span>
                            </div>
                        )}
                        <div className="flex justify-between font-bold text-gray-900 dark:text-white pt-1 border-t border-gray-200 dark:border-gray-700">
                            <span>Total TTC</span><span>{formatMoney(totals.ttc)}</span>
                        </div>
                    </div>

                </form>

                <div className="p-5 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-2 flex-shrink-0">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                        Annuler
                    </button>
                    <button type="button" onClick={handleSave} disabled={saving} className="px-5 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 inline-flex items-center gap-2">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Enregistrer
                    </button>
                </div>
            </div>
        </div>
    );
};

/* ─── Carte d'un modèle ─────────────────────────────────────────────────────── */
const TemplateCard = ({ template, clientName, onEdit, onDelete, onToggle, onGenerate, generating }) => {
    const navigate = useNavigate();
    const dueDate = new Date(template.next_due_date);
    const isOverdue = template.active && dueDate < new Date();
    const daysUntilDue = Math.ceil((dueDate - new Date()) / (1000 * 60 * 60 * 24));

    const totalTTC = (template.items || []).reduce((s, it) => {
        const ht = (Number(it.price) || 0) * (Number(it.quantity) || 1);
        const tva = template.include_tva ? ht * (Number(it.tva_rate) || 20) / 100 : 0;
        return s + ht + tva;
    }, 0);

    return (
        <div className={`bg-white dark:bg-gray-900 rounded-xl border shadow-sm overflow-hidden ${
            template.active ? 'border-gray-100 dark:border-gray-800' : 'border-gray-100 dark:border-gray-800 opacity-60'
        }`}>
            {/* Header avec statut */}
            <div className={`px-4 py-2 border-b flex items-center justify-between ${
                isOverdue
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/40'
                    : template.active
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800/40'
                        : 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-800'
            }`}>
                <div className="flex items-center gap-2">
                    {isOverdue
                        ? <><AlertCircle className="w-4 h-4 text-amber-600" /><span className="text-xs font-semibold text-amber-700 dark:text-amber-300">À générer</span></>
                        : template.active
                            ? <><Repeat className="w-4 h-4 text-green-600" /><span className="text-xs font-semibold text-green-700 dark:text-green-300">Actif</span></>
                            : <><Pause className="w-4 h-4 text-gray-400" /><span className="text-xs font-semibold text-gray-500">En pause</span></>
                    }
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                    {FREQUENCY_LABELS[template.frequency]}
                </span>
            </div>

            <div className="p-4">
                <h3 className="font-semibold text-gray-900 dark:text-white truncate">{template.title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{clientName || '—'}</p>

                <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
                    <div>
                        <p className="text-gray-400 uppercase font-semibold tracking-wider">Prochaine</p>
                        <p className={`font-medium mt-0.5 ${isOverdue ? 'text-amber-700 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'}`}>
                            {formatDate(template.next_due_date)}
                            {template.active && !isOverdue && daysUntilDue >= 0 && daysUntilDue <= 7 && (
                                <span className="block text-amber-600 text-[10px]">dans {daysUntilDue}j</span>
                            )}
                            {isOverdue && (
                                <span className="block text-amber-600 text-[10px]">en retard</span>
                            )}
                        </p>
                    </div>
                    <div>
                        <p className="text-gray-400 uppercase font-semibold tracking-wider">Montant</p>
                        <p className="font-bold text-gray-900 dark:text-white mt-0.5">{formatMoney(totalTTC)}</p>
                    </div>
                </div>

                {template.generated_count > 0 && (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-3">
                        {template.generated_count} facture{template.generated_count > 1 ? 's' : ''} déjà générée{template.generated_count > 1 ? 's' : ''}
                        {template.last_generated_quote_id && (
                            <button
                                onClick={() => navigate(`/app/devis/${template.last_generated_quote_id}`)}
                                className="ml-1 text-blue-600 hover:underline inline-flex items-center gap-0.5"
                            >
                                · voir la dernière <ChevronRight className="w-3 h-3" />
                            </button>
                        )}
                    </p>
                )}

                {/* Actions */}
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-1.5 flex-wrap">
                    <button
                        type="button"
                        onClick={onGenerate}
                        disabled={generating || !template.active}
                        title="Générer la facture maintenant"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 rounded-lg disabled:opacity-50"
                    >
                        {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                        Générer
                    </button>
                    <button
                        type="button"
                        onClick={onToggle}
                        title={template.active ? 'Mettre en pause' : 'Réactiver'}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                    >
                        {template.active ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                        {template.active ? 'Pause' : 'Reprendre'}
                    </button>
                    <button
                        type="button"
                        onClick={onEdit}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg ml-auto"
                    >
                        <Edit2 className="w-3 h-3" /> Modifier
                    </button>
                    <button
                        type="button"
                        onClick={onDelete}
                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                        title="Supprimer"
                    >
                        <Trash2 className="w-3 h-3" />
                    </button>
                </div>
            </div>
        </div>
    );
};

/* ══════════════════════════════════════════════════════════════════════════════
   Page principale
══════════════════════════════════════════════════════════════════════════════ */
const RecurringInvoices = () => {
    const { user } = useAuth();
    const { data: clients = [] } = useClients();
    const confirm = useConfirm();

    const [items, setItems]         = useState([]);
    const [loading, setLoading]     = useState(true);
    const [editing, setEditing]     = useState(null);
    const [showForm, setShowForm]   = useState(false);
    const [generatingId, setGenerating] = useState(null);

    const clientNameMap = useMemo(
        () => Object.fromEntries(clients.map(c => [c.id, c.name])),
        [clients],
    );

    const fetchItems = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('recurring_invoices')
            .select('*')
            .order('next_due_date', { ascending: true });
        setLoading(false);
        if (error) return toastError(error, 'Impossible de charger les modèles');
        setItems(data || []);
    };

    useEffect(() => { if (user) fetchItems(); }, [user]);

    const handleEdit = (template) => {
        setEditing(template);
        setShowForm(true);
    };

    const handleNew = () => {
        setEditing(null);
        setShowForm(true);
    };

    const handleDelete = async (template) => {
        const ok = await confirm({
            title: 'Supprimer ce modèle ?',
            message: `"${template.title}" sera supprimé. Les factures déjà générées sont conservées.`,
            confirmLabel: 'Supprimer',
            danger: true,
        });
        if (!ok) return;
        const { error } = await supabase.from('recurring_invoices').delete().eq('id', template.id);
        if (error) return toastError(error, 'Impossible de supprimer');
        toast.success('Modèle supprimé');
        fetchItems();
    };

    const handleToggle = async (template) => {
        const { error } = await supabase
            .from('recurring_invoices')
            .update({ active: !template.active, updated_at: new Date() })
            .eq('id', template.id);
        if (error) return toastError(error, 'Impossible de modifier');
        toast.success(template.active ? 'Modèle mis en pause' : 'Modèle réactivé');
        fetchItems();
    };

    const handleGenerate = async (template) => {
        setGenerating(template.id);
        const { data, error } = await supabase.rpc('generate_my_recurring_invoice', { p_id: template.id });
        setGenerating(null);
        if (error || !data?.success) return toastError(error || data, 'Échec de la génération');
        toast.success('Facture générée !', {
            action: { label: 'Voir', onClick: () => window.location.assign(`/app/devis/${data.quote_id}`) },
        });
        fetchItems();
    };

    const dueCount = items.filter(t => t.active && new Date(t.next_due_date) < new Date()).length;
    const monthlyRevenue = items
        .filter(t => t.active)
        .reduce((s, t) => {
            const total = (t.items || []).reduce((acc, it) => {
                const ht = (Number(it.price) || 0) * (Number(it.quantity) || 1);
                const tva = t.include_tva ? ht * (Number(it.tva_rate) || 20) / 100 : 0;
                return acc + ht + tva;
            }, 0);
            const factor = { weekly: 52/12, monthly: 1, quarterly: 1/3, biannual: 1/6, annual: 1/12 }[t.frequency] || 1;
            return s + total * factor;
        }, 0);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Repeat className="w-7 h-7 text-blue-600" />
                        Factures récurrentes
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Contrats de maintenance, abonnements — facturation automatique selon la fréquence choisie.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleNew}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm self-start"
                >
                    <Plus className="w-4 h-4" />
                    Nouveau modèle
                </button>
            </div>

            {/* KPI */}
            {items.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                        <p className="text-xs text-gray-400 uppercase font-semibold tracking-wider">Modèles actifs</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{items.filter(t => t.active).length}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                        <p className="text-xs text-gray-400 uppercase font-semibold tracking-wider">CA mensuel récurrent</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{formatMoney(monthlyRevenue)}</p>
                    </div>
                    <div className={`rounded-xl border p-4 col-span-2 md:col-span-1 ${dueCount > 0 ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40' : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800'}`}>
                        <p className="text-xs text-gray-400 uppercase font-semibold tracking-wider">À générer</p>
                        <p className={`text-2xl font-bold mt-1 ${dueCount > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-900 dark:text-white'}`}>{dueCount}</p>
                    </div>
                </div>
            )}

            {/* Liste */}
            {loading ? (
                <div className="flex justify-center py-16">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                </div>
            ) : items.length === 0 ? (
                <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
                    <Repeat className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Aucun modèle de facture récurrente</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 max-w-md mx-auto">
                        Créez un modèle pour générer automatiquement vos factures de maintenance,
                        abonnements ou prestations récurrentes.
                    </p>
                    <button
                        type="button"
                        onClick={handleNew}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg"
                    >
                        <Plus className="w-4 h-4" />
                        Créer mon premier modèle
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {items.map(template => (
                        <TemplateCard
                            key={template.id}
                            template={template}
                            clientName={clientNameMap[template.client_id]}
                            onEdit={() => handleEdit(template)}
                            onDelete={() => handleDelete(template)}
                            onToggle={() => handleToggle(template)}
                            onGenerate={() => handleGenerate(template)}
                            generating={generatingId === template.id}
                        />
                    ))}
                </div>
            )}

            {showForm && (
                <RecurringForm
                    initial={editing}
                    onClose={() => { setShowForm(false); setEditing(null); }}
                    onSaved={() => { setShowForm(false); setEditing(null); fetchItems(); }}
                />
            )}
        </div>
    );
};

export default RecurringInvoices;
