import React from 'react';
import {
    Crown, Mic, Sparkles, Zap, CheckCircle, X, TrendingUp, BarChart2
} from 'lucide-react';
import { usePlanLimits } from '../hooks/usePlanLimits';
import { PLAN_LIMITS } from '../utils/planLimits';
import { useNavigate } from 'react-router-dom';

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
        free: 'Votre clé OpenAI requise',
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
                <span className="text-sm text-gray-700">{label || value}</span>
            </div>
        );
    }
    if (value === false) {
        return (
            <div className="flex items-center gap-1.5">
                <X size={14} className="text-gray-300 flex-shrink-0" />
                <span className="text-sm text-gray-400">{label || 'Non disponible'}</span>
            </div>
        );
    }
    return <span className="text-sm text-gray-600">{value}</span>;
};

const Subscription = () => {
    const { plan, usage, isPro, isOwner, remainingVoice, voiceLimit, remainingAI, aiLimit, loading } = usePlanLimits();
    const navigate = useNavigate();
    const currentMonth = new Date().toLocaleString('fr-FR', { month: 'long', year: 'numeric' });

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
                <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Crown size={22} className="text-amber-500" />
                    Plan & Abonnement
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">Gérez votre abonnement et suivez votre utilisation</p>
            </div>

            {/* Current plan banner */}
            <div className={`rounded-xl p-5 mb-6 ${isOwner
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white'
                : isPro
                ? 'bg-gradient-to-r from-amber-400 to-orange-400 text-white'
                : 'bg-gradient-to-r from-gray-100 to-blue-50 border border-gray-200'
            }`}>
                <div className="flex items-center justify-between">
                    <div>
                        <p className={`text-xs font-medium uppercase tracking-wide ${isPro ? 'text-orange-100' : 'text-gray-500'}`}>
                            Votre plan actuel
                        </p>
                        <p className={`text-3xl font-bold mt-1 ${isPro ? 'text-white' : 'text-gray-800'}`}>
                            {isOwner ? 'Propriétaire' : isPro ? 'Pro' : 'Gratuit'}
                        </p>
                        {isOwner && (
                            <p className="text-purple-200 text-xs mt-1">Accès illimité à toutes les fonctionnalités</p>
                        )}
                    </div>
                    {isOwner ? (
                        <div className="text-5xl">👑</div>
                    ) : isPro ? (
                        <Crown size={40} className="text-orange-200" />
                    ) : (
                        <div className="text-right">
                            <p className="text-xs text-gray-500">Envie de plus ?</p>
                            <button
                                onClick={() => {}} // Stripe integration placeholder
                                className="mt-1 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                Passer en Pro
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Usage this month */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">
                    Utilisation — {currentMonth}
                </h2>

                <div className="space-y-4">
                    {/* Voice memos usage */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm text-gray-600 flex items-center gap-1.5">
                                <Mic size={14} className="text-blue-400" />
                                Mémos vocaux
                            </span>
                            <span className="text-sm font-medium text-gray-800">
                                {usage.voice_memos_count}
                                {!isPro && ` / ${voiceLimit}`}
                                {isPro && ' (illimité)'}
                            </span>
                        </div>
                        {!isPro && (
                            <>
                                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all ${
                                            remainingVoice === 0 ? 'bg-red-500' :
                                            remainingVoice <= 3 ? 'bg-orange-500' : 'bg-blue-500'
                                        }`}
                                        style={{ width: `${Math.min(100, (usage.voice_memos_count / voiceLimit) * 100)}%` }}
                                    />
                                </div>
                                <p className="text-xs text-gray-400 mt-1">
                                    {remainingVoice > 0
                                        ? `${remainingVoice} restant${remainingVoice > 1 ? 's' : ''}`
                                        : 'Limite atteinte'
                                    }
                                </p>
                            </>
                        )}
                    </div>

                    {/* AI generations usage */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm text-gray-600 flex items-center gap-1.5">
                                <Sparkles size={14} className="text-purple-400" />
                                Générations IA
                            </span>
                            <span className="text-sm font-medium text-gray-800">
                                {usage.ai_generations_count}
                                {!isPro && ` / ${aiLimit}`}
                                {isPro && ' (illimité)'}
                            </span>
                        </div>
                        {!isPro && (
                            <>
                                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all ${
                                            remainingAI === 0 ? 'bg-red-500' :
                                            remainingAI <= 2 ? 'bg-orange-500' : 'bg-purple-500'
                                        }`}
                                        style={{ width: `${Math.min(100, (usage.ai_generations_count / aiLimit) * 100)}%` }}
                                    />
                                </div>
                                <p className="text-xs text-gray-400 mt-1">
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
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-6">
                <div className="grid grid-cols-3 text-xs font-semibold uppercase tracking-wide text-gray-500 bg-gray-50 px-4 py-3 border-b border-gray-100">
                    <span>Fonctionnalité</span>
                    <span className="text-center">Gratuit</span>
                    <span className="text-center text-amber-600">Pro</span>
                </div>

                {FEATURES.map((feature, i) => {
                    const Icon = feature.icon;
                    return (
                        <div
                            key={i}
                            className={`grid grid-cols-3 px-4 py-3.5 items-center ${
                                i !== FEATURES.length - 1 ? 'border-b border-gray-50' : ''
                            } ${feature.proHighlight ? 'bg-amber-50/30' : ''}`}
                        >
                            <div className="flex items-center gap-2">
                                <Icon size={14} className="text-gray-400 flex-shrink-0" />
                                <span className="text-sm text-gray-700 font-medium">{feature.category}</span>
                            </div>
                            <div className="text-center">
                                {typeof feature.free === 'boolean'
                                    ? <CheckMark value={feature.free} label={feature.freeLabel} />
                                    : <span className="text-xs text-gray-500">{feature.free}</span>
                                }
                            </div>
                            <div className="text-center">
                                {typeof feature.pro === 'boolean'
                                    ? <CheckMark value={feature.pro} label={feature.proLabel} />
                                    : <span className={`text-xs font-medium ${feature.proHighlight ? 'text-amber-700' : 'text-gray-700'}`}>{feature.pro}</span>
                                }
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Upgrade CTA (only for free users) */}
            {!isPro && (
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-6 text-white text-center">
                    <Crown size={32} className="mx-auto mb-2 text-amber-300" />
                    <h3 className="font-bold text-lg mb-1">Passez au plan Pro</h3>
                    <p className="text-blue-100 text-sm mb-4">
                        Transcription incluse, pipeline automatique, génération IA illimitée.
                        Déléguez 100% de l'administratif.
                    </p>
                    <button
                        onClick={() => {}}
                        className="px-6 py-3 bg-white text-blue-700 font-bold rounded-lg hover:bg-blue-50 transition-colors"
                    >
                        Contacter pour l'abonnement Pro
                    </button>
                    <p className="text-xs text-blue-200 mt-2">Intégration de paiement à venir</p>
                </div>
            )}

            {isOwner && (
                <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 text-center">
                    <div className="text-3xl mb-2">👑</div>
                    <p className="text-purple-700 font-semibold text-sm">Compte Propriétaire</p>
                    <p className="text-purple-600 text-xs mt-1">Accès illimité à toutes les fonctionnalités. Aucune restriction.</p>
                </div>
            )}

            {isPro && !isOwner && (
                <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
                    <CheckCircle size={24} className="mx-auto text-green-500 mb-2" />
                    <p className="text-green-700 font-semibold text-sm">Vous avez le plan Pro actif</p>
                    <p className="text-green-600 text-xs mt-1">Toutes les fonctionnalités sont disponibles.</p>
                </div>
            )}
        </div>
    );
};

export default Subscription;
