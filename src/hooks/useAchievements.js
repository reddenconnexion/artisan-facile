import { useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useClients, useQuotes } from './useDataCache';
import { ACHIEVEMENTS, computeAchievements } from '../utils/achievements';

// Un devis est considéré « signé » dès qu'il est accepté, facturé, payé ou
// signé électroniquement — même logique que le reste du tableau de bord.
const isSigned = (q) =>
    q.status === 'accepted' || q.status === 'billed' || q.status === 'paid' || !!q.signed_at;

/**
 * Jalons de maîtrise.
 * @param {{ notify?: boolean }} opts  Si notify, déclenche un toast pour chaque
 *   jalon nouvellement débloqué (à n'activer qu'à UN seul endroit, ex. Layout,
 *   pour éviter les doublons). Le Profil l'appelle sans notify (affichage seul).
 */
export function useAchievements({ notify = false } = {}) {
    const { user } = useAuth();
    const { data: clients = [], isLoading: clientsLoading } = useClients();
    const { data: quotes = [], isLoading: quotesLoading } = useQuotes();

    const stats = useMemo(() => ({
        clients: clients.length,
        signed: quotes.filter(isSigned).length,
        paid: quotes.filter(q => q.status === 'paid').length,
    }), [clients, quotes]);

    const achievements = useMemo(() => computeAchievements(stats), [stats]);

    const storageKey = user?.id ? `achievements_unlocked_${user.id}` : null;
    const ready = !clientsLoading && !quotesLoading;

    useEffect(() => {
        if (!notify || !storageKey || !ready) return;

        const unlockedIds = achievements.filter(a => a.unlocked).map(a => a.id);

        // Premier passage pour cet utilisateur : on amorce le stock en silence
        // avec les jalons déjà acquis, pour ne pas déclencher une avalanche de
        // toasts sur des étapes franchies avant l'arrivée de la fonctionnalité.
        if (localStorage.getItem(storageKey) === null) {
            localStorage.setItem(storageKey, JSON.stringify(unlockedIds));
            return;
        }

        let seen;
        try { seen = new Set(JSON.parse(localStorage.getItem(storageKey)) || []); }
        catch { seen = new Set(); }

        const fresh = unlockedIds.filter(id => !seen.has(id));
        if (fresh.length === 0) return;

        fresh.forEach(id => {
            const a = ACHIEVEMENTS.find(x => x.id === id);
            if (a) toast.success(`Jalon débloqué ${a.emoji}`, { description: a.label });
        });
        localStorage.setItem(storageKey, JSON.stringify([...seen, ...fresh]));
    }, [notify, storageKey, ready, achievements]);

    return { achievements, stats, ready };
}
