import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { Calendar, AlertCircle, CheckCircle, FileText, ArrowRight, Wrench, Navigation, Car } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, isAfter, isBefore, addDays, parseISO, startOfDay, addHours } from 'date-fns';
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

            // 1. Upcoming Events (fetch wider range to catch today's events stored around midnight UTC)
            // Strategy: Get events from yesterday to +7 days to be safe
            const { data: rawEvents } = await supabase
                .from('events')
                .select('*')
                .eq('user_id', user.id)
                .gte('date', format(addDays(now, -1), 'yyyy-MM-dd'))
                .lte('date', format(addDays(now, 7), 'yyyy-MM-dd'))
                .order('date', { ascending: true });

            // Process events to find "Next or Current"
            // We assume 1h duration by default if not specified
            const processedEvents = (rawEvents || [])
                .map(event => {
                    // Reconstruct exact date time from stored date + stored time string
                    const d = new Date(event.date);
                    const [hours, minutes] = (event.time || '00:00').split(':');
                    d.setHours(parseInt(hours), parseInt(minutes), 0, 0);

                    const endTime = addHours(d, 1); // Assume 1h duration
                    return { ...event, startDateTime: d, endDateTime: endTime };
                })
                .filter(event => isAfter(event.endDateTime, now)) // Keep if not finished yet
                .sort((a, b) => a.startDateTime - b.startDateTime) // Sort by start time
                .slice(0, 3); // Take top 3

            // 2. Quotes to follow up (Sent > 7 days ago)
            const { data: overdueQuotes } = await supabase
                .from('quotes')
                .select('*, clients(name)')
                .eq('user_id', user.id)
                .eq('status', 'sent')
                .lt('date', sevenDaysAgo.toISOString()) // Created before 7 days ago
                .or(`last_followup_at.is.null,last_followup_at.lt.${sevenDaysAgo.toISOString()}`)
                .order('date', { ascending: true })
                .limit(10);

            // 3. Pending Invoices (Billed but not Paid)
            const { data: pendingInvoices } = await supabase
                .from('quotes')
                .select('*, clients(name)')
                .eq('user_id', user.id)
                .eq('status', 'billed')
                .order('date', { ascending: true })
                .limit(10);

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
                upcomingEvents: processedEvents || [],
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

    const handleManualFollowUp = async (e, quoteId) => {
        e.stopPropagation();
        const now = new Date().toISOString();

        // Optimistic update
        setActionItems(prev => ({
            ...prev,
            overdueQuotes: prev.overdueQuotes.filter(q => q.id !== quoteId)
        }));

        const { error } = await supabase
            .from('quotes')
            .update({ last_followup_at: now })
            .eq('id', quoteId);

        if (error) {
            console.error('Error updating follow-up:', error);
            // Revert on error (could imply re-fetching, but keeping it simple for now)
            fetchActionItems();
        }
    };

    if (loading) return (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 animate-pulse">
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
            <div className="space-y-3">
                <div className="h-16 bg-gray-100 rounded"></div>
                <div className="h-16 bg-gray-100 rounded"></div>
            </div>
        </div>
    );

    const hasItems = Object.values(actionItems).some(arr => arr.length > 0);

    if (!hasItems) return null; // Or show "All good!" message

    return (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden mb-8">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 flex justify-between items-center">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center">
                    <CheckCircle className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
                    Actions Prioritaires
                </h3>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-700 px-2 py-1 rounded border border-gray-200 dark:border-gray-600">
                    To-Do
                </span>
            </div>

            <div className="divide-y divide-gray-100">
                {/* 0. Maintenance Alerts */}
                {actionItems.maintenanceAlerts && actionItems.maintenanceAlerts.length > 0 && (
                    <div className="p-4 bg-orange-50/50 dark:bg-orange-900/10">
                        <h4 className="text-xs font-bold text-orange-800 dark:text-orange-300 uppercase tracking-wider mb-3 flex items-center">
                            <Wrench className="w-3 h-3 mr-1" /> Entretiens à prévoir
                        </h4>
                        <div className="space-y-2">
                            {actionItems.maintenanceAlerts.map(contract => (
                                <div key={contract.id} className="flex items-center justify-between text-sm bg-white dark:bg-gray-800 p-2 rounded border border-orange-100 dark:border-orange-900/30 shadow-sm">
                                    <div className="flex items-center">
                                        <div>
                                            <p className="font-medium text-gray-900 dark:text-white">{contract.clients?.name}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                {contract.equipment_name} - {format(parseISO(contract.next_maintenance_date), 'dd MMMM', { locale: fr })}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => navigate('/app/maintenance')}
                                        className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
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
                    <div className="p-4 bg-blue-50/30 dark:bg-blue-900/10">
                        <h4 className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wider mb-3 flex items-center">
                            <Calendar className="w-3 h-3 mr-1" /> Prochains RDV
                        </h4>
                        <div className="space-y-2">
                            {actionItems.upcomingEvents.map((event, idx) => {
                                const isNext = idx === 0; // The first one is the "Current/Next" one
                                return (
                                    <div key={event.id} className={`flex items-center justify-between text-sm bg-white dark:bg-gray-800 p-2 rounded border shadow-sm ${isNext ? 'border-blue-300 dark:border-blue-700 ring-1 ring-blue-100 dark:ring-blue-900/50' : 'border-blue-100 dark:border-blue-900/30'}`}>
                                        <div className="flex items-center flex-1">
                                            <div className="w-12 text-center leading-none mr-3 flex-shrink-0">
                                                <span className="block text-xs text-gray-500 dark:text-gray-400">{format(event.startDateTime, 'dd/MM', { locale: fr })}</span>
                                                <span className="block font-bold text-blue-600 dark:text-blue-400">{event.time}</span>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-medium text-gray-900 dark:text-white truncate">{event.title}</p>
                                                {event.address && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{event.address}</p>}
                                            </div>
                                        </div>
                                        {isNext && event.address && (
                                            <div className="flex gap-1 ml-2">
                                                <a
                                                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.address)}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center shadow-sm"
                                                    title="Google Maps"
                                                >
                                                    <Navigation className="w-4 h-4" />
                                                </a>
                                                <a
                                                    href={`https://waze.com/ul?q=${encodeURIComponent(event.address)}&navigate=yes`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-2 bg-blue-400 text-white rounded-lg hover:bg-blue-500 transition-colors flex items-center justify-center shadow-sm"
                                                    title="Waze"
                                                >
                                                    <Car className="w-4 h-4" />
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* 2. Overdue Quotes */}
                {actionItems.overdueQuotes.length > 0 && (
                    <div className="p-4 bg-amber-50/30 dark:bg-amber-900/10">
                        <h4 className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider mb-3 flex items-center">
                            <AlertCircle className="w-3 h-3 mr-1" /> Devis à relancer (+7j)
                        </h4>
                        <div className="space-y-2">
                            {actionItems.overdueQuotes.map(quote => (
                                <div
                                    key={quote.id}
                                    onClick={() => navigate(`/app/devis/${quote.id}`)}
                                    className="flex items-center justify-between text-sm bg-white dark:bg-gray-800 p-2 rounded border border-amber-100 dark:border-amber-900/30 shadow-sm cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                                >
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">{quote.client_name || quote.clients?.name || 'Client'}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            Envoyé le {format(parseISO(quote.date), 'dd MMMM', { locale: fr })} - {quote.total_ttc}€
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={(e) => handleManualFollowUp(e, quote.id)}
                                            className="p-1.5 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded border border-amber-200 transition-colors"
                                            title="Marquer comme relancé aujourd'hui"
                                        >
                                            Relancé
                                        </button>
                                        <ArrowRight className="w-4 h-4 text-amber-400" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 3. Pending Invoices */}
                {actionItems.pendingInvoices.length > 0 && (
                    <div className="p-4 bg-green-50/30 dark:bg-green-900/10">
                        <h4 className="text-xs font-bold text-green-800 dark:text-green-300 uppercase tracking-wider mb-3 flex items-center">
                            <FileText className="w-3 h-3 mr-1" /> Factures en attente
                        </h4>
                        <div className="space-y-2">
                            {actionItems.pendingInvoices.map(quote => (
                                <div
                                    key={quote.id}
                                    onClick={() => navigate(`/app/devis/${quote.id}`)}
                                    className="flex items-center justify-between text-sm bg-white dark:bg-gray-800 p-2 rounded border border-green-100 dark:border-green-900/30 shadow-sm cursor-pointer hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                                >
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">{quote.client_name || quote.clients?.name || 'Client'}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            Facturé le {format(parseISO(quote.date), 'dd MMMM', { locale: fr })}
                                        </p>
                                    </div>
                                    <span className="text-xs font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full">
                                        {quote.total_ttc} €
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 4. Drafts */}
                {actionItems.draftQuotes.length > 0 && (
                    <div className="p-4 bg-white dark:bg-gray-900">
                        <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                            Brouillons à finir
                        </h4>
                        <div className="space-y-2">
                            {actionItems.draftQuotes.map(quote => (
                                <div
                                    key={quote.id}
                                    onClick={() => navigate(`/app/devis/${quote.id}`)}
                                    className="flex items-center justify-between text-sm hover:bg-gray-50 dark:hover:bg-gray-800 p-2 rounded cursor-pointer transition-colors"
                                >
                                    <div className="flex items-center">
                                        <div className="w-2 h-2 bg-gray-300 dark:bg-gray-600 rounded-full mr-3"></div>
                                        <div>
                                            <p className="text-gray-900 dark:text-white">{quote.title || 'Devis sans titre'}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">{quote.client_name || quote.clients?.name}</p>
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
                <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800/50 text-xs text-center text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-800">
                    💡 Astuce : Passez une facture à "Payé" pour l'archiver.
                </div>
            )}
        </div>
    );
};

export default ActionableDashboard;
