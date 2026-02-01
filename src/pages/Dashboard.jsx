import React, { useState, useEffect } from 'react';
import { Plus, TrendingUp, Users, FileCheck, FileText, PenTool, BarChart3, ArrowLeft } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatDistanceToNow, startOfWeek, getDaysInMonth, getDate, getDay, addMonths, subMonths, addWeeks, subWeeks, startOfMonth, format, getWeek, isSameMonth, isSameYear, startOfYear, endOfYear, endOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';

import ActionableDashboard from '../components/ActionableDashboard';

const StatCard = ({ title, value, icon: Icon, color, onClick }) => (
    <div
        className={`bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
        onClick={onClick}
    >
        <div className="flex items-center justify-between">
            <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
            </div>
            <div className={`p-3 rounded-lg ${color}`}>
                <Icon className="w-6 h-6 text-white" />
            </div>
        </div>
    </div>
);

// Reusable Rich Card for standard metrics with gauges + charts
const RichStatCard = ({ title, mainValue, subText, icon: Icon, colorClass, colorHex, stats, formatValue = (v) => `${v.toFixed(0)}`, chartFormatter, type = "value", onValueClick }) => {
    const [showChart, setShowChart] = useState(false);
    const [period, setPeriod] = useState('month');

    // Stats shape: { week: {value, max, chart}, month: {value, max, chart}, year: {value, max, chart} }

    const currentData = stats[period];
    const displayValue = currentData?.value;
    const tooltipFormatter = chartFormatter || formatValue;

    return (
        <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col justify-between transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        {title} <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">({period === 'week' ? 'Sem' : period === 'month' ? 'Mois' : 'An'})</span>
                    </p>
                    <p
                        className={`text-2xl font-bold text-gray-900 dark:text-white mt-1 ${onValueClick ? 'cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors' : ''}`}
                        onClick={() => onValueClick && onValueClick(period, currentData?.details || [])}
                        title={onValueClick ? "Voir le détail" : ""}
                    >
                        {typeof displayValue === 'number' ? formatValue(displayValue) : displayValue}
                    </p>
                    {subText && !showChart && <p className="text-xs text-gray-400 mt-1">{subText}</p>}
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); setShowChart(!showChart); }}
                    className={`p-3 rounded-lg transition-colors shadow-sm ${showChart ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300' : `${colorClass} text-white hover:opacity-90`}`}
                    title={showChart ? "Retour" : "Voir les graphiques"}
                >
                    {showChart ? <ArrowLeft className="w-6 h-6" /> : <Icon className="w-6 h-6" />}
                </button>
            </div>

            {!showChart ? (
                <div className="space-y-4 pt-2 border-t border-gray-50 dark:border-gray-800 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <RevenueBar label="Cette Semaine" value={stats.week.value} max={stats.week.max} color={colorClass} onClick={() => setShowChart(true) || setPeriod('week')} period="week" formatter={formatValue} />
                    <RevenueBar label="Ce Mois" value={stats.month.value} max={stats.month.max} color={colorClass} onClick={() => setShowChart(true) || setPeriod('month')} period="month" formatter={formatValue} />
                    <RevenueBar label="Cette Année" value={stats.year.value} max={stats.year.max} color={colorClass} onClick={() => setShowChart(true) || setPeriod('year')} period="year" formatter={formatValue} />
                    <RevenueBar label="L'Année dernière" value={stats.lastYear?.value || 0} max={stats.lastYear?.max || 1} color={colorClass} onClick={() => setShowChart(true) || setPeriod('lastYear')} period="lastYear" formatter={formatValue} />
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
                            <AreaChart data={stats[period]?.chart || []}>
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

// Simple Bar helper
const RevenueBar = ({ label, value, max, color, period, onClick, formatter }) => {
    const percentage = max > 0 ? (value / max) * 100 : 0;
    return (
        <div
            className="flex flex-col gap-1 w-full cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => onClick(period)}
        >
            <div className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300">
                <span>{label}</span>
                <span>{formatter ? formatter(value) : `${value.toFixed(0)} €`}</span>
            </div>
            <div className="h-3 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                    className={`h-full ${color} rounded-full transition-all duration-500 ease-out`}
                    style={{ width: `${Math.max(percentage, 2)}%` }} // Min width for visibility
                />
            </div>
        </div>
    );
};

const Dashboard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [referenceDate, setReferenceDate] = useState(new Date());
    const [allQuotes, setAllQuotes] = useState([]);
    const [clientCount, setClientCount] = useState(0);
    const [pendingQuotesCount, setPendingQuotesCount] = useState(0);
    const [recentActivity, setRecentActivity] = useState([]);

    // Data Fetching Effect
    useEffect(() => {
        if (user) {
            fetchRawData();
        }
    }, [user]);

    const fetchRawData = async () => {
        setLoading(true);
        try {
            // 1. Fetch ALL quotes
            const { data: quotes, error: quotesError } = await supabase
                .from('quotes')
                .select('total_ttc, date, created_at, status, id, clients(name), type, parent_id, signed_at, items');

            if (quotesError) throw quotesError;
            setAllQuotes(quotes || []);

            // 2. Client Count
            const { count: cCount, error: clientsError } = await supabase
                .from('clients')
                .select('*', { count: 'exact', head: true });
            if (!clientsError) setClientCount(cCount);

            // 3. Pending Quotes (Current snapshot, keeps consistency with live data)
            const { count: pQuotes, error: pendingError } = await supabase
                .from('quotes')
                .select('*', { count: 'exact', head: true })
                .in('status', ['draft', 'sent']);
            if (!pendingError) setPendingQuotesCount(pQuotes);

            // 4. Recent Activity (Global history)
            const { data: rQuotes, error: rQuotesError } = await supabase
                .from('quotes')
                .select('*, clients(name)')
                .order('created_at', { ascending: false })
                .limit(5);

            const { data: rSignatures, error: rSignaturesError } = await supabase
                .from('quotes')
                .select('*, clients(name)')
                .not('signed_at', 'is', null)
                .order('signed_at', { ascending: false })
                .limit(5);

            const { data: rClients, error: rClientsError } = await supabase
                .from('clients')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(5);

            const activities = [
                ...(rQuotes || []).map(q => ({
                    type: 'quote',
                    date: q.created_at,
                    description: `Devis créé pour ${q.clients?.name || 'Client inconnu'}`,
                    amount: q.total_ttc
                })),
                ...(rSignatures || []).map(q => ({
                    type: 'signature',
                    date: q.signed_at,
                    description: `Devis signé par ${q.clients?.name || 'Client inconnu'}`,
                    amount: q.total_ttc
                })),
                ...(rClients || []).map(c => ({
                    type: 'client',
                    date: c.created_at,
                    description: `Nouveau client : ${c.name}`,
                    amount: null
                }))
            ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

            setRecentActivity(activities);

        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Stats Calculation Memo
    const stats = React.useMemo(() => {
        const getEmptyMetric = () => ({
            week: 0, month: 0, year: 0, lastYear: 0, total: 0,
            charts: {
                week: new Array(7).fill(0),
                month: new Array(30).fill(0), // Default safe size
                year: new Array(12).fill(0),
                lastYear: new Array(12).fill(0)
            },
            details: { week: [], month: [], year: [], lastYear: [] }
        });

        if (!(referenceDate instanceof Date) || isNaN(referenceDate)) {
            return {
                revenue: getEmptyMetric(),
                netIncome: getEmptyMetric(),
                quotes: getEmptyMetric(),
                conversion: {
                    week: { signed: 0, total: 0, value: 0, max: 100, chart: [] },
                    month: { signed: 0, total: 0, value: 0, max: 100, chart: [] },
                    year: { signed: 0, total: 0, value: 0, max: 100, chart: [] },
                    lastYear: { signed: 0, total: 0, value: 0, max: 100, chart: [] },
                    charts: { week: [], month: [], year: [], lastYear: [] },
                    details: { week: [], month: [], year: [], lastYear: [] }
                },
                clientCount: 0,
                pendingQuotesCount: 0,
                recentActivity: [],
                details: { week: [], month: [], year: [], lastYear: [] }
            };
        }

        try {
            const daysInMonth = getDaysInMonth(referenceDate);
            const emptyMonthChart = new Array(daysInMonth).fill(0);

            const getInitializedMetric = () => ({
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
                revenue: getInitializedMetric(),
                netIncome: getInitializedMetric(),
                quotes: getInitializedMetric(),
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
            const refMonthStart = startOfMonth(referenceDate);
            const refWeekStart = startOfWeek(referenceDate, { weekStartsOn: 1 });

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

                // --- REVENUE & NET INCOME ---
                if (status === 'paid') {
                    const isDuplicate = type === 'invoice' && quote.parent_id && paidQuoteIds.has(quote.parent_id);
                    if (!isDuplicate) {
                        metrics.revenue.total += amount;

                        // Net Income Calc
                        let netAmount = amount;
                        if (quote.items && Array.isArray(quote.items)) {
                            const allItemsHT = quote.items.reduce((sum, i) => sum + ((parseFloat(i.price) || 0) * (parseFloat(i.quantity) || 0)), 0);
                            const taxRatio = (allItemsHT > 0.01) ? (amount / allItemsHT) : 1;
                            const materialItems = quote.items.filter(i => i.type === 'material');
                            const materialHT = materialItems.reduce((sum, i) => sum + ((parseFloat(i.price) || 0) * (parseFloat(i.quantity) || 0)), 0);
                            const deductionHT = quote.items
                                .filter(i => (parseFloat(i.price) || 0) < 0)
                                .reduce((sum, i) => sum + ((parseFloat(i.price) || 0) * (parseFloat(i.quantity) || 0)), 0);
                            const deductionTTC = deductionHT * taxRatio;
                            const materialTTC = materialHT * taxRatio;
                            netAmount = amount - materialTTC - deductionTTC;
                        }

                        const isDeposit = (quote.title && /a(c)?compte/i.test(quote.title)) ||
                            (quote.items && quote.items.some(i => i.description && /a(c)?compte/i.test(i.description) && (parseFloat(i.price) || 0) > 0));

                        // Use referenceDate for buckets
                        if (qDate.getFullYear() === refYear) {
                            metrics.revenue.year += amount;
                            metrics.revenue.charts.year[qDate.getMonth()] += amount;
                            metrics.revenue.details.year.push(quote);

                            if (!isDeposit) {
                                metrics.netIncome.year += netAmount;
                                metrics.netIncome.charts.year[qDate.getMonth()] += netAmount;
                                metrics.netIncome.details.year.push({ ...quote, total_ttc: netAmount });
                            }

                            // Month bucket: strict month match on referenceDate
                            if (isSameMonth(qDate, referenceDate)) {
                                metrics.revenue.month += amount;
                                if (metrics.revenue.charts.month[getDate(qDate) - 1] !== undefined) {
                                    metrics.revenue.charts.month[getDate(qDate) - 1] += amount;
                                }
                                metrics.revenue.details.month.push(quote);

                                if (!isDeposit) {
                                    metrics.netIncome.month += netAmount;
                                    if (metrics.netIncome.charts.month[getDate(qDate) - 1] !== undefined) {
                                        metrics.netIncome.charts.month[getDate(qDate) - 1] += netAmount;
                                    }
                                    metrics.netIncome.details.month.push({ ...quote, total_ttc: netAmount });
                                }
                            }

                            // Week bucket: strict week match
                            // Use date-fns getWeek to compare
                            const qWeek = getWeek(qDate, { weekStartsOn: 1 });
                            const refWeek = getWeek(referenceDate, { weekStartsOn: 1 });
                            if (qWeek === refWeek) {
                                metrics.revenue.week += amount;
                                const weekDayIndex = (getDay(qDate) + 6) % 7;
                                metrics.revenue.charts.week[weekDayIndex] += amount;
                                metrics.revenue.details.week.push(quote);

                                if (!isDeposit) {
                                    metrics.netIncome.week += netAmount;
                                    metrics.netIncome.charts.week[weekDayIndex] += netAmount;
                                    metrics.netIncome.details.week.push({ ...quote, total_ttc: netAmount });
                                }
                            }

                        } else if (qDate.getFullYear() === refYear - 1) {
                            metrics.revenue.lastYear += amount;
                            metrics.revenue.charts.lastYear[qDate.getMonth()] += amount;
                            metrics.revenue.details.lastYear.push(quote);
                            if (!isDeposit) {
                                metrics.netIncome.lastYear += netAmount;
                                metrics.netIncome.charts.lastYear[qDate.getMonth()] += netAmount;
                                metrics.netIncome.details.lastYear.push({ ...quote, total_ttc: netAmount });
                            }
                        }
                    }
                }

                // --- CONVERSION ---
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
                            if (metrics.quotes.charts.month[getDate(qDate) - 1] !== undefined) {
                                metrics.quotes.charts.month[getDate(qDate) - 1] += amount;
                            }

                            metrics.conversion.month.total++;
                            if (isSigned) {
                                metrics.conversion.month.signed++;
                                if (metrics.conversion.charts.month[getDate(qDate) - 1] !== undefined) {
                                    metrics.conversion.charts.month[getDate(qDate) - 1]++;
                                }
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

            // Safe format helper for empty charts
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
                },
                clientCount,
                pendingQuotesCount,
                recentActivity,
                details: {
                    week: metrics.revenue.details.week,
                    month: metrics.revenue.details.month,
                    year: metrics.revenue.details.year,
                    lastYear: metrics.revenue.details.lastYear
                }
            };
        } catch (error) {
            console.error("Dashboard Stats Error:", error);
            // Return empty safe object
            return {
                revenue: getEmptyMetric(),
                netIncome: getEmptyMetric(),
                quotes: getEmptyMetric(),
                conversion: {
                    week: { signed: 0, total: 0, value: 0, max: 100, chart: [] },
                    month: { signed: 0, total: 0, value: 0, max: 100, chart: [] },
                    year: { signed: 0, total: 0, value: 0, max: 100, chart: [] },
                    lastYear: { signed: 0, total: 0, value: 0, max: 100, chart: [] },
                    charts: { week: [], month: [], year: [], lastYear: [] },
                    details: { week: [], month: [], year: [], lastYear: [] }
                },
                clientCount: 0,
                pendingQuotesCount: 0,
                recentActivity: [],
                details: { week: [], month: [], year: [], lastYear: [] }
            };
        }
    }, [allQuotes, referenceDate, clientCount, pendingQuotesCount, recentActivity]);

    const navigateDate = (amount, unit) => {
        if (unit === 'month') {
            setReferenceDate(prev => amount > 0 ? addMonths(prev, amount) : subMonths(prev, Math.abs(amount)));
        } else if (unit === 'week') {
            setReferenceDate(prev => amount > 0 ? addWeeks(prev, amount) : subWeeks(prev, Math.abs(amount)));
        }
    };

    const resetDate = () => setReferenceDate(new Date());

    // Real-time updates & Notifications
    useEffect(() => {
        if (!user) return;

        // Request notification permission
        if (Notification.permission === 'default') {
            Notification.requestPermission();
        }

        const subscription = supabase
            .channel('dashboard-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'quotes' },
                (payload) => {
                    console.log('Realtime change:', payload);
                    fetchRawData(); // Refresh all data

                    // Notify on new signature
                    if (payload.eventType === 'UPDATE' && payload.new.status === 'accepted' && payload.old.status !== 'accepted') {
                        new Notification('Devis Signé !', {
                            body: `Un devis a été accepté pour ${payload.new.total_ttc} €`,
                            icon: '/pwa-192x192.png'
                        });
                    }
                }
            )
            .subscribe();

        const clientsSubscription = supabase
            .channel('dashboard-clients')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'clients' },
                () => {
                    fetchRawData();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
            supabase.removeChannel(clientsSubscription);
        };
    }, [user]);

    const [detailsView, setDetailsView] = useState(null); // { period: 'week'|'month'..., items: [], title: '...' }

    let currentWeekNumber = 0;
    try {
        currentWeekNumber = getWeek(referenceDate, { weekStartsOn: 1 });
    } catch (error) {
        console.error("Week calculation error:", error);
    }

    return (
        <div className="space-y-6 relative">
            {/* Modal for details */}
            {detailsView && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDetailsView(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center text-gray-900 dark:text-white">
                            <h3 className="font-bold text-lg">
                                Détails : {detailsView.period === 'week' ? `Semaine ${currentWeekNumber}` : detailsView.period === 'month' ? format(referenceDate, 'MMMM yyyy', { locale: fr }) : detailsView.period === 'year' ? referenceDate.getFullYear() : 'L\'Année dernière'}
                                {detailsView.title && <span className="text-gray-500 font-normal ml-2">- {detailsView.title}</span>}
                            </h3>
                            <button onClick={() => setDetailsView(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
                                <Plus className="w-5 h-5 rotate-45" />
                            </button>
                        </div>
                        <div className="overflow-y-auto p-4 space-y-3">
                            {detailsView.items && detailsView.items.length > 0 ? (
                                detailsView.items.map(quote => (
                                    <div key={quote.id + Math.random()} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-700">
                                        <div>
                                            <div className="font-medium text-gray-900 dark:text-white">{quote.clients?.name || `Devis #${quote.id}`}</div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                                {new Date(quote.date || quote.created_at).toLocaleDateString()} -
                                                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${quote.status === 'paid' ? 'bg-green-100 text-green-700' :
                                                    quote.status === 'billed' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                                                    }`}>
                                                    {quote.status === 'paid' ? 'Payé' : quote.status === 'billed' ? 'Facturé' : 'Signé'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="font-bold text-gray-900 dark:text-white">
                                            {quote.total_ttc?.toFixed(2)} €
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-center text-gray-500 dark:text-gray-400 py-4">Aucun élément pour cette période.</p>
                            )}
                        </div>
                        <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-right font-bold text-lg text-gray-900 dark:text-white">
                            Total: {detailsView.items?.reduce((sum, item) => sum + (item.total_ttc || 0), 0).toFixed(2)} €
                        </div>
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Tableau de bord</h2>
                <button
                    onClick={() => navigate('/app/devis/new')}
                    className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                    <Plus className="w-5 h-5 mr-2" />
                    Nouveau Devis
                </button>
            </div>

            <div className="flex bg-white dark:bg-gray-800 p-1 rounded-lg shadow-sm border border-gray-100 dark:border-gray-800 mb-6 overflow-x-auto">
                <div className="flex items-center gap-2 p-2 border-r border-gray-100 dark:border-gray-700 mr-2 min-w-fit">
                    <button onClick={() => navigateDate(-1, 'month')} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500">
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-semibold whitespace-nowrap min-w-[120px] text-center dark:text-gray-200">
                        {format(referenceDate, 'MMMM yyyy', { locale: fr })}
                    </span>
                    <button onClick={() => navigateDate(1, 'month')} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500">
                        <ArrowLeft className="w-4 h-4 rotate-180" />
                    </button>
                </div>

                <div className="flex items-center gap-2 p-2 mr-2 min-w-fit">
                    <button onClick={() => navigateDate(-1, 'week')} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500">
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-semibold whitespace-nowrap min-w-[90px] text-center text-gray-500 dark:text-gray-400">
                        Accès Semaine {currentWeekNumber}
                    </span>
                    <button onClick={() => navigateDate(1, 'week')} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500">
                        <ArrowLeft className="w-4 h-4 rotate-180" />
                    </button>
                </div>

                <div className="ml-auto flex items-center p-2">
                    <button onClick={resetDate} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors text-gray-700 dark:text-gray-300">
                        Aujourd'hui
                    </button>
                </div>
            </div>

            <ActionableDashboard user={user} />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <RichStatCard
                    title="Chiffre d'affaires"
                    subText="Global (Encaissé)"
                    stats={stats.revenue}
                    icon={TrendingUp}
                    colorClass="bg-green-500"
                    colorHex="#10B981"
                    formatValue={(v) => `${v.toFixed(0)} €`}
                    onValueClick={(p, items) => setDetailsView({ period: p, items, title: 'Chiffre d\'Affaires' })}
                />

                <RichStatCard
                    title="Résultat Net"
                    subText="(Hors Matériel)"
                    stats={stats.netIncome}
                    icon={TrendingUp}
                    colorClass="bg-emerald-600"
                    colorHex="#059669"
                    formatValue={(v) => `${v.toFixed(0)} €`}
                    onValueClick={(p, items) => setDetailsView({ period: p, items, title: 'Résultat Net' })}
                />

                <RichStatCard
                    title="Volume de Devis"
                    subText={`${stats.pendingQuotesCount} en attente`}
                    stats={stats.quotes}
                    icon={FileCheck}
                    colorClass="bg-orange-500"
                    colorHex="#F97316"
                    formatValue={(v) => `${v.toFixed(0)} €`}
                    onValueClick={() => navigate('/app/devis', { state: { filter: 'pending' } })}
                    className="cursor-pointer"
                />

                <RichStatCard
                    title="Taux de conversion"
                    subText="Devis signés / Total"
                    stats={stats.conversion}
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
                    {stats.recentActivity.length > 0 ? (
                        stats.recentActivity.map((activity, index) => (
                            <div key={index} className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors border border-gray-100 dark:border-gray-800">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-full ${activity.type === 'quote' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' :
                                        activity.type === 'signature' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' :
                                            'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                                        }`}>
                                        {activity.type === 'quote' ? <FileText className="w-4 h-4" /> :
                                            activity.type === 'signature' ? <PenTool className="w-4 h-4" /> :
                                                <Users className="w-4 h-4" />}
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">{activity.description}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {formatDistanceToNow(new Date(activity.date), { addSuffix: true, locale: fr })}
                                        </p>
                                    </div>
                                </div>
                                {activity.amount && (
                                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                        {activity.amount.toFixed(2)} €
                                    </span>
                                )}
                            </div>
                        ))
                    ) : (
                        <div className="text-gray-500 text-center py-8">
                            Aucune activité récente.
                        </div>
                    )}
                </div>
            </div>
        </div >
    );
};

export default Dashboard;
