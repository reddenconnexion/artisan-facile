import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Loader2, Clock, HelpCircle, Crown } from 'lucide-react';
import { toast } from 'sonner';
import { generateQuoteItems, generateProQuote } from '../utils/aiService';
import { checkLimit } from '../utils/planLimits';
import { usePriceLibrary } from '../hooks/useDataCache';

/**
 * Modal "Assistant Intelligent" — génère le devis via IA.
 *
 * Plan Pro : devis complet selon la méthode de chiffrage de la skill
 * « devis électrique » (titre, objet des travaux, lignes détaillées par lot,
 * options hors total, réserves), avec un aller-retour de questions quand une
 * information change le prix. Plan gratuit : lignes simples, comme avant.
 *
 * Props:
 *   open              boolean
 *   onClose           () => void
 *   onItemsGenerated  (items: object[]) => void  — ajout de lignes (gratuit + suggestions)
 *   onQuoteGenerated  (quote: object) => void    — devis Pro complet à appliquer au formulaire
 *   userProfile       profil artisan (plan, trade, ai_hourly_rate, ai_instructions, etc.)
 */
const DevisAIModal = ({ open, onClose, onItemsGenerated, onQuoteGenerated, userProfile }) => {
    const [aiPrompt, setAiPrompt] = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState([]);
    const [aiDuration, setAiDuration] = useState(null);
    const [showSuggestions, setShowSuggestions] = useState(false);
    // Devis Pro en attente de réponses aux questions posées par l'IA.
    const [pendingQuote, setPendingQuote] = useState(null);
    const [answers, setAnswers] = useState({});

    const plan = userProfile?.plan || 'free';
    const isPro = plan === 'pro' || plan === 'owner';
    const { data: priceLibrary } = usePriceLibrary();

    const handleClose = () => {
        setAiPrompt('');
        setAiSuggestions([]);
        setAiDuration(null);
        setShowSuggestions(false);
        setPendingQuote(null);
        setAnswers({});
        onClose();
    };

    const aiContext = () => ({
        hourlyRate: userProfile?.ai_hourly_rate || '',
        instructions: userProfile?.ai_instructions || '',
        customSystemPrompt: userProfile?.ai_preferences?.quote_system_prompt || userProfile?.quote_system_prompt || '',
    });

    const showSuggestionsOrClose = (suggestions, successMessage) => {
        if (suggestions && suggestions.length > 0) {
            setAiSuggestions(suggestions);
            setShowSuggestions(true);
        } else {
            toast.success(successMessage);
            handleClose();
        }
    };

    // Devis Pro prêt : appliqué au formulaire, puis les postes à vérifier.
    const applyProQuote = (quote) => {
        const lines = quote.items.length;
        onQuoteGenerated(quote);
        setPendingQuote(null);
        setAiDuration(quote.estimated_duration || null);
        showSuggestionsOrClose(quote.suggestions, `Devis rédigé : ${lines} ligne${lines > 1 ? 's' : ''}, objet et réserves compris.`);
    };

    const runProQuote = async (withAnswers = []) => {
        const quote = await generateProQuote(aiPrompt, {
            ...aiContext(),
            trade: userProfile?.trade || '',
            priceLibrary: priceLibrary || [],
            answers: withAnswers,
        });
        if (!quote.items.length) {
            toast.warning("L'IA n'a pas généré de lignes valides.");
            return;
        }
        if (quote.questions.length > 0) {
            setPendingQuote(quote);
            setAnswers({});
        } else {
            applyProQuote(quote);
        }
    };

    const runFreeQuote = async () => {
        const { items, suggestions, estimated_duration } = await generateQuoteItems(aiPrompt, aiContext());
        if (!items || items.length === 0) {
            toast.warning("L'IA n'a pas généré de lignes valides.");
            return;
        }
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
        showSuggestionsOrClose(suggestions, `${newItems.length} lignes générées !`);
    };

    const handleGenerate = async () => {
        if (!aiPrompt.trim()) return;

        setAiLoading(true);
        try {
            const hasPersonalKey = !!userProfile?.has_openai_api_key;

            if (!hasPersonalKey && !isPro && userProfile?.id) {
                const { allowed, remaining, limit } = await checkLimit(userProfile.id, 'ai_generation', plan);
                if (!allowed) {
                    toast.error(`Vous avez utilisé vos ${limit} textes rédigés par l'appli ce mois-ci. Avec le Pro, c'est sans limite.`);
                    handleClose();
                    return;
                }
                if (remaining === 1) {
                    toast.info(`Dernière génération IA disponible ce mois-ci (${limit}/${limit}).`);
                }
            }

            if (isPro && onQuoteGenerated) await runProQuote();
            else await runFreeQuote();
        } catch (error) {
            console.error('AI Error:', error);
            toast.error(error.message);
        } finally {
            setAiLoading(false);
        }
    };

    const handleRefine = async () => {
        const answered = pendingQuote.questions
            .map((question, i) => ({ question, answer: (answers[i] || '').trim() }))
            .filter((a) => a.answer);
        if (!answered.length) {
            applyProQuote(pendingQuote);
            return;
        }
        setAiLoading(true);
        try {
            await runProQuote(answered);
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

    const subtitle = showSuggestions
        ? "Postes à vérifier avant d'envoyer le devis"
        : pendingQuote
            ? 'Quelques précisions pour chiffrer au plus juste'
            : isPro
                ? "Décrivez les travaux : l'appli rédige le devis complet, avec l'objet, les options et les réserves."
                : "Décrivez les travaux et l'IA générera le devis pour vous.";

    const loadingLabel = isPro ? 'Chiffrage en cours…' : 'Génération...';

    return createPortal(
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6 bg-gradient-to-r from-purple-600 to-indigo-600">
                    <h3 className="text-xl font-bold text-white flex items-center">
                        <Sparkles className="w-6 h-6 mr-3" />
                        Assistant Intelligent
                        {isPro && (
                            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 bg-white/20 text-white text-xs font-semibold rounded-full">
                                <Crown className="w-3 h-3" /> Pro
                            </span>
                        )}
                    </h3>
                    <p className="text-purple-100 text-sm mt-1">{subtitle}</p>
                </div>

                <div className="p-6 overflow-y-auto">
                    {showSuggestions ? (
                        <>
                            {aiDuration && (
                                <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">
                                    <Clock className="w-4 h-4 flex-shrink-0" />
                                    <span>Durée estimée du chantier : <strong>{aiDuration}</strong></span>
                                </div>
                            )}
                            <p className="text-sm text-gray-600 mb-3">
                                {isPro
                                    ? 'Le devis est rempli. Points à vérifier avant de l\'envoyer :'
                                    : 'Ces postes sont souvent oubliés pour ce type de travaux. Voulez-vous les ajouter ?'}
                            </p>
                            <ul className="space-y-2 max-h-60 overflow-y-auto">
                                {aiSuggestions.map((suggestion, idx) => (
                                    <li key={idx} className="flex items-center justify-between gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                                        <span className="text-sm text-gray-700">{suggestion}</span>
                                        {/* En Pro, ce sont des remarques à lire (quantité à
                                            vérifier, étude technique…) : les options
                                            conseillées sont déjà dans le devis. */}
                                        {!isPro && (
                                            <button
                                                onClick={() => handleAddSuggestion(suggestion)}
                                                className="flex-shrink-0 px-3 py-1 text-xs font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600"
                                            >
                                                + Ajouter
                                            </button>
                                        )}
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
                    ) : pendingQuote ? (
                        <>
                            <div className="mb-4 px-3 py-2 bg-green-50 border border-green-100 rounded-lg text-sm text-green-800">
                                Devis prêt{pendingQuote.title ? <> : <strong>{pendingQuote.title}</strong></> : ''} ({pendingQuote.items.length} lignes).
                                Répondez à ce que vous savez pour l'affiner, ou gardez-le tel quel.
                            </div>
                            <ol className="space-y-3">
                                {pendingQuote.questions.map((question, i) => (
                                    <li key={i}>
                                        <label className="flex items-start gap-2 text-sm font-medium text-gray-800 mb-1">
                                            <HelpCircle className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
                                            {question}
                                        </label>
                                        <input
                                            type="text"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                            placeholder="Votre réponse (facultatif)"
                                            value={answers[i] || ''}
                                            onChange={(e) => setAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                                        />
                                    </li>
                                ))}
                            </ol>
                            <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                                <button
                                    onClick={() => applyProQuote(pendingQuote)}
                                    disabled={aiLoading}
                                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                                >
                                    Garder ce chiffrage
                                </button>
                                <button
                                    onClick={handleRefine}
                                    disabled={aiLoading}
                                    className="px-6 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center"
                                >
                                    {aiLoading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            {loadingLabel}
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-4 h-4 mr-2" />
                                            Chiffrer avec mes réponses
                                        </>
                                    )}
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <textarea
                                className="w-full h-32 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
                                placeholder={isPro
                                    ? 'Ex : remplacement tableau 2 rangées par 3 rangées, création de 6 prises plan de travail cuisine, 8 m de câble depuis le tableau, murs en placo, 6 h de pose prévues…'
                                    : 'Ex: Rénovation complète sdb 6m2 avec carrelage métro, douche italienne, meuble vasque...'}
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleGenerate(); }}
                                autoFocus
                            />
                            <div className="mt-2 flex justify-between items-center text-xs text-gray-400">
                                <span>
                                    {isPro
                                        ? 'Plus vous donnez de détails (longueurs, supports, heures), plus le chiffrage est juste.'
                                        : 'Décrivez les travaux ci-dessus.'}
                                </span>
                                <span className="flex-shrink-0 ml-2">{aiPrompt.length} caractères</span>
                            </div>
                            {!isPro && (
                                <p className="mt-3 text-xs text-purple-700 bg-purple-50 rounded-lg px-3 py-2">
                                    Avec le Pro : un devis complet, avec l'objet des travaux, les options conseillées et vos réserves.
                                </p>
                            )}
                            {isPro && aiLoading && (
                                <p className="mt-3 text-xs text-gray-500">
                                    Le chiffrage complet prend en général moins d'une minute, jusqu'à deux sur un gros chantier.
                                </p>
                            )}

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
                                            {loadingLabel}
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-4 h-4 mr-2" />
                                            {isPro ? 'Rédiger le devis' : 'Générer'}
                                        </>
                                    )}
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
