import React from 'react';
import { RotateCcw, CheckCircle } from 'lucide-react';
import { useConfirm } from '../../context/ConfirmContext';
import { usePwaUpdate } from '../../context/PwaUpdateContext';
import { formatDateTime } from '../../utils/format';

const AppUpdateSection = () => {
    const confirm = useConfirm();
    const { needRefresh, applyUpdate } = usePwaUpdate();

    // Mise à jour de l'app : le bouton « Mettre à jour » n'apparaît que
    // lorsqu'une nouvelle version est réellement en attente (needRefresh),
    // pour ne pas surcharger l'UI. La réinitialisation reste accessible en
    // lien discret comme filet de secours (cas rare de cache bloqué).
    return (
        <div className="mt-8 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="p-8">
                {needRefresh ? (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="flex-1">
                            <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                <RotateCcw className="w-4 h-4 text-blue-600" />
                                Mise à jour disponible
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                Une nouvelle version de l'application est prête.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={applyUpdate}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition-colors flex-shrink-0"
                        >
                            Mettre à jour
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        Votre application est à jour.
                    </div>
                )}

                {/* Version installée (diagnostic) + réinitialisation discrète. */}
                <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                        Version {import.meta.env.PACKAGE_VERSION || '—'}
                        {import.meta.env.BUILD_DATE
                            ? ` — mise en ligne le ${formatDateTime(import.meta.env.BUILD_DATE, { dateStyle: 'short', timeStyle: 'short' })}`
                            : ''}
                    </p>
                    <button
                        type="button"
                        onClick={async () => {
                            const okCache = await confirm({ title: 'Réinitialiser l\'application', message: 'Le cache local et les brouillons non enregistrés seront effacés, puis l\'application rechargée.\nVos données sur le serveur ne seront pas affectées.', confirmLabel: 'Réinitialiser' });
                            if (okCache) {
                                localStorage.clear();
                                if ('caches' in window) {
                                    const cacheNames = await caches.keys();
                                    await Promise.all(cacheNames.map(name => caches.delete(name)));
                                }
                                if ('serviceWorker' in navigator) {
                                    const registrations = await navigator.serviceWorker.getRegistrations();
                                    for (const registration of registrations) {
                                        await registration.unregister();
                                    }
                                }
                                window.location.reload();
                            }
                        }}
                        className="text-xs text-gray-400 dark:text-gray-500 hover:text-red-600 underline underline-offset-2 transition-colors"
                    >
                        Problème d'affichage ? Réinitialiser l'application
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AppUpdateSection;
