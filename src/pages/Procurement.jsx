import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
    ShoppingCart, Hammer, Package, Search, Plus, Trash2,
    Check, CheckCircle, RotateCcw, Loader2, ExternalLink,
    Truck, Mic, Filter,
} from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';

const CATEGORY_META = {
    materiel: { label: 'Matériel', Icon: Package, iconClass: 'text-blue-500' },
    outillage: { label: 'Outillage', Icon: Hammer, iconClass: 'text-amber-500' },
    consommable: { label: 'Consommable', Icon: ShoppingCart, iconClass: 'text-emerald-500' },
    autre: { label: 'Autre', Icon: ShoppingCart, iconClass: 'text-gray-500' },
};

const STATUS_TABS = [
    { id: 'pending', label: 'À commander', color: 'text-blue-700 border-blue-600' },
    { id: 'ordered', label: 'Commandé', color: 'text-amber-700 border-amber-500' },
    { id: 'received', label: 'Reçu', color: 'text-emerald-700 border-emerald-500' },
];

const Procurement = () => {
    const { user } = useAuth();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('pending');
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [adding, setAdding] = useState(false);
    const [newDesc, setNewDesc] = useState('');
    const [newQty, setNewQty] = useState(1);
    const [newCategory, setNewCategory] = useState('materiel');

    const fetchItems = async () => {
        if (!user) return;
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('procurement_items')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            if (error) throw error;
            setItems(data || []);
        } catch (err) {
            console.error(err);
            toast.error('Erreur de chargement');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) fetchItems();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const counts = useMemo(() => ({
        pending: items.filter(i => i.status === 'pending').length,
        ordered: items.filter(i => i.status === 'ordered').length,
        received: items.filter(i => i.status === 'received').length,
    }), [items]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return items
            .filter(i => i.status === statusFilter)
            .filter(i => categoryFilter === 'all' || i.category === categoryFilter)
            .filter(i => !q
                || (i.description || '').toLowerCase().includes(q)
                || (i.site_label || '').toLowerCase().includes(q)
            );
    }, [items, statusFilter, categoryFilter, search]);

    // Group by site_label for the office view (handy to copy a single order)
    const groupedBySite = useMemo(() => {
        const groups = new Map();
        for (const item of filtered) {
            const key = item.site_label || 'Sans chantier';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(item);
        }
        return Array.from(groups.entries());
    }, [filtered]);

    const updateStatus = async (id, newStatus) => {
        const previous = items;
        const patch = { status: newStatus };
        if (newStatus === 'ordered') patch.ordered_at = new Date().toISOString();
        if (newStatus === 'received') patch.received_at = new Date().toISOString();
        if (newStatus === 'pending') { patch.ordered_at = null; patch.received_at = null; }

        setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
        const { error } = await supabase.from('procurement_items').update(patch).eq('id', id);
        if (error) {
            toast.error('Mise à jour impossible');
            setItems(previous);
        }
    };

    const bulkMark = async (newStatus) => {
        const ids = filtered.map(i => i.id);
        if (ids.length === 0) return;
        const previous = items;
        const now = new Date().toISOString();
        const patch = { status: newStatus };
        if (newStatus === 'ordered') patch.ordered_at = now;
        if (newStatus === 'received') patch.received_at = now;

        setItems(prev => prev.map(i => ids.includes(i.id) ? { ...i, ...patch } : i));
        const { error } = await supabase
            .from('procurement_items')
            .update(patch)
            .in('id', ids);
        if (error) {
            toast.error('Mise à jour impossible');
            setItems(previous);
        } else {
            toast.success(`${ids.length} article${ids.length > 1 ? 's' : ''} mis à jour`);
        }
    };

    const removeItem = async (id) => {
        const previous = items;
        setItems(prev => prev.filter(i => i.id !== id));
        const { error } = await supabase.from('procurement_items').delete().eq('id', id);
        if (error) {
            toast.error('Suppression impossible');
            setItems(previous);
        }
    };

    const addItem = async () => {
        const desc = newDesc.trim();
        if (!desc || !user) return;
        setAdding(true);
        const { data, error } = await supabase
            .from('procurement_items')
            .insert({
                user_id: user.id,
                description: desc,
                quantity: Number(newQty) || 1,
                category: newCategory,
                source: 'manual',
            })
            .select()
            .single();
        setAdding(false);
        if (error) {
            console.error(error);
            toast.error("Impossible d'ajouter");
            return;
        }
        setItems(prev => [data, ...prev]);
        setNewDesc('');
        setNewQty(1);
        toast.success('Ajouté');
    };

    const copyList = async () => {
        const lines = filtered.map(i =>
            `- ${i.quantity} ${i.unit || 'u'} × ${i.description}${i.site_label ? `  (${i.site_label})` : ''}`
        );
        if (!lines.length) {
            toast.info('Aucun article à copier');
            return;
        }
        try {
            await navigator.clipboard.writeText(lines.join('\n'));
            toast.success('Liste copiée dans le presse-papiers');
        } catch {
            toast.error('Copie impossible');
        }
    };

    return (
        <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <ShoppingCart className="w-6 h-6 text-blue-600" />
                        Matériel à commander
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Centralisez les besoins notés depuis les chantiers et passez vos commandes.
                    </p>
                </div>
                <Link
                    to="/terrain"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm"
                >
                    <Mic className="w-4 h-4" />
                    Mode terrain
                </Link>
            </div>

            {/* Status tabs */}
            <div className="flex gap-1 bg-white border border-gray-200 rounded-2xl p-1 w-full md:w-fit">
                {STATUS_TABS.map(({ id, label, color }) => {
                    const active = statusFilter === id;
                    return (
                        <button
                            key={id}
                            onClick={() => setStatusFilter(id)}
                            className={`flex-1 md:flex-initial px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
                                active ? `bg-gray-100 ${color.split(' ')[0]}` : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {label}
                            <span className="ml-2 inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 text-xs rounded-full bg-white border border-gray-200 text-gray-600">
                                {counts[id] || 0}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Toolbar */}
            <div className="bg-white border border-gray-200 rounded-2xl p-3 flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Rechercher un article ou un chantier…"
                        className="w-full pl-10 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-gray-400" />
                    <select
                        value={categoryFilter}
                        onChange={e => setCategoryFilter(e.target.value)}
                        className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="all">Toutes catégories</option>
                        {Object.entries(CATEGORY_META).map(([id, meta]) => (
                            <option key={id} value={id}>{meta.label}</option>
                        ))}
                    </select>
                </div>
                <button
                    onClick={copyList}
                    className="px-3 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-sm font-medium text-gray-700"
                >
                    Copier la liste
                </button>
                {statusFilter === 'pending' && filtered.length > 0 && (
                    <button
                        onClick={() => bulkMark('ordered')}
                        className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold inline-flex items-center gap-1.5"
                    >
                        <Truck className="w-4 h-4" />
                        Tout marquer commandé
                    </button>
                )}
                {statusFilter === 'ordered' && filtered.length > 0 && (
                    <button
                        onClick={() => bulkMark('received')}
                        className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-semibold inline-flex items-center gap-1.5"
                    >
                        <CheckCircle className="w-4 h-4" />
                        Tout marquer reçu
                    </button>
                )}
            </div>

            {/* Quick add */}
            <div className="bg-white border border-gray-200 rounded-2xl p-3 flex flex-wrap items-center gap-2">
                <input
                    type="text"
                    value={newDesc}
                    onChange={e => setNewDesc(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addItem(); }}
                    placeholder="Ajouter un article au bureau…"
                    className="flex-1 min-w-[200px] px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                />
                <input
                    type="number"
                    min="1"
                    value={newQty}
                    onChange={e => setNewQty(e.target.value)}
                    className="w-20 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                />
                <select
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                >
                    {Object.entries(CATEGORY_META).filter(([id]) => id !== 'autre').map(([id, meta]) => (
                        <option key={id} value={id}>{meta.label}</option>
                    ))}
                </select>
                <button
                    onClick={addItem}
                    disabled={!newDesc.trim() || adding}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-sm font-semibold inline-flex items-center gap-1.5"
                >
                    {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Ajouter
                </button>
            </div>

            {/* List */}
            {loading ? (
                <div className="flex justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
                    <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">
                        Aucun article {statusFilter === 'pending' ? 'à commander' : statusFilter === 'ordered' ? 'en cours de livraison' : 'reçu'} pour le moment.
                    </p>
                    {statusFilter === 'pending' && (
                        <Link
                            to="/terrain"
                            className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold text-blue-600 hover:text-blue-700"
                        >
                            Ajouter depuis le terrain <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    {groupedBySite.map(([siteLabel, list]) => (
                        <div key={siteLabel} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-600 uppercase tracking-wide">
                                {siteLabel}
                                <span className="ml-2 font-normal normal-case text-gray-400">
                                    · {list.length} article{list.length > 1 ? 's' : ''}
                                </span>
                            </div>
                            <ul className="divide-y divide-gray-100">
                                {list.map(item => {
                                    const meta = CATEGORY_META[item.category] || CATEGORY_META.autre;
                                    const Icon = meta.Icon;
                                    return (
                                        <li key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                                            <Icon className={`w-5 h-5 shrink-0 ${meta.iconClass}`} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 truncate">
                                                    {item.description}
                                                </p>
                                                <p className="text-xs text-gray-400">
                                                    {item.quantity} {item.unit || 'u'} · {meta.label}
                                                    {item.source === 'voice' && <span className="ml-2 inline-flex items-center gap-0.5 text-blue-500"><Mic className="w-3 h-3" /> vocal</span>}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {item.status === 'pending' && (
                                                    <button
                                                        onClick={() => updateStatus(item.id, 'ordered')}
                                                        className="px-2.5 py-1.5 text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg inline-flex items-center gap-1"
                                                    >
                                                        <Truck className="w-3.5 h-3.5" />
                                                        Commandé
                                                    </button>
                                                )}
                                                {item.status === 'ordered' && (
                                                    <>
                                                        <button
                                                            onClick={() => updateStatus(item.id, 'received')}
                                                            className="px-2.5 py-1.5 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg inline-flex items-center gap-1"
                                                        >
                                                            <Check className="w-3.5 h-3.5" />
                                                            Reçu
                                                        </button>
                                                        <button
                                                            onClick={() => updateStatus(item.id, 'pending')}
                                                            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
                                                            title="Revenir à 'À commander'"
                                                        >
                                                            <RotateCcw className="w-3.5 h-3.5" />
                                                        </button>
                                                    </>
                                                )}
                                                {item.status === 'received' && (
                                                    <button
                                                        onClick={() => updateStatus(item.id, 'pending')}
                                                        className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
                                                        title="Revenir à 'À commander'"
                                                    >
                                                        <RotateCcw className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => removeItem(item.id)}
                                                    className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg"
                                                    aria-label="Supprimer"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Procurement;
