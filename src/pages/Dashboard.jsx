import React, { useState, useMemo, useEffect, useRef } from 'react';

// Animate a number from its previous value to `target` each time target changes.
const useCountUp = (target, duration = 900) => {
    const [val, setVal] = useState(target ?? 0);
    const fromRef = useRef(target ?? 0);
    const rafRef = useRef(null);

    useEffect(() => {
        const to = target ?? 0;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        const from = fromRef.current;
        if (from === to) return;
        let startTs = null;
        const step = (ts) => {
            if (!startTs) startTs = ts;
            const t = Math.min((ts - startTs) / duration, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            setVal(from + (to - from) * eased);
            if (t < 1) { rafRef.current = requestAnimationFrame(step); }
            else { setVal(to); fromRef.current = to; rafRef.current = null; }
        };
        rafRef.current = requestAnimationFrame(step);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [target, duration]); // eslint-disable-line react-hooks/exhaustive-deps

    return val;
};
import { Plus, TrendingUp, TrendingDown, Minus, Users, FileCheck, FileText, PenTool, BarChart3, ArrowLeft, ChevronLeft, ChevronRight, ChevronDown, Mic, CheckCircle2, XCircle, Clock, Sparkles, ChevronRight as ChevronRightIcon, HelpCircle, Calendar, Settings2, Car } from 'lucide-react';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { formatDistanceToNow, startOfWeek, getDaysInMonth, getDate, getDay, addMonths, subMonths, addWeeks, subWeeks, startOfMonth, format, getWeek, isSameMonth, isSameYear, startOfYear, endOfYear, endOfWeek, addYears, subYears, isToday, isTomorrow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useDashboardData, useNextEvent } from '../hooks/useDataCache';
import { useAuth } from '../context/AuthContext';
import { useTestMode } from '../context/TestModeContext';

import ActionableDashboard from '../components/ActionableDashboard';
import QuickActions from '../components/QuickActions';
import WelcomeCard from '../components/WelcomeCard';
import OnboardingChecklist from '../components/OnboardingChecklist';
import FinancialHealthCard from '../components/FinancialHealthCard';
import CopilotChat from '../components/CopilotChat';
import DashboardCustomizeModal from '../components/DashboardCustomizeModal';
import TopClientsWidget from '../components/TopClientsWidget';
import ExpiringQuotesWidget from '../components/ExpiringQuotesWidget';
import { useDashboardSettings } from '../hooks/useDashboardSettings';
import { useAdaptiveOrder } from '../hooks/useAdaptiveOrder';
import CashFlowForecast from '../components/CashFlowForecast';
import { supabase } from '../utils/supabase';

// Ordre par défaut des widgets (à froid / repli). « kpi_strip » est épinglé.
// « clients_memos » regroupe top_clients + voice_memos (grille 2 colonnes
// indivisible). L'ordre effectif est ensuite adapté à l'usage, voir plus bas.
const DASHBOARD_WIDGET_IDS = [
    'kpi_strip', 'expiring_quotes', 'quick_actions', 'actionable',
    'financial_health', 'cash_flow_forecast', 'recent_documents',
    'clients_memos', 'advanced_stats', 'recent_activity',
];

// Score d'un widget = frecency d'une destination représentative de son domaine.
// Un widget n'étant pas « visité » comme une route, on infère sa pertinence.
const WIDGET_SCORE = {
    expiring_quotes:    (s) => s['devis'] || 0,
    actionable:         (s) => s['devis'] || 0,
    recent_documents:   (s) => s['devis'] || 0,
    financial_health:   (s) => s['accounting'] || 0,
    cash_flow_forecast: (s) => s['accounting'] || 0,
    advanced_stats:     (s) => s['accounting'] || 0,
    clients_memos:      (s) => Math.max(s['clients'] || 0, s['voice-memos'] || 0),
    quick_actions:      (s) => (s['devis-new'] || 0) + (s['client-new'] || 0) + (s['intervention-new'] || 0),
    recent_activity:    () => 0,
};
const widgetScoreFn = (id, scores) => (WIDGET_SCORE[id] ? WIDGET_SCORE[id](scores) : 0);

// --- Recent Voice Memos Widget ---
const MEMO_STATUS_ICON = {
    pending:      { Icon: Clock,       color: 'text-gray-400' },
    transcribing: { Icon: Sparkles,    color: 'text-blue-400' },
    processing:   { Icon: Sparkles,    color: 'text-purple-400' },
    done:         { Icon: CheckCircle2,color: 'text-green-500' },
    error:        { Icon: XCircle,     color: 'text-red-400' },
    cancelled:    { Icon: XCircle,     color: 'text-gray-300' },
};

const RecentVoiceMemos = ({ userId, navigate }) => {
    const [memos, setMemos] = useState([]);

    useEffect(() => {
        if (!userId) return;
        supabase.from('voice_memos')
            .select('id, transcript, status, intent_result, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(3)
            .then(({ data }) => setMemos(data || []));
    }, [userId]);

    if (memos.length === 0) return null;

    return (
        <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-gray-200/70 dark:border-white/10 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <Mic size={15} className="text-[#007AFF]" />
                    Mémos vocaux récents
                </h3>
                <button
                    onClick={() => navigate('/app/voice-memos')}
                    className="text-xs text-[#007AFF] hover:opacity-70 flex items-center gap-0.5"
                >
                    Voir tout <ChevronRightIcon size={12} />
                </button>
            </div>
            <div className="space-y-2">
                {memos.map(memo => {
                    const cfg = MEMO_STATUS_ICON[memo.status] || MEMO_STATUS_ICON.pending;
                    const StatusIcon = cfg.Icon;
                    return (
                        <div
                            key={memo.id}
                            onClick={() => navigate('/app/voice-memos')}
                            className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                        >
                            <StatusIcon size={14} className={`mt-0.5 flex-shrink-0 ${cfg.color}`} />
                            <div className="min-w-0 flex-1">
                                {memo.transcript ? (
                                    <p className="text-xs text-gray-600 dark:text-gray-400 italic truncate">"{memo.transcript}"</p>
                                ) : (
                                    <p className="text-xs text-gray-400 italic">En cours de traitement...</p>
                                )}
                                <p className="text-[10px] text-gray-400 mt-0.5">
                                    {formatDistanceToNow(new Date(memo.created_at), { addSuffix: true, locale: fr })}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// --- KPI Strip (4 essentiels d'un coup d'oeil) ---

const TrendBadge = ({ deltaPercent }) => {
    if (deltaPercent === null || deltaPercent === undefined || !Number.isFinite(deltaPercent)) return null;
    const rounded = Math.round(deltaPercent);
    if (rounded === 0) {
        return (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full">
                <Minus className="w-2.5 h-2.5" />
                Stable
            </span>
        );
    }
    const positive = rounded > 0;
    return (
        <span
            className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                positive
                    ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/30'
                    : 'text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-900/30'
            }`}
            title="Évolution par rapport à la période précédente"
        >
            {positive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
            {positive ? '+' : ''}{rounded}%
        </span>
    );
};

const KpiCard = ({ icon: Icon, iconBg, iconColor, value, label, sub, urgent, onClick, index = 0, rawValue, formatFn, trend }) => {
    const counted = useCountUp(typeof rawValue === 'number' ? rawValue : 0, 900);
    const displayValue = typeof rawValue === 'number' && formatFn ? formatFn(counted) : value;
    return (
        <button
            onClick={onClick}
            className={`flex-1 min-w-0 bg-white dark:bg-[#1c1c1e] rounded-2xl border shadow-sm p-4 text-left transition-all hover:shadow-md active:scale-[0.98] animate-card-entrance ${
                urgent
                    ? 'border-amber-200 dark:border-amber-700/50'
                    : 'border-gray-200/70 dark:border-white/10'
            }`}
            style={{ animationDelay: `${index * 60}ms` }}
        >
            <div className="flex items-center justify-between mb-2.5">
                <div className={`p-2 rounded-xl ${iconBg}`}>
                    <Icon className={`w-4 h-4 ${iconColor}`} />
                </div>
                {trend !== undefined && trend !== null ? (
                    <TrendBadge deltaPercent={trend} />
                ) : urgent ? (
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">
                        À faire
                    </span>
                ) : null}
            </div>
            <p className={`text-xl font-bold leading-tight ${urgent ? 'text-amber-700 dark:text-amber-300' : 'text-gray-900 dark:text-white'}`}>
                {displayValue}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</p>
            {sub && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">{sub}</p>}
        </button>
    );
};

const KpiStrip = ({ allQuotes, navigate, nextEvent }) => {
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));

    const caThisMonth = allQuotes
        .filter(q => q.status === 'paid' && new Date(q.date || q.created_at) >= thisMonthStart)
        .reduce((sum, q) => sum + (parseFloat(q.total_ttc) || 0), 0);

    const caLastMonth = allQuotes
        .filter(q => {
            if (q.status !== 'paid') return false;
            const d = new Date(q.date || q.created_at);
            return d >= lastMonthStart && d < thisMonthStart;
        })
        .reduce((sum, q) => sum + (parseFloat(q.total_ttc) || 0), 0);

    // Trend en % vs mois précédent. Quand le mois précédent est à 0, on
    // n'affiche pas de pourcentage (division par zéro non significative).
    const caTrend = caLastMonth > 0 ? ((caThisMonth - caLastMonth) / caLastMonth) * 100 : null;

    const pendingBilled = allQuotes.filter(q => q.status === 'billed');
    const pendingTotal = pendingBilled.reduce((sum, q) => sum + (parseFloat(q.total_ttc) || 0), 0);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const toRelanceCount = allQuotes.filter(q =>
        q.status === 'sent' && !q.archived_at && new Date(q.date || q.created_at) < sevenDaysAgo
    ).length;

    let nextRdvLabel = 'Aucun RDV';
    let nextRdvSub = 'Pas de rendez-vous prévu';
    if (nextEvent) {
        const evDate = new Date(nextEvent.date);
        const [h, m] = (nextEvent.time || '09:00').split(':');
        evDate.setHours(parseInt(h), parseInt(m), 0, 0);
        if (isToday(evDate)) {
            nextRdvLabel = `Aujourd'hui à ${format(evDate, 'HH:mm')}`;
        } else if (isTomorrow(evDate)) {
            nextRdvLabel = `Demain à ${format(evDate, 'HH:mm')}`;
        } else {
            nextRdvLabel = format(evDate, 'EEE dd MMM', { locale: fr });
        }
        nextRdvSub = nextEvent.title || 'Rendez-vous';
    }

    const fmtEur = (v) => v >= 10000
        ? `${(v / 1000).toFixed(0)} k€`
        : v >= 1000
        ? `${(v / 1000).toFixed(1)} k€`
        : `${Math.round(v)} €`;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiCard
                index={0}
                rawValue={caThisMonth}
                formatFn={fmtEur}
                icon={TrendingUp}
                iconBg="bg-green-100 dark:bg-green-900/30"
                iconColor="text-green-600 dark:text-green-400"
                value={fmtEur(caThisMonth)}
                label={`CA ${format(now, 'MMMM', { locale: fr })}`}
                sub={caLastMonth > 0 ? `vs ${fmtEur(caLastMonth)} le mois dernier` : 'Encaissé ce mois'}
                trend={caTrend}
                onClick={() => navigate('/app/accounting')}
            />
            <KpiCard
                index={1}
                rawValue={toRelanceCount}
                formatFn={(v) => Math.round(v) > 0 ? `${Math.round(v)} devis` : 'Aucun'}
                icon={FileText}
                iconBg={toRelanceCount > 0 ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-gray-100 dark:bg-gray-800'}
                iconColor={toRelanceCount > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-400'}
                value={toRelanceCount > 0 ? `${toRelanceCount} devis` : 'Aucun'}
                label="Devis à relancer"
                sub={toRelanceCount > 0 ? 'Sans réponse depuis 7j' : 'Tout est à jour ✓'}
                urgent={toRelanceCount > 0}
                onClick={() => navigate('/app/devis')}
            />
            <div className="relative flex">
                <KpiCard
                    index={2}
                    icon={Calendar}
                    iconBg="bg-blue-100 dark:bg-blue-900/30"
                    iconColor="text-blue-600 dark:text-blue-400"
                    value={nextRdvLabel}
                    label="Prochain RDV"
                    sub={nextRdvSub !== 'Pas de rendez-vous prévu' ? nextRdvSub : undefined}
                    onClick={() => navigate('/app/agenda')}
                />
                {nextEvent?.address && (
                    <a
                        href={`https://waze.com/ul?q=${encodeURIComponent(nextEvent.address)}&navigate=yes`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title={`Naviguer vers ${nextEvent.address} avec Waze`}
                        aria-label="Naviguer avec Waze"
                        className="md:hidden absolute top-3 right-3 p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg shadow-sm transition-colors flex items-center justify-center"
                    >
                        <Car className="w-4 h-4" />
                    </a>
                )}
            </div>
        </div>
    );
};

// --- Helper for Stats Calculation (Pure Function) ---
const calculateStats = (allQuotes, referenceDate) => {
    // Default safe return structure matching buildMetricObject shape
    const getSafeEmptyMetric = () => {
        const emptyItem = { value: 0, max: 100, chart: [], details: [] };
        return {
            week: { ...emptyItem },
            month: { ...emptyItem },
            year: { ...emptyItem },
            lastYear: { ...emptyItem }
        };
    };

    if (!allQuotes || !(referenceDate instanceof Date) || isNaN(referenceDate)) {
        return {
            revenue: getSafeEmptyMetric(),
            netIncome: getSafeEmptyMetric(),
            quotes: getSafeEmptyMetric(),
            conversion: getSafeEmptyMetric()
        };
    }

    try {
        const daysInMonth = getDaysInMonth(referenceDate);
        const emptyMonthChart = new Array(daysInMonth).fill(0);

        // Internal accumulation structure (different from return structure)
        const getInitializedAccumulator = () => ({
            week: 0, month: 0, year: 0, lastYear: 0, total: 0,
            charts: {
                week: new Array(7).fill(0),
                month: [...emptyMonthChart],
                year: new Array(12).fill(0),
                lastYear: new Array(12).fill(0)
            },
            details: { week: [], month: [], year: [], lastYear: [] }
        });

        const metrics = {
            revenue: getInitializedAccumulator(),
            netIncome: getInitializedAccumulator(),
            quotes: getInitializedAccumulator(),
            conversion: {
                week: { signed: 0, total: 0 },
                month: { signed: 0, total: 0 },
                year: { signed: 0, total: 0 },
                lastYear: { signed: 0, total: 0 },
                charts: { week: new Array(7).fill(0), month: [...emptyMonthChart], year: new Array(12).fill(0), lastYear: new Array(12).fill(0) },
                details: { week: [], month: [], year: [], lastYear: [] }
            }
        };

        const refYear = referenceDate.getFullYear();
        const paidQuoteIds = new Set(allQuotes.filter(q => q.type !== 'invoice' && q.status === 'paid').map(q => q.id));

        const formatChartPoints = (data, timeframe) => {
            const monthNames = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec'];
            const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
            return (data || []).map((val, i) => ({
                name: timeframe === 'year' ? monthNames[i] : timeframe === 'month' ? `${i + 1}` : weekDays[i],
                value: val
            }));
        };

        allQuotes.forEach(quote => {
            const amount = parseFloat(quote.total_ht) || parseFloat(quote.total_ttc) || 0;
            const qDate = new Date(quote.date || quote.created_at || new Date());
            if (isNaN(qDate.getTime())) return;

            const status = (quote.status || '').toLowerCase();
            const type = (quote.type || 'quote').toLowerCase();
            const isDirectInvoice = type === 'invoice' && !quote.parent_id;
            const isStandardQuote = type !== 'invoice';
            const isActivity = isStandardQuote || isDirectInvoice;

            // REVENUE & NET INCOME
            if (status === 'paid') {
                const isDuplicate = type === 'invoice' && quote.parent_id && paidQuoteIds.has(quote.parent_id);
                if (!isDuplicate) {
                    metrics.revenue.total += amount;

                    // Net Income (calculated in HT)
                    let netAmount = 0;
                    const isDeposit = (quote.title && /a(c)?compte/i.test(quote.title)) ||
                        (quote.items && quote.items.some(i => i.description && /a(c)?compte/i.test(i.description) && (parseFloat(i.price) || 0) > 0));

                    if (isDeposit) {
                        netAmount = 0; // Deposits are 100% material/cashflow, 0% Net Result (Labor)
                    } else {
                        // Materials Cost (HT)
                        const materialItems = quote.items.filter(i => i.type === 'material');
                        const materialHT = materialItems.reduce((sum, i) => sum + ((parseFloat(i.price) || 0) * (parseFloat(i.quantity) || 0)), 0);

                        // Detect Deductions (Deposits already paid)
                        // Look for negative price items that are likely deposit deductions
                        const deductionItems = quote.items.filter(i => (parseFloat(i.price) || 0) < 0);
                        const deductionHT = deductionItems.reduce((sum, i) => sum + Math.abs((parseFloat(i.price) || 0) * (parseFloat(i.quantity) || 0)), 0);

                        // Adjusted Material Cost = Total Material - Material Already Paid (Deduction)
                        // We assume deduction covers material first.
                        const adjustedMaterialHT = Math.max(0, materialHT - deductionHT);

                        netAmount = amount - adjustedMaterialHT;
                    }



                    if (qDate.getFullYear() === refYear) {
                        metrics.revenue.year += amount;
                        metrics.revenue.charts.year[qDate.getMonth()] += amount;
                        metrics.revenue.details.year.push(quote);

                        metrics.netIncome.year += netAmount;
                        metrics.netIncome.charts.year[qDate.getMonth()] += netAmount;
                        metrics.netIncome.details.year.push({ ...quote, total_ttc: netAmount });

                        if (isSameMonth(qDate, referenceDate)) {
                            metrics.revenue.month += amount;
                            if (metrics.revenue.charts.month[getDate(qDate) - 1] !== undefined) metrics.revenue.charts.month[getDate(qDate) - 1] += amount;
                            metrics.revenue.details.month.push(quote);

                            metrics.netIncome.month += netAmount;
                            if (metrics.netIncome.charts.month[getDate(qDate) - 1] !== undefined) metrics.netIncome.charts.month[getDate(qDate) - 1] += netAmount;
                            metrics.netIncome.details.month.push({ ...quote, total_ttc: netAmount });
                        }

                        const qWeek = getWeek(qDate, { weekStartsOn: 1 });
                        const refWeek = getWeek(referenceDate, { weekStartsOn: 1 });
                        if (qWeek === refWeek) {
                            metrics.revenue.week += amount;
                            const weekDayIndex = (getDay(qDate) + 6) % 7;
                            metrics.revenue.charts.week[weekDayIndex] += amount;
                            metrics.revenue.details.week.push(quote);

                            metrics.netIncome.week += netAmount;
                            metrics.netIncome.charts.week[weekDayIndex] += netAmount;
                            metrics.netIncome.details.week.push({ ...quote, total_ttc: netAmount });
                        }

                    } else if (qDate.getFullYear() === refYear - 1) {
                        metrics.revenue.lastYear += amount;
                        metrics.revenue.charts.lastYear[qDate.getMonth()] += amount;
                        metrics.revenue.details.lastYear.push(quote);
                        metrics.netIncome.lastYear += netAmount;
                        metrics.netIncome.charts.lastYear[qDate.getMonth()] += netAmount;
                        metrics.netIncome.details.lastYear.push({ ...quote, total_ttc: netAmount });
                    }
                }
            }

            // CONVERSION
            if (isActivity) {
                if (qDate.getFullYear() === refYear) {
                    metrics.quotes.year += amount;
                    metrics.quotes.charts.year[qDate.getMonth()] += amount;
                    const isSigned = isDirectInvoice || status === 'accepted' || status === 'paid' || status === 'billed' || !!quote.signed_at;

                    if (isSigned) {
                        metrics.conversion.year.signed++;
                        metrics.conversion.charts.year[qDate.getMonth()]++;
                    }
                    metrics.conversion.year.total++;

                    if (isSameMonth(qDate, referenceDate)) {
                        metrics.quotes.month += amount;
                        if (metrics.quotes.charts.month[getDate(qDate) - 1] !== undefined) metrics.quotes.charts.month[getDate(qDate) - 1] += amount;

                        metrics.conversion.month.total++;
                        if (isSigned) {
                            metrics.conversion.month.signed++;
                            if (metrics.conversion.charts.month[getDate(qDate) - 1] !== undefined) metrics.conversion.charts.month[getDate(qDate) - 1]++;
                        }
                    }

                    const qWeek = getWeek(qDate, { weekStartsOn: 1 });
                    const refWeek = getWeek(referenceDate, { weekStartsOn: 1 });
                    if (qWeek === refWeek) {
                        metrics.quotes.week += amount;
                        const weekDayIndex = (getDay(qDate) + 6) % 7;
                        metrics.quotes.charts.week[weekDayIndex] += amount;

                        metrics.conversion.week.total++;
                        if (isSigned) {
                            metrics.conversion.week.signed++;
                            metrics.conversion.charts.week[weekDayIndex]++;
                        }
                    }

                } else if (qDate.getFullYear() === refYear - 1) {
                    metrics.quotes.lastYear += amount;
                    metrics.quotes.charts.lastYear[qDate.getMonth()] += amount;
                    const isSigned = isDirectInvoice || status === 'accepted' || status === 'paid' || status === 'billed' || !!quote.signed_at;
                    if (isSigned) {
                        metrics.conversion.lastYear.signed++;
                        metrics.conversion.charts.lastYear[qDate.getMonth()]++;
                    }
                    metrics.conversion.lastYear.total++;
                }
            }
        });

        const calcRate = (signed, total) => total > 0 ? (signed / total) * 100 : 0;
        const convStats = {
            week: calcRate(metrics.conversion.week.signed, metrics.conversion.week.total),
            month: calcRate(metrics.conversion.month.signed, metrics.conversion.month.total),
            year: calcRate(metrics.conversion.year.signed, metrics.conversion.year.total),
            lastYear: calcRate(metrics.conversion.lastYear.signed, metrics.conversion.lastYear.total),
        };

        const safeFormat = (chart, type) => formatChartPoints(chart || [], type);
        const buildMetricObject = (metricData, maxRef) => ({
            week: { value: metricData.week, max: maxRef.week * 1.5 || 1000, chart: safeFormat(metricData.charts.week, 'week'), details: metricData.details.week },
            month: { value: metricData.month, max: maxRef.month * 1.2 || 5000, chart: safeFormat(metricData.charts.month, 'month'), details: metricData.details.month },
            year: { value: metricData.year, max: maxRef.year * 1.2 || 10000, chart: safeFormat(metricData.charts.year, 'year'), details: metricData.details.year },
            lastYear: { value: metricData.lastYear, max: maxRef.lastYear * 1.2 || 10000, chart: safeFormat(metricData.charts.lastYear, 'year'), details: metricData.details.lastYear },
        });

        return {
            revenue: buildMetricObject(metrics.revenue, metrics.revenue),
            netIncome: buildMetricObject(metrics.netIncome, metrics.netIncome),
            quotes: buildMetricObject(metrics.quotes, metrics.quotes),
            conversion: {
                week: { value: convStats.week, max: 100, chart: safeFormat(metrics.conversion.charts.week, 'week') },
                month: { value: convStats.month, max: 100, chart: safeFormat(metrics.conversion.charts.month, 'month') },
                year: { value: convStats.year, max: 100, chart: safeFormat(metrics.conversion.charts.year, 'year') },
                lastYear: { value: convStats.lastYear, max: 100, chart: safeFormat(metrics.conversion.charts.lastYear, 'year') },
            }
        };

    } catch (e) {
        console.error("Calculation Error", e);
        return {
            revenue: getSafeEmptyMetric(),
            netIncome: getSafeEmptyMetric(),
            quotes: getSafeEmptyMetric(),
            conversion: getSafeEmptyMetric()
        };
    }
};

// --- Reusable Smart Card with Individual Navigation ---
const RichStatCard = ({ title, tooltip, allQuotes, type, icon: Icon, colorClass, colorHex, formatValue = (v) => `${v.toFixed(0)}`, chartFormatter, staticSubText, onValueClick, cardIndex = 0 }) => {
    const [localDate, setLocalDate] = useState(new Date());
    const [period, setPeriod] = useState('month');
    const [showChart, setShowChart] = useState(false);

    // Calculate stats specifically for this card's localDate
    const stats = useMemo(() => calculateStats(allQuotes, localDate), [allQuotes, localDate]);
    const currentData = stats[type]?.[period]; // Data for current period
    const displayValue = type === 'conversion' ? stats.conversion?.[period]?.value : currentData?.value;

    // Safety check
    if (displayValue === undefined) return null;

    const tooltipFormatter = chartFormatter || formatValue;
    const animatedDisplayValue = useCountUp(displayValue, 900);

    // Navigation Logic
    const navigateDate = (amount) => {
        if (period === 'month') setLocalDate(d => amount > 0 ? addMonths(d, amount) : subMonths(d, Math.abs(amount)));
        else if (period === 'week') setLocalDate(d => amount > 0 ? addWeeks(d, amount) : subWeeks(d, Math.abs(amount)));
        else if (period === 'year') setLocalDate(d => amount > 0 ? addYears(d, amount) : subYears(d, Math.abs(amount)));
        // lastYear is just a view, usually implies "Year - 1" relative to now. We might not navigate it or treat it as year nav.
    };

    const periodLabel = useMemo(() => {
        if (period === 'month') return format(localDate, 'MMMM yyyy', { locale: fr });
        if (period === 'week') return `Semaine ${getWeek(localDate, { weekStartsOn: 1 })}`;
        if (period === 'year') return format(localDate, 'yyyy');
        if (period === 'lastYear') return format(subYears(localDate, 1), 'yyyy');
        return '';
    }, [localDate, period]);

    return (
        <div
            className="bg-white dark:bg-[#1c1c1e] p-6 rounded-2xl shadow-sm border border-gray-200/70 dark:border-white/10 flex flex-col justify-between transition-all duration-300 animate-card-entrance"
            style={{ animationDelay: `${cardIndex * 80}ms` }}
        >
            <div className="flex items-center justify-between mb-4">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</span>
                        {tooltip && (
                            <HelpCircle
                                className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 cursor-help flex-shrink-0"
                                title={tooltip}
                            />
                        )}
                        {/* Mini Navigation Controls in Title Area */}
                        {period !== 'lastYear' && (
                            <div className="flex items-center bg-gray-50 dark:bg-gray-800 rounded px-1 ml-2">
                                <button onClick={(e) => { e.stopPropagation(); navigateDate(-1); }} className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"><ChevronLeft className="w-3 h-3 text-gray-500" /></button>
                                <span className="text-[10px] font-semibold px-1 min-w-[60px] text-center text-gray-700 dark:text-gray-300 capitalize">{periodLabel}</span>
                                <button onClick={(e) => { e.stopPropagation(); navigateDate(1); }} className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"><ChevronRight className="w-3 h-3 text-gray-500" /></button>
                            </div>
                        )}
                    </div>

                    <p
                        className={`text-2xl font-bold text-gray-900 dark:text-white mt-1 ${onValueClick ? 'cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors' : ''}`}
                        onClick={() => onValueClick && onValueClick(period, type === 'conversion' ? [] : currentData?.details || [], localDate)}
                        title={onValueClick ? "Voir le détail" : ""}
                    >
                        {formatValue(animatedDisplayValue)}
                    </p>
                    {staticSubText && !showChart && <p className="text-xs text-gray-400 mt-1">{staticSubText}</p>}
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); setShowChart(!showChart); }}
                    className={`p-3 rounded-lg transition-colors shadow-sm ${showChart ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300' : `${colorClass} text-white hover:opacity-90`}`}
                >
                    {showChart ? <ArrowLeft className="w-6 h-6" /> : <Icon className="w-6 h-6" />}
                </button>
            </div>

            {!showChart ? (
                <div className="space-y-4 pt-2 border-t border-gray-50 dark:border-gray-800 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <RevenueBar label="Cette Semaine" value={stats[type].week.value} max={stats[type].week.max} color={colorClass} onClick={() => { setShowChart(true); setPeriod('week'); }} formatter={formatValue} />
                    <RevenueBar label="Ce Mois" value={stats[type].month.value} max={stats[type].month.max} color={colorClass} onClick={() => { setShowChart(true); setPeriod('month'); }} formatter={formatValue} />
                    <RevenueBar label="Cette Année" value={stats[type].year.value} max={stats[type].year.max} color={colorClass} onClick={() => { setShowChart(true); setPeriod('year'); }} formatter={formatValue} />
                    <RevenueBar label="L'Année dernière" value={stats[type].lastYear?.value || 0} max={stats[type].lastYear?.max || 1} color={colorClass} onClick={() => { setShowChart(true); setPeriod('lastYear'); }} formatter={formatValue} />
                </div>
            ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                        {['week', 'month', 'year', 'lastYear'].map(p => (
                            <button key={p} onClick={() => setPeriod(p)} className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${period === p ? 'bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                                {p === 'week' ? 'Sem' : p === 'month' ? 'Mois' : p === 'year' ? 'An' : 'An-1'}
                            </button>
                        ))}
                    </div>
                    <div className="h-[120px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={type === 'conversion' ? stats.conversion[period]?.chart : stats[type][period]?.chart || []}>
                                <defs>
                                    <linearGradient id={`grad${title.replace(/[^a-zA-Z0-9]/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={colorHex} stopOpacity={0.3} />
                                        <stop offset="95%" stopColor={colorHex} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 10 }} interval={period === 'month' ? 6 : 0} />
                                <Tooltip
                                    contentStyle={{ fontSize: '12px', padding: '4px 8px' }}
                                    formatter={(val) => [tooltipFormatter(val), '']}
                                    labelStyle={{ display: 'none' }}
                                />
                                <Area type="monotone" dataKey="value" stroke={colorHex} strokeWidth={2} fillOpacity={1} fill={`url(#grad${title.replace(/[^a-zA-Z0-9]/g, '')})`} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
        </div >
    );
};

const RevenueBar = ({ label, value, max, color, onClick, formatter }) => {
    const percentage = max > 0 ? (value / max) * 100 : 0;
    return (
        <div className="flex flex-col gap-1 w-full cursor-pointer hover:opacity-80 transition-opacity" onClick={onClick}>
            <div className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300">
                <span>{label}</span>
                <span>{formatter ? formatter(value) : `${value.toFixed(0)} €`}</span>
            </div>
            <div className="h-3 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full ${color} rounded-full transition-all duration-500 ease-out`} style={{ width: `${Math.max(percentage, 2)}%` }} />
            </div>
        </div>
    );
};

const Dashboard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [detailsView, setDetailsView] = useState(null);
    const [statsExpanded, setStatsExpanded] = useState(() => localStorage.getItem('dashboard_stats_expanded') === '1');
    const [customizeOpen, setCustomizeOpen] = useState(false);
    const { isVisible } = useDashboardSettings();
    const { isTestMode, testClient } = useTestMode();

    // Ordre des widgets adapté à l'usage, figé pendant la session (recalcul
    // périodique). « kpi_strip » reste en tête.
    const orderedWidgetIds = useAdaptiveOrder('dashboard', DASHBOARD_WIDGET_IDS, widgetScoreFn, { pinnedIds: ['kpi_strip'] });

    const toggleStats = () => {
        setStatsExpanded(prev => {
            const next = !prev;
            localStorage.setItem('dashboard_stats_expanded', next ? '1' : '0');
            return next;
        });
    };

    // Show welcome toast after email confirmation
    useEffect(() => {
        if (!user?.id) return;
        const key = `welcome_pending_${user.id}`;
        if (localStorage.getItem(key)) {
            localStorage.removeItem(key);
            // Small delay so the toast appears after layout settles
            const t = setTimeout(() => {
                toast.success('Email confirmé ! Bienvenue sur Artisan Facile.', {
                    description: 'Commencez par compléter votre profil pour des devis conformes.',
                    duration: 6000,
                });
            }, 500);
            return () => clearTimeout(t);
        }
    }, [user?.id]);

    // Utilisation du cache React Query
    const { data, isLoading: loading } = useDashboardData();
    const { data: nextEvent } = useNextEvent();
    const skillLevel = user?.user_metadata?.activity_settings?.skill_level ?? 'debutant';
    const showAdvancedStats = skillLevel !== 'debutant';

    const isTestQuote = (q) => q.clients?.name?.includes('⚗️') || (testClient?.id && q.client_id === testClient.id);

    const allQuotes = useMemo(
        () => (data?.allQuotes || []).filter(q => isTestMode || !isTestQuote(q)),
        [data?.allQuotes, isTestMode, testClient?.id]
    );
    const hasNoQuotes = allQuotes.length === 0;
    const clientCount = data?.clientCount || 0;
    const pendingQuotesCount = allQuotes.filter(q => ['draft', 'sent'].includes(q.status)).length;
    const recentActivity = useMemo(
        () => (data?.recentActivity || []).filter(a => isTestMode || !a.description.includes('⚗️')),
        [data?.recentActivity, isTestMode]
    );

    // Afficher un écran de chargement
    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-4 border-[#007AFF] border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-gray-500 text-sm">Chargement...</span>
                </div>
            </div>
        );
    }

    // Chaque widget garde sa propre logique d'affichage (gardes isVisible/niveau)
    // et renvoie null s'il ne doit pas s'afficher. L'ordre est piloté par
    // orderedWidgetIds ; le rendu en Fragment préserve l'espacement space-y-6.
    const widgetRenderers = {
        kpi_strip: () => isVisible('kpi_strip')
            ? <KpiStrip allQuotes={allQuotes} navigate={navigate} nextEvent={nextEvent} />
            : null,
        expiring_quotes: () => isVisible('expiring_quotes')
            ? <ExpiringQuotesWidget allQuotes={allQuotes} navigate={navigate} />
            : null,
        quick_actions: () => isVisible('quick_actions') ? <QuickActions /> : null,
        actionable: () => isVisible('actionable') ? <ActionableDashboard user={user} /> : null,
        financial_health: () => isVisible('financial_health') ? <FinancialHealthCard quotes={allQuotes} /> : null,
        cash_flow_forecast: () => isVisible('cash_flow_forecast') ? <CashFlowForecast allQuotes={allQuotes} navigate={navigate} /> : null,
        recent_documents: () => {
            if (!isVisible('recent_documents') || allQuotes.length === 0) return null;
            const STATUS_LABEL = { draft: 'Brouillon', sent: 'Envoyé', accepted: 'Signé', billed: 'Facturé', paid: 'Payé' };
            const STATUS_COLOR = {
                draft:    'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
                sent:     'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                accepted: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                billed:   'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
                paid:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
            };
            const recent = [...allQuotes]
                .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
                .slice(0, 5);
            return (
                <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-gray-200/70 dark:border-white/10 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/10">
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                            <FileText size={15} className="text-[#007AFF]" />
                            Derniers documents
                        </h3>
                        <button
                            onClick={() => navigate('/app/devis')}
                            className="text-xs text-[#007AFF] hover:opacity-70 flex items-center gap-0.5"
                        >
                            Voir tout <ChevronRightIcon size={12} />
                        </button>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-white/10">
                        {recent.map(q => (
                            <button
                                key={q.id}
                                onClick={() => navigate(`/app/devis/${q.id}`)}
                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 active:bg-gray-100 dark:active:bg-white/10 transition-colors text-left"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                        {q.clients?.name || q.title || `Devis #${q.id}`}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                        {q.title && q.clients?.name ? q.title : q.quote_number || ''}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[q.status] || STATUS_COLOR.draft}`}>
                                        {STATUS_LABEL[q.status] || q.status}
                                    </span>
                                    <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
                                        {(q.total_ttc || 0).toFixed(0)} €
                                    </span>
                                    <ChevronRightIcon size={16} className="text-gray-300 dark:text-gray-600" />
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            );
        },
        clients_memos: () => {
            if (!isVisible('top_clients') && !isVisible('voice_memos')) return null;
            return (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {isVisible('top_clients') && (
                        <TopClientsWidget allQuotes={allQuotes} navigate={navigate} />
                    )}
                    {isVisible('voice_memos') && (
                        <RecentVoiceMemos userId={user?.id} navigate={navigate} />
                    )}
                </div>
            );
        },
        advanced_stats: () => {
            if (!isVisible('advanced_stats') || !showAdvancedStats || hasNoQuotes) return null;
            return (
                <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-sm border border-gray-200/70 dark:border-white/10 overflow-hidden">
                    <button
                        onClick={toggleStats}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-left"
                        aria-expanded={statsExpanded}
                    >
                        <span className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white text-sm">
                            <BarChart3 className="w-4 h-4 text-[#007AFF]" />
                            Mes statistiques (CA, résultat net, conversion)
                        </span>
                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${statsExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    {statsExpanded && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4 border-t border-gray-100 dark:border-white/10">
                            <RichStatCard
                                cardIndex={0}
                                title="Chiffre d'affaires"
                                tooltip="Total des devis acceptés et facturés sur la période. C'est le montant que vos clients vous ont commandé."
                                allQuotes={allQuotes}
                                type="revenue"
                                icon={TrendingUp}
                                colorClass="bg-green-500"
                                colorHex="#10B981"
                                formatValue={(v) => `${v.toFixed(0)} €`}
                                onValueClick={(p, items, d) => setDetailsView({ period: p, items, date: d, title: 'CA' })}
                            />
                            <RichStatCard
                                cardIndex={1}
                                title="Résultat Net"
                                tooltip="Chiffre d'affaires moins le coût de vos matériaux. C'est ce qui reste pour couvrir vos charges et votre rémunération."
                                allQuotes={allQuotes}
                                type="netIncome"
                                staticSubText="(Hors Matériel)"
                                icon={TrendingUp}
                                colorClass="bg-emerald-600"
                                colorHex="#059669"
                                formatValue={(v) => `${v.toFixed(0)} €`}
                                onValueClick={(p, items, d) => setDetailsView({ period: p, items, date: d, title: 'Résultat' })}
                            />
                            <RichStatCard
                                cardIndex={2}
                                title="Volume de Devis"
                                tooltip="Montant total de tous les devis créés sur la période, signés ou non. Cliquez pour voir ceux en attente de réponse."
                                allQuotes={allQuotes}
                                type="quotes"
                                staticSubText={`${pendingQuotesCount} en attente`}
                                icon={FileCheck}
                                colorClass="bg-orange-500"
                                colorHex="#F97316"
                                formatValue={(v) => `${v.toFixed(0)} €`}
                                onValueClick={() => navigate('/app/devis', { state: { filter: 'pending' } })}
                            />
                            <RichStatCard
                                cardIndex={3}
                                title="Taux de conversion"
                                tooltip="Part de vos devis acceptés par vos clients. Ex : 60% signifie que 6 devis sur 10 ont été signés. Plus c'est élevé, mieux c'est."
                                allQuotes={allQuotes}
                                type="conversion"
                                staticSubText="Devis signés / Total"
                                icon={BarChart3}
                                colorClass="bg-blue-500"
                                colorHex="#3B82F6"
                                formatValue={(v) => `${v.toFixed(1)} %`}
                                chartFormatter={(v) => `${v} Signé(s)`}
                            />
                        </div>
                    )}
                </div>
            );
        },
        recent_activity: () => {
            if (!isVisible('recent_activity')) return null;
            return (
                <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-sm border border-gray-200/70 dark:border-white/10 p-6">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Activité récente</h3>
                    <div className="space-y-2">
                        {recentActivity.length > 0 ? (
                            recentActivity.map((activity, index) => (
                                <div key={index} className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-white/5 rounded-xl transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-full ${activity.type === 'quote' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : activity.type === 'signature' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'}`}>
                                            {activity.type === 'quote' ? <FileText className="w-4 h-4" /> : activity.type === 'signature' ? <PenTool className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-900 dark:text-white">{activity.description}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">{formatDistanceToNow(new Date(activity.date), { addSuffix: true, locale: fr })}</p>
                                        </div>
                                    </div>
                                    {activity.amount && <span className="text-sm font-semibold text-gray-900 dark:text-white">{activity.amount.toFixed(2)} €</span>}
                                </div>
                            ))
                        ) : <div className="text-gray-500 text-center py-8">Aucune activité récente.</div>}
                    </div>
                </div>
            );
        },
    };

    return (
        <div className="space-y-6 relative">
            {detailsView && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDetailsView(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                            <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                                Détails : {detailsView.period === 'week' ? `Semaine ${getWeek(detailsView.date || new Date(), { weekStartsOn: 1 })}` : format(detailsView.date || new Date(), 'MMMM yyyy', { locale: fr })}
                            </h3>
                            <button onClick={() => setDetailsView(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"><Plus className="w-5 h-5 rotate-45 text-gray-500" /></button>
                        </div>
                        <div className="overflow-y-auto p-4 space-y-3">
                            {detailsView.items && detailsView.items.length > 0 ? (
                                detailsView.items.map(quote => (
                                    <div key={quote.id + Math.random()} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-700">
                                        <div>
                                            <div className="font-medium text-gray-900 dark:text-white">{quote.clients?.name || `Devis #${quote.id}`}</div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                                {new Date(quote.date || quote.created_at).toLocaleDateString()} -
                                                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${quote.status === 'paid' ? 'bg-green-100 text-green-700' : quote.status === 'billed' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                                    {quote.status === 'paid' ? 'Payé' : quote.status === 'billed' ? 'Facturé' : 'Signé'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="font-bold text-gray-900 dark:text-white">{quote.total_ttc?.toFixed(2)} €</div>
                                    </div>
                                ))
                            ) : <p className="text-center text-gray-500 dark:text-gray-400 py-4">Aucun élément.</p>}
                        </div>
                        <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-right font-bold text-lg text-gray-900 dark:text-white">
                            Total: {detailsView.items?.reduce((sum, item) => sum + (item.total_ttc || 0), 0).toFixed(2)} €
                        </div>
                    </div>
                </div>
            )}

            <div className="flex items-end justify-between">
                <h1 className="text-[34px] leading-none font-bold tracking-tight text-gray-900 dark:text-white">
                    Tableau de bord
                </h1>
                <button
                    type="button"
                    onClick={() => setCustomizeOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#007AFF] bg-[#007AFF]/10 hover:bg-[#007AFF]/15 rounded-full transition-colors"
                    title="Personnaliser le tableau de bord"
                >
                    <Settings2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Personnaliser</span>
                </button>
            </div>

            <DashboardCustomizeModal open={customizeOpen} onClose={() => setCustomizeOpen(false)} />

            <WelcomeCard />

            {/* Checklist d'onboarding — affichée tant que les étapes essentielles
                ne sont pas validées (ou jusqu'à dismiss explicite) */}
            <OnboardingChecklist />

            {/* Widgets adaptatifs — ordre piloté par l'usage (orderedWidgetIds),
                figé pendant la session. Fragment = aucun nœud DOM ajouté, donc
                l'espacement space-y-6 reste correct. */}
            {orderedWidgetIds.map((id) => {
                const node = widgetRenderers[id]?.();
                return node ? <React.Fragment key={id}>{node}</React.Fragment> : null;
            })}

            {/* Copilot Artisan : assistant IA contextuel sur le dashboard */}
            <CopilotChat
                context={{
                    page: 'Tableau de bord',
                    today: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
                    facts: [
                        `Nombre de devis/factures en base : ${allQuotes.length}`,
                        `Clients : ${clientCount}`,
                        `Devis en attente (brouillon ou envoyé) : ${pendingQuotesCount}`,
                    ],
                }}
                presets={[
                    { label: 'Quel est mon CA ce mois ?',         prompt: 'Quel est mon chiffre d\'affaires sur les 30 derniers jours ?' },
                    { label: 'Quels devis relancer ?',            prompt: 'Quels devis envoyés méritent d\'être relancés en priorité ?' },
                    { label: 'Idées pour booster mon activité',   prompt: 'Donne-moi 3 idées concrètes pour booster mon activité d\'artisan ce mois.' },
                ]}
            />
        </div>
    );
};

export default Dashboard;
