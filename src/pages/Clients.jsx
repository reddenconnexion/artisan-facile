import React, { useState } from 'react';
import { Search, Plus, Phone, Mail, MapPin, MoreVertical, Edit, Trash2, ArrowUpDown, Users, FileText, AlertTriangle, Download } from 'lucide-react';
import { Button } from '../components/ui';
import { exportToCSV } from '../utils/csvExport';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import { useClients, useQuotes, useInvalidateCache } from '../hooks/useDataCache';
import { useDebounce } from '../hooks/useDebounce';
import { useProgressiveList } from '../hooks/useProgressiveList';
import { useTestMode } from '../context/TestModeContext';

const Clients = () => {
    const navigate = useNavigate();

    // Utilisation du cache React Query
    const { data: clients = [], isLoading: loading } = useClients();
    const { data: quotes = [] } = useQuotes();
    const { invalidateClients } = useInvalidateCache();
    const { isTestMode, testClient } = useTestMode();

    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearch = useDebounce(searchTerm, 300); // Retarde la recherche de 300ms
    const [activeMenu, setActiveMenu] = useState(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });

    // Quote stats per client
    const quoteCountByClient = quotes.reduce((acc, q) => {
        if (q.client_id) acc[q.client_id] = (acc[q.client_id] || 0) + 1;
        return acc;
    }, {});
    const lastQuoteByClient = quotes.reduce((acc, q) => {
        if (!q.client_id) return acc;
        if (!acc[q.client_id] || new Date(q.created_at) > new Date(acc[q.client_id].created_at)) {
            acc[q.client_id] = q;
        }
        return acc;
    }, {});

    const handleSort = (key) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleDeleteClient = async (clientId) => {
        try {
            const { error } = await supabase
                .from('clients')
                .delete()
                .eq('id', clientId);

            if (error) throw error;
            toast.success('Client supprimé');
            invalidateClients();
        } catch (error) {
            console.error('Error deleting client:', error);
            toast.error('Erreur lors de la suppression du client');
        } finally {
            setDeleteConfirmId(null);
            setActiveMenu(null);
        }
    };

    const filteredClients = clients.filter(client => {
        if (!isTestMode && testClient?.id && client.id === testClient.id) return false;
        const term = debouncedSearch.toLowerCase(); // Utilise la recherche retardée
        return (
            client.name.toLowerCase().includes(term) ||
            (client.email && client.email.toLowerCase().includes(term)) ||
            (client.phone && client.phone.includes(term)) ||
            (client.address && client.address.toLowerCase().includes(term))
        );
    }).sort((a, b) => {
        const aValue = a[sortConfig.key] || '';
        const bValue = b[sortConfig.key] || '';

        if (sortConfig.key === 'created_at') {
            return sortConfig.direction === 'asc'
                ? new Date(aValue) - new Date(bValue)
                : new Date(bValue) - new Date(aValue);
        }

        return sortConfig.direction === 'asc'
            ? String(aValue).localeCompare(String(bValue))
            : String(bValue).localeCompare(String(aValue));
    });

    const { visibleItems: visibleClients, hasMore, hiddenCount, loadMore, showAll } = useProgressiveList(filteredClients, { pageSize: 100 });

    if (loading) {
        return <div className="flex justify-center items-center h-64">Chargement...</div>;
    }

    const ClientListItem = ({ client }) => {
        const count = quoteCountByClient[client.id] || 0;
        const lastQuote = lastQuoteByClient[client.id];
        const isConfirmingDelete = deleteConfirmId === client.id;

        return (
            <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 last:border-0 transition-colors">
                {isConfirmingDelete ? (
                    <div className="p-4 flex items-center justify-between gap-4 bg-red-50 dark:bg-red-900/20 dark:bg-red-900/10">
                        <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>Supprimer <strong>{client.name}</strong> ? Action irréversible.</span>
                        </div>
                        <div className="flex gap-2 shrink-0">
                            <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 dark:border-gray-700"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={() => handleDeleteClient(client.id)}
                                className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                            >
                                Supprimer
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="p-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-800 dark:hover:bg-gray-800/50">
                        <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold shrink-0">
                            {client.name.charAt(0)}
                        </div>

                        <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                            <div className="md:col-span-4">
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{client.name}</h3>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <p className="text-xs text-gray-500 dark:text-gray-400 hidden md:block">Ajouté le {new Date(client.created_at).toLocaleDateString()}</p>
                                    {count > 0 && (
                                        <span className="hidden md:inline text-xs text-gray-400">
                                            · {count} devis{lastQuote ? ` · dernier le ${new Date(lastQuote.created_at).toLocaleDateString()}` : ''}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="md:col-span-4 hidden md:block">
                                {client.email && (
                                    <div className="flex items-center text-gray-600 dark:text-gray-400 dark:text-gray-300 mb-1">
                                        <Mail className="w-3 h-3 mr-2 text-gray-400" />
                                        <span className="text-xs truncate">{client.email}</span>
                                    </div>
                                )}
                                {client.phone && (
                                    <div className="flex items-center text-gray-600 dark:text-gray-400 dark:text-gray-300">
                                        <Phone className="w-3 h-3 mr-2 text-gray-400" />
                                        <span className="text-xs">{client.phone}</span>
                                    </div>
                                )}
                            </div>

                            <div className="md:col-span-4 hidden md:block">
                                {client.address && (
                                    <div className="flex items-center text-gray-600 dark:text-gray-400 dark:text-gray-300">
                                        <MapPin className="w-3 h-3 mr-2 text-gray-400" />
                                        <span className="text-xs truncate">{client.address}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => navigate(`/app/clients/${client.id}`)}
                                className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                title="Voir fiche"
                            >
                                <Edit className="w-4 h-4" />
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenu(activeMenu === client.id ? null : client.id);
                                }}
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors relative"
                            >
                                <MoreVertical className="w-4 h-4" />
                                {activeMenu === client.id && (
                                    <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-900 dark:bg-gray-800 rounded-lg shadow-lg border border-gray-100 dark:border-gray-800 dark:border-gray-700 z-50 py-1">
                                        <button
                                            onClick={() => navigate('/app/devis/new', { state: { client_id: client.id } })}
                                            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 dark:hover:bg-gray-700"
                                        >
                                            <Plus className="w-4 h-4 mr-2" />
                                            Créer un devis
                                        </button>
                                        <button
                                            onClick={() => {
                                                setDeleteConfirmId(client.id);
                                                setActiveMenu(null);
                                            }}
                                            className="flex items-center w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                                        >
                                            <Trash2 className="w-4 h-4 mr-2" />
                                            Supprimer
                                        </button>
                                    </div>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="ios-title">Mes Clients</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{clients.length} clients enregistrés</p>
                </div>
                <div className="flex items-center gap-2">
                    {filteredClients.length > 0 && (
                        <button
                            onClick={() => exportToCSV(
                                filteredClients,
                                [
                                    { key: 'name', label: 'Nom' },
                                    { key: 'email', label: 'Email' },
                                    { key: 'phone', label: 'Téléphone' },
                                    { key: 'address', label: 'Adresse' },
                                    { key: 'city', label: 'Ville' },
                                    { key: 'postal_code', label: 'Code postal' },
                                    { key: 'siren', label: 'SIREN' },
                                    { key: 'created_at', label: 'Créé le' },
                                ],
                                'clients'
                            )}
                            className="flex items-center justify-center px-3 py-2 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm"
                            title="Exporter en CSV (Excel, comptable…)"
                        >
                            <Download className="w-4 h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Exporter CSV</span>
                        </button>
                    )}
                    <Button onClick={() => navigate('/app/clients/new')}>
                        <Plus className="w-5 h-5" />
                        Nouveau Client
                    </Button>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Rechercher par nom, email, téléphone, adresse..."
                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg leading-5 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 sm:text-sm transition-shadow"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => handleSort('name')}
                        className={`flex items-center px-3 py-2 border rounded-lg transition-colors ${sortConfig.key === 'name' ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 text-blue-700 dark:text-blue-300' : 'bg-white dark:bg-gray-900 border-gray-300 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                        title="Trier par nom"
                    >
                        <span className="text-sm mr-2 hidden sm:inline">Nom</span>
                        <ArrowUpDown className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => handleSort('created_at')}
                        className={`flex items-center px-3 py-2 border rounded-lg transition-colors ${sortConfig.key === 'created_at' ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 text-blue-700 dark:text-blue-300' : 'bg-white dark:bg-gray-900 border-gray-300 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                        title="Trier par date"
                    >
                        <span className="text-sm mr-2 hidden sm:inline">Date</span>
                        <ArrowUpDown className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {visibleClients.map((client) => (
                        <ClientListItem key={client.id} client={client} />
                    ))}
                </div>
            </div>

            {hasMore && (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {visibleClients.length} affichés sur {filteredClients.length}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={loadMore}
                            className="px-4 py-2 text-sm font-medium bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors dark:border-gray-700"
                        >
                            Voir {Math.min(100, hiddenCount)} de plus
                        </button>
                        <button
                            onClick={showAll}
                            className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700"
                        >
                            Tout afficher
                        </button>
                    </div>
                </div>
            )}

            {activeMenu && (
                <div
                    className="fixed inset-0 z-0"
                    onClick={() => setActiveMenu(null)}
                />
            )}

            {filteredClients.length === 0 && (
                clients.length === 0 ? (
                    /* État vide réel — aucun client en base */
                    <div className="text-center py-16">
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-full h-20 w-20 flex items-center justify-center mx-auto mb-5">
                            <Users className="h-10 w-10 text-blue-400" />
                        </div>
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                            Vous n'avez pas encore de clients
                        </h3>
                        <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-xs mx-auto">
                            Ajoutez votre premier client pour lui créer un devis professionnel en 2 minutes.
                        </p>
                        <button
                            onClick={() => navigate('/app/clients/new')}
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-ios text-white font-semibold rounded-lg hover:bg-ios-dark transition-colors shadow-sm"
                        >
                            <Plus className="w-4 h-4" />
                            Ajouter mon premier client
                        </button>
                    </div>
                ) : (
                    /* Aucun résultat pour la recherche */
                    <div className="text-center py-12">
                        <div className="bg-gray-50 dark:bg-gray-800 dark:bg-gray-800/50 rounded-full h-16 w-16 flex items-center justify-center mx-auto mb-4">
                            <Search className="h-8 w-8 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Aucun résultat</h3>
                        <p className="text-gray-500 dark:text-gray-400 mt-1">
                            Aucun client ne correspond à "<span className="font-medium">{searchTerm}</span>".
                        </p>
                    </div>
                )
            )}
        </div >
    );
};

export default Clients;
