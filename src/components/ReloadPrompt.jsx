import React from 'react'
import { toast } from 'sonner'
import { RefreshCw, X } from 'lucide-react'
import { usePwaUpdate } from '../context/PwaUpdateContext'

// Bandeau « Nouvelle version disponible ». L'enregistrement du service worker et
// la détection des mises à jour vivent dans PwaUpdateContext (source unique,
// partagée avec le bouton du profil).
function ReloadPrompt() {
    const { offlineReady, setOfflineReady, needRefresh, setNeedRefresh, applyUpdate } = usePwaUpdate()

    const close = () => {
        setOfflineReady(false)
        setNeedRefresh(false)
    }

    React.useEffect(() => {
        if (offlineReady) {
            toast.success("L'application est prête à être utilisée hors ligne.")
            setOfflineReady(false)
        }
    }, [offlineReady, setOfflineReady])

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
                    onClick={applyUpdate}
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
