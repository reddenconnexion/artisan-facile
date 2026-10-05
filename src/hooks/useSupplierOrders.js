import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';

// Chantiers auxquels on peut imputer un achat : devis racines (jamais
// l'avenant ni la facture d'acompte, le trigger remonte de toute façon au
// parent), envoyés ou signés, les plus récents d'abord.
const CHANTIER_STATUSES = ['sent', 'accepted', 'billed', 'paid'];

export function useOpenChantiers() {
    const { user } = useAuth();
    return useQuery({
        queryKey: ['openChantiers', user?.id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('quotes')
                .select('id, title, client_name, quote_number, status, date, include_tva, clients(name)')
                .eq('user_id', user.id)
                .eq('type', 'quote')
                .is('parent_quote_id', null)
                .in('status', CHANTIER_STATUSES)
                .order('date', { ascending: false })
                .limit(200);
            if (error) throw error;
            return data || [];
        },
        enabled: !!user,
        staleTime: 2 * 60 * 1000,
    });
}

// Lignes d'achat (commandes web et factures fournisseurs).
export function useSupplierPurchases() {
    const { user } = useAuth();
    return useQuery({
        queryKey: ['supplierPurchases', user?.id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('supplier_purchases')
                .select('id, invoice_id, supplier_name, product_name, reference, quantity, unit, unit_price, unit_price_ttc, total_price, purchase_date, quote_id, procurement_item_id, match_status, origin')
                .eq('user_id', user.id)
                .order('purchase_date', { ascending: false })
                .order('id', { ascending: true })
                .limit(2000);
            if (error) throw error;
            return data || [];
        },
        enabled: !!user,
        staleTime: 60 * 1000,
    });
}

// En-têtes de commandes / factures fournisseurs.
export function useSupplierOrders() {
    const { user } = useAuth();
    return useQuery({
        queryKey: ['supplierOrders', user?.id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('supplier_invoices')
                .select('id, supplier_name, order_ref, invoice_number, invoice_date, total_ht, total_ttc, shipping_cost, item_count, source, created_at')
                .eq('user_id', user.id)
                .order('invoice_date', { ascending: false })
                .limit(300);
            if (error) throw error;
            return data || [];
        },
        enabled: !!user,
        staleTime: 60 * 1000,
    });
}

/** Rafraîchit tout ce qu'un achat rattaché fait bouger (marge comprise). */
export function useInvalidateSupplierOrders() {
    const queryClient = useQueryClient();
    return useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['supplierPurchases'] });
        queryClient.invalidateQueries({ queryKey: ['supplierOrders'] });
        queryClient.invalidateQueries({ queryKey: ['procurementItems'] });
        queryClient.invalidateQueries({ queryKey: ['priceLibrary'] });
    }, [queryClient]);
}

/** Ids des lignes « à commander » déjà réglées par un achat. */
export const linkedItemIds = (purchases) => new Set(
    (purchases || [])
        .filter((p) => p.procurement_item_id != null && ['auto', 'manual', 'created'].includes(p.match_status))
        .map((p) => p.procurement_item_id),
);
