import React from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from 'sonner'
import { RefreshCw, X } from 'lucide-react'

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

    // Bandeau visible (pas un toast discret) : une nouvelle version est en
    // attente et ne s'activera qu'au clic sur « Recharger ». C'est ce qui
    // débloque les onglets/apps gardés ouverts (desktop, PWA macOS) qui, en
    // mode auto-update silencieux, restaient sur l'ancien cache.
    if (!needRefresh) return null

    return (
        <div className="fixed inset-x-0 bottom-0 z-[9999] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto flex max-w-md items-center gap-3 rounded-xl bg-blue-600 px-4 py-3 text-white shadow-lg ring-1 ring-black/5">
                <RefreshCw className="h-5 w-5 flex-shrink-0" />
                <p className="flex-1 text-sm font-medium leading-snug">
                    Une nouvelle version est disponible.
                </p>
                <button
                    type="button"
                    onClick={() => updateServiceWorker(true)}
                    className="flex-shrink-0 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50"
                >
                    Recharger
                </button>
                <button
                    type="button"
                    onClick={close}
                    aria-label="Ignorer"
                    className="flex-shrink-0 text-white/80 transition-colors hover:text-white"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </div>
    )
}

export default ReloadPrompt
