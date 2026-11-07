import { useEffect, useState } from 'react';
import {
    Crown, Mic, Sparkles, Zap, CheckCircle, X, TrendingUp, BarChart2,
    Loader2, ExternalLink, CreditCard
} from 'lucide-react';
import { usePlanLimits } from '../hooks/usePlanLimits';
import { PLAN_LIMITS } from '../utils/planLimits';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import { formatDate } from '../utils/format';
import { STRIPE_PORTAL_LOGIN_URL, portalLoginUrl } from '../utils/stripePortal';
import { cancellationNotice } from '../utils/subscriptionStatus';
import { proOffer, trialNotice } from '../utils/founderOffer';
import { useFounderSpots } from '../hooks/useFounderSpots';
import { useUserProfile } from '../hooks/useDataCache';
import FounderOfferCard from '../components/FounderOfferCard';
import FounderVisioContact from '../components/FounderVisioContact';

const FEATURES = [
    {
        category: 'Mémos vocaux',
        free: `${PLAN_LIMITS.free.voice_memos} mémos/mois`,
        pro: 'Illimité',
        icon: Mic,
    },
    {
        category: 'Génération IA',
        free: `${PLAN_LIMITS.free.ai_generations} générations/mois`,
        pro: 'Illimité',
        icon: Sparkles,
    },
    {
        category: 'Transcription',
        free: 'Votre clé OpenAI ou Gemini requise',
        pro: 'Incluse (géré par l\'app)',
        icon: Zap,
        proHighlight: true,
    },
    {
        category: 'Pipeline automatique',
        free: false,
        pro: true,
        freeLabel: 'Formulaires pré-remplis uniquement',
        proLabel: 'Exécution auto + annulation 30s',
        icon: TrendingUp,
        proHighlight: true,
    },
    {
        category: 'Tous les modules',
        free: true,
        pro: true,
        freeLabel: 'Clients, Devis, Factures, Rapports...',
        proLabel: 'Tout inclus',
        icon: BarChart2,
    },
];

const CheckMark = ({ value, label }) => {
    if (value === true || (typeof value === 'string' && value)) {
        return (
            <div className="flex items-center gap-1.5">
                <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
                <span className="text-sm text-gray-700 dark:text-gray-300">{label || value}</span>
            </div>
        );
    }
    if (value === false) {
        return (
            <div className="flex items-center gap-1.5">
                <X size={14} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
                <span className="text-sm text-gray-400 dark:text-gray-500">{label || 'Non disponible'}</span>
            </div>
        );
    }
    return <span className="text-sm text-gray-600 dark:text-gray-400">{value}</span>;
};

