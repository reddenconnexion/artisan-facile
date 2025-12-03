import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Plus, MoreHorizontal, Phone, Mail, Calendar, ArrowRight, Maximize2, Minimize2 } from 'lucide-react';

const CRM = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [focusedColumn, setFocusedColumn] = useState(null);

    const columns = [
        { id: 'lead', title: 'Prospects', color: 'bg-gray-100 border-gray-200' },
        { id: 'contacted', title: 'Contactés', color: 'bg-blue-50 border-blue-100' },
        { id: 'proposal', title: 'Devis en cours', color: 'bg-yellow-50 border-yellow-100' },
        { id: 'signed', title: 'Signés', color: 'bg-green-50 border-green-100' },
        { id: 'lost', title: 'Perdus', color: 'bg-red-50 border-red-100' }
    ];

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
                .order('created_at', { ascending: false });

            if (error) throw error;
            setClients(data || []);
        } catch (error) {
            toast.error('Erreur lors du chargement des données CRM');
            console.error('Error fetching CRM data:', error);
        } finally {
            setLoading(false);
        }
    };

    const updateStatus = async (clientId, newStatus) => {
        try {
            const { error } = await supabase
                .from('clients')
                .update({ status: newStatus })
                .eq('id', clientId);

            if (error) throw error;

            setClients(clients.map(c =>
                c.id.toString() === clientId.toString() ? { ...c, status: newStatus } : c
            ));
            toast.success('Statut mis à jour');
        } catch (error) {
            console.error('Error updating status:', error);
            toast.error('Erreur lors de la mise à jour : ' + error.message);
        }
    };

    const getClientsByStatus = (status) => {
        return clients.filter(client => (client.status || 'lead') === status);
    };

    const handleDragStart = (e, clientId) => {
        e.dataTransfer.setData('clientId', clientId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e, status) => {
        e.preventDefault();
        const clientId = e.dataTransfer.getData('clientId');
        if (clientId) {
            updateStatus(clientId, status);
        }
    };

    if (loading) return <div className="flex justify-center items-center h-64">Chargement...</div>;

    return (
        <div className="h-[calc(100vh-100px)] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4 px-4 shrink-0">
                <h2 className="text-2xl font-bold text-gray-900">
                    Suivi Commercial (CRM)
                    {focusedColumn && <span className="text-gray-400 text-lg font-normal ml-2">/ {columns.find(c => c.id === focusedColumn)?.title}</span>}
                </h2>
                <div className="flex gap-2">
                    {focusedColumn && (
                        <button
                            onClick={() => setFocusedColumn(null)}
                            className="flex items-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                        >
                            <Minimize2 className="w-4 h-4 mr-2" />
                            Vue d'ensemble
                        </button>
                    )}
                    <button
                        onClick={() => navigate('/clients/new')}
                        className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        <Plus className="w-5 h-5 mr-2" />
                        Nouveau Prospect
                    </button>
                </div>
            </div>

            <div className={`flex gap-4 px-4 pb-4 h-full overflow-hidden ${focusedColumn ? '' : 'overflow-x-auto'}`}>
                {columns.map(column => {
                    if (focusedColumn && focusedColumn !== column.id) return null;

                    return (
                        <div
                            key={column.id}
                            className={`
                                flex flex-col rounded-xl border ${column.color} h-full max-h-full transition-all duration-300
                                ${focusedColumn ? 'w-full max-w-4xl mx-auto' : 'flex-1 min-w-[280px]'}
                            `}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, column.id)}
                        >
                            <div className="p-4 font-semibold text-gray-700 flex justify-between items-center bg-white/50 rounded-t-xl border-b border-gray-200/50 backdrop-blur-sm shrink-0">
                                <div className="flex items-center gap-2">
                                    <span>{column.title}</span>
                                    <span className="bg-white px-2 py-0.5 rounded-full text-xs text-gray-500 shadow-sm">
                                        {getClientsByStatus(column.id).length}
                                    </span>
                                </div>
                                {!focusedColumn && (
                                    <button
                                        onClick={() => setFocusedColumn(column.id)}
                                        className="p-1 hover:bg-white/50 rounded text-gray-400 hover:text-gray-600 transition-colors"
                                        title="Agrandir cette colonne"
                                    >
                                        <Maximize2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            <div className="p-3 flex-1 overflow-y-auto space-y-3">
                                {getClientsByStatus(column.id).map(client => (
                                    <div
                                        key={client.id}
                                        className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition-shadow group cursor-move active:cursor-grabbing"
                                        draggable="true"
                                        onDragStart={(e) => handleDragStart(e, client.id)}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-medium text-gray-900 truncate pr-2 pointer-events-none">{client.name}</h4>
                                            <button
                                                onClick={() => navigate(`/clients/${client.id}`)}
                                                className="text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <MoreHorizontal className="w-4 h-4" />
                                            </button>
                                        </div>

                                        <div className="space-y-1 mb-3 pointer-events-none">
                                            {client.phone && (
                                                <div className="flex items-center text-xs text-gray-500">
                                                    <Phone className="w-3 h-3 mr-1.5" />
                                                    {client.phone}
                                                </div>
                                            )}
                                            {client.email && (
                                                <div className="flex items-center text-xs text-gray-500 truncate">
                                                    <Mail className="w-3 h-3 mr-1.5" />
                                                    {client.email}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex justify-between items-center pt-2 border-t border-gray-50">
                                            <span className="text-xs text-gray-400">
                                                {new Date(client.created_at).toLocaleDateString()}
                                            </span>

                                            {/* Simple Move Actions for MVP - could be Drag & Drop later */}
                                            <div className="flex gap-1">
                                                {column.id !== 'lead' && (
                                                    <button
                                                        onClick={() => updateStatus(client.id, columns[columns.findIndex(c => c.id === column.id) - 1].id)}
                                                        className="p-2 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                                                        title="Reculer"
                                                    >
                                                        <ArrowRight className="w-3 h-3 rotate-180" />
                                                    </button>
                                                )}
                                                {column.id !== 'lost' && (
                                                    <button
                                                        onClick={() => updateStatus(client.id, columns[columns.findIndex(c => c.id === column.id) + 1].id)}
                                                        className="p-2 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                                                        title="Avancer"
                                                    >
                                                        <ArrowRight className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default CRM;
