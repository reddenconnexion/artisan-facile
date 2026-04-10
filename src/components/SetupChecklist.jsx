import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronRight, X, Rocket, Star, ArrowUp, Sparkles } from 'lucide-react';
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

const INTERMEDIATE_SUGGESTIONS = [
    {
        id: 'accounting',
        label: 'Configurer la comptabilité',
        description: 'Suivez votre CA et visualisez vos charges URSSAF',
        href: '/app/accounting',
    },
    {
        id: 'agenda',
        label: 'Planifier un rendez-vous',
        description: 'Organisez vos chantiers et RDV clients depuis l\'agenda',
        href: '/app/agenda',
    },
    {
        id: 'library',
        label: 'Enrichir votre bibliothèque',
        description: 'Ajoutez vos prestations pour créer vos devis encore plus vite',
        href: '/app/library',
    },
];

const SetupChecklist = () => {
    const { user } = useAuth();
    const isDemo = user?.is_anonymous === true || user?.id === 'demo-local-fallback';
    const dismissKey = `setup_checklist_dismissed_${user?.id}`;
    const [dismissed, setDismissed] = useState(() => localStorage.getItem(dismissKey) === '1');
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

    if (dismissed || isDemo || skillLevel === 'confirme') return null;

    // ── Niveau Débutant ──────────────────────────────────────────────────────
    if (skillLevel === 'debutant') {
        const steps = [
            {
                id: 'profile',
                label: 'Compléter votre profil',
                description: 'Nom d\'entreprise, SIRET et adresse — requis pour des devis légaux',
                done: profileComplete,
                href: '/app/settings',
            },
            {
                id: 'client',
                label: 'Ajouter votre premier client',
                description: 'Créez une fiche client pour lui envoyer votre premier devis',
                done: hasClient,
                href: '/app/clients/new',
            },
            {
                id: 'quote',
                label: 'Créer votre premier devis',
                description: 'Envoyez-le depuis votre téléphone en moins de 2 minutes',
                done: hasQuote,
                href: '/app/devis/new',
            },
        ];
        const completedCount = steps.filter(s => s.done).length;
        const allDone = completedCount === steps.length;
        const progress = Math.round((completedCount / steps.length) * 100);
        const levelUpInfo = LEVEL_UP_DATA.debutant;

        // Toutes les étapes terminées → proposer le passage de niveau
        if (allDone) {
            return (
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-200 dark:border-green-800/50 rounded-xl p-5 mb-6 relative">
                    <button
                        onClick={handleDismiss}
                        className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-white/60 transition-colors"
                        title="Masquer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-9 h-9 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Star className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <p className="font-bold text-gray-900 dark:text-white text-sm">Bases maîtrisées — parfait départ !</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Passez au niveau suivant pour débloquer plus de fonctionnalités</p>
                        </div>
                    </div>
                    <div className="mb-4 space-y-1.5">
                        {levelUpInfo.unlocks.map(feature => (
                            <div key={feature} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                <span className="text-green-500 font-bold text-base leading-none">+</span>
                                {feature}
                            </div>
                        ))}
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

        // Étapes en cours
        return (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-100 dark:border-blue-900/50 rounded-xl p-5 mb-6 relative">
                <button
                    onClick={handleDismiss}
                    className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-white/60 transition-colors"
                    title="Masquer"
                >
                    <X className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Rocket className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0 pr-6">
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
                <div className="space-y-2">
                    {steps.map((step, index) => (
                        step.done ? (
                            <div key={step.id} className="flex items-center gap-3 p-3 rounded-lg opacity-50">
                                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-500 line-through">
                                    {step.label}
                                </p>
                            </div>
                        ) : (
                            <Link
                                key={step.id}
                                to={step.href}
                                className="flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-all border-2 border-blue-100 dark:border-blue-900/40"
                            >
                                <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                                    <span className="text-xs font-bold text-white">{index + 1}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{step.label}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{step.description}</p>
                                </div>
                                <ChevronRight className="w-4 h-4 text-blue-400 flex-shrink-0" />
                            </Link>
                        )
                    ))}
                </div>
            </div>
        );
    }

    // ── Niveau Intermédiaire ─────────────────────────────────────────────────
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
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <p className="font-bold text-gray-900 dark:text-white text-sm">Niveau Intermédiaire — à explorer</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Vos nouveaux modules sont disponibles dans le menu</p>
                    </div>
                </div>
                <div className="space-y-2 mb-4">
                    {INTERMEDIATE_SUGGESTIONS.map(suggestion => (
                        <Link
                            key={suggestion.id}
                            to={suggestion.href}
                            className="flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-all border border-gray-100 dark:border-gray-700"
                        >
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">{suggestion.label}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{suggestion.description}</p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-blue-400 flex-shrink-0" />
                        </Link>
                    ))}
                </div>
                <button
                    onClick={() => handleLevelUp(levelUpInfo.nextLevel, levelUpInfo.nextLabel)}
                    disabled={levelingUp}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
                >
                    <ArrowUp className="w-4 h-4" />
                    {levelingUp ? 'Activation...' : `Tout débloquer — Niveau ${levelUpInfo.nextLabel} ${levelUpInfo.emoji}`}
                </button>
            </div>
        );
    }

    return null;
};

export default SetupChecklist;
