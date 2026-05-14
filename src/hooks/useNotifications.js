import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';

const LAST_SEEN_KEY = 'notifications_last_seen';

export function getNotifLastSeen() {
    try {
        const s = localStorage.getItem(LAST_SEEN_KEY);
        return s ? new Date(s) : null;
    } catch {
        return null;
    }
}

export function markNotificationsRead() {
    localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
}

export function useNotifications() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    // Invalidation en temps réel dès qu'un message ou un log arrive
    useEffect(() => {
        if (!user?.id) return;
        const ch = supabase
            .channel(`notif_feed_${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'portal_messages',
                filter: `user_id=eq.${user.id}`,
            }, () => queryClient.invalidateQueries({ queryKey: ['notifications', user.id] }))
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'audit_logs',
                filter: `user_id=eq.${user.id}`,
            }, () => queryClient.invalidateQueries({ queryKey: ['notifications', user.id] }))
            .subscribe();
        return () => supabase.removeChannel(ch);
    }, [user?.id, queryClient]);

    return useQuery({
        queryKey: ['notifications', user?.id],
        queryFn: async () => {
            if (!user) return { items: [], unreadCount: 0 };

            const [msgRes, logRes] = await Promise.all([
                supabase
                    .from('portal_messages')
                    .select('id, content, sender_name, created_at, read_at, client_id')
                    .eq('user_id', user.id)
                    .eq('sender_type', 'client')
                    .order('created_at', { ascending: false })
                    .limit(10),
                supabase
                    .from('audit_logs')
                    .select('id, action, entity_id, entity_label, details, created_at')
                    .eq('user_id', user.id)
                    .in('action', ['quote.signed', 'invoice.paid'])
                    .order('created_at', { ascending: false })
                    .limit(10),
            ]);

            const messages = msgRes.data || [];
            const logs = logRes.data || [];
            const lastSeen = getNotifLastSeen();

            const msgItems = messages.map(m => ({
                id: `msg_${m.id}`,
                type: 'message',
                title: `Message de ${m.sender_name || 'un client'}`,
                description: m.content.length > 80 ? `${m.content.slice(0, 77)}…` : m.content,
                timestamp: m.created_at,
                href: '/app/portal-messages',
                unread: !m.read_at,
            }));

            const logItems = logs.map(l => {
                const isSigned = l.action === 'quote.signed';
                const amount = l.details?.total_ttc;
                const amountStr = amount != null
                    ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount)
                    : '';
                return {
                    id: `log_${l.id}`,
                    type: isSigned ? 'signature' : 'payment',
                    title: isSigned
                        ? `Devis signé — ${l.entity_label || 'document'}`
                        : `Facture payée — ${l.entity_label || 'document'}`,
                    description: amountStr,
                    timestamp: l.created_at,
                    href: l.entity_id ? `/app/devis/${l.entity_id}` : '/app/devis',
                    unread: lastSeen ? new Date(l.created_at) > lastSeen : true,
                };
            });

            const items = [...msgItems, ...logItems]
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, 20);

            return { items, unreadCount: items.filter(i => i.unread).length };
        },
        enabled: !!user,
        staleTime: 60_000,
        refetchOnWindowFocus: true,
    });
}
