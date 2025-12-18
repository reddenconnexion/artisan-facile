import React, { useState, useEffect } from 'react';
import { Plus, TrendingUp, Users, FileCheck, FileText, PenTool, BarChart3, ArrowLeft } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatDistanceToNow, startOfWeek, getDaysInMonth, getDate, getDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';

import ActionableDashboard from '../components/ActionableDashboard';

const StatCard = ({ title, value, icon: Icon, color, onClick }) => (
    <div
        className={`bg-white p-6 rounded-xl shadow-sm border border-gray-100 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
        onClick={onClick}
    >
        <div className="flex items-center justify-between">
            <div>
                <p className="text-sm font-medium text-gray-500">{title}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
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
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <p className="text-sm font-medium text-gray-500">
                        {title} <span className="text-xs text-gray-400 font-normal">({period === 'week' ? 'Sem' : period === 'month' ? 'Mois' : 'An'})</span>
                    </p>
                    <p
                        className={`text-2xl font-bold text-gray-900 mt-1 ${onValueClick ? 'cursor-pointer hover:text-blue-600 transition-colors' : ''}`}
                        onClick={() => onValueClick && onValueClick(period)}
                        title={onValueClick ? "Voir le détail" : ""}
                    >
                        {typeof displayValue === 'number' ? formatValue(displayValue) : displayValue}
                    </p>
                    {subText && !showChart && <p className="text-xs text-gray-400 mt-1">{subText}</p>}
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); setShowChart(!showChart); }}
                    className={`p-3 rounded-lg transition-colors shadow-sm ${showChart ? 'bg-gray-100 text-gray-600' : `${colorClass} text-white hover:opacity-90`}`}
                    title={showChart ? "Retour" : "Voir les graphiques"}
                >
                    {showChart ? <ArrowLeft className="w-6 h-6" /> : <Icon className="w-6 h-6" />}
                </button>
            </div>

            {!showChart ? (
                <div className="space-y-4 pt-2 border-t border-gray-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <RevenueBar label="Cette Semaine" value={stats.week.value} max={stats.week.max} color={colorClass} onClick={() => setShowChart(true) || setPeriod('week')} period="week" />
                    <RevenueBar label="Ce Mois" value={stats.month.value} max={stats.month.max} color={colorClass} onClick={() => setShowChart(true) || setPeriod('month')} period="month" />
                    <RevenueBar label="Cette Année" value={stats.year.value} max={stats.year.max} color={colorClass} onClick={() => setShowChart(true) || setPeriod('year')} period="year" />
                </div>
            ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        {['week', 'month', 'year'].map(p => (
                            <button key={p} onClick={() => setPeriod(p)} className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${period === p ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                                {p === 'week' ? 'Sem' : p === 'month' ? 'Mois' : 'An'}
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
const RevenueBar = ({ label, value, max, color, period, onClick }) => {
    const percentage = max > 0 ? (value / max) * 100 : 0;
    return (
        <div
            className="flex flex-col gap-1 w-full cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => onClick(period)}
        >
            <div className="flex justify-between text-sm font-medium text-gray-700">
                <span>{label}</span>
                <span>{value.toFixed(0)} €</span>
            </div>
            <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
                <div
                    className={`h-full ${color} rounded-full transition-all duration-500 ease-out`}
                    style={{ width: `${Math.max(percentage, 2)}%` }} // Min width for visibility
                />
            </div>
        </div>
    );
};

const Dashboard = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [stats, setStats] = useState(() => {
        const getEmptyMetric = () => ({
            week: { value: 0, max: 1, chart: [] },
            month: { value: 0, max: 1, chart: [] },
            year: { value: 0, max: 1, chart: [] }
        });

        try {
            const cached = localStorage.getItem('dashboard_stats');
            if (cached) {
                const parsed = JSON.parse(cached);
                // Simple validation to check if legacy structure
                if (parsed.revenue && parsed.revenue.year) {
                    return parsed;
                }
            }
        } catch (e) {
            console.error("Error parsing dashboard cache", e);
        }

        return {
            revenue: getEmptyMetric(),
            quotes: getEmptyMetric(),
            conversion: getEmptyMetric(),
            clientCount: 0,
            pendingQuotesCount: 0,
            recentActivity: [],
            details: { week: [], month: [], year: [] }
        };
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            fetchStats();
        }
    }, [user]);

    const fetchStats = async () => {
        try {
            // 1. Fetch ALL quotes for calculations
            const { data: allQuotes, error: quotesError } = await supabase
                .from('quotes')
                .select('total_ttc, date, created_at, status, id, clients(name), type, parent_id, signed_at');

            if (quotesError) throw quotesError;

            // Date references
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonthStart = new Date(currentYear, now.getMonth(), 1);
            const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
            const currentYearStart = new Date(currentYear, 0, 1);
            const daysInMonth = getDaysInMonth(now);

            // Helpers for chart init
            const initChart = (type) => {
                if (type === 'year') return new Array(12).fill(0);
                if (type === 'month') return new Array(daysInMonth).fill(0);
                if (type === 'week') return new Array(7).fill(0);
                return [];
            }

            const formatChartPoints = (data, timeframe) => {
                const monthNames = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec'];
                const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
                return data.map((val, i) => ({
                    name: timeframe === 'year' ? monthNames[i] : timeframe === 'month' ? `${i + 1}` : weekDays[i],
                    value: val
                }));
            }

            // Metric Accumulators
            const metrics = {
                revenue: { week: 0, month: 0, year: 0, total: 0, charts: { week: initChart('week'), month: initChart('month'), year: initChart('year') }, details: { week: [], month: [], year: [] } },
                quotes: { week: 0, month: 0, year: 0, total: 0, charts: { week: initChart('week'), month: initChart('month'), year: initChart('year') }, details: { week: [], month: [], year: [] } }, // Value of created quotes
                conversion: {
                    week: { signed: 0, total: 0 },
                    month: { signed: 0, total: 0 },
                    year: { signed: 0, total: 0 },
                    charts: { week: initChart('week'), month: initChart('month'), year: initChart('year') }, // Will store % rate
                    details: { week: [], month: [], year: [] }
                }
            };

            // Create a set of PAID quote IDs to avoid double counting
            // We only consider an invoice a duplicate if its parent quote is ALREADY counted as paid.
            const paidQuoteIds = new Set(allQuotes.filter(q => q.type !== 'invoice' && q.status === 'paid').map(q => q.id));

            allQuotes.forEach(quote => {
                const amount = parseFloat(quote.total_ttc) || 0;
                // Ensure date is valid, fallback to created_at, fallback to now
                const qDate = new Date(quote.date || quote.created_at || new Date());

                if (isNaN(qDate.getTime())) return; // Skip invalid dates

                // Normalize status
                const status = (quote.status || '').toLowerCase();
                const type = (quote.type || 'quote').toLowerCase();

                // Check if it's an "Effective Quote" (Standard Quote OR Direct Invoice)
                // A Direct Invoice (invoice with no parent) counts as a "Converted Quote" (Sold instantly)
                const isDirectInvoice = type === 'invoice' && !quote.parent_id;
                const isStandardQuote = type !== 'invoice';
                const isActivity = isStandardQuote || isDirectInvoice;

                // --- REVENUE CALC (Paid only) ---
                // Supabase status 'paid' is reliable
                if (status === 'paid') {
                    // Check duplicate invoice logic (Invoice that HAS a parent quote)
                    // If the parent quote is also 'paid', we prioritize the quote (or just count one of them)
                    // If the parent quote is 'accepted' (not paid), we MUST count the invoice.
                    const isDuplicate = type === 'invoice' && quote.parent_id && paidQuoteIds.has(quote.parent_id);
                    if (!isDuplicate) {
                        metrics.revenue.total += amount;
                        if (qDate.getFullYear() === currentYear) {
                            metrics.revenue.year += amount;
                            metrics.revenue.charts.year[qDate.getMonth()] += amount;
                            metrics.revenue.details.year.push(quote);

                            if (qDate >= currentMonthStart && qDate.getMonth() === now.getMonth()) {
                                metrics.revenue.month += amount;
                                metrics.revenue.charts.month[getDate(qDate) - 1] += amount;
                                metrics.revenue.details.month.push(quote);

                                if (qDate >= currentWeekStart) {
                                    metrics.revenue.week += amount;
                                    metrics.revenue.charts.week[(getDay(qDate) + 6) % 7] += amount;
                                    metrics.revenue.details.week.push(quote);
                                }
                            }
                        }
                    }
                }

                // --- QUOTES/CONVERSION ACTIVITY ---
                if (isActivity) {
                    if (qDate.getFullYear() === currentYear) {
                        metrics.quotes.year += amount;
                        metrics.quotes.charts.year[qDate.getMonth()] += amount;

                        // Conversion Logic
                        // If Direct Invoice -> Automatically Signed (100% success)
                        // If Standard Quote -> Check status
                        const isSigned = isDirectInvoice ||
                            status === 'accepted' ||
                            status === 'paid' ||
                            status === 'billed' ||
                            !!quote.signed_at;

                        if (isSigned) {
                            metrics.conversion.year.signed++;
                            metrics.conversion.charts.year[qDate.getMonth()]++; // Chart shows volume of signatures
                        }

                        metrics.conversion.year.total++;

                        if (qDate >= currentMonthStart && qDate.getMonth() === now.getMonth()) {
                            metrics.quotes.month += amount;
                            metrics.quotes.charts.month[getDate(qDate) - 1] += amount;

                            metrics.conversion.month.total++;
                            if (isSigned) {
                                metrics.conversion.month.signed++;
                                metrics.conversion.charts.month[getDate(qDate) - 1]++;
                            }

                            if (qDate >= currentWeekStart) {
                                metrics.quotes.week += amount;
                                metrics.quotes.charts.week[(getDay(qDate) + 6) % 7] += amount;

                                metrics.conversion.week.total++;
                                if (isSigned) {
                                    metrics.conversion.week.signed++;
                                    metrics.conversion.charts.week[(getDay(qDate) + 6) % 7]++;
                                }
                            }
                        }
                    }
                }
            });

            // Conversion Rates Calculation
            const calcRate = (signed, total) => total > 0 ? (signed / total) * 100 : 0;
            const convStats = {
                week: calcRate(metrics.conversion.week.signed, metrics.conversion.week.total),
                month: calcRate(metrics.conversion.month.signed, metrics.conversion.month.total),
                year: calcRate(metrics.conversion.year.signed, metrics.conversion.year.total),
            };

            // Transform conversion charts to simple signed count for now (easier visual) or smooth rate?
            // Let's stick to signed COUNT for the chart to show activity, but display RATE in main text.
            // Or better: show the Rate trend? A rate of 0 or 100 per day is spiky.
            // Let's map conversion charts to "Success Rate" if needed, but "Signed Count" is safer.
            // Actually, let's use the COUNT of signed quotes for the graph. It correlates with conversion success.

            // Construct Final Stats Object
            const buildMetricObject = (metricData, maxRef) => ({
                week: { value: metricData.week, max: maxRef.week * 1.5 || 1000, chart: formatChartPoints(metricData.charts.week, 'week') },
                month: { value: metricData.month, max: maxRef.month * 1.2 || 5000, chart: formatChartPoints(metricData.charts.month, 'month') },
                year: { value: metricData.year, max: maxRef.year * 1.2 || 10000, chart: formatChartPoints(metricData.charts.year, 'year') },
            });



            // Fetch names for details if needed (already fetched for recent but full list might be needed)
            // Optimization: We can just fetch names in the initial query or fetch on click.
            // Let's modify initial query to include client name for better UX in details.

            // 2. Nombre de clients
            const { count: clientCount, error: clientsError } = await supabase
                .from('clients')
                .select('*', { count: 'exact', head: true });

            if (clientsError) throw clientsError;

            // 3. Devis en attente
            const { count: pendingQuotes, error: pendingError } = await supabase
                .from('quotes')
                .select('*', { count: 'exact', head: true })
                .in('status', ['draft', 'sent']);

            if (pendingError) throw pendingError;

            // 4. Recent Activity
            // Fetch recent quotes
            const { data: recentQuotes, error: recentQuotesError } = await supabase
                .from('quotes')
                .select('*, clients(name)')
                .order('created_at', { ascending: false })
                .limit(5);

            if (recentQuotesError) throw recentQuotesError;

            // Fetch recent signatures (quotes with signed_at)
            const { data: recentSignatures, error: recentSignaturesError } = await supabase
                .from('quotes')
                .select('*, clients(name)')
                .not('signed_at', 'is', null) // Only signed quotes
                .order('signed_at', { ascending: false })
                .limit(5);

            if (recentSignaturesError) throw recentSignaturesError;

            // Fetch recent clients
            const { data: recentClients, error: recentClientsError } = await supabase
                .from('clients')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(5);

            if (recentClientsError) throw recentClientsError;

            // Combine and format
            const activities = [
                // Created quotes
                ...(recentQuotes || []).map(q => ({
                    type: 'quote',
                    date: q.created_at,
                    description: `Devis créé pour ${q.clients?.name || 'Client inconnu'}`,
                    amount: q.total_ttc
                })),
                // Signed quotes (distinct event)
                ...(recentSignatures || []).map(q => ({
                    type: 'signature',
                    date: q.signed_at,
                    description: `Devis signé par ${q.clients?.name || 'Client inconnu'}`,
                    amount: q.total_ttc
                })),
                // New clients
                ...(recentClients || []).map(c => ({
                    type: 'client',
                    date: c.created_at,
                    description: `Nouveau client : ${c.name}`,
                    amount: null
                }))
            ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10); // Show top 10 mixed

            const newStats = {
                revenue: buildMetricObject(metrics.revenue, metrics.revenue),
                quotes: buildMetricObject(metrics.quotes, metrics.quotes),
                conversion: {
                    week: { value: convStats.week, max: 100, chart: formatChartPoints(metrics.conversion.charts.week, 'week') },
                    month: { value: convStats.month, max: 100, chart: formatChartPoints(metrics.conversion.charts.month, 'month') },
                    year: { value: convStats.year, max: 100, chart: formatChartPoints(metrics.conversion.charts.year, 'year') },
                },
                clientCount,
                pendingQuotesCount: pendingQuotes || 0,
                recentActivity: activities,
                details: {
                    week: metrics.revenue.details.week, // Default to Revenue details for now in the shared view
                    month: metrics.revenue.details.month,
                    year: metrics.revenue.details.year
                }
            };

            setStats(newStats);
            localStorage.setItem('dashboard_stats', JSON.stringify(newStats));
        } catch (error) {
            console.error('Error fetching dashboard stats:', error);
        } finally {
            setLoading(false);
        }
    };

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
                    fetchStats(); // Refresh stats on any change

                    // Notify on new signature
                    if (payload.eventType === 'UPDATE' && payload.new.status === 'accepted' && payload.old.status !== 'accepted') {
                        // Check if it's a signature (either via signed_at or status change to accepted)
                        new Notification('Devis Signé !', {
                            body: `Un devis a été accepté pour ${payload.new.total_ttc} €`,
                            icon: '/pwa-192x192.png'
                        });
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [user]);

    const [selectedPeriod, setSelectedPeriod] = useState(null); // 'week', 'month', 'year'





    return (
        <div className="space-y-6 relative">
            {/* Modal for details */}
            {selectedPeriod && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedPeriod(null)}>
                    <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="font-bold text-lg">Détails : {selectedPeriod === 'week' ? 'Cette Semaine' : selectedPeriod === 'month' ? 'Ce Mois' : 'Cette Année'}</h3>
                            <button onClick={() => setSelectedPeriod(null)} className="p-1 hover:bg-gray-100 rounded-full">
                                <Plus className="w-5 h-5 rotate-45" />
                            </button>
                        </div>
                        <div className="overflow-y-auto p-4 space-y-3">
                            {stats.details && stats.details[selectedPeriod] && stats.details[selectedPeriod].length > 0 ? (
                                stats.details[selectedPeriod].map(quote => (
                                    <div key={quote.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                                        <div>
                                            <div className="font-medium text-gray-900">{quote.clients?.name || `Devis #${quote.id}`}</div>
                                            <div className="text-xs text-gray-500">
                                                {new Date(quote.date || quote.created_at).toLocaleDateString()} -
                                                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${quote.status === 'paid' ? 'bg-green-100 text-green-700' :
                                                    quote.status === 'billed' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                                                    }`}>
                                                    {quote.status === 'paid' ? 'Payé' : quote.status === 'billed' ? 'Facturé' : 'Signé'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="font-bold text-gray-900">
                                            {quote.total_ttc?.toFixed(2)} €
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-center text-gray-500 py-4">Aucun élément pour cette période.</p>
                            )}
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-gray-50 text-right font-bold text-lg">
                            Total: {stats[`turnover${selectedPeriod.charAt(0).toUpperCase() + selectedPeriod.slice(1)}`]?.toFixed(2)} €
                        </div>
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Tableau de bord</h2>
                <button
                    onClick={() => navigate('/app/devis/new')}
                    className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                    <Plus className="w-5 h-5 mr-2" />
                    Nouveau Devis
                </button>
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
                    onValueClick={(p) => setSelectedPeriod(p)}
                />

                <RichStatCard
                    title="Volume de Devis"
                    subText={`${stats.pendingQuotesCount} en attente`}
                    stats={stats.quotes}
                    icon={FileCheck}
                    colorClass="bg-orange-500"
                    colorHex="#F97316"
                    formatValue={(v) => `${v.toFixed(0)} €`}
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

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Activité récente</h3>
                <div className="space-y-4">
                    {stats.recentActivity.length > 0 ? (
                        stats.recentActivity.map((activity, index) => (
                            <div key={index} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors border border-gray-100">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-full ${activity.type === 'quote' ? 'bg-blue-100 text-blue-600' :
                                        activity.type === 'signature' ? 'bg-purple-100 text-purple-600' :
                                            'bg-green-100 text-green-600'
                                        }`}>
                                        {activity.type === 'quote' ? <FileText className="w-4 h-4" /> :
                                            activity.type === 'signature' ? <PenTool className="w-4 h-4" /> :
                                                <Users className="w-4 h-4" />}
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-900">{activity.description}</p>
                                        <p className="text-xs text-gray-500">
                                            {formatDistanceToNow(new Date(activity.date), { addSuffix: true, locale: fr })}
                                        </p>
                                    </div>
                                </div>
                                {activity.amount && (
                                    <span className="text-sm font-semibold text-gray-900">
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
