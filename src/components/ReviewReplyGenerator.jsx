import React, { useState, useEffect } from 'react';
import { Star, Sparkles, Loader2, Copy, Check, RefreshCw, MessageSquareQuote } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../utils/supabase';
import { generateReviewReply } from '../utils/aiService';
import { getTradeConfig } from '../constants/trades';

const TONES = [
    { id: 'chaleureux', label: 'Chaleureux' },
    { id: 'professionnel', label: 'Professionnel' },
    { id: 'concis', label: 'Concis' },
];

const VARIANT_COUNTS = [2, 3];

/**
 * Outil de réponse aux avis clients optimisé pour le référencement local.
 * L'artisan colle l'avis reçu, choisit la note, le ton et le nombre de
 * variantes ; l'IA génère plusieurs réponses publiables (affichées côte à côte)
 * qui intègrent naturellement nom d'entreprise, métier et ville (signaux SEO
 * local) — sans bourrage de mots-clés et avec gestion adaptée des avis négatifs.
 */
const ReviewReplyGenerator = () => {
    const { user } = useAuth();

    const [business, setBusiness] = useState(null);
    const [reviewText, setReviewText] = useState('');
    const [rating, setRating] = useState(5);
    const [customerName, setCustomerName] = useState('');
    const [tone, setTone] = useState('chaleureux');
    const [count, setCount] = useState(3);

    const [loading, setLoading] = useState(false);
    const [replies, setReplies] = useState([]);
    const [copiedIndex, setCopiedIndex] = useState(null);

    // Charge le contexte entreprise utilisé pour le SEO local.
    useEffect(() => {
        if (!user) return;
        supabase
            .from('profiles')
            .select('company_name, city, postal_code, trade, full_name')
            .eq('id', user.id)
            .single()
            .then(({ data }) => {
                if (!data) return;
                const tradeLabel = getTradeConfig(data.trade)?.label || '';
                setBusiness({
                    companyName: data.company_name || '',
                    city: data.city || '',
                    area: data.postal_code || '',
                    trade: tradeLabel,
                    signature: data.company_name || data.full_name || '',
                });
            });
    }, [user]);

    const handleGenerate = async () => {
        if (!reviewText.trim()) {
            toast.error("Collez d'abord l'avis du client.");
            return;
        }
        setLoading(true);
        setCopiedIndex(null);
        try {
            const { replies: generated } = await generateReviewReply({
                reviewText,
                rating,
                customerName: customerName.trim(),
                tone,
                business: business || {},
                count,
            });
            setReplies(generated);
        } catch (error) {
            console.error('Review reply error:', error);
            toast.error(error.message || 'Erreur lors de la génération.');
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async (text, index) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedIndex(index);
            toast.success('Réponse copiée !');
            setTimeout(() => setCopiedIndex((c) => (c === index ? null : c)), 2000);
        } catch {
            toast.error('Copie impossible sur cet appareil.');
        }
    };

    const isNegative = rating <= 2;
    const hasResults = replies.length > 0;

    return (
        <div className="space-y-4">
            {/* Intro */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                    <MessageSquareQuote className="w-5 h-5 text-blue-600" />
                    Réponse aux avis (SEO local)
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Collez l'avis reçu : l'IA propose plusieurs réponses publiables qui intègrent
                    naturellement votre métier{business?.city ? `, votre ville` : ''} et le nom de votre
                    entreprise pour booster votre référencement local Google.
                </p>
                {business && !business.city && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                        Astuce : renseignez votre ville et votre métier dans Paramètres &gt; Profil
                        pour des réponses encore mieux optimisées localement.
                    </p>
                )}
            </div>

            {/* Saisie */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                    {/* Note */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            Note de l'avis
                        </label>
                        <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((n) => (
                                <button
                                    key={n}
                                    type="button"
                                    onClick={() => setRating(n)}
                                    className="p-1 transition-transform hover:scale-110"
                                    aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
                                    aria-pressed={rating === n}
                                >
                                    <Star
                                        className={`w-7 h-7 ${
                                            n <= rating
                                                ? 'fill-amber-400 text-amber-400'
                                                : 'text-gray-300 dark:text-gray-600'
                                        }`}
                                    />
                                </button>
                            ))}
                            <span className="ml-2 text-sm text-gray-500">{rating}/5</span>
                        </div>
                    </div>

                    {/* Prénom client */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            Prénom du client <span className="text-gray-400 font-normal">(optionnel)</span>
                        </label>
                        <input
                            type="text"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            placeholder="Ex : Sophie"
                            className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                </div>

                {isNegative && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">
                        Avis négatif : les réponses resteront empathiques et professionnelles,
                        sans mots-clés marketing, et inviteront à poursuivre hors ligne.
                    </p>
                )}

                {/* Avis */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Avis du client
                    </label>
                    <textarea
                        value={reviewText}
                        onChange={(e) => setReviewText(e.target.value)}
                        rows={5}
                        placeholder="Collez ici l'avis laissé par le client..."
                        className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                    />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                    {/* Ton */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            Ton de la réponse
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {TONES.map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setTone(t.id)}
                                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                                        tone === t.id
                                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                    }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Nombre de variantes */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            Nombre de variantes
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {VARIANT_COUNTS.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setCount(c)}
                                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                                        count === c
                                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                    }`}
                                >
                                    {c} propositions
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleGenerate}
                    disabled={loading || !reviewText.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {loading ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Génération...
                        </>
                    ) : (
                        <>
                            <Sparkles className="w-4 h-4" />
                            {hasResults ? 'Générer de nouvelles propositions' : 'Générer les propositions'}
                        </>
                    )}
                </button>
            </div>

            {/* Résultats */}
            {(hasResults || loading) && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                            {hasResults
                                ? `${replies.length} proposition${replies.length > 1 ? 's' : ''} — choisissez celle qui vous ressemble`
                                : 'Rédaction en cours...'}
                        </h3>
                        {hasResults && (
                            <button
                                onClick={handleGenerate}
                                disabled={loading}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-50"
                                title="Régénérer d'autres propositions"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                                Régénérer
                            </button>
                        )}
                    </div>

                    {loading && !hasResults ? (
                        <div className="flex items-center justify-center py-12 text-gray-400">
                            <Loader2 className="w-6 h-6 animate-spin" />
                        </div>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {replies.map((reply, index) => {
                                const copied = copiedIndex === index;
                                return (
                                    <div
                                        key={index}
                                        className="flex flex-col bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden"
                                    >
                                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Variante {index + 1}
                                            </span>
                                            <button
                                                onClick={() => handleCopy(reply, index)}
                                                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                                                    copied
                                                        ? 'text-green-600 bg-green-50 dark:bg-green-900/20'
                                                        : 'text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                                                }`}
                                            >
                                                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                                {copied ? 'Copié' : 'Copier'}
                                            </button>
                                        </div>
                                        <p className="flex-1 p-4 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                                            {reply}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ReviewReplyGenerator;
