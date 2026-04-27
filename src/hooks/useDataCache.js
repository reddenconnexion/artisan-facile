import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { saveToOfflineCache, getFromOfflineCache } from '../utils/offlineCache';

/**
 * Hooks de cache pour les données principales
 * Utilise React Query pour :
 * - Éviter les rechargements inutiles
 * - Garder les données en mémoire entre les pages
 * - Synchroniser automatiquement après modifications
 * - Persister en localStorage pour consultation hors-ligne
 */

// Helper: wrap queryFn avec cache offline
function withOfflineCache(cacheKey, fetchFn) {
    return async () => {
        // Si en ligne, toujours essayer le réseau
        if (navigator.onLine) {
            const data = await fetchFn();
            // Ne sauvegarder que les résultats non-vides
            if (data && (!Array.isArray(data) || data.length > 0)) {
                saveToOfflineCache(cacheKey, data);
            }
            return data;
        }

        // Hors-ligne : essayer le fetch (Workbox peut servir depuis son cache)
        try {
            const data = await fetchFn();
            if (data && (!Array.isArray(data) || data.length > 0)) {
                saveToOfflineCache(cacheKey, data);
            }
            return data;
        } catch (error) {
            // Hors-ligne et fetch échoué : retourner le cache local
            const cached = getFromOfflineCache(cacheKey);
            if (cached?.data) return cached.data;
            throw error;
        }
    };
}

// Cache des clients
export function useClients() {
    const { user } = useAuth();

    return useQuery({
        queryKey: ['clients', user?.id],
        queryFn: withOfflineCache(`clients_${user?.id}`, async () => {
            const { data, error } = await supabase
                .from('clients')
                .select('*')
                .order('name');
            if (error) throw error;
            return data || [];
        }),
        enabled: !!user,
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
    });
}

