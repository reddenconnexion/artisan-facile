import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Mail, Link2, EyeOff, ChevronDown, ChevronRight, Loader2, Package } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { Button, Card, PageHeader, EmptyState, LoadingState } from '../components/ui';
import SupplierOrderImportModal from '../components/SupplierOrderImportModal';
import { useProcurementItems } from '../hooks/useDataCache';
import {
    useOpenChantiers, useSupplierPurchases, useSupplierOrders, useInvalidateSupplierOrders, linkedItemIds,
} from '../hooks/useSupplierOrders';
import { chantierLabel, suggestItemMatches } from '../utils/supplierOrder';
import { formatDate, formatPrice } from '../utils/format';

const STATUS = {
    auto: { label: 'Rapprochée', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
    manual: { label: 'Rattachée', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
    created: { label: 'Ajoutée au chantier', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    unmatched: { label: 'À rattacher', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
    ignored: { label: 'Stock / atelier', cls: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300' },
};

const selectCls = 'w-full px-2.5 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white';

/** Une ligne d'achat pas encore imputée : choix du chantier puis de la ligne prévue. */
const UnmatchedRow = ({ p, chantiers, openItems, linked, onDone }) => {
    const [quoteId, setQuoteId] = useState('');
    const [itemId, setItemId] = useState(undefined);
    const [busy, setBusy] = useState(false);

    const qid = quoteId ? Number(quoteId) : null;
    const candidates = qid ? openItems.filter((it) => Number(it.quote_id) === qid) : [];
    const suggested = useMemo(() => {
        if (!qid) return null;
        const m = suggestItemMatches([{ key: 'x', quoteId: qid, reference: p.reference, label: p.product_name }], openItems, linked);
        return m.get('x') ?? null;
    }, [qid, p.reference, p.product_name, openItems, linked]);
    const chosenItem = itemId !== undefined ? itemId : suggested;

    const run = async (fn) => {
        setBusy(true);
        try {
            const { error } = await fn();
            if (error) throw error;
            onDone();
        } catch (err) {
            toast.error(err.message || 'Action impossible');
        } finally {
            setBusy(false);
        }
    };

    const attach = () => run(() => (chosenItem
        ? supabase.rpc('link_supplier_purchase', { p_purchase_id: p.id, p_item_id: chosenItem })
        : supabase.rpc('attach_supplier_purchase_to_quote', { p_purchase_id: p.id, p_quote_id: qid })));
    const ignore = () => run(() => supabase.rpc('ignore_supplier_purchase', { p_purchase_id: p.id }));

    return (
        <li className="p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{p.product_name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        {p.supplier_name} · {formatDate(p.purchase_date)} · {p.quantity} × {formatPrice(p.unit_price_ttc ?? p.unit_price)}
                        {p.reference ? ` · réf. ${p.reference}` : ''}
                    </p>
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">{formatPrice(p.total_price)}</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
                <select className={selectCls} value={quoteId} onChange={(e) => { setQuoteId(e.target.value); setItemId(undefined); }} aria-label="Chantier">
                    <option value="">Choisir le chantier…</option>
                    {chantiers.map((q) => <option key={q.id} value={String(q.id)}>{chantierLabel(q)}</option>)}
                </select>
                {qid && candidates.length > 0 && (
                    <select className={selectCls} value={chosenItem ? String(chosenItem) : ''} onChange={(e) => setItemId(e.target.value ? Number(e.target.value) : null)} aria-label="Ligne prévue">
                        <option value="">Ligne en plus (pas prévue)</option>
                        {candidates.map((it) => <option key={it.id} value={String(it.id)}>Règle : {it.description} ×{it.quantity}</option>)}
                    </select>
                )}
            </div>
            <div className="flex gap-2">
                <Button size="sm" onClick={attach} disabled={busy || !qid}>
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />} Rattacher
                </Button>
                <Button size="sm" variant="secondary" onClick={ignore} disabled={busy}>
                    <EyeOff className="w-4 h-4" /> Stock / atelier
                </Button>
            </div>
        </li>
    );
};

/**
 * Commandes fournisseurs : import des mails de confirmation de commande web,
 * lignes d'achat encore à imputer, et historique des commandes par chantier.
 */
const SupplierOrders = () => {
    const [importOpen, setImportOpen] = useState(false);
    const [expanded, setExpanded] = useState({});
    const invalidate = useInvalidateSupplierOrders();
    const { data: chantiers = [] } = useOpenChantiers();
    const { data: procItems = [] } = useProcurementItems();
    const { data: purchases = [], isLoading: loadingP } = useSupplierPurchases();
    const { data: orders = [], isLoading: loadingO } = useSupplierOrders();

    const linked = useMemo(() => linkedItemIds(purchases), [purchases]);
    const openItems = useMemo(
        () => procItems.filter((it) => it.quote_id != null && it.status !== 'cancelled' && !linked.has(it.id)),
        [procItems, linked],
    );
    const chantierById = useMemo(() => new Map(chantiers.map((q) => [q.id, q])), [chantiers]);
    const unmatched = purchases.filter((p) => p.match_status === 'unmatched');
    const linesByOrder = useMemo(() => {
        const m = new Map();
        for (const p of purchases) {
            const k = p.invoice_id ?? 'none';
            if (!m.has(k)) m.set(k, []);
            m.get(k).push(p);
        }
        return m;
    }, [purchases]);

    const loading = (loadingP || loadingO) && purchases.length === 0 && orders.length === 0;

    return (
        <div className="max-w-3xl mx-auto p-4 md:p-6 pb-24 space-y-4">
            <PageHeader
                title="Commandes"
                subtitle="Vos achats fournisseurs imputés aux chantiers, pour une marge au prix réel."
                action={<Button onClick={() => setImportOpen(true)}><Mail className="w-4 h-4" /> Importer</Button>}
            />

            {loading ? <LoadingState /> : (
                <>
                    {unmatched.length > 0 && (
                        <Card className="overflow-hidden">
                            <div className="px-4 py-3 border-b border-gray-100 dark:border-white/10">
                                <p className="font-semibold text-gray-900 dark:text-white">À rattacher ({unmatched.length})</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Achats que l'appli n'a pas su imputer seule. Tant qu'ils ne sont pas rattachés, ils ne comptent dans aucune marge.</p>
                            </div>
                            <ul className="divide-y divide-gray-100 dark:divide-white/10">
                                {unmatched.map((p) => (
                                    <UnmatchedRow key={p.id} p={p} chantiers={chantiers} openItems={openItems} linked={linked} onDone={invalidate} />
                                ))}
                            </ul>
                        </Card>
                    )}

                    {orders.length === 0 && !linesByOrder.has('none') ? (
                        <EmptyState
                            icon={Package}
                            title="Aucune commande enregistrée"
                            description="Après une commande sur un site fournisseur, copiez le mail de confirmation et importez-le : chaque ligne part sur son chantier au prix payé."
                        />
                    ) : (
                        <Card as="ul" className="divide-y divide-gray-100 dark:divide-white/10">
                            {orders.map((o) => {
                                const lines = linesByOrder.get(o.id) || [];
                                const open = !!expanded[o.id];
                                const sites = [...new Set(lines.map((l) => l.quote_id).filter((x) => x != null))];
                                return (
                                    <li key={o.id}>
                                        <button
                                            type="button"
                                            onClick={() => setExpanded((e) => ({ ...e, [o.id]: !open }))}
                                            className="w-full p-4 flex items-start gap-3 text-left"
                                        >
                                            {open ? <ChevronDown className="w-4 h-4 mt-1 text-gray-400" /> : <ChevronRight className="w-4 h-4 mt-1 text-gray-400" />}
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-gray-900 dark:text-white truncate">
                                                    {o.supplier_name}{o.order_ref ? ` · n°${o.order_ref}` : o.invoice_number ? ` · facture ${o.invoice_number}` : ''}
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    {formatDate(o.invoice_date)} · {lines.length} ligne{lines.length > 1 ? 's' : ''}
                                                    {sites.length ? ` · ${sites.map((id) => chantierById.get(id)?.client_name || `devis ${id}`).join(', ')}` : ''}
                                                    {o.source === 'web_order' ? ' · commande web' : ' · facture'}
                                                </p>
                                            </div>
                                            {o.total_ttc != null && <span className="font-semibold text-gray-900 dark:text-white whitespace-nowrap">{formatPrice(o.total_ttc)}</span>}
                                        </button>
                                        {open && (
                                            <ul className="px-4 pb-4 space-y-1.5">
                                                {lines.map((l) => {
                                                    const st = STATUS[l.match_status] || STATUS.unmatched;
                                                    const site = l.quote_id != null ? chantierById.get(l.quote_id) : null;
                                                    return (
                                                        <li key={l.id} className="flex items-start justify-between gap-2 text-sm">
                                                            <div className="min-w-0">
                                                                <p className="text-gray-800 dark:text-gray-200">{l.quantity} × {l.product_name}</p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-1.5">
                                                                    <span className={`px-1.5 py-0.5 rounded ${st.cls}`}>{st.label}</span>
                                                                    {l.quote_id != null && (
                                                                        <Link to={`/app/affaires/${l.quote_id}`} className="text-ios hover:underline">
                                                                            {site ? chantierLabel(site) : `Devis ${l.quote_id}`}
                                                                        </Link>
                                                                    )}
                                                                </p>
                                                            </div>
                                                            <span className="whitespace-nowrap text-gray-700 dark:text-gray-300">{formatPrice(l.total_price)}</span>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
                                    </li>
                                );
                            })}
                        </Card>
                    )}
                </>
            )}

            <SupplierOrderImportModal open={importOpen} onClose={() => setImportOpen(false)} />
        </div>
    );
};

export default SupplierOrders;
