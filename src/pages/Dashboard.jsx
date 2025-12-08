import React, { useState, useEffect } from 'react';
import { Plus, TrendingUp, Users, FileCheck, FileText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
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
            // 1. Chiffre d'affaires (Total HT des devis acceptés/facturés)
            // Including 'paid' status in turnover calculation
            const { data: acceptedQuotes, error: quotesError } = await supabase
                .from('quotes')
                .select('total_ht')
                .in('status', ['accepted', 'billed', 'paid']);

            if (quotesError) throw quotesError;

            const turnover = acceptedQuotes.reduce((sum, quote) => sum + (quote.total_ht || 0), 0);

            // 2. Nombre de clients
            const { count: clientCount, error: clientsError } = await supabase
                .from('clients')
                .select('*', { count: 'exact', head: true });

            if (clientsError) throw clientsError;

            // 3. Devis en attente (draft or sent)
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

            // Fetch recent clients
            const { data: recentClients, error: recentClientsError } = await supabase
                .from('clients')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(5);

            if (recentClientsError) throw recentClientsError;

            // Combine and format
            const activities = [
                ...(recentQuotes || []).map(q => ({
                    type: 'quote',
                    date: q.created_at,
                    description: `Devis pour ${q.clients?.name || 'Client inconnu'}`,
                    amount: q.total_ttc
                })),
                ...(recentClients || []).map(c => ({
                    type: 'client',
                    date: c.created_at,
                    description: `Nouveau client : ${c.name}`,
                    amount: null
                }))
            ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

            const newStats = {
                turnover,
                clientCount: clientCount || 0,
                pendingQuotes: pendingQuotes || 0,
                recentActivity: activities
            };

            setStats(newStats);
            localStorage.setItem('dashboard_stats', JSON.stringify(newStats));
        } catch (error) {
            console.error('Error fetching dashboard stats:', error);
            // If error (e.g. offline), we keep the existing state (which might be from localStorage)
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Tableau de bord</h2>
                <button
                    onClick={() => navigate('/devis/new')}
                    className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                    <Plus className="w-5 h-5 mr-2" />
                    Nouveau Devis
                </button>
            </div>

            <ActionableDashboard user={user} />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    title="Chiffre d'affaires (HT)"
                    value={loading ? "..." : `${stats.turnover.toFixed(2)} €`}
                    icon={TrendingUp}
                    color="bg-green-500"
                />
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
                                    <div className={`p-2 rounded-full ${activity.type === 'quote' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                                        {activity.type === 'quote' ? <FileText className="w-4 h-4" /> : <Users className="w-4 h-4" />}
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
