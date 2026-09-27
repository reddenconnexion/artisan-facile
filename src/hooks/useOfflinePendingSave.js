import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useNetworkStatus } from './useNetworkStatus';

/**
 * Formulaire terrain saisi sans réseau : retient qu'un enregistrement est en
 * attente et, dès que le réseau revient, propose de l'enregistrer d'un clic.
 *
 * const { isOnline, markPending, clearPending } =
 *     useOfflinePendingSave({ label: 'Le rapport', onSave: () => handleSave() });
 */
export function useOfflinePendingSave({ label, onSave }) {
    const isOnline = useNetworkStatus();
    const pendingRef = useRef(false);
    const onSaveRef = useRef(onSave);

    useEffect(() => {
        onSaveRef.current = onSave;
    }, [onSave]);

    const markPending = useCallback(() => { pendingRef.current = true; }, []);
    const clearPending = useCallback(() => { pendingRef.current = false; }, []);

    useEffect(() => {
        if (!isOnline || !pendingRef.current) return;
        pendingRef.current = false;
        toast(`Réseau rétabli — ${label.toLowerCase()} n'est pas encore enregistré`, {
            id: 'offline-pending-save',
            duration: 20000,
            action: { label: 'Enregistrer', onClick: () => onSaveRef.current?.() },
        });
    }, [isOnline, label]);

    return { isOnline, markPending, clearPending };
}
