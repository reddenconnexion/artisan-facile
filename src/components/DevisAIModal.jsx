import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Loader2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { generateQuoteItems } from '../utils/aiService';
import { checkLimit } from '../utils/planLimits';

/**
 * Modal "Assistant Intelligent" — génère des lignes de devis via IA.
 *
 * Props:
 *   open              boolean
 *   onClose           () => void
 *   onItemsGenerated  (items: object[]) => void  — appelé à chaque ajout (batch + suggestions)
 *   userProfile       profil artisan (plan, ai_hourly_rate, ai_instructions, etc.)
 */
const DevisAIModal = ({ open, onClose, onItemsGenerated, userProfile }) => {
    const [aiPrompt, setAiPrompt] = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState([]);
    const [aiDuration, setAiDuration] = useState(null);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const handleClose = () => {
        setAiPrompt('');
        setAiSuggestions([]);
        setAiDuration(null);
        setShowSuggestions(false);
        onClose();
    };

    const handleGenerate = async () => {
        if (!aiPrompt.trim()) return;

        setAiLoading(true);
        try {
            const hasPersonalKey = !!userProfile?.has_openai_api_key;
            const plan = userProfile?.plan || 'free';
            const isPro = plan === 'pro' || plan === 'owner';

            if (!hasPersonalKey && !isPro && userProfile?.id) {
                const { allowed, remaining, limit } = await checkLimit(userProfile.id, 'ai_generation', plan);
                if (!allowed) {
                    toast.error(`Limite atteinte : ${limit} générations IA/mois. Passez au plan Pro pour un accès illimité.`);
                    handleClose();
                    return;
                }
                if (remaining === 1) {
                    toast.info(`Dernière génération IA disponible ce mois-ci (${limit}/${limit}).`);
                }
            }

            const context = {
                hourlyRate: userProfile?.ai_hourly_rate || '',
                instructions: userProfile?.ai_instructions || '',
                customSystemPrompt: userProfile?.ai_preferences?.quote_system_prompt || userProfile?.quote_system_prompt || '',
            };

            const { items, suggestions, estimated_duration } = await generateQuoteItems(aiPrompt, context);

            if (items && items.length > 0) {
                const newItems = items.map(item => ({
                    id: Date.now() + Math.random(),
                    description: item.description,
                    quantity: parseFloat(item.quantity) || 1,
                    unit: item.unit || 'u',
                    price: parseFloat(item.price) || 0,
                    buying_price: 0,
                    type: item.type || 'service',
                }));

                onItemsGenerated(newItems);
                setAiDuration(estimated_duration || null);

                if (suggestions && suggestions.length > 0) {
                    setAiSuggestions(suggestions);
                    setShowSuggestions(true);
                } else {
                    toast.success(`${newItems.length} lignes générées !`);
                    handleClose();
                }
            } else {
                toast.warning("L'IA n'a pas généré de lignes valides.");
            }
        } catch (error) {
            console.error('AI Error:', error);
            toast.error(error.message);
        } finally {
            setAiLoading(false);
        }
    };

    const handleAddSuggestion = (suggestion) => {
        onItemsGenerated([{
            id: Date.now() + Math.random(),
            description: suggestion,
            quantity: 1,
            unit: 'forfait',
            price: 0,
            buying_price: 0,
            type: 'service',
        }]);
        setAiSuggestions(prev => prev.filter(s => s !== suggestion));
        toast.success('Ligne ajoutée — pensez à renseigner le prix');
    };

    if (!open) return null;

    return createPortal(
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6 bg-gradient-to-r from-purple-600 to-indigo-600">
                    <h3 className="text-xl font-bold text-white flex items-center">
                        <Sparkles className="w-6 h-6 mr-3" />
                        Assistant Intelligent
                    </h3>
                    <p className="text-purple-100 text-sm mt-1">
                        {showSuggestions
                            ? "Postes à ne pas oublier détectés par l'IA"
                            : "Décrivez les travaux et l'IA générera le devis pour vous."}
                    </p>
                </div>

                <div className="p-6">
                    {!showSuggestions ? (
                        <>
                            <textarea
                                className="w-full h-32 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
                                placeholder="Ex: Rénovation complète sdb 6m2 avec carrelage métro, douche italienne, meuble vasque..."
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleGenerate(); }}
                                autoFocus
                            />
                            <div className="mt-2 flex justify-between items-center text-xs text-gray-400">
                                <span>Décrivez les travaux ci-dessus.</span>
                                <span>{aiPrompt.length} caractères</span>
                            </div>

                            <div className="mt-6 flex justify-end gap-3">
                                <button
                                    onClick={handleClose}
                                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                                >
                                    Annuler
                                </button>
                                <button
                                    onClick={handleGenerate}
                                    disabled={aiLoading || !aiPrompt.trim()}
                                    className="px-6 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center"
                                >
                                    {aiLoading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Génération...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-4 h-4 mr-2" />
                                            Générer
                                        </>
                                    )}
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            {aiDuration && (
                                <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">
                                    <Clock className="w-4 h-4 flex-shrink-0" />
                                    <span>Durée estimée du chantier : <strong>{aiDuration}</strong></span>
                                </div>
                            )}
                            <p className="text-sm text-gray-600 mb-3">
                                Ces postes sont souvent oubliés pour ce type de travaux. Voulez-vous les ajouter ?
                            </p>
                            <ul className="space-y-2 max-h-60 overflow-y-auto">
                                {aiSuggestions.map((suggestion, idx) => (
                                    <li key={idx} className="flex items-center justify-between gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                                        <span className="text-sm text-gray-700">{suggestion}</span>
                                        <button
                                            onClick={() => handleAddSuggestion(suggestion)}
                                            className="flex-shrink-0 px-3 py-1 text-xs font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600"
                                        >
                                            + Ajouter
                                        </button>
                                    </li>
                                ))}
                                {aiSuggestions.length === 0 && (
                                    <li className="text-sm text-gray-500 text-center py-2">Tous les postes ont été ajoutés !</li>
                                )}
                            </ul>
                            <div className="mt-6 flex justify-end">
                                <button
                                    onClick={handleClose}
                                    className="px-6 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700"
                                >
                                    Terminer
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default DevisAIModal;
