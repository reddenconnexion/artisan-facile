import React, { useState } from 'react';
import { Search, Plus, Phone, Mail, MapPin, MoreVertical, Edit, Trash2, LayoutGrid, List, ArrowUpDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import { useClients, useInvalidateCache } from '../hooks/useDataCache';
import { useDebounce } from '../hooks/useDebounce';

const Clients = () => {
    const navigate = useNavigate();

    // Utilisation du cache React Query
    const { data: clients = [], isLoading: loading } = useClients();
    const { invalidateClients } = useInvalidateCache();

    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearch = useDebounce(searchTerm, 300); // Retarde la recherche de 300ms
    const [activeMenu, setActiveMenu] = useState(null);
    const [viewMode, setViewMode] = useState(() => localStorage.getItem('clients_view_mode') || 'grid');
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

    const toggleViewMode = (mode) => {
        setViewMode(mode);
        localStorage.setItem('clients_view_mode', mode);
    };

    const handleSort = (key) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleDeleteClient = async (clientId) => {
        if (!window.confirm('Voulez-vous vraiment supprimer ce client ? Cette action est irréversible.')) {
            setActiveMenu(null);
            return;
        }

        try {
            const { error } = await supabase
                .from('clients')
                .delete()
                .eq('id', clientId);

            if (error) throw error;
            toast.success('Client supprimé avec succès');
            invalidateClients(); // Rafraîchit le cache
        } catch (error) {
            console.error('Error deleting client:', error);
            toast.error('Erreur lors de la suppression du client');
        } finally {
            setActiveMenu(null);
        }
    };

    const filteredClients = clients.filter(client => {
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

    if (loading) {
        return <div className="flex justify-center items-center h-64">Chargement...</div>;
    }

    const ClientCard = ({ client }) => (
        <div key={client.id} className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 hover:shadow-md transition-shadow relative">
            <div className="flex justify-between items-start">
                <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold shrink-0">
                        {client.name.charAt(0)}
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white line-clamp-1">{client.name}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Ajouté le {new Date(client.created_at).toLocaleDateString()}</p>
                    </div>
                </div>
                <div className="relative">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenu(activeMenu === client.id ? null : client.id);
                        }}
                        className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-50 transition-colors"
                    >
                        <MoreVertical className="w-5 h-5" />
                    </button>
                    {activeMenu === client.id && (
                        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-100 dark:border-gray-700 z-10 py-1">
                            <button
                                onClick={() => {
                                    navigate(`/app/clients/${client.id}`);
                                    setActiveMenu(null);
                                }}
                                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                <Edit className="w-4 h-4 mr-2" />
                                Modifier / Voir
                            </button>
                            <button
                                onClick={() => handleDeleteClient(client.id)}
                                className="flex items-center w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Supprimer
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-6 space-y-3">
                {client.email && (
                    <div className="flex items-center text-gray-600 dark:text-gray-300">
                        <Mail className="w-4 h-4 mr-3 text-gray-400 dark:text-gray-500 shrink-0" />
                        <span className="text-sm truncate">{client.email}</span>
                    </div>
                )}
                {client.phone && (
                    <div className="flex items-center text-gray-600 dark:text-gray-300">
                        <Phone className="w-4 h-4 mr-3 text-gray-400 dark:text-gray-500 shrink-0" />
                        <span className="text-sm">{client.phone}</span>
                    </div>
                )}
                {client.address && (
                    <div className="flex items-center text-gray-600 dark:text-gray-300">
                        <MapPin className="w-4 h-4 mr-3 text-gray-400 dark:text-gray-500 shrink-0" />
                        <span className="text-sm line-clamp-1">{client.address}</span>
                    </div>
                )}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 flex justify-end space-x-3">
                <button
                    onClick={() => navigate(`/app/clients/${client.id}`)}
                    className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                >
                    Voir fiche
                </button>
                <button
                    onClick={() => navigate('/app/devis/new', { state: { client_id: client.id } })}
                    className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                >
                    Créer devis
                </button>
            </div>
        </div>
    );

    const ClientListItem = ({ client }) => (
        <div key={client.id} className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
            <div className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold shrink-0">
                    {client.name.charAt(0)}
                </div>

                <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                    <div className="md:col-span-4">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{client.name}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 hidden md:block">Ajouté le {new Date(client.created_at).toLocaleDateString()}</p>
                    </div>

                    <div className="md:col-span-4 hidden md:block">
                        {client.email && (
                            <div className="flex items-center text-gray-600 dark:text-gray-300 mb-1">
                                <Mail className="w-3 h-3 mr-2 text-gray-400" />
                                <span className="text-xs truncate">{client.email}</span>
                            </div>
                        )}
                        {client.phone && (
                            <div className="flex items-center text-gray-600 dark:text-gray-300">
                                <Phone className="w-3 h-3 mr-2 text-gray-400" />
                                <span className="text-xs">{client.phone}</span>
                            </div>
                        )}
                    </div>

                    <div className="md:col-span-4 hidden md:block">
                        {client.address && (
                            <div className="flex items-center text-gray-600 dark:text-gray-300">
                                <MapPin className="w-3 h-3 mr-2 text-gray-400" />
                                <span className="text-xs truncate">{client.address}</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => navigate(`/app/clients/${client.id}`)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Voir fiche"
                    >
                        <Edit className="w-4 h-4" />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenu(activeMenu === client.id ? null : client.id);
                        }}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors relative"
                    >
                        <MoreVertical className="w-4 h-4" />
                        {activeMenu === client.id && (
                            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-100 dark:border-gray-700 z-50 py-1">
                                <button
                                    onClick={() => navigate('/app/devis/new', { state: { client_id: client.id } })}
                                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Créer un devis
                                </button>
                                <button
                                    onClick={() => handleDeleteClient(client.id)}
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
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Mes Clients</h2>
                    <p className="text-sm text-gray-500 mt-1">{clients.length} clients enregistrés</p>
                </div>
                <button
                    onClick={() => navigate('/app/clients/new')}
                    className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                >
                    <Plus className="w-5 h-5 mr-2" />
                    Nouveau Client
                </button>
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
                        className={`flex items-center px-3 py-2 border rounded-lg transition-colors ${sortConfig.key === 'name' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                        title="Trier par nom"
                    >
                        <span className="text-sm mr-2 hidden sm:inline">Nom</span>
                        <ArrowUpDown className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => handleSort('created_at')}
                        className={`flex items-center px-3 py-2 border rounded-lg transition-colors ${sortConfig.key === 'created_at' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                        title="Trier par date"
                    >
                        <span className="text-sm mr-2 hidden sm:inline">Date</span>
                        <ArrowUpDown className="w-4 h-4" />
                    </button>
                    <div className="h-full w-px bg-gray-300 mx-1"></div>
                    <button
                        onClick={() => toggleViewMode('grid')}
                        className={`p-2 rounded-lg border transition-colors ${viewMode === 'grid' ? 'bg-gray-100 border-gray-300 text-gray-900' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'}`}
                        title="Vue grille"
                    >
                        <LayoutGrid className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => toggleViewMode('list')}
                        className={`p-2 rounded-lg border transition-colors ${viewMode === 'list' ? 'bg-gray-100 border-gray-300 text-gray-900' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'}`}
                        title="Vue liste"
                    >
                        <List className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredClients.map((client) => (
                        <ClientCard key={client.id} client={client} />
                    ))}
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {filteredClients.map((client) => (
                            <ClientListItem key={client.id} client={client} />
                        ))}
                    </div>
                </div>
            )}

            {
                activeMenu && (
                    <div
                        className="fixed inset-0 z-0"
                        onClick={() => setActiveMenu(null)}
                    ></div>
                )
            }

            {
                filteredClients.length === 0 && (
                    <div className="text-center py-12">
                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-full h-16 w-16 flex items-center justify-center mx-auto mb-4">
                            <Search className="h-8 w-8 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Aucun client trouvé</h3>
                        <p className="text-gray-500 mt-1">Essayez de modifier vos termes de recherche.</p>
                    </div>
                )
            }
        </div >
    );
};

export default Clients;
