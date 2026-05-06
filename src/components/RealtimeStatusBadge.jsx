import React from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Small inline indicator shown when a Realtime channel can't connect.
 * Renders nothing in the normal "subscribed" state — it only appears when
 * something is actually wrong, so it doesn't add noise to the UI.
 */
const RealtimeStatusBadge = ({ status, className = '' }) => {
    if (status !== 'error' && status !== 'closed') return null;

    return (
        <span
            className={`inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-full px-2 py-0.5 ${className}`}
            title="Les mises à jour en temps réel ne sont pas disponibles. Rafraîchissez la page pour voir les derniers changements."
        >
            <WifiOff className="w-3 h-3" />
            Hors temps réel
        </span>
    );
};

export default RealtimeStatusBadge;