const Subscription = () => {
    const { plan, cancelAt, trialEnd, isFounder, trialEligible, usage, isPro, isOwner, remainingVoice, voiceLimit, remainingAI, aiLimit, loading, refresh } = usePlanLimits();
    const spotsLeft = useFounderSpots();
    const { data: profile } = useUserProfile();
    const [billingInterval, setBillingInterval] = useState('month');
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [portalLoading, setPortalLoading] = useState(false);
    const cancelNotice = cancellationNotice(cancelAt);
    const trialText = trialNotice(trialEnd);
    const offer = proOffer(spotsLeft, billingInterval);
    // Résiliation d'abord : un essai annulé garde sa date de fin d'essai,
    // mais aucun prélèvement n'aura lieu.
    const proStatusText = cancelNotice
        || trialText
        || (isFounder ? 'Membre fondateur · tarif bloqué à vie' : 'Renouvellement automatique');
    const currentMonth = formatDate(new Date(), { month: 'long', year: 'numeric' });

    // Handle Stripe redirect callbacks
    useEffect(() => {
        if (searchParams.get('success') === 'true') {
            toast.success('🎉 Bienvenue dans le plan Pro ! Votre essai et vos avantages sont actifs.');
            refresh();
            // Clean URL
            navigate('/app/subscription', { replace: true });
        } else if (searchParams.get('cancelled') === 'true') {
            toast.info('Paiement annulé. Vous restez sur le plan gratuit.');
            navigate('/app/subscription', { replace: true });
        }
    }, []);

    const handleCheckout = async () => {
        setCheckoutLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke('create-checkout-session', {
                body: { origin: window.location.origin, interval: billingInterval },
            });
            if (error) {
                const body = await error.context?.json?.().catch(() => null);
                throw new Error(body?.error || error.message);
            }
            if (data?.url) {
                window.location.href = data.url;
            } else {
                throw new Error('URL de paiement non reçue');
            }
        } catch (err) {
            toast.error('Erreur lors de la création du paiement : ' + err.message);
            setCheckoutLoading(false);
        }
    };

    const handleManageSubscription = async () => {
        setPortalLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke('stripe-portal', {
                body: { origin: window.location.origin },
            });
            if (error) {
                const body = await error.context?.json?.().catch(() => null);
                throw new Error(body?.error || error.message);
            }
            if (data?.url) {
                window.location.href = data.url;
            } else {
                throw new Error('URL du portail non reçue');
            }
        } catch (err) {
            console.warn('stripe-portal indisponible, repli sur le lien de connexion :', err.message);
            const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: {} }));
            toast.info('Connectez-vous au portail Stripe avec votre e-mail.');
            window.location.href = portalLoginUrl(user?.email);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto px-4 py-6">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Crown size={22} className="text-amber-500" />
                    Plan & Abonnement
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Gérez votre abonnement et suivez votre utilisation</p>
            </div>

            {/* Current plan banner */}
            <div className={`rounded-xl p-5 mb-6 ${isOwner
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white'
                : isPro
                ? 'bg-gradient-to-r from-amber-400 to-orange-400 text-white'
                : 'bg-gradient-to-r from-gray-100 to-blue-50 dark:from-gray-800 dark:to-gray-700 border border-gray-200 dark:border-gray-600'
            }`}>
                <div className="flex items-center justify-between">
                    <div>
                        <p className={`text-xs font-medium uppercase tracking-wide ${isPro || isOwner ? 'text-orange-100' : 'text-gray-500 dark:text-gray-400'}`}>
                            Votre plan actuel
                        </p>
                        <p className={`text-3xl font-bold mt-1 ${isPro || isOwner ? 'text-white' : 'text-gray-800 dark:text-white'}`}>
                            {isOwner ? 'Propriétaire' : isPro ? 'Pro' : 'Gratuit'}
                        </p>
                        {isOwner && (
                            <p className="text-purple-200 text-xs mt-1">Accès illimité à toutes les fonctionnalités</p>
                        )}
                        {isPro && !isOwner && (
                            <p className="text-orange-100 text-xs mt-1">{proStatusText}</p>
                        )}
                    </div>
                    {isOwner ? (
                        <div className="text-5xl">👑</div>
                    ) : isPro ? (
                        <div className="text-right flex flex-col items-end gap-2">
                            <Crown size={36} className="text-orange-200" />
                            <button
                                onClick={handleManageSubscription}
                                disabled={portalLoading}
                                className="flex items-center gap-1.5 text-xs text-orange-100 hover:text-white transition-colors"
                            >
                                {portalLoading
                                    ? <Loader2 size={12} className="animate-spin" />
                                    : <ExternalLink size={12} />
                                }
                                Gérer l'abonnement
                            </button>
                        </div>
                    ) : (
                        <div className="text-right">
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                {offer.founder ? `Fondateur : ${offer.priceLabel}` : offer.priceLabel}
                            </p>
                            <button
                                onClick={handleCheckout}
                                disabled={checkoutLoading}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
                            >
                                {checkoutLoading
                                    ? <Loader2 size={14} className="animate-spin" />
                                    : <CreditCard size={14} />
                                }
                                Passer en Pro
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Usage this month */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 mb-5">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">
                    Utilisation — {currentMonth}
                </h2>

                <div className="space-y-4">
                    {/* Voice memos */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                                <Mic size={14} className="text-blue-400" />
                                Mémos vocaux
                            </span>
                            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                {usage.voice_memos_count}
                                {!isPro && ` / ${voiceLimit}`}
                                {isPro && ' (illimité)'}
                            </span>
                        </div>
                        {!isPro && (
                            <>
                                <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all ${
                                            remainingVoice === 0 ? 'bg-red-500' :
                                            remainingVoice <= 3 ? 'bg-orange-500' : 'bg-blue-500'
                                        }`}
                                        style={{ width: `${Math.min(100, (usage.voice_memos_count / voiceLimit) * 100)}%` }}
                                    />
                                </div>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                    {remainingVoice > 0
                                        ? `${remainingVoice} restant${remainingVoice > 1 ? 's' : ''}`
                                        : 'Limite atteinte'
                                    }
                                </p>
                            </>
                        )}
                    </div>

                    {/* AI generations */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                                <Sparkles size={14} className="text-purple-400" />
                                Générations IA
                            </span>
                            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                {usage.ai_generations_count}
                                {!isPro && ` / ${aiLimit}`}
                                {isPro && ' (illimité)'}
                            </span>
                        </div>
                        {!isPro && (
                            <>
                                <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all ${
                                            remainingAI === 0 ? 'bg-red-500' :
                                            remainingAI <= 2 ? 'bg-orange-500' : 'bg-purple-500'
                                        }`}
                                        style={{ width: `${Math.min(100, (usage.ai_generations_count / aiLimit) * 100)}%` }}
                                    />
                                </div>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                    {remainingAI > 0
                                        ? `${remainingAI} restant${remainingAI > 1 ? 's' : ''}`
                                        : 'Limite atteinte'
                                    }
                                </p>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Feature comparison */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden mb-6">
                <div className="grid grid-cols-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <span>Fonctionnalité</span>
                    <span className="text-center">Gratuit</span>
                    <span className="text-center text-amber-600 dark:text-amber-400">Pro</span>
                </div>

                {FEATURES.map((feature, i) => {
                    const Icon = feature.icon;
                    return (
                        <div
                            key={i}
                            className={`grid grid-cols-3 px-4 py-3.5 items-center ${
                                i !== FEATURES.length - 1 ? 'border-b border-gray-50 dark:border-gray-700/50' : ''
                            } ${feature.proHighlight ? 'bg-amber-50/30 dark:bg-amber-900/10' : ''}`}
                        >
                            <div className="flex items-center gap-2">
                                <Icon size={14} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
                                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{feature.category}</span>
                            </div>
                            <div className="text-center">
                                {typeof feature.free === 'boolean'
                                    ? <CheckMark value={feature.free} label={feature.freeLabel} />
                                    : <span className="text-xs text-gray-500 dark:text-gray-400">{feature.free}</span>
                                }
                            </div>
                            <div className="text-center">
                                {typeof feature.pro === 'boolean'
                                    ? <CheckMark value={feature.pro} label={feature.proLabel} />
                                    : <span className={`text-xs font-medium ${feature.proHighlight ? 'text-amber-700 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'}`}>{feature.pro}</span>
                                }
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Offre Pro (utilisateurs gratuits) */}
            {!isPro && (
                <FounderOfferCard
                    spotsLeft={spotsLeft}
                    interval={billingInterval}
                    onIntervalChange={setBillingInterval}
                    onCheckout={handleCheckout}
                    loading={checkoutLoading}
                    trialEligible={trialEligible}
                />
            )}

            {isOwner && (
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 rounded-xl p-4 text-center">
                    <div className="text-3xl mb-2">👑</div>
                    <p className="text-purple-700 dark:text-purple-300 font-semibold text-sm">Compte Propriétaire</p>
                    <p className="text-purple-600 dark:text-purple-400 text-xs mt-1">Accès illimité à toutes les fonctionnalités. Aucune restriction.</p>
                </div>
            )}

            {isPro && !isOwner && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 rounded-xl p-4 text-center">
                    <CheckCircle size={24} className="mx-auto text-green-500 mb-2" />
                    <p className="text-green-700 dark:text-green-300 font-semibold text-sm">
                        {isFounder ? 'Plan Pro actif · Membre fondateur' : 'Plan Pro actif'}
                    </p>
                    <p className="text-green-600 dark:text-green-400 text-xs mt-1 mb-3">
                        {cancelNotice
                            ? `${cancelNotice}. Vous repasserez ensuite au plan gratuit, sans nouveau prélèvement.`
                            : trialText
                                ? `${trialText}. Annulable à tout moment avant cette date.`
                                : 'Toutes les fonctionnalités sont disponibles.'}
                    </p>
                    {isFounder && !cancelNotice && (
                        <FounderVisioContact name={profile?.full_name} company={profile?.company_name} />
                    )}
                    <button
                        onClick={handleManageSubscription}
                        disabled={portalLoading}
                        className="inline-flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 hover:underline"
                    >
                        {portalLoading ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                        Gérer / annuler l'abonnement
                    </button>
                    <p className="text-[11px] text-green-600/80 dark:text-green-400/70 mt-2">
                        Factures, carte bancaire, résiliation :{' '}
                        <a
                            href={STRIPE_PORTAL_LOGIN_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-green-700 dark:hover:text-green-300"
                        >
                            portail client Stripe
                        </a>
                    </p>
                </div>
            )}
        </div>
    );
};

export default Subscription;
