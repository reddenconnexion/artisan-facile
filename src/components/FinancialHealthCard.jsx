import React, { useMemo, useState } from 'react';
import { Heart, TrendingUp, ChevronDown, Lightbulb, Activity } from 'lucide-react';
import { computeFinancialHealth, scoreColor, scoreLabel } from '../utils/financialHealth';

/* ─── Gauge SVG circulaire animée ─── */
const ScoreGauge = ({ score, size = 132 }) => {
    const stroke = 10;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const safeScore = score ?? 0;
    const offset = circumference - (safeScore / 100) * circumference;
    const color = scoreColor(score).hex;

    return (
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <circle
                    cx={size / 2} cy={size / 2} r={radius}
                    stroke="#e5e7eb" strokeWidth={stroke} fill="none"
                    className="dark:stroke-gray-700"
                />
                <circle
                    cx={size / 2} cy={size / 2} r={radius}
                    stroke={color} strokeWidth={stroke} fill="none"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 1s ease-out, stroke 0.5s' }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-gray-900 dark:text-white">
                    {score !== null ? score : '—'}
                </span>
                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                    sur 100
                </span>
            </div>
        </div>
    );
};

/* ─── Une métrique du breakdown ─── */
const MetricRow = ({ metric }) => {
    const color = scoreColor(metric.score);
    const isActive = metric.score !== null;

    return (
        <div className="py-2">
            <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {metric.label}
                </p>
                <p className={`text-[10px] font-bold flex-shrink-0 ${color.text}`}>
                    {metric.score !== null ? `${metric.score}/100` : '—'}
                </p>
            </div>
            <p className={`text-lg font-bold leading-tight mt-0.5 ${isActive ? color.text : 'text-gray-300 dark:text-gray-600'}`}>
                {metric.value || '—'}
            </p>
            <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden mt-1.5">
                <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                        width: `${metric.score ?? 0}%`,
                        backgroundColor: color.hex,
                    }}
                />
            </div>
        </div>
    );
};

/* ─── Composant principal ─── */
const FinancialHealthCard = ({ quotes }) => {
    const [showAdvice, setShowAdvice] = useState(false);

    const health = useMemo(() => computeFinancialHealth(quotes || []), [quotes]);

    // Pas du tout de devis : on n'affiche pas la carte (l'onboarding s'en charge)
    if (!quotes || quotes.length === 0) return null;

    // Devis présents mais pas assez signés/facturés pour calculer un score
    if (!health.hasData) {
        return (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
                <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-blue-50 dark:bg-blue-900/30 rounded-xl">
                        <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-900 dark:text-white text-base">
                            Score de santé financière
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Pas encore assez de devis signés ou de factures payées pour calculer votre score.
                            Continuez votre activité, le score apparaîtra automatiquement.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const color = scoreColor(health.score);
    const label = scoreLabel(health.score);

    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="p-5 sm:p-6">

                {/* Header */}
                <div className="flex items-center gap-2.5 mb-5">
                    <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-900/30">
                        <Heart className="w-4 h-4 text-rose-500" fill="currentColor" />
                    </div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-base">
                        Santé financière
                    </h3>
                    <span className={`ml-auto text-xs font-bold px-2.5 py-1 rounded-full ${color.text} bg-gray-50 dark:bg-gray-800`}>
                        {label}
                    </span>
                </div>

                {/* Gauge + breakdown side-by-side sur desktop, empilés sur mobile */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-6">
                    <div className="flex justify-center sm:justify-start">
                        <ScoreGauge score={health.score} />
                    </div>

                    <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                        {health.breakdown.map(metric => (
                            <MetricRow key={metric.id} metric={metric} />
                        ))}
                    </div>
                </div>

                {/* Conseils */}
                {health.advice.length > 0 && (
                    <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800">
                        <button
                            onClick={() => setShowAdvice(v => !v)}
                            className="w-full flex items-center gap-2 text-left text-sm font-semibold text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-colors"
                        >
                            <Lightbulb className="w-4 h-4 flex-shrink-0" />
                            <span className="flex-1">
                                {health.advice.length} conseil{health.advice.length > 1 ? 's' : ''} pour améliorer votre score
                            </span>
                            <ChevronDown className={`w-4 h-4 transition-transform ${showAdvice ? 'rotate-180' : ''}`} />
                        </button>

                        {showAdvice && (
                            <ul className="mt-3 space-y-2">
                                {health.advice.map((tip, idx) => (
                                    <li
                                        key={idx}
                                        className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 bg-amber-50/50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30 rounded-lg px-3 py-2"
                                    >
                                        <TrendingUp className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                                        <span className="leading-relaxed">{tip}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {/* Aucun conseil = score parfait, on félicite */}
                {health.advice.length === 0 && health.score >= 80 && (
                    <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800">
                        <p className="text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
                            <span>🎉</span>
                            <span>Vos indicateurs sont au vert — continuez sur cette lancée !</span>
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FinancialHealthCard;
