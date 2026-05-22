import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { FileText, CheckCircle, Clock, AlertCircle, ArrowRight, Mail, Phone, MessageSquare, Calendar } from 'lucide-react';

const StatusBadge = ({ status }) => {
    const styles = {
        draft: { bg: 'bg-gray-100', text: 'text-gray-700', icon: Clock, label: 'Brouillon' },
        sent: { bg: 'bg-blue-100', text: 'text-blue-700', icon: AlertCircle, label: 'Envoyé' },
        accepted: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle, label: 'Accepté' },
        rejected: { bg: 'bg-red-100', text: 'text-red-700', icon: AlertCircle, label: 'Refusé' },
        billed: { bg: 'bg-purple-100', text: 'text-purple-700', icon: CheckCircle, label: 'Facturé' },
        paid: { bg: 'bg-teal-100', text: 'text-teal-700', icon: CheckCircle, label: 'Payé' },
    };
    const style = styles[status] || styles.draft;
    const Icon = style.icon;

    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
            <Icon className="w-3 h-3 mr-1" />
            {style.label}
        </span>
    );
};

const ClientHistory = ({ clientId }) => {
    const navigate = useNavigate();
    const [history, setHistory] = useState([]);
    const [interactions, setInteractions] = useState([]);
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (clientId) {
            fetchHistory();
        }
    }, [clientId]);

    const fetchHistory = async () => {
        try {
            const [quotesResult, interactionsResult, eventsResult] = await Promise.all([
                supabase
                    .from('quotes')
                    .select('*')
                    .eq('client_id', clientId)
                    .order('created_at', { ascending: false }),
                supabase
                    .from('client_interactions')
                    .select('*')
                    .eq('client_id', clientId)
                    .order('date', { ascending: false }),
                supabase
                    .from('events')
                    .select('*')
                    .eq('client_id', clientId)
                    .order('date', { ascending: false })
            ]);

            if (quotesResult.error) throw quotesResult.error;
            // Catch error for interactions quietly in case table is brand new for user
            const loadedInteractions = interactionsResult.data || [];

            if (eventsResult.error) {
                console.error('Error fetching events:', eventsResult.error);
            }
            const loadedEvents = eventsResult.data || [];

            setHistory(quotesResult.data || []);
            setInteractions(loadedInteractions);
            setEvents(loadedEvents);
        } catch (error) {
            console.error('Error fetching client history:', error);
        } finally {
            setLoading(false);
        }
    };

    const lastContact = interactions.length > 0 ? interactions[0] : null;

    if (loading) return <div className="text-center py-4 text-gray-500 dark:text-gray-400">Chargement de l'historique...</div>;

    if (history.length === 0 && interactions.length === 0) {
        return (
            <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
                <FileText className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400">Aucun historique pour ce client.</p>
                <button
                    onClick={() => navigate('/app/devis/new', { state: { client_id: clientId } })}
                    className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                    Créer un devis
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Last Contact Summary */}
            {lastContact && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-start md:items-center">
                    <Clock className="w-5 h-5 text-blue-600 mr-3 mt-1 md:mt-0 flex-shrink-0" />
                    <div>
                        <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                            Dernier contact : {new Date(lastContact.date).toLocaleDateString()} à {new Date(lastContact.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5 flex items-center gap-1">
                            {lastContact.type === 'email' && <><Mail className="w-3 h-3" /> Email</>}
                            {lastContact.type === 'call' && <><Phone className="w-3 h-3" /> Appel</>}
                            {lastContact.type === 'sms' && <><MessageSquare className="w-3 h-3" /> SMS</>}
                            {lastContact.type === 'meeting' && <><Calendar className="w-3 h-3" /> RDV</>}
                            {lastContact.type === 'other' && 'Autre'}
                            {lastContact.details ? ` - ${lastContact.details}` : ''}
                        </p>
                    </div>
                </div>
            )}



            {/* Interventions (Events) List */}
            {events.length > 0 && (
                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 font-medium text-sm text-gray-700 dark:text-gray-300 flex justify-between items-center">
                        <span>Historique des interventions</span>
                    </div>
                    <ul className="divide-y divide-gray-100 dark:divide-gray-800 max-h-60 overflow-y-auto">
                        {events.map(event => (
                            <li key={event.id} className="px-4 py-3 flex items-start space-x-3 hover:bg-gray-50 dark:hover:bg-gray-800">
                                <div className="mt-0.5 flex-shrink-0">
                                    <Calendar className="w-4 h-4 text-blue-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                            {event.title}
                                        </p>
                                        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap ml-2">
                                            {new Date(event.date).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                                        {event.time} {event.address ? `- ${event.address}` : ''}
                                    </p>
                                    {event.details && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">
                                            {event.details}
                                        </p>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Interactions List */}
            {interactions.length > 0 && (
                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 font-medium text-sm text-gray-700 dark:text-gray-300 flex justify-between items-center">
                        <span>Journal des échanges</span>
                    </div>
                    <ul className="divide-y divide-gray-100 dark:divide-gray-800 max-h-60 overflow-y-auto">
                        {interactions.map(log => (
                            <li key={log.id} className="px-4 py-3 flex items-start space-x-3 hover:bg-gray-50 dark:hover:bg-gray-800">
                                <div className="mt-0.5 flex-shrink-0">
                                    {log.type === 'email' && <Mail className="w-4 h-4 text-gray-400" />}
                                    {log.type === 'call' && <Phone className="w-4 h-4 text-gray-400" />}
                                    {log.type === 'sms' && <MessageSquare className="w-4 h-4 text-gray-400" />}
                                    {log.type === 'meeting' && <Calendar className="w-4 h-4 text-gray-400" />}
                                    {log.type === 'other' && <Clock className="w-4 h-4 text-gray-400" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white capitalize truncate">
                                            {log.type === 'email' ? 'Email' : log.type === 'call' ? 'Appel' : log.type === 'sms' ? 'SMS' : log.type}
                                        </p>
                                        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap ml-2">{new Date(log.date).toLocaleDateString()}</span>
                                    </div>
                                    {log.details && <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">{log.details}</p>}
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Documents List */}
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Devis & Factures</h3>
                    <button
                        onClick={() => navigate('/app/devis/new', { state: { client_id: clientId } })}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800"
                    >
                        + Nouveau devis
                    </button>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        {/* Table Header */}
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Type</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Montant</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Statut</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Action</th>
                            </tr>
                        </thead>
                        {/* Table Body */}
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {history.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-4 py-4 text-center text-sm text-gray-500 dark:text-gray-400">Aucun document</td>
                                </tr>
                            ) : (
                                history.map((item) => (
                                    <tr
                                        key={item.id}
                                        onClick={() => navigate(`/app/devis/${item.id}`)}
                                        className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                                    >
                                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                            {new Date(item.date).toLocaleDateString()}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                            {(item.type === 'invoice' || item.status === 'paid') ? 'Facture' : 'Devis'} #{item.quote_number || item.id}
                                        </td>
                                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                                            {item.total_ttc.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={item.status} />
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <ArrowRight className="w-5 h-5 text-gray-400" />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ClientHistory;
