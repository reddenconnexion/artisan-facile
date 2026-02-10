import { useEffect, useRef } from 'react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useInvalidateCache } from './useDataCache';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

/**
 * Hook global : écoute en temps réel les signatures de devis via Supabase Realtime.
 * Affiche un toast riche + notification navigateur quand un client signe un devis.
 */
export function useSignatureNotifications() {
    const { user } = useAuth();
    const { invalidateQuotes } = useInvalidateCache();
    const navigate = useNavigate();
    const processedIds = useRef(new Set());

    useEffect(() => {
        if (!user?.id) return;

        const channel = supabase
            .channel('signature-notifications')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'quotes',
                    filter: `user_id=eq.${user.id}`,
                },
                async (payload) => {
                    const newRecord = payload.new;
                    const oldRecord = payload.old;

                    // Détecter une nouvelle signature : signed_at vient d'apparaître
                    if (!newRecord.signed_at || oldRecord.signed_at) return;
                    if (processedIds.current.has(newRecord.id)) return;
                    processedIds.current.add(newRecord.id);

                    // Récupérer les infos client pour le message
                    let clientName = 'un client';
                    let quoteTitle = newRecord.title || '';
                    try {
                        if (newRecord.client_id) {
                            const { data: client } = await supabase
                                .from('clients')
                                .select('name')
                                .eq('id', newRecord.client_id)
                                .single();
                            if (client?.name) clientName = client.name;
                        }
                    } catch { /* ignore */ }

                    const amount = newRecord.total_ttc
                        ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(newRecord.total_ttc)
                        : '';

                    const message = quoteTitle
                        ? `${clientName} a signé "${quoteTitle}"${amount ? ` - ${amount}` : ''}`
                        : `${clientName} a signé un devis${amount ? ` de ${amount}` : ''}`;

                    // Toast in-app avec action
                    toast.success(message, {
                        duration: 15000,
                        action: {
                            label: 'Voir le devis',
                            onClick: () => navigate(`/app/devis/${newRecord.id}`),
                        },
                    });

                    // Notification navigateur
                    if ('Notification' in window && Notification.permission === 'granted') {
                        new Notification('Devis signé !', {
                            body: message,
                            icon: '/pwa-192x192.png',
                            tag: `signature-${newRecord.id}`,
                        });
                    }

                    // Rafraîchir les données
                    invalidateQuotes();
                }
            )
            .subscribe();

        // Demander la permission notifications au premier chargement
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user?.id]);
}
