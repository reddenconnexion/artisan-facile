import React, { useState, useEffect } from 'react';
import { Search, Plus, Phone, Mail, MapPin, MoreVertical, Edit, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

const Clients = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [clients, setClients] = useState(() => {
        const cached = localStorage.getItem('clients_list');
        return cached ? JSON.parse(cached) : [];
    });
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeMenu, setActiveMenu] = useState(null);

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
            // The realtime subscription will update the list automatically
        } catch (error) {
            console.error('Error deleting client:', error);
            toast.error('Erreur lors de la suppression du client');
        } finally {
            setActiveMenu(null);
        }
    };

    useEffect(() => {
        if (user) {
            fetchClients();

            // Realtime subscription
            const subscription = supabase
                .channel('clients_list_subscription')
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'clients' },
                    (payload) => {
                        fetchClients();
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(subscription);
            };
        }
    }, [user]);

    const fetchClients = async () => {
        try {
            const { data, error } = await supabase
                .from('clients')
                .select('*')
                .order('name');

            if (error) throw error;
            const newClients = data || [];
            setClients(newClients);
            localStorage.setItem('clients_list', JSON.stringify(newClients));
        } catch (error) {
            // toast.error('Erreur lors du chargement des clients'); // Avoid spamming toast if offline
            console.error('Error fetching clients:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredClients = clients.filter(client =>
        client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (client.email && client.email.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    if (loading) {
        return <div className="flex justify-center items-center h-64">Chargement...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Mes Clients</h2>
                <button
                    onClick={() => navigate('/app/clients/new')}
                    className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                    <Plus className="w-5 h-5 mr-2" />
                    Nouveau Client
                </button>
            </div>

            {/* Barre de recherche */}
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                    type="text"
                    placeholder="Rechercher un client..."
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg leading-5 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Liste des clients */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredClients.map((client) => (
                    <div key={client.id} className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 hover:shadow-md transition-shadow relative">
                        <div className="flex justify-between items-start">
                            <div className="flex items-center space-x-3">
                                <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">
                                    {client.name.charAt(0)}
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{client.name}</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Ajouté le {new Date(client.created_at).toLocaleDateString()}</p>
                                </div>
                            </div>
                            <div className="relative">
                                <button
                                    onClick={() => setActiveMenu(activeMenu === client.id ? null : client.id)}
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
                                    <Mail className="w-4 h-4 mr-3 text-gray-400 dark:text-gray-500" />
                                    <span className="text-sm">{client.email}</span>
                                </div>
                            )}
                            {client.phone && (
                                <div className="flex items-center text-gray-600 dark:text-gray-300">
                                    <Phone className="w-4 h-4 mr-3 text-gray-400 dark:text-gray-500" />
                                    <span className="text-sm">{client.phone}</span>
                                </div>
                            )}
                            {client.address && (
                                <div className="flex items-center text-gray-600 dark:text-gray-300">
                                    <MapPin className="w-4 h-4 mr-3 text-gray-400 dark:text-gray-500" />
                                    <span className="text-sm">{client.address}</span>
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
                ))}
            </div>

            {/* Click outside to close menu */}
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
                        <p className="text-gray-500">Aucun client trouvé.</p>
                    </div>
                )
            }
        </div >
    );
};

export default Clients;
