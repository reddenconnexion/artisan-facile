import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

function getCurrentPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission; // 'default' | 'granted' | 'denied'
}

export function usePushNotifications() {
    const { user } = useAuth();
    const [isSupported, setIsSupported]   = useState(false);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isLoading, setIsLoading]       = useState(false);
    const [permission, setPermission]     = useState(() => getCurrentPermission());

    useEffect(() => {
        setIsSupported(
            'serviceWorker' in navigator &&
            'PushManager' in window &&
            !!VAPID_PUBLIC_KEY,
        );
    }, []);

    useEffect(() => {
        if (!isSupported || !user?.id) return;
        navigator.serviceWorker.ready.then((reg) =>
            reg.pushManager.getSubscription().then((sub) => setIsSubscribed(!!sub)),
        );
    }, [isSupported, user?.id]);

    // Resync permission state on focus (user might change browser settings)
    useEffect(() => {
        const onFocus = () => setPermission(getCurrentPermission());
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, []);

    const subscribe = useCallback(async () => {
        if (!user?.id) return { success: false, error: 'Non connecté' };
        setIsLoading(true);
        try {
            const result = await Notification.requestPermission();
            setPermission(result);
            if (result !== 'granted') {
                return {
                    success: false,
                    error: result === 'denied'
                        ? 'Vous avez bloqué les notifications dans votre navigateur'
                        : 'Permission refusée',
                };
            }

            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });

            const json = sub.toJSON();
            const { error } = await supabase.from('push_subscriptions').upsert({
                user_id:  user.id,
                endpoint: json.endpoint,
                p256dh:   json.keys.p256dh,
                auth:     json.keys.auth,
            }, { onConflict: 'user_id,endpoint' });

            if (error) throw error;
            setIsSubscribed(true);
            return { success: true };
        } catch (err) {
            console.error('Push subscribe error:', err);
            return { success: false, error: err.message };
        } finally {
            setIsLoading(false);
        }
    }, [user?.id]);

    const unsubscribe = useCallback(async () => {
        setIsLoading(true);
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
                await sub.unsubscribe();
                await supabase.from('push_subscriptions')
                    .delete()
                    .eq('user_id', user.id)
                    .eq('endpoint', sub.endpoint);
            }
            setIsSubscribed(false);
        } catch (err) {
            console.error('Push unsubscribe error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [user?.id]);

    const sendTestNotification = useCallback(async () => {
        if (!isSubscribed) return { success: false, error: 'Non abonné' };
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return { success: false, error: 'Session expirée' };

            const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-test-push`;
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type':  'application/json',
                },
                body: JSON.stringify({}),
            });
            const result = await res.json();
            if (!res.ok || !result.success) {
                return { success: false, error: result.error || 'Échec de l\'envoi' };
            }
            return { success: true, delivered: result.delivered };
        } catch (err) {
            console.error('Test push error:', err);
            return { success: false, error: err.message };
        }
    }, [isSubscribed]);

    return {
        isSupported,
        isSubscribed,
        isLoading,
        permission,
        subscribe,
        unsubscribe,
        sendTestNotification,
    };
}
