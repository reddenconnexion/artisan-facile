import { useState } from 'react';
import { Crown, CheckCircle, CreditCard, Loader2, ShieldCheck, Users } from 'lucide-react';
import { PRO_BENEFITS, TRIAL_DAYS, proOffer, spotsLabel } from '../utils/founderOffer';

/**
 * Offre Pro (page Abonnement) : essai gratuit, tarif fondateur bloqué à vie
 * tant qu'il reste des places, visio d'accueil, garantie premier mois.
 */
const FounderOfferCard = ({ spotsLeft, interval, onIntervalChange, onCheckout, loading, trialEligible }) => {
    const offer = proOffer(spotsLeft, interval);
    const spots = offer.founder ? spotsLabel(spotsLeft) : null;
    // Date du premier prélèvement si l'essai commence aujourd'hui.
    const [firstCharge] = useState(() => new Date(Date.now() + TRIAL_DAYS * 24 * 3600 * 1000)
        .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }));

    const perks = [
        ...PRO_BENEFITS.map((b) => b.title),
        ...(offer.founder ? [
            'Visio de 30 min avec Denis, électricien depuis 25 ans : bibliothèque de prix et premier devis montés avec vous',
            'Tarif bloqué à vie tant que vous restez abonné',
        ] : []),
        'Tout le gratuit, dont les factures prêtes pour la facture électronique obligatoire de 2027',
    ];

    return (
        <div className="rounded-2xl overflow-hidden border-2 border-amber-400 dark:border-amber-500/70 bg-white dark:bg-gray-800 shadow-sm">
            <div className="bg-gradient-to-r from-amber-400 to-orange-400 px-5 py-2.5 flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wide text-white flex items-center gap-1.5">
                    <Crown size={14} />
                    {offer.founder ? 'Offre membre fondateur' : 'Plan Pro'}
                </span>
                {spots && (
                    <span className="text-xs font-semibold text-white bg-black/15 rounded-full px-2.5 py-0.5 flex items-center gap-1">
                        <Users size={12} />
                        {spots}
                    </span>
                )}
            </div>

            <div className="p-5 sm:p-6">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                    {trialEligible ? `${TRIAL_DAYS} jours gratuits, puis ` : ''}
                    {offer.priceLabel}
                    {offer.founder ? ' à vie' : ''}
                </h3>

                <div className="mt-3 inline-flex rounded-lg bg-gray-100 dark:bg-gray-700 p-1 text-sm" role="group" aria-label="Périodicité">
                    {[
                        { value: 'month', label: 'Mensuel' },
                        { value: 'year', label: 'Annuel · 2 mois offerts' },
                    ].map(({ value, label }) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => onIntervalChange(value)}
                            aria-pressed={interval === value}
                            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${interval === value
                                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <div className="mt-4 flex items-end gap-2 flex-wrap">
                    <span className="text-4xl font-extrabold text-gray-900 dark:text-white">{offer.priceLabel}</span>
                    {offer.founder && (
                        <span className="text-base text-gray-400 line-through mb-1">{offer.standardLabel}</span>
                    )}
                </div>
                {offer.monthlyEquivalent && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">soit {offer.monthlyEquivalent}</p>
                )}
                <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
                    L'appli relance vos clients et réclame votre argent pendant que vous êtes sur le chantier.
                    Un seul devis signé en plus dans l'année, et l'abonnement est payé.
                </p>

                <ul className="mt-5 space-y-2.5">
                    {perks.map((perk) => (
                        <li key={perk} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                            <CheckCircle size={16} className="text-green-500 flex-shrink-0 mt-0.5" />
                            <span>{perk}</span>
                        </li>
                    ))}
                </ul>

                <div className="mt-5 flex items-start gap-2.5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800/50 px-3 py-2.5">
                    <ShieldCheck size={18} className="text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-green-800 dark:text-green-300">
                        <strong>Satisfait ou remboursé.</strong> Si le premier mois payé ne vous convient pas,
                        écrivez à Denis : il vous rembourse, sans question.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={onCheckout}
                    disabled={loading}
                    className="mt-5 w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60"
                >
                    {loading ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />}
                    {trialEligible ? `Commencer mes ${TRIAL_DAYS} jours gratuits` : `Passer en Pro · ${offer.priceLabel}`}
                </button>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 text-center">
                    {trialEligible
                        ? `Carte demandée, aucun prélèvement avant le ${firstCharge}. `
                        : ''}
                    Annulable en 2 clics depuis l'appli · Paiement sécurisé par Stripe
                </p>
            </div>
        </div>
    );
};

export default FounderOfferCard;
