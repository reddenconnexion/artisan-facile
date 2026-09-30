import { useCallback, useEffect, useState } from 'react';
import { CloudOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { OUTBOX_EVENT, PHOTOS_SYNCED_EVENT, flushPhotoOutbox, pendingPhotos } from '../utils/photoOutbox';
import { loadAgendaEvents } from '../utils/agendaEvents';

const RETRY_MS = 60 * 1000;

/**
 * Travail en zone blanche, côté synchronisation :
 * - envoie les photos prises sans réseau dès que le réseau revient (et à
 *   l'ouverture de l'app, et toutes les minutes tant qu'il en reste) ;
 * - garde une copie fraîche de l'agenda sur le téléphone à chaque ouverture en
 *   ligne, pour que l'agenda du jour reste consultable sur le chantier ;
 * - affiche combien de photos attendent l'envoi.
 */
const OfflineSync = () => {
    const { user } = useAuth();
    const isOnline = useNetworkStatus();
    const [pending, setPending] = useState(0);
    const [syncing, setSyncing] = useState(false);

    const refreshCount = useCallback(async () => {
        try {
            setPending((await pendingPhotos()).length);
        } catch {
            setPending(0);
        }
    }, []);

    const sync = useCallback(async () => {
        if (!user || !navigator.onLine) return;
        setSyncing(true);
        try {
            const { sent, remaining, error } = await flushPhotoOutbox();
            if (sent > 0) {
                toast.success(`${sent} photo${sent > 1 ? 's' : ''} prise${sent > 1 ? 's' : ''} hors connexion envoyée${sent > 1 ? 's' : ''} dans la galerie`);
            }
            if (error && remaining > 0) {
                console.error('Photo outbox flush:', error);
                toast.error(`${remaining} photo${remaining > 1 ? 's' : ''} en attente n'${remaining > 1 ? 'ont' : 'a'} pas pu être envoyée${remaining > 1 ? 's' : ''} : ${error.message}`, { id: 'photo-outbox-error' });
            }
        } catch (err) {
            console.error('Photo outbox unavailable:', err);
        } finally {
            setSyncing(false);
            refreshCount();
        }
    }, [user, refreshCount]);

    useEffect(() => {
        const onChange = () => refreshCount();
        window.addEventListener(OUTBOX_EVENT, onChange);
        window.addEventListener(PHOTOS_SYNCED_EVENT, onChange);
        refreshCount();
        return () => {
            window.removeEventListener(OUTBOX_EVENT, onChange);
            window.removeEventListener(PHOTOS_SYNCED_EVENT, onChange);
        };
    }, [refreshCount]);

    // Ouverture de l'app et retour du réseau.
    useEffect(() => {
        if (!user || !isOnline) return;
        sync();
        loadAgendaEvents(user.id).catch(() => {});
    }, [user, isOnline, sync]);

    // Nouvel essai régulier tant que des photos attendent (ex. réseau revenu
    // sans que le navigateur ne le signale).
    useEffect(() => {
        if (!user || !isOnline || pending === 0) return;
        const t = setInterval(sync, RETRY_MS);
        return () => clearInterval(t);
    }, [user, isOnline, pending, sync]);

    if (pending === 0) return null;

    return (
        <div
            role="status"
            className="fixed bottom-24 left-4 z-50 flex items-center gap-2 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg md:bottom-4"
        >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudOff className="h-3.5 w-3.5" />}
            {pending} photo{pending > 1 ? 's' : ''} en attente d'envoi
        </div>
    );
};

export default OfflineSync;
