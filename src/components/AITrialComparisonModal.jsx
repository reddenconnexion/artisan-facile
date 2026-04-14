import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, TrendingUp, Euro, Crown, ChevronRight, X, Zap } from 'lucide-react';

const PRO_PRICE = 14.99; // € / mois
const DEFAULT_QUOTES_PER_WEEK = 4;
const DEFAULT_HOURLY_RATE = 50; // €/h si non configuré

/**
 * Modal affiché après l'essai IA pour comparer
 * le temps passé sur le devis traditionnel vs le devis IA
 * et montrer les économies potentielles rapportées au taux horaire.
 *
 * Props:
 *  - isOpen              : boolean
 *  - traditionalTime     : number  — secondes pour le 1er devis manuel
 *  - aiTime              : number  — secondes pour le devis IA
 *  - hourlyRate          : number  — taux horaire de l'artisan (€)
 *  - onSubscribe         : () => void
 *  - onClose             : () => void
 */
const AITrialComparisonModal = ({
    isOpen,
    traditionalTime,
    aiTime,
    hourlyRate,
    onSubscribe,
    onClose,
}) => {
    const [quotesPerWeek, setQuotesPerWeek] = useState(DEFAULT_QUOTES_PER_WEEK);

    if (!isOpen) return null;

    const rate = parseFloat(hourlyRate) > 0 ? parseFloat(hourlyRate) : DEFAULT_HOURLY_RATE;
    const timeSavedPerQuote = Math.max(0, (traditionalTime || 0) - (aiTime || 0));

    // Calculs mensuel (4,33 semaines / mois)
    const quotesPerMonth = Math.round(quotesPerWeek * 4.33);
    const monthlyTimeSavedSec = timeSavedPerQuote * quotesPerMonth;
    const monthlyTimeSavedHours = monthlyTimeSavedSec / 3600;
    const monthlyValueEur = monthlyTimeSavedHours * rate;
    const roi = monthlyValueEur > 0 ? (monthlyValueEur / PRO_PRICE).toFixed(1) : null;

    // Nombre de devis pour rentabiliser l'abo
    const timeSavedPerQuoteHours = timeSavedPerQuote / 3600;
    const quotesToBreakEven = timeSavedPerQuoteHours > 0
        ? Math.ceil(PRO_PRICE / (timeSavedPerQuoteHours * rate))
        : null;

    // Formatage
    const formatTime = (seconds) => {
        if (!seconds && seconds !== 0) return '—';
        const m = Math.floor(seconds / 60);
        const s = Math.round(seconds % 60);
        if (m === 0) return `${s} sec`;
        if (s === 0) return `${m} min`;
        return `${m} min ${s} sec`;
    };

    const formatHours = (hours) => {
        if (hours < 1) {
            const minutes = Math.round(hours * 60);
            return `${minutes} min`;
        }
        const h = Math.floor(hours);
        const m = Math.round((hours - h) * 60);
        return m > 0 ? `${h}h ${m}min` : `${h}h`;
    };

    const formatEur = (val) =>
        val.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';

    const isSaving = timeSavedPerQuote > 0;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
            <div className="relative w-full sm:max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
                {/* Bande dégradée */}
                <div className="h-1.5 bg-gradient-to-r from-purple-500 via-violet-500 to-indigo-500" />

                {/* Bouton fermer */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    aria-label="Fermer"
                >
                    <X size={18} />
                </button>

                <div className="p-5 sm:p-6">
                    {/* Titre */}
                    <div className="text-center mb-5">
                        <div className="flex items-center justify-center w-12 h-12 bg-purple-100 dark:bg-purple-900/40 rounded-xl mx-auto mb-3">
                            <Zap size={24} className="text-purple-600 dark:text-purple-400" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                            Résultat de votre essai IA
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Comparaison de vos deux devis
                        </p>
                    </div>

                    {/* Comparatif temps */}
                    <div className="grid grid-cols-2 gap-3 mb-5">
                        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-center border border-gray-200 dark:border-gray-700">
                            <Clock size={18} className="text-gray-400 mx-auto mb-1.5" />
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1">
                                Devis traditionnel
                            </p>
                            <p className="text-xl font-bold text-gray-700 dark:text-gray-200">
                                {formatTime(traditionalTime)}
                            </p>
                        </div>
                        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 text-center border border-purple-200 dark:border-purple-800">
                            <Zap size={18} className="text-purple-500 mx-auto mb-1.5" />
                            <p className="text-xs text-purple-600 dark:text-purple-400 font-medium mb-1">
                                Devis avec l'IA
                            </p>
                            <p className="text-xl font-bold text-purple-700 dark:text-purple-300">
                                {formatTime(aiTime)}
                            </p>
                        </div>
                    </div>

                    {/* Gain par devis */}
                    {isSaving && (
                        <div className="flex items-center justify-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-3 mb-5">
                            <TrendingUp size={16} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                            <p className="text-sm font-semibold text-green-700 dark:text-green-300">
                                Gain par devis&nbsp;: <span className="text-base">{formatTime(timeSavedPerQuote)}</span>
                            </p>
                        </div>
                    )}

                    {/* Sélecteur fréquence */}
                    <div className="mb-5">
                        <label className="flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            <span>Combien de devis créez-vous par semaine&nbsp;?</span>
                            <span className="text-purple-600 dark:text-purple-400 font-bold">{quotesPerWeek}</span>
                        </label>
                        <input
                            type="range"
                            min={1}
                            max={20}
                            step={1}
                            value={quotesPerWeek}
                            onChange={(e) => setQuotesPerWeek(parseInt(e.target.value))}
                            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-600"
                        />
                        <div className="flex justify-between text-xs text-gray-400 mt-1">
                            <span>1</span>
                            <span>10</span>
                            <span>20</span>
                        </div>
                    </div>

                    {/* Statistiques mensuelles */}
                    <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-xl p-4 mb-5 border border-purple-100 dark:border-purple-800/50">
                        <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wide mb-3">
                            Potentiel mensuel ({quotesPerMonth} devis/mois)
                        </p>

                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-600 dark:text-gray-300">Temps récupéré</span>
                                <span className="text-sm font-bold text-gray-800 dark:text-white">
                                    {formatHours(monthlyTimeSavedHours)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-600 dark:text-gray-300">
                                    Valeur à {rate} €/h
                                </span>
                                <span className="text-sm font-bold text-green-600 dark:text-green-400">
                                    {formatEur(monthlyValueEur)}
                                </span>
                            </div>
                            <div className="border-t border-purple-200 dark:border-purple-700 pt-2.5 flex items-center justify-between">
                                <span className="text-sm text-gray-600 dark:text-gray-300">
                                    Abonnement Pro IA
                                </span>
                                <span className="text-sm font-bold text-gray-700 dark:text-gray-200">
                                    {PRO_PRICE.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €/mois
                                </span>
                            </div>
                            {roi && parseFloat(roi) > 1 && (
                                <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg px-3 py-2">
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                        Retour sur investissement
                                    </span>
                                    <span className="text-base font-bold text-purple-600 dark:text-purple-400">
                                        ×{roi}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Message break-even */}
                    {quotesToBreakEven !== null && quotesToBreakEven > 0 && (
                        <p className="text-xs text-center text-gray-500 dark:text-gray-400 mb-5">
                            L'abonnement est rentabilisé dès{' '}
                            <span className="font-semibold text-gray-700 dark:text-gray-300">
                                {quotesToBreakEven} devis{quotesToBreakEven > 1 ? 's' : ''} par mois
                            </span>
                            .
                        </p>
                    )}

                    {/* CTA */}
                    <div className="flex flex-col gap-2">
                        <button
                            onClick={onSubscribe}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold rounded-xl transition-all shadow-md hover:shadow-lg active:scale-[0.98]"
                        >
                            <Crown size={16} />
                            Passer Pro — {PRO_PRICE.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €/mois
                            <ChevronRight size={16} />
                        </button>
                        <p className="text-center text-xs text-gray-400 dark:text-gray-500">
                            Sans engagement · Résiliable à tout moment
                        </p>
                        <button
                            onClick={onClose}
                            className="w-full px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                            Plus tard
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AITrialComparisonModal;
