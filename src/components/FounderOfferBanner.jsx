import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, X } from 'lucide-react';
import { usePlanLimits } from '../hooks/usePlanLimits';
import { useFounderSpots } from '../hooks/useFounderSpots';
import { TRIAL_DAYS, proOffer, spotsLabel } from '../utils/founderOffer';

const DISMISS_KEY = 'founder_offer_banner_dismissed';

const readDismissed = () => {
    try {
        return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
        return false;
    }
};

/**
 * Bandeau du tableau de bord (comptes gratuits) : offre membre fondateur tant
 * qu'il reste des places. Masquable ; le choix est retenu sur cet appareil.
 */
const FounderOfferBanner = () => {
    const navigate = useNavigate();
    const { isPro, loading, trialEligible } = usePlanLimits();
    const spotsLeft = useFounderSpots();
    const [dismissed, setDismissed] = useState(readDismissed);

    const offer = proOffer(spotsLeft, 'month');
    if (loading || isPro || dismissed || !offer.founder) return null;

    const dismiss = () => {
        setDismissed(true);
        try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* stockage indisponible */ }
    };

    return (
        <div className="relative rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 text-white p-4 pr-10 shadow-sm">
            <button
                type="button"
                onClick={dismiss}
                aria-label="Masquer l'offre"
                className="absolute top-2 right-2 p-1.5 rounded-md text-white/80 hover:text-white hover:bg-white/15"
            >
                <X size={16} />
            </button>
            <div className="flex items-start gap-3">
                <Crown size={22} className="flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                    <p className="font-bold text-sm sm:text-base">
                        Offre membre fondateur
                        {spotsLabel(spotsLeft) ? ` · ${spotsLabel(spotsLeft)}` : ''}
                    </p>
                    <p className="text-sm text-white/95 mt-0.5">
                        {trialEligible ? `${TRIAL_DAYS} jours gratuits, puis ` : ''}
                        {offer.priceLabel} à vie au lieu de {offer.standardLabel} : l'appli relance vos devis et vos
                        factures en retard toute seule, demande vos avis Google et vous fait le point chaque soir.
                        Visio de démarrage avec Denis, satisfait ou remboursé.
                    </p>
                    <button
                        type="button"
                        onClick={() => navigate('/app/subscription')}
                        className="mt-2.5 inline-flex items-center px-3.5 py-1.5 bg-white text-orange-600 text-sm font-bold rounded-lg hover:bg-orange-50 transition-colors"
                    >
                        Voir l'offre
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FounderOfferBanner;
