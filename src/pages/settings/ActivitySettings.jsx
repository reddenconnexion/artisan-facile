import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../utils/supabase';
import { toast } from 'sonner';
import { Save, ToggleLeft, ToggleRight, Briefcase, FileText, PenTool, Wrench, ShieldCheck, Layers, Users, Calendar, Calculator, LogOut, Box } from 'lucide-react';
import FollowUpConfig from '../../components/FollowUpConfig';

const ActivitySettings = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Default settings
    const [settings, setSettings] = useState({
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
        enable_inventory: true
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
            icon: Briefcase
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
            icon: Layers
        },
        {
            key: 'enable_signature',
            label: 'Signature Électronique',
            description: 'Faites signer vos devis directement sur tablette ou mobile.',
            icon: PenTool
        },
        {
            key: 'enable_rentals',
            label: 'Suivi Location Matériel',
            description: 'Gérez les locations d\'équipements (échafaudages, mini-pelles...).',
            icon: ShieldCheck
        },
        {
            key: 'enable_crm',
            label: 'Gestion Clients (CRM)',
            description: 'Suivi des fiches clients, historique et notes.',
            icon: Users
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
        }
    ];

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">Mon Activité</h1>
                <p className="text-gray-500 mt-1">Activez uniquement les fonctionnalités dont vous avez besoin pour simplifier votre interface.</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-100 overflow-hidden">
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
                                {isEnabled ? <ToggleRight className="w-10 h-10" /> : <ToggleLeft className="w-10 h-10" />}
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
