import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { Calendar, AlertCircle, CheckCircle, FileText, ArrowRight, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, isAfter, isBefore, addDays, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

const ActionableDashboard = ({ user }) => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [actionItems, setActionItems] = useState({
        upcomingEvents: [],
        overdueQuotes: [],
        pendingInvoices: [],
        draftQuotes: []
    });

    useEffect(() => {
        if (user) {
            fetchActionItems();
        }
    }, [user]);

    const fetchActionItems = async () => {
        try {
            setLoading(true);
            const now = new Date();
            const threeDaysFromNow = addDays(now, 3);
            const sevenDaysAgo = addDays(now, -7);

            // 1. Upcoming Events (Next 3 days)
            const { data: events } = await supabase
                .from('events')
                .select('*')
                .eq('user_id', user.id)
                .gte('date', now.toISOString())
                .lte('date', threeDaysFromNow.toISOString())
                .order('date', { ascending: true })
                .limit(3);

            // 2. Quotes to follow up (Sent > 7 days ago)
            const { data: overdueQuotes } = await supabase
                .from('quotes')
                .select('*, clients(name)')
                .eq('user_id', user.id)
                .eq('status', 'sent')
                .lt('date', sevenDaysAgo.toISOString()) // Created before 7 days ago
                .limit(3);

            // 3. Pending Invoices (Billed but not Paid)
            const { data: pendingInvoices } = await supabase
                .from('quotes')
                .select('*, clients(name)')
                .eq('user_id', user.id)
                .eq('status', 'billed')
                .limit(3);

            // 4. Drafts (To finish)
            const { data: draftQuotes } = await supabase
                .from('quotes')
                .select('*, clients(name)')
                .eq('user_id', user.id)
                .eq('status', 'draft')
                .order('updated_at', { ascending: false }) // Recently worked on
                .limit(3);

            // 5. Maintenance (For plumbers/electricians)
            let maintenanceAlerts = [];
            const jobType = user.user_metadata?.job_type;
            if (['plombier', 'chauffagiste', 'electricien'].includes(jobType)) {
                const { data: alerts } = await supabase
                    .from('maintenance_contracts')
                    .select('*, clients(name)')
                    .eq('user_id', user.id)
                    .lte('next_maintenance_date', addDays(now, 30).toISOString()) // Due in next 30 days or overdue
                    .limit(3);
                maintenanceAlerts = alerts || [];
            }

            setActionItems({
                upcomingEvents: events || [],
                overdueQuotes: overdueQuotes || [],
                pendingInvoices: pendingInvoices || [],
                draftQuotes: draftQuotes || [],
                maintenanceAlerts: maintenanceAlerts
            });

        } catch (error) {
            console.error('Error loading dashboard items:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="space-y-3">
                <div className="h-16 bg-gray-100 rounded"></div>
                <div className="h-16 bg-gray-100 rounded"></div>
            </div>
        </div>
    );

    const hasItems = Object.values(actionItems).some(arr => arr.length > 0);

    if (!hasItems) return null; // Or show "All good!" message

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-8">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                <h3 className="font-semibold text-gray-900 flex items-center">
                    <CheckCircle className="w-5 h-5 mr-2 text-blue-600" />
                    Actions Prioritaires
                </h3>
                <span className="text-xs font-medium text-gray-500 bg-white px-2 py-1 rounded border border-gray-200">
                    To-Do
                </span>
            </div>

            <div className="divide-y divide-gray-100">
                {/* 0. Maintenance Alerts */}
                {actionItems.maintenanceAlerts && actionItems.maintenanceAlerts.length > 0 && (
                    <div className="p-4 bg-orange-50/50">
                        <h4 className="text-xs font-bold text-orange-800 uppercase tracking-wider mb-3 flex items-center">
                            <Wrench className="w-3 h-3 mr-1" /> Entretiens à prévoir
                        </h4>
                        <div className="space-y-2">
                            {actionItems.maintenanceAlerts.map(contract => (
                                <div key={contract.id} className="flex items-center justify-between text-sm bg-white p-2 rounded border border-orange-100 shadow-sm">
                                    <div className="flex items-center">
                                        <div>
                                            <p className="font-medium text-gray-900">{contract.clients?.name}</p>
                                            <p className="text-xs text-gray-500">
                                                {contract.equipment_name} - {format(parseISO(contract.next_maintenance_date), 'dd MMMM', { locale: fr })}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => navigate('/app/maintenance')}
                                        className="text-xs font-medium text-blue-600 hover:text-blue-800"
                                    >
                                        Voir
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 1. Events */}
                {actionItems.upcomingEvents.length > 0 && (
                    <div className="p-4 bg-blue-50/30">
                        <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-3 flex items-center">
                            <Calendar className="w-3 h-3 mr-1" /> Prochains RDV
                        </h4>
                        <div className="space-y-2">
                            {actionItems.upcomingEvents.map(event => (
                                <div key={event.id} className="flex items-center justify-between text-sm bg-white p-2 rounded border border-blue-100 shadow-sm">
                                    <div className="flex items-center">
                                        <div className="w-12 text-center leading-none mr-3">
                                            <span className="block text-xs text-gray-500">{format(parseISO(event.date), 'dd/MM', { locale: fr })}</span>
                                            <span className="block font-bold text-blue-600">{event.time}</span>
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900">{event.title}</p>
                                            {event.address && <p className="text-xs text-gray-500 truncate max-w-[200px]">{event.address}</p>}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 2. Overdue Quotes */}
                {actionItems.overdueQuotes.length > 0 && (
                    <div className="p-4 bg-amber-50/30">
                        <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-3 flex items-center">
                            <AlertCircle className="w-3 h-3 mr-1" /> Devis à relancer (+7j)
                        </h4>
                        <div className="space-y-2">
                            {actionItems.overdueQuotes.map(quote => (
                                <div
                                    key={quote.id}
                                    onClick={() => navigate(`/app/devis/${quote.id}`)}
                                    className="flex items-center justify-between text-sm bg-white p-2 rounded border border-amber-100 shadow-sm cursor-pointer hover:bg-amber-50 transition-colors"
                                >
                                    <div>
                                        <p className="font-medium text-gray-900">{quote.client_name || quote.clients?.name || 'Client'}</p>
                                        <p className="text-xs text-gray-500">
                                            Envoyé le {format(parseISO(quote.date), 'dd MMMM', { locale: fr })} - {quote.total_ttc}€
                                        </p>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-amber-400" />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 3. Pending Invoices */}
                {actionItems.pendingInvoices.length > 0 && (
                    <div className="p-4 bg-green-50/30">
                        <h4 className="text-xs font-bold text-green-800 uppercase tracking-wider mb-3 flex items-center">
                            <FileText className="w-3 h-3 mr-1" /> Factures en attente
                        </h4>
                        <div className="space-y-2">
                            {actionItems.pendingInvoices.map(quote => (
                                <div
                                    key={quote.id}
                                    onClick={() => navigate(`/app/devis/${quote.id}`)}
                                    className="flex items-center justify-between text-sm bg-white p-2 rounded border border-green-100 shadow-sm cursor-pointer hover:bg-green-50 transition-colors"
                                >
                                    <div>
                                        <p className="font-medium text-gray-900">{quote.client_name || quote.clients?.name || 'Client'}</p>
                                        <p className="text-xs text-gray-500">
                                            Facturé le {format(parseISO(quote.date), 'dd MMMM', { locale: fr })}
                                        </p>
                                    </div>
                                    <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">
                                        {quote.total_ttc} €
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 4. Drafts */}
                {actionItems.draftQuotes.length > 0 && (
                    <div className="p-4">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                            Brouillons à finir
                        </h4>
                        <div className="space-y-2">
                            {actionItems.draftQuotes.map(quote => (
                                <div
                                    key={quote.id}
                                    onClick={() => navigate(`/app/devis/${quote.id}`)}
                                    className="flex items-center justify-between text-sm hover:bg-gray-50 p-2 rounded cursor-pointer transition-colors"
                                >
                                    <div className="flex items-center">
                                        <div className="w-2 h-2 bg-gray-300 rounded-full mr-3"></div>
                                        <div>
                                            <p className="text-gray-900">{quote.title || 'Devis sans titre'}</p>
                                            <p className="text-xs text-gray-500">{quote.client_name || quote.clients?.name}</p>
                                        </div>
                                    </div>
                                    <ArrowRight className="w-3 h-3 text-gray-300" />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {(actionItems.overdueQuotes.length > 0 || actionItems.pendingInvoices.length > 0) && (
                <div className="px-6 py-3 bg-gray-50 text-xs text-center text-gray-500 border-t border-gray-100">
                    💡 Astuce : Passez une facture à "Payé" pour l'archiver.
                </div>
            )}
        </div>
    );
};

export default ActionableDashboard;
