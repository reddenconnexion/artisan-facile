import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronRight, ChevronDown, X, Rocket, ArrowUp, Sparkles, Mic, Send, Calculator } from 'lucide-react';
import { useClients, useQuotes, useUserProfile } from '../hooks/useDataCache';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';

const LEVEL_UP_DATA = {
    debutant: {
        nextLevel: 'intermediaire',
        nextLabel: 'Intermédiaire',
        emoji: '⚡',
        unlocks: [
            'Agenda & Suivi de chantiers',
            'Comptabilité & URSSAF',
            'Bibliothèque de prix',
            'Mémos vocaux',
        ],
    },
    intermediaire: {
        nextLevel: 'confirme',
        nextLabel: 'Confirmé',
        emoji: '🚀',
        unlocks: [
            'Portfolio & Marketing',
            'Locations matériel',
            'Tous les modules avancés',
        ],
    },
};

const FEATURE_TIPS = [
    {
        id: 'voice',
        icon: Mic,
        color: 'text-blue-500',
        bg: 'bg-blue-50 dark:bg-blue-900/20',
        title: 'Saisie vocale',
        description: 'Dictez un devis depuis le chantier, l\'IA transcrit et structure.',
        href: '/app/voice-memos',
    },
    {
        id: 'ai',
        icon: Sparkles,
        color: 'text-violet-500',
        bg: 'bg-violet-50 dark:bg-violet-900/20',
        title: 'IA dans les devis',
        description: 'Bouton "Générer avec l\'IA" pour remplir automatiquement.',
        href: '/app/devis/new',
    },
    {
        id: 'send',
        icon: Send,
        color: 'text-sky-500',
        bg: 'bg-sky-50 dark:bg-sky-900/20',
        title: 'Envoi & signature en ligne',
        description: 'Le client signe depuis son téléphone, sans compte.',
        href: '/app/devis',
    },
    {
        id: 'calculator',
        icon: Calculator,
        color: 'text-orange-500',
        bg: 'bg-orange-50 dark:bg-orange-900/20',
        title: 'Calculateur matériaux',
        description: 'Estimez le coût des matériaux avant de fixer votre prix.',
        href: '/app/devis/new',
    },
];

