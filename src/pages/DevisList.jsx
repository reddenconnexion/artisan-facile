import React, { useState, useEffect } from 'react';
import { Search, Plus, FileText, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

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

const DevisList = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [devisList, setDevisList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (user) {
            fetchDevis();
        }
    }, [user]);

    const fetchDevis = async () => {
        try {
            const { data, error } = await supabase
                .from('quotes')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setDevisList(data || []);
        } catch (error) {
            toast.error('Erreur lors du chargement des devis');
            console.error('Error fetching quotes:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredDevis = devisList.filter(devis =>
        (devis.client_name && devis.client_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        devis.id.toString().includes(searchTerm)
    );

    if (loading) {
        return <div className="flex justify-center items-center h-64">Chargement...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-2xl font-bold text-gray-900">Devis & Factures</h2>
                <button
                    onClick={() => navigate('/devis/new')}
                    className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                    <Plus className="w-5 h-5 mr-2" />
                    Nouveau Devis
                </button>
            </div>

            {/* Filtres et Recherche */}
            <div className="flex gap-4">
                <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Rechercher un devis, un client..."
                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Liste */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Numéro</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Montant TTC</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
                            <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredDevis.map((devis) => (
                            <tr key={devis.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => navigate(`/devis/${devis.id}`)}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                                    #{devis.id}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {devis.client_name || 'Client inconnu'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {new Date(devis.date).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                                    {devis.total_ttc ? devis.total_ttc.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '-'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <StatusBadge status={devis.status} />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button className="text-gray-400 hover:text-gray-600">
                                        <FileText className="w-5 h-5" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredDevis.length === 0 && (
                    <div className="text-center py-12">
                        <p className="text-gray-500">Aucun devis trouvé.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DevisList;
