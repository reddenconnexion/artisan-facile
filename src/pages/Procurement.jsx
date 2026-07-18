import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    ShoppingCart, Hammer, Package, Search, Plus, Trash2,
    Check, CheckCircle, RotateCcw, Loader2, ExternalLink,
    Truck, Mic, Filter, FileText,
} from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useUserProfile, useProcurementItems } from '../hooks/useDataCache';
import { Button } from '../components/ui';
import { buildCatalogUpsert, isCatalogable } from '../utils/procurementCatalog';
import { groupMaterialsMargin } from '../utils/realizedMargin';

const CATEGORY_META = {
    materiel: { label: 'Matériel', Icon: Package, iconClass: 'text-blue-500' },
    outillage: { label: 'Outillage', Icon: Hammer, iconClass: 'text-amber-500' },
    consommable: { label: 'Consommable', Icon: ShoppingCart, iconClass: 'text-emerald-500' },
    autre: { label: 'Autre', Icon: ShoppingCart, iconClass: 'text-gray-500' },
};

const formatPrice = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
};

const STATUS_TABS = [
    { id: 'pending', label: 'À commander', color: 'text-blue-700 border-blue-600' },
    { id: 'ordered', label: 'Commandé', color: 'text-amber-700 border-amber-500' },
    { id: 'received', label: 'Reçu', color: 'text-emerald-700 border-emerald-500' },
];

