import { useState, useEffect } from 'react';
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

export function usePushNotifications() {
    const { user } = useAuth();
    const [isSupported, setIsSupported] = useState(false);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        setIsSupported(
            'serviceWorker' in navigator &&
            'PushManager' in window &&
            !!VAPID_PUBLIC_KEY
        );
    }, []);

    useEffect(() => {
        if (!isSupported || !user?.id) return;
        navigator.serviceWorker.ready.then((reg) =>
            reg.pushManager.getSubscription().then((sub) => setIsSubscribed(!!sub))
        );
    }, [isSupported, user?.id]);

    const subscribe = async () => {
        if (!user?.id) return { success: false, error: 'Non connecté' };
        setIsLoading(true);
        try {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                return { success: false, error: 'Permission refusée' };
            }

            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });

            const json = sub.toJSON();
            const { error } = await supabase.from('push_subscriptions').upsert({
                user_id: user.id,
                endpoint: json.endpoint,
                p256dh: json.keys.p256dh,
                auth: json.keys.auth,
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
    };

    const unsubscribe = async () => {
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
    };

    return { isSupported, isSubscribed, isLoading, subscribe, unsubscribe };
}
