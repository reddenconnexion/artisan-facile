import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { FileText, CheckCircle, Clock, AlertCircle, ArrowRight } from 'lucide-react';

const StatusBadge = ({ status }) => {
    const styles = {
        draft: { bg: 'bg-gray-100', text: 'text-gray-700', icon: Clock, label: 'Brouillon' },
        sent: { bg: 'bg-blue-100', text: 'text-blue-700', icon: AlertCircle, label: 'Envoyé' },
        accepted: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle, label: 'Accepté' },
        rejected: { bg: 'bg-red-100', text: 'text-red-700', icon: AlertCircle, label: 'Refusé' },
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
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (clientId) {
            fetchHistory();
        }
    }, [clientId]);

    const fetchHistory = async () => {
        try {
            const { data, error } = await supabase
                .from('quotes')
                .select('*')
                .eq('client_id', clientId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setHistory(data || []);
        } catch (error) {
            console.error('Error fetching client history:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="text-center py-4 text-gray-500">Chargement de l'historique...</div>;

    if (history.length === 0) {
        return (
            <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                <FileText className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500">Aucun devis ou facture pour ce client.</p>
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
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Historique des chantiers</h3>
                <button
                    onClick={() => navigate('/app/devis/new', { state: { client_id: clientId } })}
                    className="text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                    + Nouveau devis
                </button>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Montant</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {history.map((item) => (
                            <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-3 text-sm text-gray-900">
                                    {new Date(item.date).toLocaleDateString()}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-500">
                                    {item.status === 'accepted' ? 'Facture' : 'Devis'} #{item.id}
                                </td>
                                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                    {item.total_ttc.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                </td>
                                <td className="px-4 py-3">
                                    <StatusBadge status={item.status} />
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <button
                                        onClick={() => navigate(`/app/devis/${item.id}`)}
                                        className="text-gray-400 hover:text-blue-600"
                                    >
                                        <ArrowRight className="w-5 h-5" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ClientHistory;
