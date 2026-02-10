import React, { useState, useMemo } from 'react';
import { Plus, TrendingUp, Users, FileCheck, FileText, PenTool, BarChart3, ArrowLeft, ChevronLeft, ChevronRight, LayoutDashboard } from 'lucide-react';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { formatDistanceToNow, startOfWeek, getDaysInMonth, getDate, getDay, addMonths, subMonths, addWeeks, subWeeks, startOfMonth, format, getWeek, isSameMonth, isSameYear, startOfYear, endOfYear, endOfWeek, addYears, subYears } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { useDashboardData } from '../hooks/useDataCache';
import { useAuth } from '../context/AuthContext';

import ActionableDashboard from '../components/ActionableDashboard';

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
            const amount = parseFloat(quote.total_ttc) || 0;
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

                    // Net Income
                    const isDeposit = (quote.title && /a(c)?compte/i.test(quote.title)) ||
                        (quote.items && quote.items.some(i => i.description && /a(c)?compte/i.test(i.description) && (parseFloat(i.price) || 0) > 0));

                    if (isDeposit) {
                        netAmount = 0; // Deposits are 100% material/cashflow, 0% Net Result (Labor)
                    } else {
                        const allItemsHT = quote.items.reduce((sum, i) => sum + ((parseFloat(i.price) || 0) * (parseFloat(i.quantity) || 0)), 0);
                        const taxRatio = (allItemsHT > 0.01) ? (amount / allItemsHT) : 1;

                        // Materials Cost
                        const materialItems = quote.items.filter(i => i.type === 'material');
                        const materialHT = materialItems.reduce((sum, i) => sum + ((parseFloat(i.price) || 0) * (parseFloat(i.quantity) || 0)), 0);

                        // Detect Deductions (Deposits already paid)
                        // Look for negative price items that are likely deposit deductions
                        const deductionItems = quote.items.filter(i => (parseFloat(i.price) || 0) < 0);
                        const deductionHT = deductionItems.reduce((sum, i) => sum + Math.abs((parseFloat(i.price) || 0) * (parseFloat(i.quantity) || 0)), 0);

                        // Adjusted Material Cost = Total Material - Material Already Paid (Deduction)
                        // We assume deduction covers material first.
                        const adjustedMaterialHT = Math.max(0, materialHT - deductionHT);

                        const adjustedMaterialTTC = adjustedMaterialHT * taxRatio;
                        netAmount = amount - adjustedMaterialTTC;
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
const RichStatCard = ({ title, allQuotes, type, icon: Icon, colorClass, colorHex, formatValue = (v) => `${v.toFixed(0)}`, chartFormatter, staticSubText, onValueClick }) => {
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
        <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col justify-between transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</span>
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
                        {formatValue(displayValue)}
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

    // Utilisation du cache React Query
    const { data, isLoading: loading } = useDashboardData();

    const allQuotes = data?.allQuotes || [];
    const clientCount = data?.clientCount || 0;
    const pendingQuotesCount = data?.pendingQuotesCount || 0;
    const recentActivity = data?.recentActivity || [];

    // Afficher un écran de chargement
    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-gray-500 text-sm">Chargement...</span>
                </div>
            </div>
        );
    }

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

            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <LayoutDashboard className="w-8 h-8 text-blue-600" />
                    Tableau de bord
                </h2>
                <button onClick={() => navigate('/app/devis/new')} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                    <Plus className="w-5 h-5 mr-2" /> Nouveau Devis
                </button>
            </div>

            <ActionableDashboard user={user} />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <RichStatCard
                    title="Chiffre d'affaires"
                    allQuotes={allQuotes}
                    type="revenue"
                    icon={TrendingUp}
                    colorClass="bg-green-500"
                    colorHex="#10B981"
                    formatValue={(v) => `${v.toFixed(0)} €`}
                    onValueClick={(p, items, d) => setDetailsView({ period: p, items, date: d, title: 'CA' })}
                />
                <RichStatCard
                    title="Résultat Net"
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
                    title="Volume de Devis"
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
                    title="Taux de conversion"
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

            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Activité récente</h3>
                <div className="space-y-4">
                    {recentActivity.length > 0 ? (
                        recentActivity.map((activity, index) => (
                            <div key={index} className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors border border-gray-100 dark:border-gray-800">
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
        </div>
    );
};

export default Dashboard;
