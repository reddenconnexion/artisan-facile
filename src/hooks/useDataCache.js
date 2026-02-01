import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';

/**
 * Hooks de cache pour les données principales
 * Utilise React Query pour :
 * - Éviter les rechargements inutiles
 * - Garder les données en mémoire entre les pages
 * - Synchroniser automatiquement après modifications
 */

// Cache des clients
export function useClients() {
    const { user } = useAuth();

    return useQuery({
        queryKey: ['clients', user?.id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('clients')
                .select('*')
                .order('name');
            if (error) throw error;
            return data || [];
        },
        enabled: !!user,
        staleTime: 5 * 60 * 1000, // 5 minutes avant de considérer les données périmées
        gcTime: 30 * 60 * 1000, // 30 minutes en cache
    });
}

// Cache des devis/factures
export function useQuotes(filters = {}) {
    const { user } = useAuth();

    return useQuery({
        queryKey: ['quotes', user?.id, filters],
        queryFn: async () => {
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
        },
        enabled: !!user,
        staleTime: 2 * 60 * 1000, // 2 minutes
        gcTime: 15 * 60 * 1000, // 15 minutes
    });
}

// Cache d'un devis spécifique
export function useQuote(id) {
    const { user } = useAuth();

    return useQuery({
        queryKey: ['quote', id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('quotes')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            return data;
        },
        enabled: !!user && !!id && id !== 'new',
        staleTime: 1 * 60 * 1000, // 1 minute
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
        queryFn: async () => {
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
        },
        enabled: !!user,
        staleTime: 10 * 60 * 1000, // 10 minutes
        gcTime: 60 * 60 * 1000, // 1 heure
    });
}

// Cache de l'inventaire
export function useInventory() {
    const { user } = useAuth();

    return useQuery({
        queryKey: ['inventory', user?.id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('inventory')
                .select('*')
                .order('name');
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

// Hook pour invalider le cache après une modification
export function useInvalidateCache() {
    const queryClient = useQueryClient();

    return {
        invalidateClients: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
        invalidateQuotes: () => queryClient.invalidateQueries({ queryKey: ['quotes'] }),
        invalidateQuote: (id) => queryClient.invalidateQueries({ queryKey: ['quote', id] }),
        invalidatePriceLibrary: () => queryClient.invalidateQueries({ queryKey: ['priceLibrary'] }),
        invalidateProfile: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
        invalidateInventory: () => queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        invalidateAgenda: () => queryClient.invalidateQueries({ queryKey: ['agenda'] }),
        invalidateAll: () => queryClient.invalidateQueries(),
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
        queryFn: async () => {
            // Récupérer les devis avec les données clients
            const { data: quotes, error: quotesError } = await supabase
                .from('quotes')
                .select('total_ttc, date, created_at, status, id, clients(name), type, parent_id, signed_at, items');
            if (quotesError) throw quotesError;

            // Compter les clients
            const { count: clientCount } = await supabase
                .from('clients')
                .select('*', { count: 'exact', head: true });

            // Compter les devis en attente
            const { count: pendingQuotesCount } = await supabase
                .from('quotes')
                .select('*', { count: 'exact', head: true })
                .in('status', ['draft', 'sent']);

            // Activité récente
            const { data: rQuotes } = await supabase
                .from('quotes')
                .select('*, clients(name)')
                .order('created_at', { ascending: false })
                .limit(5);

            const { data: rSignatures } = await supabase
                .from('quotes')
                .select('*, clients(name)')
                .not('signed_at', 'is', null)
                .order('signed_at', { ascending: false })
                .limit(5);

            const { data: rClients } = await supabase
                .from('clients')
                .select('*')
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
        },
        enabled: !!user,
        staleTime: 2 * 60 * 1000, // 2 minutes
        gcTime: 10 * 60 * 1000, // 10 minutes
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
