import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Truck, Mail } from 'lucide-react';
import { Card, Button } from './ui';
import SupplierOrderImportModal from './SupplierOrderImportModal';
import { useSupplierPurchases, useSupplierOrders } from '../hooks/useSupplierOrders';
import { affaireQuoteIds } from '../utils/affaireSite';
import { formatDate, formatPrice } from '../utils/format';

/**
 * Commandes fournisseurs imputées à l'affaire (devis, avenants…), avec
 * l'import d'un mail de commande directement sur ce chantier.
 */
const AffaireOrders = ({ quote, linkedDocs }) => {
    const [importOpen, setImportOpen] = useState(false);
    const { data: purchases = [] } = useSupplierPurchases();
    const { data: orders = [] } = useSupplierOrders();

    const groups = useMemo(() => {
        const ids = new Set(affaireQuoteIds(quote, linkedDocs));
        const headers = new Map(orders.map((o) => [o.id, o]));
        const map = new Map();
        for (const p of purchases) {
            if (p.quote_id == null || !ids.has(Number(p.quote_id)) || p.match_status === 'ignored') continue;
            const k = p.invoice_id ?? `d${p.purchase_date}`;
            if (!map.has(k)) map.set(k, { key: k, header: headers.get(p.invoice_id), supplier: p.supplier_name, date: p.purchase_date, total: 0, count: 0 });
            const g = map.get(k);
            g.total += Number(p.total_price) || 0;
            g.count += 1;
        }
        return [...map.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    }, [purchases, orders, quote, linkedDocs]);

    const total = groups.reduce((s, g) => s + g.total, 0);

    return (
        <Card className="p-4 mb-4">
            <div className="flex items-center justify-between gap-2 mb-2">
                <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <Truck className="w-4 h-4 text-gray-400" /> Commandes fournisseurs
                </p>
                <Link to="/app/commandes" className="text-sm text-ios hover:underline">Toutes</Link>
            </div>
            {groups.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Aucune commande rattachée. Importez le mail de confirmation pour suivre le prix réellement payé.
                </p>
            ) : (
                <ul className="text-sm space-y-1 mb-1">
                    {groups.map((g) => (
                        <li key={g.key} className="flex justify-between gap-2">
                            <span className="text-gray-700 dark:text-gray-300 min-w-0 truncate">
                                {formatDate(g.date)} · {g.header?.supplier_name || g.supplier}
                                {g.header?.order_ref ? ` n°${g.header.order_ref}` : ''}
                                <span className="text-gray-400"> · {g.count} ligne{g.count > 1 ? 's' : ''}</span>
                            </span>
                            <span className="whitespace-nowrap text-gray-900 dark:text-white">{formatPrice(g.total)}</span>
                        </li>
                    ))}
                    <li className="flex justify-between gap-2 pt-1 border-t border-gray-100 dark:border-white/10 font-semibold">
                        <span className="text-gray-900 dark:text-white">Total acheté (TTC)</span>
                        <span className="text-gray-900 dark:text-white">{formatPrice(total)}</span>
                    </li>
                </ul>
            )}
            <Button variant="secondary" size="sm" className="mt-2" onClick={() => setImportOpen(true)}>
                <Mail className="w-4 h-4" /> Importer une commande pour ce chantier
            </Button>
            <SupplierOrderImportModal open={importOpen} onClose={() => setImportOpen(false)} defaultQuoteId={quote.id} />
        </Card>
    );
};

export default AffaireOrders;
