import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Mic } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { useVoice } from '../hooks/useVoice';

const ClientForm = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const location = useLocation();
    const { user } = useAuth();
    const isEditing = !!id && id !== 'new';
    const [loading, setLoading] = useState(false);
    const { isListening, transcript, startListening, stopListening, resetTranscript } = useVoice();
    const [activeField, setActiveField] = useState(null);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        address: '',
        notes: '',
        status: 'lead'
    });

    // Handle Voice Data from Navigation
    useEffect(() => {
        if (location.state?.voiceData) {
            const { name } = location.state.voiceData;
            if (name) {
                setFormData(prev => ({ ...prev, name }));
            }
            // Clear state
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    // Handle Dictation
    useEffect(() => {
        if (transcript && activeField) {
            setFormData(prev => ({ ...prev, [activeField]: transcript }));
        }
    }, [transcript, activeField]);

    const toggleDictation = (field) => {
        if (isListening && activeField === field) {
            stopListening();
            setActiveField(null);
        } else {
            setActiveField(field);
            resetTranscript();
            startListening();
        }
    };

    useEffect(() => {
        if (isEditing && user) {
            fetchClient();
        }
    }, [id, user]);

    const fetchClient = async () => {
        try {
            const { data, error } = await supabase
                .from('clients')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            if (data) {
                setFormData({
                    name: data.name,
                    email: data.email || '',
                    phone: data.phone || '',
                    address: data.address || '',
                    address: data.address || '',
                    notes: data.notes || '',
                    status: data.status || 'lead'
                });
            }
        } catch (error) {
            toast.error('Erreur lors du chargement du client');
            console.error('Error fetching client:', error);
            navigate('/clients');
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const clientData = {
                ...formData,
                user_id: user.id
            };

            let error;
            if (isEditing) {
                const { error: updateError } = await supabase
                    .from('clients')
                    .update(clientData)
                    .eq('id', id);
                error = updateError;
            } else {
                const { error: insertError } = await supabase
                    .from('clients')
                    .insert([clientData]);
                error = insertError;
            }

            if (error) throw error;

            toast.success(isEditing ? 'Client modifié avec succès' : 'Client créé avec succès');
            navigate('/clients');
        } catch (error) {
            toast.error('Erreur lors de la sauvegarde');
            console.error('Error saving client:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <div className="flex items-center mb-6">
                <button
                    onClick={() => navigate('/clients')}
                    className="mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                >
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <h2 className="text-2xl font-bold text-gray-900">
                    {isEditing ? 'Modifier le client' : 'Nouveau client'}
                </h2>
            </div>

            <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
                <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                        Nom complet / Entreprise *
                    </label>
                    <input
                        type="text"
                        id="name"
                        name="name"
                        required
                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                        value={formData.name}
                        onChange={handleChange}
                    />
                </div>

                <div>
                    <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                        Statut
                    </label>
                    <select
                        id="status"
                        name="status"
                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                        value={formData.status}
                        onChange={handleChange}
                    >
                        <option value="lead">Prospect</option>
                        <option value="contacted">Contacté</option>
                        <option value="proposal">Devis en cours</option>
                        <option value="signed">Signé</option>
                        <option value="lost">Perdu</option>
                    </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                            Email
                        </label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            value={formData.email}
                            onChange={handleChange}
                        />
                    </div>
                    <div>
                        <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                            Téléphone
                        </label>
                        <input
                            type="tel"
                            id="phone"
                            name="phone"
                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            value={formData.phone}
                            onChange={handleChange}
                        />
                    </div>
                </div>

                <div>
                    <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
                        Adresse
                    </label>
                    <textarea
                        id="address"
                        name="address"
                        rows={3}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                        value={formData.address}
                        onChange={handleChange}
                    />
                </div>

                <div>
                    <div className="flex justify-between items-center mb-1">
                        <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                            Notes internes
                        </label>
                        <button
                            type="button"
                            onClick={() => toggleDictation('notes')}
                            className={`p-1 rounded-full hover:bg-gray-100 ${isListening && activeField === 'notes' ? 'text-red-500 animate-pulse' : 'text-gray-400'}`}
                            title="Dicter"
                        >
                            <Mic className="w-4 h-4" />
                        </button>
                    </div>
                    <textarea
                        id="notes"
                        name="notes"
                        rows={2}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                        value={formData.notes}
                        onChange={handleChange}
                    />
                </div>

                <div className="flex justify-end pt-4 border-t border-gray-100">
                    <button
                        type="button"
                        onClick={() => navigate('/clients')}
                        className="px-4 py-2 mr-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                        Annuler
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        {loading ? 'Enregistrement...' : 'Enregistrer'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default ClientForm;