const Procurement = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [statusFilter, setStatusFilter] = useState('pending');
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [adding, setAdding] = useState(false);
    const [newDesc, setNewDesc] = useState('');
    const [newQty, setNewQty] = useState(1);
    const [newCategory, setNewCategory] = useState('materiel');
    const [libraryItems, setLibraryItems] = useState([]);

    const { data: profile } = useUserProfile();
    const coefficient = parseFloat(profile?.default_margin_coefficient) || 0;

    // La liste est mise en cache par React Query (hook partagé) : elle reste en
    // mémoire entre les pages, donc revenir sur l'écran ne relance plus un
    // chargement complet avec spinner. Le cache est aussi la source de vérité
    // pour les mises à jour optimistes ci-dessous.
    const { data: items = [], isLoading, isError } = useProcurementItems();
    // Spinner uniquement au tout premier chargement (aucune donnée en cache).
    const loading = isLoading && items.length === 0;

    const itemsKey = ['procurementItems', user?.id];
    // Applique une transformation optimiste au cache et renvoie l'état
    // précédent pour permettre un rollback en cas d'erreur réseau.
    const patchItems = (updater) => {
        const previous = queryClient.getQueryData(itemsKey) || [];
        queryClient.setQueryData(itemsKey, updater(previous));
        return previous;
    };
    const restoreItems = (previous) => queryClient.setQueryData(itemsKey, previous);

    useEffect(() => {
        if (isError) toast.error('Erreur de chargement');
    }, [isError]);

    const fetchLibrary = async () => {
        if (!user) return;
        const { data, error } = await supabase
            .from('price_library')
            .select('id, user_id, description, price, buying_price, supplier, unit')
            .eq('user_id', user.id);
        if (!error) setLibraryItems(data || []);
    };

    useEffect(() => {
        if (user) fetchLibrary();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    // Répertorie du matériel dans la Bibliothèque de Prix (BPU) : le prix
    // d'achat constaté, le prix de vente et le fournisseur remontent au catalogue
    // pour préremplir les prochains devis. Sans doublon (upsert par description).
    // `silent` : pas de toast si rien n'était répertoriable (déclenchement auto).
    const catalogToLibrary = async (list, { silent = false } = {}) => {
        if (!user) return;
        const catalogable = (list || []).filter(isCatalogable);
        if (catalogable.length === 0) {
            if (!silent) toast.info("Renseignez d'abord un prix d'achat ou de vente pour répertorier");
            return;
        }
        const { toInsert, toUpdate } = buildCatalogUpsert(catalogable, libraryItems, user.id, { coefficient });
        if (toInsert.length === 0 && toUpdate.length === 0) {
            if (!silent) toast.info('Déjà à jour dans la bibliothèque');
            return;
        }
        try {
            if (toInsert.length > 0) {
                const { error } = await supabase.from('price_library').insert(toInsert);
                if (error) throw error;
            }
            if (toUpdate.length > 0) {
                const { error } = await supabase.from('price_library').upsert(toUpdate);
                if (error) throw error;
            }
            const n = toInsert.length + toUpdate.length;
            toast.success(
                `${n} article${n > 1 ? 's' : ''} répertorié${n > 1 ? 's' : ''} dans la bibliothèque`,
                {
                    action: {
                        label: 'Voir',
                        onClick: () => navigate('/app/library'),
                    },
                }
            );
            fetchLibrary();
        } catch (err) {
            console.error('Erreur mise au catalogue:', err);
            if (!silent) toast.error('Impossible de répertorier dans la bibliothèque');
        }
    };

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
                || (i.supplier || '').toLowerCase().includes(q)
            );
    }, [items, statusFilter, categoryFilter, search]);

    // Groupe pour la vue bureau (pratique pour copier une commande d'un bloc).
    // Le matériel envoyé depuis un devis est isolé par devis (clé quote_id) afin
    // de rester identifié au devis et de ne pas se mélanger au reste — même si
    // deux devis portent le même intitulé. Les autres lignes restent groupées
    // par chantier (site_label).
    const groupedBySite = useMemo(() => {
        const groups = new Map();
        for (const item of filtered) {
            const fromQuote = item.quote_id != null;
            const key = fromQuote
                ? `quote:${item.quote_id}`
                : `site:${item.site_label || 'Sans chantier'}`;
            if (!groups.has(key)) {
                groups.set(key, {
                    key,
                    quoteId: fromQuote ? item.quote_id : null,
                    label: item.site_label || (fromQuote ? `Devis #${item.quote_id}` : 'Sans chantier'),
                    items: [],
                });
            }
            groups.get(key).items.push(item);
        }
        return Array.from(groups.values());
    }, [filtered]);

    const updateStatus = async (id, newStatus) => {
        const patch = { status: newStatus };
        if (newStatus === 'ordered') patch.ordered_at = new Date().toISOString();
        if (newStatus === 'received') patch.received_at = new Date().toISOString();
        if (newStatus === 'pending') { patch.ordered_at = null; patch.received_at = null; }

        const previous = patchItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
        const { error } = await supabase.from('procurement_items').update(patch).eq('id', id);
        if (error) {
            toast.error('Mise à jour impossible');
            restoreItems(previous);
            return;
        }
        // Un matériel reçu est un achat confirmé : on le répertorie au catalogue.
        if (newStatus === 'received') {
            const item = previous.find(i => i.id === id);
            if (item) catalogToLibrary([item], { silent: true });
        }
    };

    const bulkMark = async (newStatus) => {
        const ids = filtered.map(i => i.id);
        if (ids.length === 0) return;
        const now = new Date().toISOString();
        const patch = { status: newStatus };
        if (newStatus === 'ordered') patch.ordered_at = now;
        if (newStatus === 'received') patch.received_at = now;

        const previous = patchItems(prev => prev.map(i => ids.includes(i.id) ? { ...i, ...patch } : i));
        const { error } = await supabase
            .from('procurement_items')
            .update(patch)
            .in('id', ids);
        if (error) {
            toast.error('Mise à jour impossible');
            restoreItems(previous);
        } else {
            toast.success(`${ids.length} article${ids.length > 1 ? 's' : ''} mis à jour`);
            if (newStatus === 'received') {
                const list = previous.filter(i => ids.includes(i.id));
                catalogToLibrary(list, { silent: true });
            }
        }
    };

    const removeItem = async (id) => {
        const previous = patchItems(prev => prev.filter(i => i.id !== id));
        const { error } = await supabase.from('procurement_items').delete().eq('id', id);
        if (error) {
            toast.error('Suppression impossible');
            restoreItems(previous);
        }
    };

    // Enregistre le prix d'achat / le fournisseur saisis librement au bureau.
    // Sauvegarde optimiste ; on ne réécrit que si la valeur change réellement.
    const saveItemFields = async (id, patch) => {
        const current = items.find(i => i.id === id);
        if (!current) return;
        const changed = Object.keys(patch).some(k => (current[k] ?? null) !== (patch[k] ?? null));
        if (!changed) return;
        const previous = patchItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
        const { error } = await supabase.from('procurement_items').update(patch).eq('id', id);
        if (error) {
            toast.error('Enregistrement impossible');
            restoreItems(previous);
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
        patchItems(prev => [data, ...prev]);
        setNewDesc('');
        setNewQty(1);
        toast.success('Ajouté');
    };

    const copyList = async () => {
        if (!filtered.length) {
            toast.info('Aucun article à copier');
            return;
        }
        // On reprend le regroupement de l'affichage : le chantier / devis
        // apparaît une seule fois en tête de bloc plutôt que répété sur
        // chaque ligne.
        const blocks = groupedBySite.map(({ label, items: list }) => {
            const lines = list.map(i =>
                `- ${i.quantity} ${i.unit || 'u'} × ${i.description}`
                + (i.supplier ? `  [${i.supplier}]` : '')
            );
            const header = label && label !== 'Sans chantier' ? `${label} :` : '';
            return header ? [header, ...lines].join('\n') : lines.join('\n');
        });
        try {
            await navigator.clipboard.writeText(blocks.join('\n\n'));
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
                    <h1 className="ios-title">Matériel à commander</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Centralisez les besoins notés depuis les chantiers et passez vos commandes.
                    </p>
                </div>
                <Link
                    to="/terrain"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-ios hover:bg-ios-dark text-white text-sm font-semibold shadow-sm"
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
                            className={`flex-1 md:flex-initial px-4 py-2 text-sm font-semibold rounded-2xl transition-colors ${
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
                        placeholder="Rechercher un article, un fournisseur ou un chantier…"
                        className="w-full pl-10 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-gray-400" />
                    <select
                        value={categoryFilter}
                        onChange={e => setCategoryFilter(e.target.value)}
                        className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="all">Toutes catégories</option>
                        {Object.entries(CATEGORY_META).map(([id, meta]) => (
                            <option key={id} value={id}>{meta.label}</option>
                        ))}
                    </select>
                </div>
                <button
                    onClick={copyList}
                    className="px-3 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-2xl text-sm font-medium text-gray-700"
                >
                    Copier la liste
                </button>
                {statusFilter === 'pending' && filtered.length > 0 && (
                    <button
                        onClick={() => bulkMark('ordered')}
                        className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-sm font-semibold inline-flex items-center gap-1.5"
                    >
                        <Truck className="w-4 h-4" />
                        Tout marquer commandé
                    </button>
                )}
                {statusFilter === 'ordered' && filtered.length > 0 && (
                    <button
                        onClick={() => bulkMark('received')}
                        className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl text-sm font-semibold inline-flex items-center gap-1.5"
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
                    className="flex-1 min-w-[200px] px-3 py-2 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500"
                />
                <input
                    type="number"
                    min="1"
                    value={newQty}
                    onChange={e => setNewQty(e.target.value)}
                    className="w-20 px-3 py-2 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500"
                />
                <select
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500"
                >
                    {Object.entries(CATEGORY_META).filter(([id]) => id !== 'autre').map(([id, meta]) => (
                        <option key={id} value={id}>{meta.label}</option>
                    ))}
                </select>
                <Button onClick={addItem} disabled={!newDesc.trim() || adding}>
                    {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Ajouter
                </Button>
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
                    {groupedBySite.map(({ key, label, quoteId, items: list }) => (
                        <div key={key} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-gray-600 uppercase tracking-wide">
                                {quoteId != null && (
                                    <Link
                                        to={`/app/devis/${quoteId}`}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 normal-case tracking-normal font-semibold hover:bg-blue-100"
                                        title="Ouvrir le devis"
                                    >
                                        <FileText className="w-3.5 h-3.5" />
                                        Devis
                                    </Link>
                                )}
                                <span>{label}</span>
                                <span className="font-normal normal-case text-gray-400">
                                    · {list.length} article{list.length > 1 ? 's' : ''}
                                </span>
                                {/* Marge matériel du devis, recalculée en direct au fil de la
                                    saisie des prix d'achat (toutes les lignes du devis, quel
                                    que soit l'onglet). Le devis n'est pas modifié. */}
                                {quoteId != null && (() => {
                                    const gm = groupMaterialsMargin(items.filter(i => Number(i.quote_id) === Number(quoteId)));
                                    if (!gm) return null;
                                    const pct = Math.round(gm.margin * 100);
                                    const cls = gm.margin >= 0.35 ? 'bg-green-50 text-green-700'
                                        : gm.margin >= 0.20 ? 'bg-amber-50 text-amber-700'
                                        : 'bg-red-50 text-red-600';
                                    return (
                                        <span
                                            className={`ml-auto inline-flex items-center px-2 py-0.5 rounded-full normal-case tracking-normal font-semibold ${cls}`}
                                            title={`Marge matériel réalisée d'après vos prix d'achat (${gm.pricedCount}/${gm.totalCount} article${gm.totalCount > 1 ? 's' : ''} renseigné${gm.pricedCount > 1 ? 's' : ''}) : vente ${formatPrice(gm.saleKnown)} − achat ${formatPrice(gm.costKnown)}. Se met à jour à chaque prix saisi, sans modifier le devis.`}
                                        >
                                            Marge matériel {pct} %
                                        </span>
                                    );
                                })()}
                            </div>
                            <ul className="divide-y divide-gray-100">
                                {list.map(item => {
                                    const meta = CATEGORY_META[item.category] || CATEGORY_META.autre;
                                    const Icon = meta.Icon;
                                    return (
                                        <li key={item.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50">
                                            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${meta.iconClass}`} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 truncate">
                                                    {item.description}
                                                </p>
                                                <p className="text-xs text-gray-400">
                                                    {item.quantity} {item.unit || 'u'} · {meta.label}
                                                    {item.sale_price != null && (
                                                        <span className="ml-2 text-gray-500">
                                                            · PV {formatPrice(item.sale_price)}/{item.unit || 'u'}
                                                        </span>
                                                    )}
                                                    {item.source === 'voice' && <span className="ml-2 inline-flex items-center gap-0.5 text-blue-500"><Mic className="w-3 h-3" /> vocal</span>}
                                                </p>
                                                {/* Champs libres répertoriés pour le prochain devis */}
                                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                                    <div className="relative">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            min="0"
                                                            defaultValue={item.buying_price ?? ''}
                                                            onBlur={e => {
                                                                const v = e.target.value.trim();
                                                                saveItemFields(item.id, { buying_price: v === '' ? null : parseFloat(v) });
                                                            }}
                                                            placeholder="Prix d'achat"
                                                            className="w-28 pl-2 pr-5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                        />
                                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">€</span>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        defaultValue={item.supplier ?? ''}
                                                        onBlur={e => {
                                                            const v = e.target.value.trim();
                                                            saveItemFields(item.id, { supplier: v === '' ? null : v });
                                                        }}
                                                        placeholder="Fournisseur"
                                                        className="w-36 px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                    />
                                                </div>
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
