import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BookOpen, Mic, Truck, Zap, Tag, ChevronRight } from 'lucide-react';

const COLOR = {
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    violet: 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400',
    rose: 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
    emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
};

const Ressources = () => {
    const { user } = useAuth();
    const userSettings = user?.user_metadata?.activity_settings || {};
    const jobType = user?.user_metadata?.job_type;
    const skillLevel = userSettings.skill_level ?? 'debutant';
    const showConfirme = skillLevel === 'confirme';

    const enablePriceLibrary = userSettings.enable_price_library ?? true;
    const enableRentals = userSettings.enable_rentals
        ?? (['macon', 'gros_oeuvre', 'peintre', 'paysagiste', 'terrassier'].includes(jobType) || !jobType);

    const tools = [
        ...(enablePriceLibrary ? [{
            name: 'Bibliothèque de prix',
            description: 'Vos ouvrages et matériaux favoris pour créer vos devis plus vite.',
            href: '/app/library',
            icon: BookOpen,
            color: 'blue',
        }] : []),
        {
            name: 'Plan électrique',
            description: 'Concevez et sauvegardez des plans électriques dans la fiche client.',
            href: '/app/outils',
            icon: Zap,
            color: 'amber',
        },
        {
            name: 'Étiquettes de tableau',
            description: 'Générez les étiquettes de votre tableau électrique.',
            href: '/app/etiquettes-tableau',
            icon: Tag,
            color: 'violet',
        },
        {
            name: 'Mémos vocaux',
            description: 'Enregistrez des notes vocales et retrouvez-les facilement.',
            href: '/app/voice-memos',
            icon: Mic,
            color: 'rose',
        },
        ...(enableRentals && showConfirme ? [{
            name: 'Locations de matériel',
            description: "Suivez les locations d'équipements (échafaudages, mini-pelles...).",
            href: '/app/rentals',
            icon: Truck,
            color: 'emerald',
        }] : []),
    ];

    return (
        <div className="max-w-5xl mx-auto">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Outils</h1>
                <p className="text-gray-500 dark:text-gray-400 mt-1">
                    Vos outils métier et ressources, regroupés au même endroit.
                </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {tools.map(tool => {
                    const Icon = tool.icon;
                    return (
                        <Link
                            key={tool.href}
                            to={tool.href}
                            className="group flex flex-col gap-3 p-5 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-md transition-all"
                        >
                            <div className="flex items-center justify-between">
                                <div className={`p-3 rounded-lg ${COLOR[tool.color]}`}>
                                    <Icon className="w-6 h-6" />
                                </div>
                                <ChevronRight className="w-5 h-5 text-gray-300 dark:text-gray-600 group-hover:text-blue-500 transition-colors" />
                            </div>
                            <div>
                                <h2 className="font-semibold text-gray-900 dark:text-white">{tool.name}</h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{tool.description}</p>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
};

export default Ressources;
