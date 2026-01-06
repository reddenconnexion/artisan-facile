import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Save, Globe, MapPin, Navigation, History, Users, FileText, Palette, Mail, Phone, MessageSquare, Calendar, Trash2, Mic, Sparkles } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
// import { useVoice } from '../hooks/useVoice'; // Removed direct hook usage
import SmartVoiceModal from '../components/SmartVoiceModal';
import ProjectPhotos from '../components/ProjectPhotos';
import ClientHistory from '../components/ClientHistory';
import ClientContacts from '../components/ClientContacts';
import ClientReferences from '../components/ClientReferences';

const ClientForm = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const location = useLocation();
    const { user } = useAuth();
    const isEditing = !!id && id !== 'new';
    const [loading, setLoading] = useState(false);

    // const { isListening, transcript, startListening, stopListening, resetTranscript } = useVoice(); // Removed
    const [activeTab, setActiveTab] = useState('info'); // 'info', 'contacts', 'history'
    const [showVoiceModal, setShowVoiceModal] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        address: '',
        notes: '',
        status: 'lead',
        type: 'professional',
        siren: '',
        tva_intracom: '',
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

    // Handle Voice Result from Smart Modal
    const handleVoiceResult = (data) => {
        setFormData(prev => ({
            ...prev,
            name: data.name || prev.name,
            // Only update if found to avoid erasing existing data accidentally?
            // Actually, if user dictates, they likely want to fill.
            // But let's be safe: override if non-empty.
            email: data.email || prev.email,
            phone: data.phone || prev.phone,
            address: data.address || prev.address,
            notes: data.notes ? (prev.notes ? prev.notes + '\n' + data.notes : data.notes) : prev.notes
        }));
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
                    type: data.type || 'professional',
                    siren: data.siren || '',
                    tva_intracom: data.tva_intracom || '',
                    contacts: data.contacts || []
                });
            }
        } catch (error) {
            toast.error('Erreur lors du chargement du client');
            console.error('Error fetching client:', error);
            navigate('/app/clients');
        }
    };

    const handleContactAction = async (type, value) => {
        if (!value) {
            toast.error(`Aucun ${type === 'email' ? 'email' : 'numéro'} défini`);
            return;
        }

        if (isEditing) {
            try {
                const { error } = await supabase.from('client_interactions').insert([{
                    user_id: user.id,
                    client_id: id,
                    type: type,
                    date: new Date(),
                    details: 'Action depuis fiche client'
                }]);

                if (!error && (type === 'call' || type === 'sms')) {
                    toast.success('Interaction enregistrée');
                }
            } catch (err) {
                console.error('Log interaction error', err);
            }
        }

        if (type === 'email') {
            window.location.href = `mailto:${value}`;
        } else if (type === 'call') {
            window.location.href = `tel:${value}`;
        } else if (type === 'sms') {
            window.location.href = `sms:${value}`;
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('Voulez-vous vraiment supprimer ce client ? Cette action est irréversible.')) {
            return;
        }

        try {
            const { error } = await supabase
                .from('clients')
                .delete()
                .eq('id', id);

            if (error) throw error;
            toast.success('Client supprimé avec succès');
            navigate('/app/clients');
        } catch (error) {
            console.error('Error deleting client:', error);
            toast.error('Erreur lors de la suppression du client');
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
                // For updates, we don't need to resend user_id, and we should add updated_at
                const { user_id, ...updateData } = clientData;
                const { data, error: updateError } = await supabase
                    .from('clients')
                    .update({ ...updateData, updated_at: new Date() })
                    .eq('id', id)
                    .select();

                if (!updateError && (!data || data.length === 0)) {
                    throw new Error("L'enregistrement a échoué (client introuvable ou permissions insuffisantes).");
                }
                error = updateError;
            } else {
                const { error: insertError } = await supabase
                    .from('clients')
                    .insert([clientData])
                    .select();
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
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                <div className="flex items-center">
                    <button
                        onClick={() => navigate('/app/clients')}
                        className="mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                        {isEditing ? 'Modifier le client' : 'Nouveau client'}
                    </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => setShowVoiceModal(true)}
                        className="flex items-center px-3 py-2 text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg hover:from-indigo-600 hover:to-purple-700 shadow-sm"
                    >
                        <Sparkles className="w-4 h-4 mr-2" />
                        <span className="hidden sm:inline">IA Assistant</span>
                    </button>
                    {isEditing && (
                        <button
                            type="button"
                            onClick={() => navigate('/app/agenda', {
                                state: {
                                    prefill: {
                                        client_id: id,
                                        client_name: formData.name,
                                        address: formData.address
                                    }
                                }
                            })}
                            className="flex items-center px-3 py-2 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100"
                        >
                            <Calendar className="w-4 h-4 mr-2" />
                            <span className="hidden sm:inline">RDV</span>
                        </button>
                    )}
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
                            <span className="hidden sm:inline">Portail</span>
                        </button>
                    )}
                    {isEditing && (
                        <button
                            type="button"
                            onClick={handleDelete}
                            className="flex items-center px-3 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100"
                            title="Supprimer le client"
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Supprimer
                        </button>
                    )}
                </div>
            </div>

            <div className="flex space-x-4 mb-6 border-b border-gray-200 overflow-x-auto pb-0.5">
                <button
                    onClick={() => setActiveTab('info')}
                    className={`pb-2 px-1 text-sm font-medium transition-colors relative whitespace-nowrap flex-shrink-0 ${activeTab === 'info' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Informations
                    </div>
                    {activeTab === 'info' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full" />}
                </button>
                <button
                    onClick={() => setActiveTab('contacts')}
                    className={`pb-2 px-1 text-sm font-medium transition-colors relative whitespace-nowrap flex-shrink-0 ${activeTab === 'contacts' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Contacts
                    </div>
                    {activeTab === 'contacts' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full" />}
                </button>
                {isEditing && (
                    <button
                        onClick={() => setActiveTab('materials')}
                        className={`pb-2 px-1 text-sm font-medium transition-colors relative whitespace-nowrap flex-shrink-0 ${activeTab === 'materials' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <div className="flex items-center gap-2">
                            <Palette className="w-4 h-4" />
                            Matériaux
                        </div>
                        {activeTab === 'materials' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full" />}
                    </button>
                )}
                {isEditing && (
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`pb-2 px-1 text-sm font-medium transition-colors relative whitespace-nowrap flex-shrink-0 ${activeTab === 'history' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
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
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
                                    Type de client
                                </label>
                                <select
                                    id="type"
                                    name="type"
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    value={formData.type}
                                    onChange={handleChange}
                                >
                                    <option value="professional">Professionnel / Entreprise</option>
                                    <option value="individual">Particulier</option>
                                </select>
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
                                    <option value="lead">Demande / A Contacter</option>
                                    <option value="contacted">Visite / Devis à faire</option>
                                    <option value="proposal">Devis Envoyé</option>
                                    <option value="signed">Signé / En Cours</option>
                                    <option value="lost">Perdu / Sans suite</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex justify-between items-center mb-1">
                            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                                Nom complet / Entreprise *
                            </label>
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

                    {formData.type === 'professional' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label htmlFor="siren" className="block text-sm font-medium text-gray-700 mb-1">
                                    SIREN (9 chiffres) *
                                </label>
                                <input
                                    type="text"
                                    id="siren"
                                    name="siren"
                                    maxLength={9}
                                    placeholder="Ex: 123456789"
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    value={formData.siren}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, '').slice(0, 9);
                                        setFormData(prev => ({ ...prev, siren: val }));
                                    }}
                                />
                            </div>
                            <div>
                                <label htmlFor="tva_intracom" className="block text-sm font-medium text-gray-700 mb-1">
                                    Numéro de TVA Intracom.
                                </label>
                                <input
                                    type="text"
                                    id="tva_intracom"
                                    name="tva_intracom"
                                    placeholder="Ex: FR00123456789"
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    value={formData.tva_intracom}
                                    onChange={(e) => setFormData(prev => ({ ...prev, tva_intracom: e.target.value.toUpperCase() }))}
                                />
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <div className="flex items-center gap-2">
                                    <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                                        Email
                                    </label>
                                    {isEditing && formData.email && (
                                        <button
                                            type="button"
                                            onClick={() => handleContactAction('email', formData.email)}
                                            className="p-1 text-blue-600 hover:bg-blue-50 rounded-full"
                                            title="Envoyer un email"
                                        >
                                            <Mail className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
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
                                <div className="flex items-center gap-2">
                                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                                        Téléphone
                                    </label>
                                    {isEditing && formData.phone && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => handleContactAction('call', formData.phone)}
                                                className="p-1 text-green-600 hover:bg-green-50 rounded-full"
                                                title="Appeler"
                                            >
                                                <Phone className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleContactAction('sms', formData.phone)}
                                                className="p-1 text-blue-600 hover:bg-blue-50 rounded-full"
                                                title="Envoyer un SMS"
                                            >
                                                <MessageSquare className="w-4 h-4" />
                                            </button>
                                        </>
                                    )}
                                </div>
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
                            <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                                Notes internes
                            </label>
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

            {activeTab === 'materials' && isEditing && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <ClientReferences clientId={id} />
                </div>
            )}

            {activeTab === 'history' && isEditing && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <ClientHistory clientId={id} />
                </div>
            )}

            {isEditing && <ProjectPhotos clientId={id} />}

            <SmartVoiceModal
                isOpen={showVoiceModal}
                onClose={() => setShowVoiceModal(false)}
                onResult={handleVoiceResult}
                context="client"
            />
        </div>
    );
};

export default ClientForm;
