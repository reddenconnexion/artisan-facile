import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../utils/supabase';
import { toast } from 'sonner';
import { Save, CheckCircle, Circle, Folder, FileText, Pen, Wrench, Shield, List, Users, Calendar, Calculator, LogOut, Box, ClipboardList, Image as ImageIcon, Megaphone, Kanban } from 'lucide-react';
import FollowUpConfig from '../../components/FollowUpConfig';

const ActivitySettings = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Default settings
    const [settings, setSettings] = useState({
        skill_level: 'debutant',
        enable_price_library: true,
        enable_maintenance: false,
        enable_deposits: true,
        enable_situations: false,
        enable_signature: true,
        enable_rentals: false,
        enable_crm: true,
        enable_agenda: true,
        enable_calculator: true,
        enable_accounting: true,
        enable_inventory: true,
        enable_intervention_reports: true,
        enable_portfolio: false,
        enable_marketing: false
    });

    useEffect(() => {
        if (user) {
            fetchSettings();
        }
    }, [user]);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            // We store these preferences in user_metadata for simplicity as they are user-specific config
            // Alternatively, we could overlap with a 'profiles' table, but metadata is faster for now.

            // However, Supabase auth.users metadata is editable.
            // Let's check if we have them in metadata, otherwise defaults.
            const meta = user.user_metadata?.activity_settings;

            if (meta) {
                setSettings(prev => ({ ...prev, ...meta }));
            } else {
                // Smart Defaults based on Job Type
                const jobType = user.user_metadata?.job_type;
                if (['plombier', 'chauffagiste', 'electricien'].includes(jobType)) {
                    setSettings(prev => ({ ...prev, enable_maintenance: true }));
                }
                if (['macon', 'gros_oeuvre', 'peintre'].includes(jobType)) {
                    setSettings(prev => ({ ...prev, enable_situations: true }));
                }
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
            toast.error("Impossible de charger vos préférences");
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = (key) => {
        setSettings(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            const { error } = await supabase.auth.updateUser({
                data: { activity_settings: settings }
            });

            if (error) throw error;
            toast.success("Préférences enregistrées !");
        } catch (error) {
            console.error('Error saving settings:', error);
            toast.error("Erreur lors de la sauvegarde");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Chargement...</div>;

    const features = [
        {
            key: 'enable_price_library',
            label: 'Bibliothèque de Prix',
            description: 'Gérez vos ouvrages et matériaux favoris pour créer vos devis plus vite.',
            icon: Folder
        },
        {
            key: 'enable_inventory',
            label: 'Gestion de Stock',
            description: 'Suivez quantités et valeur de votre stock de matériaux.',
            icon: Box
        },
        {
            key: 'enable_maintenance',
            label: 'Contrats de Maintenance',
            description: 'Suivi des entretiens périodiques et dates d\'échéance (SAV).',
            icon: Wrench
        },
        {
            key: 'enable_deposits',
            label: 'Factures d\'Acompte',
            description: 'Générez des factures partielles pour valider le démarrage des travaux.',
            icon: FileText
        },
        {
            key: 'enable_situations',
            label: 'Factures de Situation',
            description: 'Facturez à l\'avancement du chantier (ex: 30%, 60%...).',
            icon: List
        },
        {
            key: 'enable_signature',
            label: 'Signature Électronique',
            description: 'Faites signer vos devis directement sur tablette ou mobile.',
            icon: Pen
        },
        {
            key: 'enable_rentals',
            label: 'Suivi Location Matériel',
            description: 'Gérez les locations d\'équipements (échafaudages, mini-pelles...).',
            icon: Shield
        },
        {
            key: 'enable_crm',
            label: 'Suivi de Chantiers (Kanban)',
            description: 'Gérez l\'avancement de vos chantiers en colonnes : acompte reçu, commande matériel, en cours, terminé.',
            icon: Kanban
        },
        {
            key: 'enable_portfolio',
            label: 'Portfolio & Réalisations',
            description: 'Publiez vos photos de chantiers terminés pour les partager avec des prospects.',
            icon: ImageIcon
        },
        {
            key: 'enable_marketing',
            label: 'Calendrier Marketing',
            description: 'Planifiez vos publications sur les réseaux sociaux (Facebook, Instagram…).',
            icon: Megaphone
        },
        {
            key: 'enable_agenda',
            label: 'Agenda Intelligent',
            description: 'Planification des rendez-vous et chantiers.',
            icon: Calendar
        },
        {
            key: 'enable_calculator',
            label: 'Calculatrice de Matériaux',
            description: 'Estimez les quantités de matériaux (ciment, peinture...) directement depuis le devis.',
            icon: Calculator
        },
        {
            key: 'enable_accounting',
            label: 'Comptabilité & Charges',
            description: 'Suivi du CA et calcul automatique des charges sociales (URSSAF).',
            icon: Calculator
        },
        {
            key: 'enable_intervention_reports',
            label: 'Rapports d\'intervention',
            description: 'Créez des rapports de dépannage avec signature client et export PDF.',
            icon: ClipboardList
        }
    ];

    const LEVELS = [
        {
            id: 'debutant',
            emoji: '🌱',
            label: 'Débutant',
            description: 'Devis et clients uniquement — l\'essentiel pour démarrer',
        },
        {
            id: 'intermediaire',
            emoji: '⚡',
            label: 'Intermédiaire',
            description: 'Ajoute l\'agenda, les chantiers et la comptabilité',
        },
        {
            id: 'confirme',
            emoji: '🚀',
            label: 'Confirmé',
            description: 'Tous les modules activés selon vos préférences ci-dessous',
        },
    ];

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mon Activité</h1>
                <p className="text-gray-500 dark:text-gray-400 mt-1">Adaptez l'interface à votre niveau d'utilisation, puis activez les modules dont vous avez besoin.</p>
            </div>

            {/* Sélecteur de niveau */}
            <div className="mb-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Niveau d'expérience</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Choisissez votre niveau pour adapter la navigation à votre utilisation.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {LEVELS.map(level => {
                        const isSelected = (settings.skill_level ?? 'debutant') === level.id;
                        return (
                            <button
                                key={level.id}
                                onClick={() => setSettings(prev => ({ ...prev, skill_level: level.id }))}
                                className={`flex flex-col items-start p-4 rounded-xl border-2 text-left transition-all ${
                                    isSelected
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-900'
                                }`}
                            >
                                <span className="text-2xl mb-2">{level.emoji}</span>
                                <span className={`text-sm font-bold ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-800 dark:text-gray-200'}`}>
                                    {level.label}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{level.description}</span>
                            </button>
                        );
                    })}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                    💡 Le niveau <strong>Confirmé</strong> respecte les activations ci-dessous. Les autres niveaux ont une sélection prédéfinie.
                </p>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
                {features.map((feature) => {
                    const isEnabled = settings[feature.key];
                    const Icon = feature.icon;

                    return (
                        <div key={feature.key} className="p-6 flex items-start justify-between hover:bg-gray-50 transition-colors">
                            <div className="flex gap-4">
                                <div className={`p-3 rounded-lg ${isEnabled ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                                    <Icon className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-medium text-gray-900">{feature.label}</h3>
                                    <p className="text-gray-500 text-sm mt-1">{feature.description}</p>
                                </div>
                            </div>

                            <button
                                onClick={() => handleToggle(feature.key)}
                                className={`text-2xl focus:outline-none transition-colors ${isEnabled ? 'text-blue-600' : 'text-gray-300'}`}
                            >
                                {isEnabled ? <CheckCircle className="w-8 h-8" /> : <Circle className="w-8 h-8" />}
                            </button>
                        </div>
                    );
                })}
            </div>

            <FollowUpConfig />

            <div className="mt-8 flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm"
                >
                    <Save className="w-5 h-5 mr-2" />
                    {saving ? 'Enregistrement...' : 'Enregistrer mes préférences'}
                </button>
            </div>
        </div>
    );
};

export default ActivitySettings;
