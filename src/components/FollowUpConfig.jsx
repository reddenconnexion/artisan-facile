import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Clock, MessageSquare, AlertCircle } from 'lucide-react';
import { getFollowUpSettings, saveFollowUpSettings } from '../utils/followUpService';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

const FollowUpConfig = () => {
    const { user } = useAuth();
    const [config, setConfig] = useState({ steps: [] });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            loadConfig();
        }
    }, [user]);

    const loadConfig = async () => {
        setLoading(true);
        const settings = await getFollowUpSettings(user.id);
        setConfig(settings);
        setLoading(false);
    };

    const handleStepChange = (index, field, value) => {
        const newSteps = [...config.steps];
        newSteps[index] = { ...newSteps[index], [field]: value };
        setConfig({ ...config, steps: newSteps });
    };

    const addStep = () => {
        setConfig({
            ...config,
            steps: [
                ...config.steps,
                { delay: 7, label: "Nouvelle relance", context: "Ton poli et professionnel." }
            ]
        });
    };

    const removeStep = (index) => {
        const newSteps = config.steps.filter((_, i) => i !== index);
        setConfig({ ...config, steps: newSteps });
    };

    const handleSave = async () => {
        try {
            await saveFollowUpSettings(user.id, config);
            toast.success("Scénario de relance enregistré !");
        } catch (error) {
            toast.error("Erreur lors de la sauvegarde");
            console.error(error);
        }
    };

    if (loading) return <div className="text-sm text-gray-500">Chargement de la configuration...</div>;

    return (
        <div className="mt-8 pt-8 border-t border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                <Clock className="w-5 h-5 mr-2 text-blue-600" />
                Scénario de Relance Automatique
            </h2>
            <p className="text-gray-500 mb-6 text-sm bg-blue-50 p-4 rounded-lg border border-blue-100">
                Définissez ici la séquence de relances pour vos devis envoyés.
                L'assistant IA utilisera le "Contexte" pour rédiger des e-mails personnalisés à chaque étape.
            </p>

            <div className="space-y-4">
                {config.steps.map((step, index) => (
                    <div key={index} className="bg-white border border-gray-200 p-4 rounded-lg shadow-sm relative group">
                        <div className="flex flex-col md:flex-row gap-4">
                            <div className="flex-1">
                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Étape {index + 1}</label>
                                <input
                                    type="text"
                                    value={step.label}
                                    onChange={(e) => handleStepChange(index, 'label', e.target.value)}
                                    className="w-full font-medium border-0 border-b border-gray-300 focus:border-blue-500 focus:ring-0 px-0 bg-transparent placeholder-gray-400"
                                    placeholder="Nom de la relance (ex: Relance J+3)"
                                />
                            </div>
                            <div className="w-full md:w-32">
                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Délai (jours)</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={step.delay}
                                        onChange={(e) => handleStepChange(index, 'delay', parseInt(e.target.value) || 0)}
                                        className="w-full border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-right pr-8"
                                    />
                                    <span className="absolute right-3 top-2 text-gray-400 text-sm">j</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-3">
                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 flex items-center">
                                <MessageSquare className="w-3 h-3 mr-1" />
                                Contexte pour l'IA
                            </label>
                            <textarea
                                value={step.context}
                                onChange={(e) => handleStepChange(index, 'context', e.target.value)}
                                className="w-full border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                                rows={2}
                                placeholder="Donnez des instructions à l'IA (ex: Ton courtois, insister sur la dispo...)"
                            />
                        </div>

                        <button
                            onClick={() => removeStep(index)}
                            className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Supprimer cette étape"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>

            <div className="mt-4 flex justify-between items-center">
                <button
                    onClick={addStep}
                    className="flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                    <Plus className="w-4 h-4 mr-1" />
                    Ajouter une étape
                </button>

                <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800"
                >
                    Enregistrer le scénario
                </button>
            </div>
        </div>
    );
};

export default FollowUpConfig;
