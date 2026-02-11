import React from 'react';
import { WifiOff, RefreshCw, CheckCircle } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { getLastSyncTime } from '../utils/offlineCache';

function formatSyncTime(timestamp) {
    if (!timestamp) return null;
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "à l'instant";
    if (minutes < 60) return `il y a ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `il y a ${hours}h`;
    const days = Math.floor(hours / 24);
    return `il y a ${days}j`;
}

const OfflineBanner = () => {
    const isOnline = useNetworkStatus();
    const [justReconnected, setJustReconnected] = React.useState(false);
    const wasOffline = React.useRef(false);

    React.useEffect(() => {
        if (!isOnline) {
            wasOffline.current = true;
        } else if (wasOffline.current) {
            wasOffline.current = false;
            setJustReconnected(true);
            const timer = setTimeout(() => setJustReconnected(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [isOnline]);

    if (justReconnected) {
        return (
            <div className="bg-green-500 text-white px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2 fixed top-0 left-0 right-0 z-[60] shadow-md animate-in slide-in-from-top duration-300">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span>Connexion rétablie - Synchronisation en cours...</span>
            </div>
        );
    }

    if (isOnline) return null;

    const lastSync = getLastSyncTime();
    const syncLabel = formatSyncTime(lastSync);

    return (
        <div className="bg-amber-500 text-white px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-3 fixed top-0 left-0 right-0 z-[60] shadow-md">
            <WifiOff className="w-4 h-4 flex-shrink-0" />
            <span>
                Mode hors-ligne
                {syncLabel && <span className="opacity-90"> — Dernière sync {syncLabel}</span>}
            </span>
            <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-1 bg-amber-600 hover:bg-amber-700 px-2 py-1 rounded text-xs transition-colors"
            >
                <RefreshCw className="w-3 h-3" />
                Réessayer
            </button>
        </div>
    );
};

export default OfflineBanner;
