import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, ChevronRight, X, Rocket } from 'lucide-react';
import { useClients, useQuotes, useUserProfile } from '../hooks/useDataCache';
import { useAuth } from '../context/AuthContext';

const SetupChecklist = () => {
    const { user } = useAuth();
    const isDemo = user?.is_anonymous === true || user?.id === 'demo-local-fallback';
    const dismissKey = `setup_checklist_dismissed_${user?.id}`;
    const [dismissed, setDismissed] = useState(() => localStorage.getItem(dismissKey) === '1');

    const { data: profile } = useUserProfile();
    const { data: clients = [] } = useClients();
    const { data: quotes = [] } = useQuotes();

    const profileComplete = !!(profile?.company_name && profile?.siret);
    const hasClient = clients.length > 0;
    const hasQuote = quotes.length > 0;

    // En mode démo, le profil est pré-rempli — on invite à s'inscrire plutôt qu'à configurer
    const steps = isDemo ? [
        {
            id: 'quote',
            label: 'Créer un devis d\'essai',
            description: 'Testez le formulaire — client et profil déjà remplis',
            done: hasQuote,
            href: '/app/devis/new',
        },
        {
            id: 'client',
            label: 'Ajouter un client',
            description: 'Créez une fiche client en quelques secondes',
            done: false,
            href: '/app/clients/new',
        },
        {
            id: 'register',
            label: 'Créer mon compte gratuit',
            description: 'Conservez vos données et accédez à toutes les fonctionnalités',
            done: false,
            href: '/register',
        },
    ] : [
        {
            id: 'profile',
            label: 'Compléter votre profil',
            description: 'Nom d\'entreprise, SIRET et adresse — requis pour des devis légalement valides',
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

    if (dismissed || allDone) return null;

    const handleDismiss = () => {
        localStorage.setItem(dismissKey, '1');
        setDismissed(true);
    };

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
                        {isDemo ? 'Explorez l\'app — tout est déjà prêt' : `Démarrez votre activité — ${completedCount}/${steps.length} étapes`}
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
                {steps.map((step) => (
                    step.done ? (
                        <div
                            key={step.id}
                            className="flex items-center gap-3 p-3 rounded-lg opacity-50"
                        >
                            <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-500 line-through">
                                {step.label}
                            </p>
                        </div>
                    ) : (
                        <Link
                            key={step.id}
                            to={step.href}
                            className="flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-gray-800 shadow-sm hover:shadow-md hover:bg-white dark:hover:bg-gray-700 transition-all"
                        >
                            <Circle className="w-5 h-5 text-blue-300 dark:text-blue-600 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                    {step.label}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    {step.description}
                                </p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        </Link>
                    )
                ))}
            </div>
        </div>
    );
};

export default SetupChecklist;
