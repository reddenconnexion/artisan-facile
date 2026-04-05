import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mic, Sparkles, Keyboard, Calculator, X, Lightbulb, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const TIPS = [
    {
        id: 'voice',
        icon: Mic,
        color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
        title: 'Saisie vocale',
        description: 'Dictez un devis à voix haute depuis le chantier. L\'IA transcrit et structure automatiquement.',
        href: '/app/voice-memos',
        cta: 'Essayer',
    },
    {
        id: 'ai',
        icon: Sparkles,
        color: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400',
        title: 'IA dans les devis',
        description: 'Dans le formulaire devis, cliquez sur "Générer avec l\'IA" pour remplir les lignes automatiquement.',
        href: '/app/devis/new',
        cta: 'Créer un devis',
    },
    {
        id: 'shortcuts',
        icon: Keyboard,
        color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
        title: 'Raccourcis clavier',
        description: 'Alt+D → Nouveau devis · Alt+C → Nouveau client · Alt+R → Nouveau RDV. Gagnez du temps au bureau.',
        href: null,
        cta: null,
    },
    {
        id: 'calculator',
        icon: Calculator,
        color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
        title: 'Calculateur matériaux',
        description: 'Dans un devis, ouvrez le calculateur pour estimer le coût des matériaux avant de fixer votre prix.',
        href: '/app/devis/new',
        cta: 'Ouvrir un devis',
    },
];

const FeatureTips = () => {
    const { user } = useAuth();
    const dismissKey = `feature_tips_dismissed_${user?.id}`;
    const [dismissed, setDismissed] = useState(() => localStorage.getItem(dismissKey) === '1');

    if (dismissed) return null;

    return (
        <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Fonctionnalités à découvrir
                    </span>
                </div>
                <button
                    onClick={() => {
                        localStorage.setItem(dismissKey, '1');
                        setDismissed(true);
                    }}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
                    title="Masquer"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {TIPS.map((tip) => {
                    const Icon = tip.icon;
                    const content = (
                        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-4 h-full flex flex-col gap-3 hover:shadow-md transition-shadow">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${tip.color}`}>
                                <Icon className="w-4 h-4" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{tip.title}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{tip.description}</p>
                            </div>
                            {tip.cta && (
                                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-0.5">
                                    {tip.cta} <ChevronRight className="w-3 h-3" />
                                </span>
                            )}
                        </div>
                    );

                    return tip.href ? (
                        <Link key={tip.id} to={tip.href} className="block">
                            {content}
                        </Link>
                    ) : (
                        <div key={tip.id}>{content}</div>
                    );
                })}
            </div>
        </div>
    );
};

export default FeatureTips;
