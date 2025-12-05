import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Save, Mic, Globe, MapPin, Navigation, History, Users, FileText } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { useVoice } from '../hooks/useVoice';
import ProjectPhotos from '../components/ProjectPhotos';
import ClientHistory from '../components/ClientHistory';
import ClientContacts from '../components/ClientContacts';

const ClientForm = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const location = useLocation();
    const { user } = useAuth();
    const isEditing = !!id && id !== 'new';
    const [loading, setLoading] = useState(false);
    const { isListening, transcript, startListening, stopListening, resetTranscript } = useVoice();
    const [activeField, setActiveField] = useState(null);
    const [activeTab, setActiveTab] = useState('info'); // 'info', 'contacts', 'history'

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        address: '',
        notes: '',
        status: 'lead',
        portal_token: null,
        contacts: []
    });

    // Handle Voice Data from Navigation
    useEffect(() => {
        if (location.state?.voiceData) {
            const { name, email, phone, address } = location.state.voiceData;
            setFormData(prev => ({
                ...prev,
                name: name || prev.name,
                email: email || prev.email,
                phone: phone || prev.phone,
                address: address || prev.address
            }));
            // Clear state
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    // Handle Dictation
    useEffect(() => {
        if (transcript && activeField) {
            let value = transcript;

            if (activeField === 'email') {
                value = value.toLowerCase()
                    .replace(/\s+arobase\s+|\s*@\s*/g, '@')
                    .replace(/\s+point\s+|\s*\.\s*/g, '.')
                    .replace(/\s+/g, '');
            } else if (activeField === 'phone') {
                // Keep digits, spaces, +, and .
                // Maybe clean up if needed, but raw transcript is usually okay for phone if spoken clearly
            } else if (activeField === 'name' || activeField === 'address') {
                // Capitalize first letter
                if (value.length > 0) {
                    value = value.charAt(0).toUpperCase() + value.slice(1);
                }
            }

            setFormData(prev => ({ ...prev, [activeField]: value }));
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
                    notes: data.notes || '',
                    status: data.status || 'lead',
                    portal_token: data.portal_token,
                    contacts: data.contacts || []
                });
            }
        } catch (error) {
            toast.error('Erreur lors du chargement du client');
            console.error('Error fetching client:', error);
            navigate('/app/clients');
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
            navigate('/app/clients');
        } catch (error) {
            toast.error('Erreur lors de la sauvegarde');
            console.error('Error saving client:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                    <button
                        onClick={() => navigate('/app/clients')}
                        className="mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <h2 className="text-2xl font-bold text-gray-900">
                        {isEditing ? 'Modifier le client' : 'Nouveau client'}
                    </h2>
                </div>
                {isEditing && formData.portal_token && (
                    <button
                        type="button"
                        onClick={() => {
                            const url = `${window.location.origin}/p/${formData.portal_token}`;
                            navigator.clipboard.writeText(url);
                            toast.success('Lien du portail copié !');
                        }}
                        className="flex items-center px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100"
                    >
                        <Globe className="w-4 h-4 mr-2" />
                        Partager l'espace client
                    </button>
                )}
            </div>

            <div className="flex space-x-4 mb-6 border-b border-gray-200">
                <button
                    onClick={() => setActiveTab('info')}
                    className={`pb-2 px-1 text-sm font-medium transition-colors relative ${activeTab === 'info' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Informations
                    </div>
                    {activeTab === 'info' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full" />}
                </button>
                <button
                    onClick={() => setActiveTab('contacts')}
                    className={`pb-2 px-1 text-sm font-medium transition-colors relative ${activeTab === 'contacts' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Contacts
                    </div>
                    {activeTab === 'contacts' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full" />}
                </button>
                {isEditing && (
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`pb-2 px-1 text-sm font-medium transition-colors relative ${activeTab === 'history' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <div className="flex items-center gap-2">
                            <History className="w-4 h-4" />
                            Historique
                        </div>
                        {activeTab === 'history' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full" />}
                    </button>
                )}
            </div>

            {activeTab === 'info' && (
                <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                                Nom complet / Entreprise *
                            </label>
                            <button
                                type="button"
                                onClick={() => toggleDictation('name')}
                                className={`p-1 rounded-full hover:bg-gray-100 ${isListening && activeField === 'name' ? 'text-red-500 animate-pulse' : 'text-gray-400'}`}
                                title="Dicter"
                            >
                                <Mic className="w-4 h-4" />
                            </button>
                        </div>
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
                            <div className="flex justify-between items-center mb-1">
                                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                                    Email
                                </label>
                                <button
                                    type="button"
                                    onClick={() => toggleDictation('email')}
                                    className={`p-1 rounded-full hover:bg-gray-100 ${isListening && activeField === 'email' ? 'text-red-500 animate-pulse' : 'text-gray-400'}`}
                                    title="Dicter"
                                >
                                    <Mic className="w-4 h-4" />
                                </button>
                            </div>
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
                            <div className="flex justify-between items-center mb-1">
                                <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                                    Téléphone
                                </label>
                                <button
                                    type="button"
                                    onClick={() => toggleDictation('phone')}
                                    className={`p-1 rounded-full hover:bg-gray-100 ${isListening && activeField === 'phone' ? 'text-red-500 animate-pulse' : 'text-gray-400'}`}
                                    title="Dicter"
                                >
                                    <Mic className="w-4 h-4" />
                                </button>
                            </div>
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
                        <div className="flex justify-between items-center mb-1">
                            <label htmlFor="address" className="block text-sm font-medium text-gray-700">
                                Adresse
                            </label>
                            <div className="flex items-center gap-2">
                                {formData.address && (
                                    <>
                                        <a
                                            href={`https://www.waze.com/ul?q=${encodeURIComponent(formData.address)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-1 text-blue-500 hover:bg-blue-50 rounded-full"
                                            title="Ouvrir avec Waze"
                                        >
                                            <Navigation className="w-4 h-4" />
                                        </a>
                                        <a
                                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formData.address)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-1 text-green-600 hover:bg-green-50 rounded-full"
                                            title="Ouvrir avec Google Maps"
                                        >
                                            <MapPin className="w-4 h-4" />
                                        </a>
                                    </>
                                )}
                                <button
                                    type="button"
                                    onClick={() => toggleDictation('address')}
                                    className={`p-1 rounded-full hover:bg-gray-100 ${isListening && activeField === 'address' ? 'text-red-500 animate-pulse' : 'text-gray-400'}`}
                                    title="Dicter"
                                >
                                    <Mic className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
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
                            onClick={() => navigate('/app/clients')}
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
            )}

            {activeTab === 'contacts' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <ClientContacts
                        contacts={formData.contacts}
                        onChange={(newContacts) => setFormData(prev => ({ ...prev, contacts: newContacts }))}
                    />
                    <div className="flex justify-end pt-4 mt-6 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={loading}
                            className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            <Save className="w-4 h-4 mr-2" />
                            {loading ? 'Enregistrement...' : 'Enregistrer les contacts'}
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'history' && isEditing && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <ClientHistory clientId={id} />
                </div>
            )}

            {isEditing && <ProjectPhotos clientId={id} />}
        </div>
    );
};

export default ClientForm;
