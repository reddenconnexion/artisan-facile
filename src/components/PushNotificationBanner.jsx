import React, { useState } from 'react';
import { Bell, X, Smartphone } from 'lucide-react';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isInStandaloneMode = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

const PushNotificationBanner = () => {
    const { user } = useAuth();
    const dismissKey = `push_banner_dismissed_${user?.id}`;
    const [dismissed, setDismissed] = useState(() => localStorage.getItem(dismissKey) === '1');
    const [loading, setLoading] = useState(false);
    const { isSupported, isSubscribed, subscribe } = usePushNotifications();

    // Don't show if already subscribed, not supported, or dismissed
    if (dismissed || isSubscribed) return null;

    // iOS not in standalone = PWA not installed yet
    const iosNotInstalled = isIOS() && !isInStandaloneMode();

    const handleDismiss = () => {
        localStorage.setItem(dismissKey, '1');
        setDismissed(true);
    };

    const handleEnable = async () => {
        setLoading(true);
        const result = await subscribe();
        setLoading(false);
        if (result.success) {
            toast.success('Notifications activées ! Vous serez alerté dès qu\'un client signe.');
            handleDismiss(); // hide banner after success
        } else {
            toast.error(result.error || 'Impossible d\'activer les notifications');
        }
    };

    if (iosNotInstalled) {
        return (
            <div className="mb-6 flex items-start gap-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3">
                <Smartphone className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                        Installez l'app pour activer les notifications
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                        Sur iPhone : appuyez sur <strong>Partager</strong> → <strong>"Sur l'écran d'accueil"</strong>, puis revenez ici pour activer les alertes de signature.
                    </p>
                </div>
                <button onClick={handleDismiss} className="p-1 text-blue-400 hover:text-blue-600 rounded flex-shrink-0" title="Masquer">
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
        );
    }

    if (!isSupported) return null;

    return (
        <div className="mb-6 flex items-center gap-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3">
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center flex-shrink-0">
                <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                    Soyez alerté dès qu'un client signe
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                    Activez les notifications push pour recevoir une alerte instantanée, même application fermée.
                </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
                <button
                    onClick={handleEnable}
                    disabled={loading}
                    className="text-xs font-semibold px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                    {loading ? 'Activation...' : 'Activer'}
                </button>
                <button onClick={handleDismiss} className="p-1 text-blue-400 hover:text-blue-600 rounded" title="Masquer">
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
};

export default PushNotificationBanner;
