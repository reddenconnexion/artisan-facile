import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUserProfile, useClients, useQuotes, usePriceLibrary } from './useDataCache';

const STORAGE_PREFIX = 'onboarding_dismissed_';

/**
 * Suivi de la progression d'onboarding du nouvel utilisateur.
 * Calcule l'état de complétion des 5 étapes essentielles depuis les caches
 * React Query (pas de requête supplémentaire). La checklist est masquée
 * automatiquement quand toutes les étapes sont validées ou que l'utilisateur
 * la masque manuellement (persisté en localStorage par user_id).
 */
export function useOnboardingStatus() {
    const { user } = useAuth();
    const { data: profile }       = useUserProfile();
    const { data: clients = [] }  = useClients();
    const { data: quotes = [] }   = useQuotes();
    const { data: library = [] }  = usePriceLibrary();

    const dismissKey = `${STORAGE_PREFIX}${user?.id || 'anon'}`;
    const [dismissed, setDismissed] = useState(() => {
        try { return localStorage.getItem(dismissKey) === '1'; }
        catch { return false; }
    });

    // Détection PWA installée (display-mode standalone, ou navigator.standalone iOS)
    const [isInstalled, setIsInstalled] = useState(false);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const standalone = window.matchMedia?.('(display-mode: standalone)').matches
            || window.navigator?.standalone === true;
        setIsInstalled(!!standalone);
    }, []);

    const steps = useMemo(() => {
        const profileComplete = !!profile?.company_name && !!profile?.siret;
        const hasClient       = clients.length > 0;
        const hasQuote        = quotes.length > 0;
        const hasLibrary      = library.length > 0;

        return [
            {
                id: 'profile',
                label: 'Compléter votre profil',
                description: 'Nom d\'entreprise et SIRET — obligatoires sur les devis',
                done: profileComplete,
                action: '/app/settings',
            },
            {
                id: 'client',
                label: 'Ajouter votre premier client',
                description: 'Coordonnées et adresse pour pouvoir lui faire un devis',
                done: hasClient,
                action: '/app/clients/new',
            },
            {
                id: 'quote',
                label: 'Créer votre premier devis',
                description: 'Le cœur de votre activité — moins de 2 minutes avec l\'IA',
                done: hasQuote,
                action: '/app/devis/new',
            },
            {
                id: 'library',
                label: 'Configurer la bibliothèque de prix',
                description: 'Vos prestations et matériaux récurrents pour gagner du temps',
                done: hasLibrary,
                action: '/app/library',
            },
            {
                id: 'install',
                label: 'Installer l\'app sur votre téléphone',
                description: 'Accès en 1 clic, mode hors-ligne, notifications push',
                done: isInstalled,
                action: null, // Pas d'action programmable — l'install dépend du navigateur
                hint: isInstalled ? null : 'Menu du navigateur → "Ajouter à l\'écran d\'accueil"',
            },
        ];
    }, [profile, clients.length, quotes.length, library.length, isInstalled]);

    const completedCount = steps.filter(s => s.done).length;
    const totalCount     = steps.length;
    const isComplete     = completedCount === totalCount;

    const dismiss = useCallback(() => {
        try { localStorage.setItem(dismissKey, '1'); }
        catch { /* quota exceeded, ignore */ }
        setDismissed(true);
    }, [dismissKey]);

    const shouldShow = !dismissed && !isComplete;

    return { steps, completedCount, totalCount, isComplete, shouldShow, dismiss };
}
