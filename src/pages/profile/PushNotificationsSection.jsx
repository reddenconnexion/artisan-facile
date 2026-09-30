import React from 'react';
import { toast } from 'sonner';
import { Bell } from 'lucide-react';
import { Button } from '../../components/ui';

// Les valeurs du hook usePushNotifications et l'état `isTestingPush` restent
// dans la page parente : ils survivent ainsi aux changements d'onglet.
const PushNotificationsSection = ({
    isPushSupported,
    isPushSubscribed,
    isPushLoading,
    pushPermission,
    subscribePush,
    unsubscribePush,
    sendTestPush,
    isTestingPush,
    setIsTestingPush,
}) => {
    return (
        <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 rounded-2xl shadow-sm border border-blue-100 dark:border-blue-800/40 overflow-hidden">
            <div className="p-8">
                <h3 className="text-lg font-semibold text-blue-900 mb-4 flex items-center">
                    <Bell className="w-5 h-5 mr-2" />
                    Notifications Push
                </h3>
                <p className="text-sm text-blue-800 mb-3">
                    Recevez une notification immédiate sur cet appareil — même quand l'application est fermée :
                </p>
                <ul className="text-xs text-blue-800 space-y-1 mb-6 ml-1">
                    <li>✅ Devis signés par vos clients</li>
                    <li>💬 Nouveaux messages depuis les portails clients</li>
                    <li>📥 Factures fournisseurs reçues</li>
                </ul>

                {!isPushSupported ? (
                    <div className="bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-800/40 rounded-lg p-4 space-y-2">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Les notifications push ne sont pas disponibles sur ce navigateur.
                        </p>
                        {/iphone|ipad|ipod/i.test(navigator.userAgent) ? (
                            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-xs text-blue-800 space-y-1">
                                <p className="font-semibold">Activer sur iPhone / iPad :</p>
                                <ol className="list-decimal list-inside space-y-1">
                                    <li>Ouvrez cette page dans <strong>Safari</strong></li>
                                    <li>Appuyez sur l'icône <strong>Partager</strong> (carré avec flèche)</li>
                                    <li>Sélectionnez <strong>"Sur l'écran d'accueil"</strong></li>
                                    <li>Revenez dans l'app installée et réactivez ici</li>
                                </ol>
                            </div>
                        ) : (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Utilisez Chrome, Edge ou Firefox sur ordinateur ou Android.
                            </p>
                        )}
                    </div>
                ) : pushPermission === 'denied' && !isPushSubscribed ? (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg p-4 space-y-2">
                        <p className="text-sm font-semibold text-amber-900 flex items-center gap-2">
                            <span>⚠️</span> Notifications bloquées dans votre navigateur
                        </p>
                        <p className="text-xs text-amber-800">
                            Pour les réactiver, cliquez sur l'icône <strong>cadenas / paramètres</strong> à gauche de la barre d'adresse, puis autorisez les notifications pour ce site. Rechargez ensuite la page.
                        </p>
                    </div>
                ) : isPushSubscribed ? (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 rounded-lg p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                                <span className="text-sm font-medium text-green-800">Notifications activées sur cet appareil</span>
                            </div>
                            <button
                                type="button"
                                onClick={async () => {
                                    await unsubscribePush();
                                    toast.success('Notifications désactivées');
                                }}
                                disabled={isPushLoading}
                                className="text-xs text-red-600 hover:text-red-700 hover:underline disabled:opacity-50"
                            >
                                Désactiver
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={async () => {
                                setIsTestingPush(true);
                                const result = await sendTestPush();
                                setIsTestingPush(false);
                                if (result.success) {
                                    toast.success('Notification envoyée — vérifiez votre écran !', {
                                        description: 'Si vous ne la voyez pas, vérifiez les paramètres système de votre appareil.',
                                        duration: 8000,
                                    });
                                } else {
                                    toast.error(result.error || 'Échec de l\'envoi', { duration: 6000 });
                                }
                            }}
                            disabled={isTestingPush}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-blue-700 border border-blue-200 dark:border-blue-800/40 font-medium text-sm rounded-lg transition-colors disabled:opacity-50"
                        >
                            {isTestingPush
                                ? <><span className="w-3.5 h-3.5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />Envoi en cours…</>
                                : <><Bell className="w-4 h-4" />Envoyer une notification de test</>
                            }
                        </button>
                        <p className="text-xs text-blue-700 text-center">
                            Si la notification de test n'arrive pas, vos notifications ne fonctionneront pas pour les vraies alertes.
                        </p>
                    </div>
                ) : (
                    <Button
                        type="button"
                        onClick={async () => {
                            const result = await subscribePush();
                            if (result.success) {
                                toast.success('Notifications activées !', {
                                    description: 'Vous pouvez maintenant envoyer une notification de test.',
                                });
                            } else {
                                toast.error(result.error || 'Impossible d\'activer les notifications');
                            }
                        }}
                        disabled={isPushLoading}
                        size="lg"
                    >
                        <Bell className="w-4 h-4" />
                        {isPushLoading ? 'Activation...' : 'Activer les notifications push'}
                    </Button>
                )}
            </div>
        </div>
    );
};

export default PushNotificationsSection;
