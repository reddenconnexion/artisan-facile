import React, { useState, useEffect } from 'react';
import { Search, Plus, Phone, Mail, MapPin, MoreVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

const Clients = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (user) {
            fetchClients();
        }
    }, [user]);

    const fetchClients = async () => {
        try {
            const { data, error } = await supabase
                .from('clients')
                .select('*')
                .order('name');

            if (error) throw error;
            setClients(data || []);
        } catch (error) {
            toast.error('Erreur lors du chargement des clients');
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
                <h2 className="text-2xl font-bold text-gray-900">Mes Clients</h2>
                <button
                    onClick={() => navigate('/clients/new')}
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
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Liste des clients */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredClients.map((client) => (
                    <div key={client.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start">
                            <div className="flex items-center space-x-3">
                                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                                    {client.name.charAt(0)}
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900">{client.name}</h3>
                                    <p className="text-sm text-gray-500">Ajouté le {new Date(client.created_at).toLocaleDateString()}</p>
                                </div>
                            </div>
                            <button className="text-gray-400 hover:text-gray-600">
                                <MoreVertical className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="mt-6 space-y-3">
                            {client.email && (
                                <div className="flex items-center text-gray-600">
                                    <Mail className="w-4 h-4 mr-3 text-gray-400" />
                                    <span className="text-sm">{client.email}</span>
                                </div>
                            )}
                            {client.phone && (
                                <div className="flex items-center text-gray-600">
                                    <Phone className="w-4 h-4 mr-3 text-gray-400" />
                                    <span className="text-sm">{client.phone}</span>
                                </div>
                            )}
                            {client.address && (
                                <div className="flex items-center text-gray-600">
                                    <MapPin className="w-4 h-4 mr-3 text-gray-400" />
                                    <span className="text-sm">{client.address}</span>
                                </div>
                            )}
                        </div>

                        <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end space-x-3">
                            <button
                                onClick={() => navigate(`/clients/${client.id}`)}
                                className="text-sm font-medium text-blue-600 hover:text-blue-800"
                            >
                                Voir fiche
                            </button>
                            <button
                                onClick={() => navigate('/devis/new', { state: { client_id: client.id } })}
                                className="text-sm font-medium text-blue-600 hover:text-blue-800"
                            >
                                Créer devis
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {filteredClients.length === 0 && (
                <div className="text-center py-12">
                    <p className="text-gray-500">Aucun client trouvé.</p>
                </div>
            )}
        </div>
    );
};

export default Clients;
