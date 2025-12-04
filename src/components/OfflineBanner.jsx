import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

const OfflineBanner = () => {
    const isOnline = useNetworkStatus();

    if (isOnline) return null;

    return (
        <div className="bg-amber-500 text-white px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-3 fixed top-0 left-0 right-0 z-[60] shadow-md">
            <WifiOff className="w-4 h-4 flex-shrink-0" />
            <span>Mode hors-ligne - Vos données en cache sont disponibles</span>
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
