import { CheckCircle, Radio, XCircle, Loader2 } from 'lucide-react';

// Statut d'enregistrement du SIREN dans l'annuaire DGFIP via B2BRouter
const B2BReceiverStatus = ({ b2bReceiverStatus, b2bReceiverError, registerB2BReceiver, siretCheck }) => {
    return (
        <>
            {b2bReceiverStatus === 'loading' && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-blue-600">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Enregistrement dans l'annuaire DGFIP…
                </div>
            )}
            {b2bReceiverStatus === 'registered' && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-green-700 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 rounded-lg px-2.5 py-1.5">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Enregistré dans l'annuaire DGFIP — vos fournisseurs peuvent vous envoyer des factures électroniques</span>
                </div>
            )}
            {b2bReceiverStatus === 'error' && (
                <div className="mt-2 text-xs text-red-700 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-lg px-2.5 py-1.5 space-y-1">
                    <div className="flex items-center gap-1.5">
                        <XCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Échec de l'enregistrement annuaire DGFIP</span>
                    </div>
                    {b2bReceiverError && <p className="font-mono text-[10px] opacity-70 break-all">{b2bReceiverError}</p>}
                    <button type="button" onClick={registerB2BReceiver} className="text-red-600 underline hover:text-red-800">Réessayer</button>
                </div>
            )}
            {!b2bReceiverStatus && siretCheck.level === 'ok' && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg px-2.5 py-1.5">
                    <Radio className="w-3.5 h-3.5 shrink-0" />
                    <span>Sauvegardez le profil pour vous enregistrer dans l'annuaire DGFIP</span>
                </div>
            )}
        </>
    );
};

export default B2BReceiverStatus;
