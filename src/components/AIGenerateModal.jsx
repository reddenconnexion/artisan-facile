import React, { useState } from 'react';
import { X, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { generateQuoteItems } from '../utils/aiService';

/**
 * Modale pour générer des lignes de devis avec l'IA
 * Extraite de DevisForm.jsx pour réduire sa taille
 */
export default function AIGenerateModal({ isOpen, onClose, onItemsGenerated, userProfile }) {
    const [prompt, setPrompt] = useState('');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleGenerate = async () => {
        if (!prompt.trim()) return;

        setLoading(true);
        try {
            const context = {
                apiKey: userProfile?.openai_api_key || localStorage.getItem('openai_api_key'),
                provider: userProfile?.ai_provider || localStorage.getItem('ai_provider'),
                hourlyRate: userProfile?.ai_hourly_rate || localStorage.getItem('ai_hourly_rate') || '',
                travelFee: {
                    zone1: {
                        radius: userProfile?.zone1_radius || localStorage.getItem('zone1_radius'),
                        price: userProfile?.zone1_price || localStorage.getItem('zone1_price')
                    },
                    zone2: {
                        radius: userProfile?.zone2_radius || localStorage.getItem('zone2_radius'),
                        price: userProfile?.zone2_price || localStorage.getItem('zone2_price')
                    },
                    zone3: {
                        radius: userProfile?.zone3_radius || localStorage.getItem('zone3_radius'),
                        price: userProfile?.zone3_price || localStorage.getItem('zone3_price')
                    }
                },
                instructions: userProfile?.ai_instructions || localStorage.getItem('ai_instructions') || ''
            };

            const items = await generateQuoteItems(prompt, context);
            if (items && items.length > 0) {
                const newItems = items.map(item => ({
                    id: Date.now() + Math.random(),
                    description: item.description,
                    quantity: parseFloat(item.quantity) || 1,
                    unit: item.unit || 'u',
                    price: parseFloat(item.price) || 0,
                    buying_price: 0,
                    type: item.type || 'service'
                }));

                onItemsGenerated(newItems);
                toast.success(`${newItems.length} lignes générées !`);
                onClose();
                setPrompt('');
            } else {
                toast.warning("L'IA n'a pas généré de lignes valides.");
            }
        } catch (error) {
            console.error("AI Error:", error);
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleGenerate();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
                <div className="flex items-center justify-between p-4 border-b">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-purple-600" />
                        Générer avec l'IA
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    <p className="text-sm text-gray-600">
                        Décrivez les travaux à réaliser et l'IA générera les lignes du devis avec les prix estimés.
                    </p>

                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ex: Pose de carrelage 60x60 dans une salle de bain de 8m², avec joints et préparation du sol..."
                        className="w-full h-32 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        autoFocus
                    />

                    <div className="flex justify-end gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            Annuler
                        </button>
                        <button
                            onClick={handleGenerate}
                            disabled={loading || !prompt.trim()}
                            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Génération...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-4 h-4" />
                                    Générer
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
