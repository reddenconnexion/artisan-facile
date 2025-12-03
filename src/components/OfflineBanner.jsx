import React from 'react';
import { WifiOff } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

const OfflineBanner = () => {
    const isOnline = useNetworkStatus();

    if (isOnline) return null;

    return (
        <div className="bg-yellow-500 text-white px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2 fixed top-0 left-0 right-0 z-[60]">
            <WifiOff className="w-4 h-4" />
            Mode hors-ligne activé. Certaines fonctionnalités peuvent être limitées.
        </div>
    );
};

export default OfflineBanner;
