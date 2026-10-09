import { useState, useEffect, useRef, useMemo } from 'react';
import { Star, Sparkles, Loader2, Copy, Check, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { generateReviewReply } from '../utils/aiService';
import { getTradeConfig } from '../constants/trades';

const TONES = [
    { id: 'chaleureux', label: 'Chaleureux' },
    { id: 'professionnel', label: 'Professionnel' },
    { id: 'concis', label: 'Concis' },
];

// Réponses que l'artisan a réellement choisies (copiées) : mémorisées par
// utilisateur pour que l'IA ne les reproduise plus jamais, quel que soit
// l'avis traité. On garde les plus récentes pour borner la taille du prompt.
const CHOSEN_STORAGE_LIMIT = 30;
const chosenStorageKey = (userId) => `review_reply_chosen_v1:${userId || 'anonyme'}`;
const loadChosenReplies = (userId) => {
    try {
        const raw = JSON.parse(localStorage.getItem(chosenStorageKey(userId)));
        return Array.isArray(raw) ? raw.filter((r) => typeof r === 'string' && r.trim()) : [];
    } catch {
        return [];
    }
};

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent';

/**
 * Réponse aux avis clients optimisée pour le référencement local, intégrée à
 * la fenêtre « Demander un avis ». L'artisan colle l'avis reçu ; l'IA propose
 * plusieurs réponses publiables qui citent naturellement entreprise, métier et
 * ville. Le lieu et l'objet de l'intervention sont pré-remplis depuis le
 * chantier ouvert.
 */
const ReviewReplyPanel = ({ userProfile, intervention = null, defaultCity = '' }) => {
    const [reviewText, setReviewText] = useState('');
    const [rating, setRating] = useState(5);
    const [customerName, setCustomerName] = useState('');
    const [interventionCity, setInterventionCity] = useState(intervention?.city || defaultCity || '');
    const [workObject, setWorkObject] = useState(intervention?.title || '');
    const [tone, setTone] = useState('chaleureux');

    const [loading, setLoading] = useState(false);
    const [replies, setReplies] = useState([]);
    const [copiedIndex, setCopiedIndex] = useState(null);

    const business = useMemo(() => ({
        companyName: userProfile?.company_name || '',
        city: userProfile?.city || '',
        area: userProfile?.postal_code || '',
        trade: getTradeConfig(userProfile?.trade)?.label || '',
        signature: userProfile?.company_name || userProfile?.full_name || '',
    }), [userProfile]);

    // Propositions déjà générées pour CET avis : « Régénérer » doit s'en
    // écarter. On repart de zéro dès que l'artisan traite un autre avis.
    const previousRepliesRef = useRef([]);
    useEffect(() => {
        previousRepliesRef.current = [];
    }, [reviewText]);

    // Réponses copiées par le passé (tous avis confondus) : bannies de toutes
    // les générations futures.
    const userId = userProfile?.id;
    const chosenRepliesRef = useRef([]);
    useEffect(() => {
        chosenRepliesRef.current = loadChosenReplies(userId);
    }, [userId]);

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
                interventionCity: interventionCity.trim(),
                workObject: workObject.trim(),
                tone,
                business,
                count: 3,
                previousReplies: previousRepliesRef.current,
                chosenReplies: chosenRepliesRef.current,
            });
            previousRepliesRef.current = [...previousRepliesRef.current, ...generated].slice(-12);
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
            // Copier = choisir : cette réponse ne doit plus jamais être proposée.
            const next = [...chosenRepliesRef.current.filter((r) => r !== text), text]
                .slice(-CHOSEN_STORAGE_LIMIT);
            chosenRepliesRef.current = next;
            try {
                localStorage.setItem(chosenStorageKey(userId), JSON.stringify(next));
            } catch {
                // Stockage indisponible : la mémoire de session suffit.
            }
            toast.success("Réponse copiée ! Collez-la sous l'avis Google.");
            setTimeout(() => setCopiedIndex((c) => (c === index ? null : c)), 2000);
        } catch {
            toast.error('Copie impossible sur cet appareil.');
        }
    };

    const isNegative = rating <= 2;
    const hasResults = replies.length > 0;

    return (
        <div className="space-y-4">
            <p className="text-sm text-gray-500">
                Collez l'avis reçu : l'IA propose des réponses prêtes à publier qui citent
                naturellement votre métier, votre ville et votre entreprise (bon pour le
                référencement local Google).
            </p>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Avis du client</label>
                <textarea
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    rows={4}
                    placeholder="Collez ici l'avis laissé par le client..."
                    className={`${inputClass} resize-y`}
                />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Note</label>
                    <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                            <button
                                key={n}
                                type="button"
                                onClick={() => setRating(n)}
                                className="p-1 transition-transform hover:scale-110"
                                aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
                                aria-pressed={rating === n}
                            >
                                <Star className={`w-6 h-6 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Prénom du client <span className="text-gray-400 font-normal">(optionnel)</span>
                    </label>
                    <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Ex : Sophie"
                        className={inputClass}
                    />
                </div>
            </div>

            {isNegative && (
                <p className="text-xs text-gray-500 -mt-2">
                    Avis négatif : les réponses resteront calmes et professionnelles, sans
                    mots-clés marketing, et proposeront d'en parler directement.
                </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Lieu d'intervention <span className="text-gray-400 font-normal">(optionnel)</span>
                    </label>
                    <input
                        type="text"
                        value={interventionCity}
                        onChange={(e) => setInterventionCity(e.target.value)}
                        placeholder={business.city ? `Ex : ${business.city}` : 'Ex : Libourne'}
                        className={inputClass}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Objet de l'intervention <span className="text-gray-400 font-normal">(optionnel)</span>
                    </label>
                    <input
                        type="text"
                        value={workObject}
                        onChange={(e) => setWorkObject(e.target.value)}
                        placeholder="Ex : remplacement tableau électrique"
                        className={inputClass}
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Ton</label>
                <div className="flex flex-wrap gap-2">
                    {TONES.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setTone(t.id)}
                            aria-pressed={tone === t.id}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                                tone === t.id ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            <button
                type="button"
                onClick={handleGenerate}
                disabled={loading || !reviewText.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : hasResults ? <RefreshCw className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                {loading ? 'Rédaction...' : hasResults ? "Proposer d'autres réponses" : 'Proposer des réponses'}
            </button>

            {hasResults && (
                <div className="space-y-3">
                    {replies.map((reply, index) => {
                        const copied = copiedIndex === index;
                        return (
                            <div key={index} className="bg-gray-50 border border-gray-100 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                        Proposition {index + 1}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => handleCopy(reply, index)}
                                        className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                                            copied ? 'text-green-600 bg-green-50' : 'text-blue-600 hover:bg-blue-50'
                                        }`}
                                    >
                                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                        {copied ? 'Copié' : 'Copier'}
                                    </button>
                                </div>
                                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{reply}</p>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ReviewReplyPanel;
