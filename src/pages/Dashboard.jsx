import React, { useState, useEffect } from 'react';
import { Plus, TrendingUp, Users, FileCheck, FileText, PenTool } from 'lucide-react';
import { formatDistanceToNow, startOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';

import ActionableDashboard from '../components/ActionableDashboard';

const StatCard = ({ title, value, icon: Icon, color }) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
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

const Dashboard = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [stats, setStats] = useState(() => {
        const cached = localStorage.getItem('dashboard_stats');
        return cached ? JSON.parse(cached) : {
            turnover: 0,
            turnoverYear: 0,
            turnoverMonth: 0,
            turnoverWeek: 0,
            clientCount: 0,
            pendingQuotes: 0,
            recentActivity: []
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
            // 1. Chiffre d'affaires (Encaissé uniquement) - Fetch date to calculate periods
            const { data: paidQuotes, error: quotesError } = await supabase
                .from('quotes')
                .select('total_ttc, date, created_at, status')
                .in('status', ['paid', 'accepted', 'billed']); // Include accepted/billed as revenue if paid flow not fully used

            if (quotesError) throw quotesError;

            const now = new Date();
            // Fix for Sunday (0) to be treated as end of week (7) for calc, or just use date-fns startOfWeek if available (it is imported!)
            // We have: import { startOfWeek } from 'date-fns';
            // Let's use it for reliability.
            const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

            const currentYear = new Date().getFullYear();
            const currentMonthStart = new Date(currentYear, new Date().getMonth(), 1);
            const currentYearStart = new Date(currentYear, 0, 1);

            let turnover = 0;
            let turnoverWeek = 0;
            let turnoverMonth = 0;
            let turnoverYear = 0;

            paidQuotes.forEach(quote => {
                const amount = quote.total_ttc || 0;
                const qDate = new Date(quote.date || quote.created_at);

                turnover += amount;

                if (qDate >= currentYearStart) {
                    turnoverYear += amount;
                    if (qDate >= currentMonthStart) {
                        turnoverMonth += amount;
                        if (qDate >= currentWeekStart) {
                            turnoverWeek += amount;
                        }
                    }
                }
            });

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
                turnover,
                turnoverWeek,
                turnoverMonth,
                turnoverYear,
                clientCount: clientCount || 0,
                pendingQuotes: pendingQuotes || 0,
                recentActivity: activities
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

    // Simple Bar helper
    const RevenueBar = ({ label, value, max, color }) => {
        const percentage = max > 0 ? (value / max) * 100 : 0;
        return (
            <div className="flex flex-col gap-1 w-full">
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

    return (
        <div className="space-y-6">
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
                {/* Revenue Card - Expanded */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 md:col-span-1">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="text-sm font-medium text-gray-500">Chiffre d'affaires Global</p>
                            <p className="text-2xl font-bold text-gray-900 mt-1">
                                {loading ? "..." : `${stats.turnover?.toFixed(2) || '0.00'} €`}
                            </p>
                        </div>
                        <div className="p-3 rounded-lg bg-green-500">
                            <TrendingUp className="w-6 h-6 text-white" />
                        </div>
                    </div>
                    {/* Visual Breakdown */}
                    <div className="space-y-4 pt-2 border-t border-gray-50">
                        <RevenueBar
                            label="Cette Semaine"
                            value={stats.turnoverWeek || 0}
                            max={stats.turnoverMonth * 1.5 || 1000} // Scale relatively
                            color="bg-green-400"
                        />
                        <RevenueBar
                            label="Ce Mois"
                            value={stats.turnoverMonth || 0}
                            max={stats.turnoverYear * 0.5 || 5000} // Scale relatively
                            color="bg-green-500"
                        />
                        <RevenueBar
                            label="Cette Année"
                            value={stats.turnoverYear || 0}
                            max={stats.turnoverYear * 1.2 || 10000} // Self scale roughly
                            color="bg-green-600"
                        />
                    </div>
                </div>

                <StatCard
                    title="Clients Actifs"
                    value={loading ? "..." : stats.clientCount}
                    icon={Users}
                    color="bg-blue-500"
                />
                <StatCard
                    title="Devis en attente"
                    value={loading ? "..." : stats.pendingQuotes}
                    icon={FileCheck}
                    color="bg-orange-500"
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
        </div>
    );
};

export default Dashboard;