// Cache des devis/factures
export function useQuotes(filters = {}) {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const filterKey = JSON.stringify(filters);

    useEffect(() => {
        if (!user) return;
        const channel = supabase
            .channel(`quotes_realtime_${user.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes', filter: `user_id=eq.${user.id}` }, () => {
                queryClient.invalidateQueries({ queryKey: ['quotes', user.id] });
                queryClient.invalidateQueries({ queryKey: ['quote'] });
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [user?.id, queryClient]);

    return useQuery({
        queryKey: ['quotes', user?.id, filters],
        queryFn: withOfflineCache(`quotes_${user?.id}_${filterKey}`, async () => {
            let query = supabase
                .from('quotes')
                .select('*')
                .order('created_at', { ascending: false });

            if (filters.status) {
                query = query.eq('status', filters.status);
            }
            if (filters.type) {
                query = query.eq('type', filters.type);
            }
            if (filters.client_id) {
                query = query.eq('client_id', filters.client_id);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        }),
        enabled: !!user,
        staleTime: 2 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
    });
}

// Cache d'un devis spécifique
export function useQuote(id) {
    const { user } = useAuth();

    return useQuery({
        queryKey: ['quote', id],
        queryFn: withOfflineCache(`quote_${id}`, async () => {
            const { data, error } = await supabase
                .from('quotes')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            return data;
        }),
        enabled: !!user && !!id && id !== 'new',
        staleTime: 1 * 60 * 1000,
    });
}

// Cache de la bibliothèque de prix
export function usePriceLibrary() {
    const { user } = useAuth();

    return useQuery({
        queryKey: ['priceLibrary', user?.id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('price_library')
                .select('*')
                .order('description');
            if (error) throw error;
            return data || [];
        },
        enabled: !!user,
        staleTime: 10 * 60 * 1000, // 10 minutes (change peu)
        gcTime: 60 * 60 * 1000, // 1 heure
    });
}

// Cache du profil utilisateur
export function useUserProfile() {
    const { user } = useAuth();

    return useQuery({
        queryKey: ['profile', user?.id],
        queryFn: withOfflineCache(`profile_${user?.id}`, async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();
            if (error) throw error;

            const aiPrefs = data?.ai_preferences || {};
            const settings = user.user_metadata?.activity_settings || {};

            return {
                ...data,
                ...aiPrefs,
                email: user.email,
                ...settings
            };
        }),
        enabled: !!user,
        staleTime: 10 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
    });
}

// Cache de l'inventaire (matériaux dans price_library)
export function useInventory() {
    const { user } = useAuth();

    return useQuery({
        queryKey: ['inventory', user?.id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('price_library')
                .select('*')
                .or('type.eq.material,type.is.null')
                .order('stock_quantity', { ascending: false });
            if (error) throw error;
            return data || [];
        },
        enabled: !!user,
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
    });
}

// Cache des événements agenda
export function useAgendaEvents(startDate, endDate) {
    const { user } = useAuth();

    return useQuery({
        queryKey: ['agenda', user?.id, startDate, endDate],
        queryFn: async () => {
            let query = supabase
                .from('events')
                .select('*')
                .order('start_date');

            if (startDate) {
                query = query.gte('start_date', startDate);
            }
            if (endDate) {
                query = query.lte('start_date', endDate);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        },
        enabled: !!user,
        staleTime: 2 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
    });
}

// Prochain événement agenda (pour le dashboard KPI)
export function useNextEvent() {
    const { user } = useAuth();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    return useQuery({
        queryKey: ['nextEvent', user?.id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('events')
                .select('id, title, date, time, type')
                .eq('user_id', user.id)
                .gte('date', today)
                .order('date', { ascending: true })
                .limit(1);
            if (error) throw error;
            return data?.length > 0 ? data[0] : null;
        },
        enabled: !!user,
        staleTime: 2 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
    });
}

// Compteurs d'actions en attente (pour badges de navigation)
// Dérivé du cache useQuotes — pas de requête supplémentaire
export function usePendingCounts() {
    const { data: quotes = [] } = useQuotes();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const overdueQuotes = quotes.filter(q =>
        q.status === 'sent' && new Date(q.date || q.created_at) < sevenDaysAgo
    ).length;

    const pendingInvoices = quotes.filter(q => q.status === 'billed').length;

    const signedNotBilled = quotes.filter(q => q.status === 'accepted').length;

    const total = overdueQuotes + pendingInvoices + signedNotBilled;

    return { overdueQuotes, pendingInvoices, signedNotBilled, total };
}

// Hook pour invalider le cache après une modification
export function useInvalidateCache() {
    const queryClient = useQueryClient();

    return {
        invalidateClients: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
        invalidateQuotes: () => {
            queryClient.invalidateQueries({ queryKey: ['quotes'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        },
        invalidateQuote: (id) => queryClient.invalidateQueries({ queryKey: ['quote', id] }),
        invalidatePriceLibrary: () => queryClient.invalidateQueries({ queryKey: ['priceLibrary'] }),
        invalidateProfile: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
        invalidateInventory: () => queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        invalidateAgenda: () => queryClient.invalidateQueries({ queryKey: ['agenda'] }),
        invalidateAll: () => queryClient.invalidateQueries(),
        invalidateInterventionReports: () => queryClient.invalidateQueries({ queryKey: ['interventionReports'] }),
        invalidateInterventionReport: (id) => queryClient.invalidateQueries({ queryKey: ['interventionReport', id] }),
    };
}

// Mutation pour sauvegarder un devis
export function useSaveQuote() {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    return useMutation({
        mutationFn: async ({ id, data, isEditing }) => {
            if (isEditing) {
                const { data: result, error } = await supabase
                    .from('quotes')
                    .update({ ...data, updated_at: new Date() })
                    .eq('id', id)
                    .select()
                    .single();
                if (error) throw error;
                return result;
            } else {
                const { data: result, error } = await supabase
                    .from('quotes')
                    .insert([{ ...data, user_id: user.id }])
                    .select()
                    .single();
                if (error) throw error;
                return result;
            }
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['quotes'] });
            queryClient.invalidateQueries({ queryKey: ['quote', data.id] });
        },
    });
}

// Cache des données du Dashboard (statistiques)
export function useDashboardData() {
    const { user } = useAuth();

    return useQuery({
        queryKey: ['dashboard', user?.id],
        queryFn: withOfflineCache(`dashboard_${user?.id}`, async () => {
            // Récupérer les devis avec les données clients
            const { data: quotes, error: quotesError } = await supabase
                .from('quotes')
                .select('total_ht, total_ttc, date, created_at, status, id, client_id, clients(name), type, parent_id, signed_at, items, title');
            if (quotesError) throw quotesError;

            // Compter les clients (hors client test)
            const { count: clientCount } = await supabase
                .from('clients')
                .select('*', { count: 'exact', head: true })
                .not('name', 'like', '⚗️%');

            // Compter les devis en attente (hors client test)
            const { count: pendingQuotesCount } = await supabase
                .from('quotes')
                .select('*, clients!inner(name)', { count: 'exact', head: true })
                .in('status', ['draft', 'sent'])
                .not('clients.name', 'like', '⚗️%');

            // Activité récente (hors client test)
            const { data: rQuotes } = await supabase
                .from('quotes')
                .select('*, clients!inner(name)')
                .not('clients.name', 'like', '⚗️%')
                .order('created_at', { ascending: false })
                .limit(5);

            const { data: rSignatures } = await supabase
                .from('quotes')
                .select('*, clients!inner(name)')
                .not('clients.name', 'like', '⚗️%')
                .not('signed_at', 'is', null)
                .order('signed_at', { ascending: false })
                .limit(5);

            const { data: rClients } = await supabase
                .from('clients')
                .select('*')
                .not('name', 'like', '⚗️%')
                .order('created_at', { ascending: false })
                .limit(5);

            const activities = [
                ...(rQuotes || []).map(q => ({ type: 'quote', date: q.created_at, description: `Devis créé pour ${q.clients?.name || 'Client inconnu'}`, amount: q.total_ttc })),
                ...(rSignatures || []).map(q => ({ type: 'signature', date: q.signed_at, description: `Devis signé par ${q.clients?.name || 'Client inconnu'}`, amount: q.total_ttc })),
                ...(rClients || []).map(c => ({ type: 'client', date: c.created_at, description: `Nouveau client : ${c.name}`, amount: null }))
            ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

            return {
                allQuotes: quotes || [],
                clientCount: clientCount || 0,
                pendingQuotesCount: pendingQuotesCount || 0,
                recentActivity: activities
            };
        }),
        enabled: !!user,
        staleTime: 2 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
    });
}

// Cache des rapports d'intervention
export function useInterventionReports() {
    const { user } = useAuth();

    return useQuery({
        queryKey: ['interventionReports', user?.id],
        queryFn: withOfflineCache(`interventionReports_${user?.id}`, async () => {
            const { data, error } = await supabase
                .from('intervention_reports')
                .select('*')
                .order('date', { ascending: false });
            if (error) throw error;
            return data || [];
        }),
        enabled: !!user,
        staleTime: 2 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
    });
}

// Cache d'un rapport d'intervention spécifique
export function useInterventionReport(id) {
    const { user } = useAuth();

    return useQuery({
        queryKey: ['interventionReport', id],
        queryFn: withOfflineCache(`interventionReport_${id}`, async () => {
            const { data, error } = await supabase
                .from('intervention_reports')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            return data;
        }),
        enabled: !!user && !!id && id !== 'new',
        staleTime: 1 * 60 * 1000,
    });
}

// Mutation pour sauvegarder un client
export function useSaveClient() {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    return useMutation({
        mutationFn: async ({ id, data, isEditing }) => {
            if (isEditing) {
                const { data: result, error } = await supabase
                    .from('clients')
                    .update({ ...data, updated_at: new Date() })
                    .eq('id', id)
                    .select()
                    .single();
                if (error) throw error;
                return result;
            } else {
                const { data: result, error } = await supabase
                    .from('clients')
                    .insert([{ ...data, user_id: user.id }])
                    .select()
                    .single();
                if (error) throw error;
                return result;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['clients'] });
        },
    });
}