const WelcomeCard = () => {
    const { user } = useAuth();
    const isDemo = user?.is_anonymous === true || user?.id === 'demo-local-fallback';
    const dismissKey = `welcome_card_dismissed_${user?.id}`;
    const [dismissed, setDismissed] = useState(() => localStorage.getItem(dismissKey) === '1');
    const [expanded, setExpanded] = useState(false);
    const [levelingUp, setLevelingUp] = useState(false);

    const { data: profile } = useUserProfile();
    const { data: clients = [] } = useClients();
    const { data: quotes = [] } = useQuotes();

    const skillLevel = user?.user_metadata?.activity_settings?.skill_level ?? 'debutant';
    const profileComplete = !!(profile?.company_name && profile?.siret);
    const hasClient = clients.length > 0;
    const hasQuote = quotes.length > 0;

    const handleDismiss = () => {
        localStorage.setItem(dismissKey, '1');
        setDismissed(true);
    };

    const handleLevelUp = async (nextLevel, nextLabel) => {
        setLevelingUp(true);
        try {
            const currentSettings = user?.user_metadata?.activity_settings || {};
            await supabase.auth.updateUser({
                data: { activity_settings: { ...currentSettings, skill_level: nextLevel } },
            });
            toast.success(`Niveau ${nextLabel} débloqué ! 🎉`);
        } catch {
            toast.error('Erreur lors du changement de niveau');
        } finally {
            setLevelingUp(false);
        }
    };

    if (dismissed || skillLevel === 'confirme') return null;

    const steps = [
        {
            id: 'profile',
            label: 'Compléter votre profil',
            description: 'Nom d\'entreprise, SIRET et adresse — requis pour des devis légaux.',
            done: profileComplete,
            href: '/app/settings',
        },
        {
            id: 'client',
            label: 'Ajouter votre premier client',
            description: 'Une fiche réutilisable sur tous vos devis.',
            done: hasClient,
            href: '/app/clients/new',
        },
        {
            id: 'quote',
            label: 'Créer votre premier devis',
            description: 'Envoyez-le par email, votre client signe en ligne.',
            done: hasQuote,
            href: '/app/devis/new',
        },
    ];

    const completedCount = steps.filter(s => s.done).length;
    const allDone = completedCount === steps.length;
    const progress = Math.round((completedCount / steps.length) * 100);
    const nextStep = steps.find(s => !s.done);

    // Niveau intermédiaire : pas d'étapes, propose level-up Confirmé
    if (skillLevel === 'intermediaire') {
        const levelUpInfo = LEVEL_UP_DATA.intermediaire;
        return (
            <div className="bg-gradient-to-br from-blue-50 to-violet-50 dark:from-blue-950/30 dark:to-violet-950/30 border border-blue-100 dark:border-violet-900/40 rounded-xl p-5 mb-6 relative">
                <button
                    onClick={handleDismiss}
                    className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-white/60 transition-colors"
                    title="Masquer"
                >
                    <X className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 bg-violet-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0 pr-6">
                        <p className="font-bold text-gray-900 dark:text-white text-sm">Tout débloquer — Niveau {levelUpInfo.nextLabel}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{levelUpInfo.unlocks.join(' · ')}</p>
                    </div>
                </div>
                <button
                    onClick={() => handleLevelUp(levelUpInfo.nextLevel, levelUpInfo.nextLabel)}
                    disabled={levelingUp}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
                >
                    <ArrowUp className="w-4 h-4" />
                    {levelingUp ? 'Activation...' : `Activer le niveau ${levelUpInfo.nextLabel} ${levelUpInfo.emoji}`}
                </button>
            </div>
        );
    }

    // Niveau débutant — toutes les étapes faites : proposer level-up
    if (allDone) {
        const levelUpInfo = LEVEL_UP_DATA.debutant;
        return (
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-200 dark:border-green-800/50 rounded-xl p-5 mb-6 relative">
                <button
                    onClick={handleDismiss}
                    className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-white/60 transition-colors"
                    title="Masquer"
                >
                    <X className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0 pr-6">
                        <p className="font-bold text-gray-900 dark:text-white text-sm">Bases maîtrisées — bravo !</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Débloquez {levelUpInfo.unlocks.length} modules supplémentaires.</p>
                    </div>
                </div>
                <button
                    onClick={() => handleLevelUp(levelUpInfo.nextLevel, levelUpInfo.nextLabel)}
                    disabled={levelingUp}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
                >
                    <ArrowUp className="w-4 h-4" />
                    {levelingUp ? 'Activation...' : `Passer au niveau ${levelUpInfo.nextLabel} ${levelUpInfo.emoji}`}
                </button>
            </div>
        );
    }

    // Niveau débutant — étapes en cours : afficher la prochaine étape prioritaire en grand
    return (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-100 dark:border-blue-900/50 rounded-xl p-5 mb-6 relative">
            <button
                onClick={handleDismiss}
                className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-white/60 transition-colors"
                title="Masquer"
            >
                <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4 pr-6">
                <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Rocket className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 dark:text-white text-sm">
                        Démarrez votre activité — {completedCount}/{steps.length} étapes
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 bg-white/70 dark:bg-gray-800/60 rounded-full h-2 overflow-hidden">
                            <div
                                className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <span className="text-xs font-semibold text-blue-700 dark:text-blue-400 flex-shrink-0 w-8 text-right">
                            {progress}%
                        </span>
                    </div>
                </div>
            </div>

            {/* Étape prioritaire mise en avant */}
            {nextStep && (
                <Link
                    to={nextStep.href}
                    className="flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-all border-2 border-blue-200 dark:border-blue-900/40"
                >
                    <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-white">{steps.indexOf(nextStep) + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{nextStep.label}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{nextStep.description}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-blue-400 flex-shrink-0" />
                </Link>
            )}

            {/* Bouton "Voir toutes les étapes" */}
            <button
                onClick={() => setExpanded(e => !e)}
                className="mt-3 flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 transition-colors"
            >
                {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                {expanded ? 'Masquer le détail' : 'Voir toutes les étapes et astuces'}
            </button>

            {expanded && (
                <div className="mt-3 space-y-3">
                    {/* Étapes restantes / faites */}
                    <div className="space-y-1.5">
                        {steps.map((step, index) => (
                            step.done ? (
                                <div key={step.id} className="flex items-center gap-3 px-3 py-2 rounded-lg opacity-60">
                                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                                    <p className="text-xs font-medium text-gray-500 dark:text-gray-500 line-through">
                                        {step.label}
                                    </p>
                                </div>
                            ) : step.id === nextStep?.id ? null : (
                                <Link
                                    key={step.id}
                                    to={step.href}
                                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/60 dark:bg-gray-800/60 hover:bg-white dark:hover:bg-gray-800 transition-colors"
                                >
                                    <div className="w-5 h-5 rounded-full border-2 border-blue-300 dark:border-blue-700 flex items-center justify-center flex-shrink-0">
                                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">{index + 1}</span>
                                    </div>
                                    <p className="text-xs text-gray-700 dark:text-gray-300 flex-1">{step.label}</p>
                                    <ChevronRight className="w-3 h-3 text-blue-400" />
                                </Link>
                            )
                        ))}
                    </div>

                    {/* Astuces fonctionnalités (compactes) */}
                    <div>
                        <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                            À découvrir aussi
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {FEATURE_TIPS.map(tip => {
                                const Icon = tip.icon;
                                return (
                                    <Link
                                        key={tip.id}
                                        to={tip.href}
                                        className={`flex items-start gap-2.5 rounded-lg p-2.5 ${tip.bg} hover:opacity-90 transition-opacity`}
                                    >
                                        <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${tip.color}`} />
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold text-gray-900 dark:text-white">{tip.title}</p>
                                            <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-snug">{tip.description}</p>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>

                    {isDemo && (
                        <p className="text-[11px] text-center text-gray-500 dark:text-gray-400">
                            🧪 Mode démo — <Link to="/register" className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">créer un vrai compte</Link>
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export default WelcomeCard;
