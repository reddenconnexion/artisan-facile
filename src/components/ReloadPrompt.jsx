import React from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from 'sonner'

// Sans vérification périodique, le service worker ne cherche une nouvelle
// version qu'au chargement initial de la page : les utilisateurs qui gardent
// l'app ouverte (PWA installée, onglet épinglé) restent bloqués sur une
// version en cache pendant des jours. On vérifie donc au retour de l'app au
// premier plan (throttlé) et toutes les heures.
const SW_CHECK_INTERVAL_MS = 60 * 60 * 1000
const SW_CHECK_MIN_GAP_MS = 5 * 60 * 1000

function ReloadPrompt() {
    const {
        offlineReady: [offlineReady, setOfflineReady],
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegisteredSW(swUrl, r) {
            console.log('SW Registered: ' + swUrl)
            if (!r) return

            let lastCheck = Date.now()
            const checkForUpdate = async () => {
                if (r.installing || !navigator.onLine) return
                lastCheck = Date.now()
                try {
                    // Vérifie que le sw.js est joignable (réseau captif, serveur
                    // down…) avant de demander la mise à jour, comme recommandé
                    // par la doc vite-plugin-pwa.
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
            // Retour au premier plan (cas typique : PWA mobile rouverte depuis
            // les apps récentes) — throttlé pour ne pas vérifier à chaque
            // changement d'onglet.
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

    const close = () => {
        setOfflineReady(false)
        setNeedRefresh(false)
    }

    React.useEffect(() => {
        if (offlineReady) {
            toast.success("L'application est prête à être utilisée hors ligne.")
            setOfflineReady(false)
        }
    }, [offlineReady])

    React.useEffect(() => {
        if (needRefresh) {
            toast.info(
                <div className="flex flex-col gap-2">
                    <span>Une nouvelle version est disponible.</span>
                    <button
                        onClick={() => updateServiceWorker(true)}
                        className="bg-blue-600 text-white px-3 py-1 rounded text-sm font-medium hover:bg-blue-700"
                    >
                        Mettre à jour
                    </button>
                </div>,
                { duration: Infinity, onDismiss: close }
            )
        }
    }, [needRefresh])

    return null
}

export default ReloadPrompt
