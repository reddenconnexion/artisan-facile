import React from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from 'sonner'

function ReloadPrompt() {
    const {
        offlineReady: [offlineReady, setOfflineReady],
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegistered(r) {
            console.log('SW Registered: ' + r)
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
