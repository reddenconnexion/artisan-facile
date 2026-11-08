import { FileSignature, Wallet, Star, Send } from 'lucide-react';
import { formatCurrencyRounded, formatDate } from '../utils/format';
import { PRO_PRICES, formatEuros } from '../utils/founderOffer';

const Tile = ({ icon: Icon, value, label, tone }) => (
    <div className="flex-1 min-w-0 rounded-xl bg-white/70 dark:bg-white/5 px-3 py-2.5">
        <Icon size={15} className={`${tone} mb-1`} />
        <p className="text-lg font-bold text-gray-900 dark:text-white leading-tight">{value}</p>
        <p className="text-[11px] text-gray-600 dark:text-gray-400">{label}</p>
    </div>
);

/**
 * « Ce que l'appli vous a rapporté » : devis signés après une relance du
 * pilote, factures payées après un rappel, avis demandés, mails envoyés, à
 * côté du prix de l'abonnement.
 */
const AutopilotGains = ({ gains, activatedAt, isFounder = false }) => {
    if (!gains) return null;
    const price = formatEuros(PRO_PRICES[isFounder ? 'founder' : 'standard'].month);
    const since = activatedAt ? ` depuis le ${formatDate(activatedAt, { day: 'numeric', month: 'long' })}` : '';

    return (
        <section className="rounded-xl border border-green-200 dark:border-green-800/50 bg-green-50 dark:bg-green-900/20 p-4 mb-5">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Ce que l'appli vous a rapporté{since}</h2>
            {gains.mails === 0 ? (
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                    Les résultats apparaîtront ici dès que l'appli aura relancé vos clients : devis signés et factures payées après ses relances.
                </p>
            ) : (
                <>
                    <div className="mt-2.5 flex gap-2">
                        <Tile icon={FileSignature} tone="text-blue-600 dark:text-blue-400" value={formatCurrencyRounded(gains.signed.amount)}
                            label={`signés après relance (${gains.signed.count} devis)`} />
                        <Tile icon={Wallet} tone="text-green-600 dark:text-green-400" value={formatCurrencyRounded(gains.paid.amount)}
                            label={`encaissés après rappel (${gains.paid.count} facture${gains.paid.count > 1 ? 's' : ''})`} />
                        <Tile icon={Star} tone="text-amber-500" value={gains.reviews} label="avis Google demandés" />
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-2.5 flex items-center gap-1.5">
                        <Send size={12} />
                        {gains.mails} mail{gains.mails > 1 ? 's' : ''} envoyé{gains.mails > 1 ? 's' : ''} à votre place, pour un abonnement à {price}/mois.
                    </p>
                </>
            )}
        </section>
    );
};

export default AutopilotGains;
