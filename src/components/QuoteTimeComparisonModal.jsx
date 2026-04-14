import React, { useState } from 'react';
import { X, Clock, TrendingUp, Sparkles, ArrowRight, Crown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const PRO_PRICE_MONTHLY = 14.99;
const DEFAULT_QUOTES_PER_WEEK = 4;

const formatTime = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}min ${s}s` : `${m}min`;
};

const StatCard = ({ label, value, sub, highlight }) => (
    <div className={`rounded-xl p-4 text-center ${highlight ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700' : 'bg-gray-50 dark:bg-gray-800/60'}`}>
        <div className={`text-2xl font-bold ${highlight ? 'text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-gray-100'}`}>{value}</div>
        <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</div>}
    </div>
);

const QuoteTimeComparisonModal = ({ manualSeconds, aiSeconds, hourlyRate, onClose }) => {
    const navigate = useNavigate();
    const [quotesPerWeek, setQuotesPerWeek] = useState(DEFAULT_QUOTES_PER_WEEK);

    const savedSeconds = Math.max(0, manualSeconds - aiSeconds);
    const savedMinutes = savedSeconds / 60;
    const savedHours = savedMinutes / 60;

    const weeklyTimeSavedMinutes = Math.round(savedMinutes * quotesPerWeek);
    const monthlyTimeSavedHours = (savedHours * quotesPerWeek * 4.33);

    const rate = parseFloat(hourlyRate) || 45;
    const monthlyGainEuros = Math.round(monthlyTimeSavedHours * rate);
    const roi = monthlyGainEuros > 0
        ? Math.round((monthlyGainEuros / PRO_PRICE_MONTHLY) * 10) / 10
        : 0;

    const timeSavedPct = manualSeconds > 0
        ? Math.round((savedSeconds / manualSeconds) * 100)
        : 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">

                {/* Header */}
                <div className="relative bg-gradient-to-br from-blue-600 to-indigo-700 rounded-t-2xl p-6 text-white">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                    >
                        <X size={16} />
                    </button>
                    <div className="flex items-center gap-2 mb-1">
                        <Sparkles size={20} />
                        <span className="text-sm font-semibold uppercase tracking-wide opacity-90">Résultats de votre essai IA</span>
                    </div>
                    <h2 className="text-2xl font-bold leading-tight">
                        Vous avez gagné {formatTime(savedSeconds)}
                    </h2>
                    <p className="text-blue-100 text-sm mt-1">
                        sur ce seul devis — voici ce que ça représente en un mois
                    </p>
                </div>

                <div className="p-5 space-y-5">

                    {/* Time comparison */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                            <Clock size={14} /> Comparatif de création
                        </h3>
                        <div className="grid grid-cols-3 gap-3">
                            <StatCard
                                label="Sans IA"
                                value={formatTime(manualSeconds)}
                                sub="votre premier devis"
                            />
                            <StatCard
                                label="Avec IA"
                                value={formatTime(aiSeconds)}
                                sub="cet essai"
                                highlight
                            />
                            <StatCard
                                label="Gain"
                                value={`-${timeSavedPct}%`}
                                sub={formatTime(savedSeconds) + ' économisé'}
                                highlight
                            />
                        </div>
                    </div>

                    {/* Frequency selector */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                            <TrendingUp size={14} /> Projection mensuelle
                        </h3>
                        <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-4">
                            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-2">
                                Combien de devis faites-vous par semaine ?
                            </label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="range"
                                    min={1}
                                    max={20}
                                    value={quotesPerWeek}
                                    onChange={e => setQuotesPerWeek(Number(e.target.value))}
                                    className="flex-1 accent-blue-600"
                                />
                                <span className="text-lg font-bold text-blue-600 dark:text-blue-400 w-12 text-right">
                                    {quotesPerWeek}/sem
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mt-3">
                            <StatCard
                                label="Gain temps / semaine"
                                value={weeklyTimeSavedMinutes >= 60
                                    ? `${Math.floor(weeklyTimeSavedMinutes / 60)}h${weeklyTimeSavedMinutes % 60 > 0 ? weeklyTimeSavedMinutes % 60 + 'min' : ''}`
                                    : `${weeklyTimeSavedMinutes} min`}
                                sub={`${quotesPerWeek} devis × ${formatTime(savedSeconds)}`}
                            />
                            <StatCard
                                label="Valeur mensuelle"
                                value={`${monthlyGainEuros} €`}
                                sub={`à ${rate} €/h`}
                                highlight
                            />
                        </div>
                    </div>

                    {/* ROI block */}
                    <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/30 dark:to-blue-900/30 rounded-xl p-4 border border-indigo-100 dark:border-indigo-800">
                        <div className="flex items-start gap-3">
                            <Crown size={20} className="text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
                            <div>
                                <div className="font-semibold text-gray-800 dark:text-gray-100">
                                    L'abonnement Pro à {PRO_PRICE_MONTHLY} €/mois
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
                                    {roi > 1
                                        ? <>Avec {quotesPerWeek} devis/semaine, chaque euro investi vous en rapporte <span className="font-bold text-indigo-700 dark:text-indigo-300">{roi}€</span>. L'abonnement est remboursé en <span className="font-bold text-indigo-700 dark:text-indigo-300">{Math.ceil(30 / roi)}j</span>.</>
                                        : <>L'IA IA vous fait gagner du temps sur chaque devis — adaptez le curseur à votre volume pour visualiser l'économie réelle.</>
                                    }
                                </div>
                                <div className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                                    Sans engagement · Résiliable à tout moment
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* CTA */}
                    <div className="flex flex-col gap-2">
                        <button
                            onClick={() => { onClose(); navigate('/app/subscription'); }}
                            className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow transition-all"
                        >
                            <Crown size={16} />
                            Passer au Pro — {PRO_PRICE_MONTHLY} €/mois
                            <ArrowRight size={16} />
                        </button>
                        <button
                            onClick={onClose}
                            className="w-full py-2.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                        >
                            Continuer sans abonnement
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QuoteTimeComparisonModal;
