import React, { createContext, useContext } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

// Contexte PWA partagé : un SEUL enregistrement du service worker, dont l'état
// (needRefresh / offlineReady) et l'action de mise à jour sont exposés à toute
// l'app. Permet d'afficher le bandeau ET le bouton « Mettre à jour » du profil
// uniquement quand une nouvelle version est réellement en attente.
//
// Sans vérification périodique, le service worker ne cherche une nouvelle version
// qu'au chargement initial : les utilisateurs qui gardent l'app ouverte (PWA
// installée, onglet épinglé) restent bloqués sur une version en cache. On vérifie
// donc au retour au premier plan (throttlé) et toutes les heures.
const SW_CHECK_INTERVAL_MS = 60 * 60 * 1000
const SW_CHECK_MIN_GAP_MS = 5 * 60 * 1000

const PwaUpdateContext = createContext(null)

export function PwaUpdateProvider({ children }) {
    const {
        offlineReady: [offlineReady, setOfflineReady],
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegisteredSW(swUrl, r) {
            if (!r) return
            let lastCheck = Date.now()
            const checkForUpdate = async () => {
                if (r.installing || !navigator.onLine) return
                lastCheck = Date.now()
                try {
                    // Vérifie que le sw.js est joignable avant de demander la mise
                    // à jour (réseau captif, serveur down…), comme recommandé par
                    // la doc vite-plugin-pwa.
                    const resp = await fetch(swUrl, {
                        cache: 'no-store',
                        headers: { 'cache-control': 'no-cache' },
                    })
                    if (resp.status === 200) await r.update()
                } catch {
                    // Hors ligne ou réseau instable : on réessaiera au prochain cycle
                }
            }
            setInterval(checkForUpdate, SW_CHECK_INTERVAL_MS)
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && Date.now() - lastCheck > SW_CHECK_MIN_GAP_MS) {
                    checkForUpdate()
                }
            })
        },
        onRegisterError(error) {
            console.log('SW registration error', error)
        },
    })

    // Applique la mise à jour de façon fiable. updateServiceWorker(true) n'active
    // le nouveau worker et ne recharge que s'il existe un worker « en attente » au
    // moment du clic ; on ajoute un filet de sécurité qui force le rechargement.
    const applyUpdate = React.useCallback(async () => {
        try {
            await updateServiceWorker(true)
        } catch {
            // ignore : on force le rechargement quoi qu'il arrive
        }
        setTimeout(() => window.location.reload(), 1500)
    }, [updateServiceWorker])

    const value = { offlineReady, setOfflineReady, needRefresh, setNeedRefresh, applyUpdate }
    return <PwaUpdateContext.Provider value={value}>{children}</PwaUpdateContext.Provider>
}

// Retourne un fallback inoffensif si le provider n'est pas monté (ex. rendu hors
// de l'app principale), pour ne jamais casser un composant consommateur.
export function usePwaUpdate() {
    return useContext(PwaUpdateContext) || {
        offlineReady: false,
        needRefresh: false,
        setOfflineReady: () => {},
        setNeedRefresh: () => {},
        applyUpdate: () => window.location.reload(),
    }
}
