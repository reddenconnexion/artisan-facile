import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Plus, Trash2, Save, ArrowLeft, FileText, Download, Mic, MicOff, User, FileCheck, PenTool } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { generateDevisPDF } from '../utils/pdfGenerator';
import SignatureModal from '../components/SignatureModal';
import { useVoice } from '../hooks/useVoice';

const DevisForm = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const location = useLocation();
    const { user } = useAuth();
    const isEditing = !!id && id !== 'new';
    const [loading, setLoading] = useState(false);
    const [clients, setClients] = useState([]);
    const [userProfile, setUserProfile] = useState(null);
    const { isListening, transcript, startListening, stopListening, resetTranscript } = useVoice();
    const [activeField, setActiveField] = useState(null); // 'notes' or 'item-description-{index}'
    const [priceLibrary, setPriceLibrary] = useState([]);

    useEffect(() => {
        if (user) {
            fetchPriceLibrary();
        }
    }, [user]);

    const fetchPriceLibrary = async () => {
        const { data } = await supabase.from('price_library').select('*');
        setPriceLibrary(data || []);
    };

    // Handle Dictation
    useEffect(() => {
        if (transcript && activeField) {
            if (activeField === 'notes') {
                setFormData(prev => ({ ...prev, notes: transcript }));
            } else if (activeField.startsWith('item-description-')) {
                const index = parseInt(activeField.split('-')[2]);
                // Ensure the item exists at the given index before updating
                if (formData.items[index]) {
                    updateItem(formData.items[index].id, 'description', transcript);
                }
            }
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

    const [formData, setFormData] = useState({
        client_id: '',
        date: new Date().toISOString().split('T')[0],
        valid_until: '',
        items: [
            { id: 1, description: '', quantity: 1, price: 0 }
        ],
        notes: '',
        status: 'draft',
        include_tva: true
    });

    useEffect(() => {
        if (user) {
            fetchClients().then((loadedClients) => {
                // Handle Voice Data AFTER clients are loaded
                if (location.state?.voiceData) {
                    const { clientName, notes } = location.state.voiceData;

                    if (clientName && loadedClients) {
                        // Fuzzy search for client
                        const foundClient = loadedClients.find(c =>
                            c.name.toLowerCase().includes(clientName.toLowerCase())
                        );

                        if (foundClient) {
                            setFormData(prev => ({
                                ...prev,
                                client_id: foundClient.id,
                                notes: notes ? (prev.notes ? prev.notes + '\n' + notes : notes) : prev.notes
                            }));
                            toast.success(`Client ${foundClient.name} sélectionné`);
                        } else {
                            toast.warning(`Client "${clientName}" non trouvé`);
                        }
                    }

                    if (notes && !clientName) {
                        setFormData(prev => ({
                            ...prev,
                            notes: notes ? (prev.notes ? prev.notes + '\n' + notes : notes) : prev.notes
                        }));
                    }

                    // Clear state
                    window.history.replaceState({}, document.title);
                }
            });
            fetchUserProfile();
            if (isEditing) {
                fetchDevis();
            }
        }
    }, [user, id]);

    const fetchUserProfile = async () => {
        const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
        if (data) setUserProfile({ ...data, email: user.email });
    };

    const fetchClients = async () => {
        const { data } = await supabase.from('clients').select('*'); // Fetch all fields for PDF
        setClients(data || []);
        return data || [];
    };

    const fetchDevis = async () => {
        try {
            const { data, error } = await supabase
                .from('quotes')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            if (data) {
                setFormData({
                    client_id: data.client_id || '',
                    date: data.date,
                    valid_until: data.valid_until || '',
                    items: data.items || [],
                    notes: data.notes || '',
                    status: data.status || 'draft',
                    include_tva: data.total_tva > 0 || (data.total_ht === 0 && data.total_tva === 0) // Heuristic: if TVA > 0, it was included. If both 0, assume included by default or check logic.
                });
            }
        } catch (error) {
            toast.error('Erreur lors du chargement du devis');
            navigate('/devis');
        }
    };

    const addItem = () => {
        setFormData(prev => ({
            ...prev,
            items: [...prev.items, { id: Date.now(), description: '', quantity: 1, price: 0 }]
        }));
    };

    const removeItem = (itemId) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.filter(item => item.id !== itemId)
        }));
    };

    const updateItem = (itemId, field, value) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.map(item =>
                item.id === itemId ? { ...item, [field]: value } : item
            )
        }));
    };

    const calculateTotal = () => {
        const subtotal = formData.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
        const tva = formData.include_tva ? subtotal * 0.20 : 0; // TVA 20% par défaut
        const total = subtotal + tva;
        return { subtotal, tva, total };
    };

    const { subtotal, tva, total } = calculateTotal();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        if (!formData.client_id) {
            toast.error('Veuillez sélectionner un client');
            setLoading(false);
            return;
        }

        try {
            const selectedClient = clients.find(c => c.id.toString() === formData.client_id.toString());

            const quoteData = {
                user_id: user.id,
                client_id: formData.client_id,
                client_name: selectedClient ? selectedClient.name : 'Client inconnu',
                date: formData.date,
                valid_until: formData.valid_until || null,
                items: formData.items,
                total_ht: subtotal,
                total_tva: tva,
                total_ttc: total,
                notes: formData.notes,
                status: formData.status
            };

            let error;
            if (isEditing) {
                const { error: updateError } = await supabase
                    .from('quotes')
                    .update(quoteData)
                    .eq('id', id);
                error = updateError;
            } else {
                const { error: insertError } = await supabase
                    .from('quotes')
                    .insert([quoteData]);
                error = insertError;
            }

            if (error) throw error;

            toast.success(isEditing ? 'Devis modifié avec succès' : 'Devis créé avec succès');
            navigate('/devis');
        } catch (error) {
            toast.error('Erreur lors de la sauvegarde');
            console.error('Error saving quote:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadPDF = (isInvoice = false) => {
        try {
            if (!formData.client_id) {
                toast.error('Veuillez sélectionner un client pour générer le PDF');
                return;
            }

            const selectedClient = clients.find(c => c.id.toString() === formData.client_id.toString());

            if (!selectedClient) {
                console.error('Client not found for ID:', formData.client_id);
                toast.error('Erreur : Client introuvable');
                return;
            }

            const devisData = {
                id: isEditing ? id : 'PROVISOIRE',
                ...formData,
                total_ht: subtotal,
                total_tva: tva,
                total_ttc: total,
                include_tva: formData.include_tva
            };

            console.log('Generating PDF with data:', { devisData, selectedClient, user: userProfile });
            generateDevisPDF(devisData, selectedClient, userProfile, isInvoice);
            toast.success(isInvoice ? 'Facture générée avec succès' : 'PDF généré avec succès');
        } catch (error) {
            console.error('Error generating PDF:', error);
            toast.error('Erreur lors de la génération du PDF : ' + error.message);
        }
    };

    const handleConvertToInvoice = async () => {
        if (!window.confirm('Voulez-vous convertir ce devis en facture ? Cela changera son statut en "Accepté".')) {
            return;
        }

        try {
            const { error } = await supabase
                .from('quotes')
                .update({ status: 'accepted' })
                .eq('id', id);

            if (error) throw error;

            setFormData(prev => ({ ...prev, status: 'accepted' }));
            toast.success('Devis converti en facture');
            handleDownloadPDF(true); // Auto-generate invoice PDF
        } catch (error) {
            toast.error('Erreur lors de la conversion');
            console.error('Error converting to invoice:', error);
        }
    };

    return (
        <div className="max-w-4xl mx-auto pb-12">
            <div className="flex items-center justify-between mb-6">
                <button
                    onClick={() => navigate('/devis')}
                    className="flex items-center text-gray-600 hover:text-gray-900"
                >
                    <ArrowLeft className="w-5 h-5 mr-2" />
                    Retour
                </button>
                <div className="flex gap-3">
                    {id && (
                        <>
                            <button
                                onClick={() => setShowSignatureModal(true)}
                                className={`flex items-center px-4 py-2 rounded-lg transition-colors ${signature || formData.status === 'accepted'
                                    ? 'bg-green-100 text-green-700 cursor-default'
                                    : 'bg-purple-600 text-white hover:bg-purple-700'
                                    }`}
                                disabled={!!signature || formData.status === 'accepted'}
                            >
                                {signature || formData.status === 'accepted' ? (
                                    <>
                                        <FileCheck className="w-4 h-4 mr-2" />
                                        Signé
                                    </>
                                ) : (
                                    <>
                                        <PenTool className="w-4 h-4 mr-2" />
                                        Faire signer
                                    </>
                                )}
                            </button>
                            <button
                                onClick={handleDownloadPDF}
                                className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                                <Download className="w-4 h-4 mr-2" />
                                PDF
                            </button>
                        </>
                    )}

                    <button
                        type="button"
                        onClick={() => handleDownloadPDF(formData.status === 'accepted')}
                        className="flex items-center px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                        <Download className="w-4 h-4 mr-2" />
                        {formData.status === 'accepted' ? 'Télécharger Facture' : 'Télécharger Devis'}
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="flex items-center px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        {loading ? 'Enregistrement...' : 'Enregistrer'}
                    </button>
                </div >
            </div >

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 space-y-8">
                {/* En-tête Devis */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-sm font-medium text-gray-700">Client</label>
                            {formData.client_id && (
                                <button
                                    type="button"
                                    onClick={() => navigate(`/clients/${formData.client_id}`)}
                                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                    Voir la fiche client
                                </button>
                            )}
                        </div>
                        <select
                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            value={formData.client_id}
                            onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                        >
                            <option value="">Sélectionner un client</option>
                            {clients.map(client => (
                                <option key={client.id} value={client.id}>{client.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Date d'émission</label>
                            <input
                                type="date"
                                className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                value={formData.date}
                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Validité jusqu'au</label>
                            <input
                                type="date"
                                className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                value={formData.valid_until}
                                onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                            />
                        </div>
                    </div>
                </div>

                {/* Lignes du devis */}
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Détails des prestations</h3>
                    <div className="space-y-4">
                        {formData.items.map((item, index) => (
                            <div key={item.id} className="flex gap-4 items-start">
                                <div className="flex-1 relative">
                                    <input
                                        type="text"
                                        placeholder="Description"
                                        list={`library-suggestions-${item.id}`}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg pr-8"
                                        value={item.description}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            updateItem(item.id, 'description', val);

                                            // Check for exact match in library to auto-fill price
                                            const libraryItem = priceLibrary.find(lib => lib.description === val);
                                            if (libraryItem) {
                                                updateItem(item.id, 'price', libraryItem.price);
                                                // Optional: update unit if you had a unit field in items
                                            }
                                        }}
                                        required
                                    />
                                    <datalist id={`library-suggestions-${item.id}`}>
                                        {Array.isArray(priceLibrary) && priceLibrary.map(lib => (
                                            <option key={lib.id} value={lib.description}>
                                                {lib.price}€
                                            </option>
                                        ))}
                                    </datalist>
                                    <button
                                        type="button"
                                        onClick={() => toggleDictation(`item-description-${index}`)}
                                        className={`absolute right-2 top-2 p-0.5 rounded-full hover:bg-gray-100 ${isListening && activeField === `item-description-${index}` ? 'text-red-500 animate-pulse' : 'text-gray-400'}`}
                                        title="Dicter"
                                    >
                                        <Mic className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="w-24">
                                    <input
                                        type="number"
                                        placeholder="Qté"
                                        min="1"
                                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-right"
                                        value={item.quantity}
                                        onChange={(e) => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                                    />
                                </div>
                                <div className="w-32">
                                    <input
                                        type="number"
                                        placeholder="Prix U."
                                        min="0"
                                        step="0.01"
                                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-right"
                                        value={item.price}
                                        onChange={(e) => updateItem(item.id, 'price', parseFloat(e.target.value) || 0)}
                                    />
                                </div>
                                <div className="w-32 py-2 text-right font-medium text-gray-900">
                                    {(item.quantity * item.price).toFixed(2)} €
                                </div>
                                <button
                                    onClick={() => removeItem(item.id)}
                                    className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={addItem}
                        className="mt-4 flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
                    >
                        <Plus className="w-4 h-4 mr-1" />
                        Ajouter une ligne
                    </button>
                </div>

                {/* Totaux */}
                <div className="flex justify-end pt-6 border-t border-gray-100">
                    <div className="w-64 space-y-3">
                        <div className="flex items-center justify-end mb-4">
                            <input
                                type="checkbox"
                                id="include_tva"
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                checked={formData.include_tva}
                                onChange={(e) => setFormData({ ...formData, include_tva: e.target.checked })}
                            />
                            <label htmlFor="include_tva" className="ml-2 block text-sm text-gray-900">
                                Appliquer la TVA (20%)
                            </label>
                        </div>
                        <div className="flex justify-between text-gray-600">
                            <span>Total HT</span>
                            <span>{subtotal.toFixed(2)} €</span>
                        </div>
                        {formData.include_tva && (
                            <div className="flex justify-between text-gray-600">
                                <span>TVA (20%)</span>
                                <span>{tva.toFixed(2)} €</span>
                            </div>
                        )}
                        {!formData.include_tva && (
                            <div className="text-xs text-gray-500 text-right italic">
                                TVA non applicable, art. 293 B du CGI
                            </div>
                        )}
                        <div className="flex justify-between text-lg font-bold text-gray-900 pt-3 border-t border-gray-200">
                            <span>Total TTC</span>
                            <span>{total.toFixed(2)} €</span>
                        </div>
                    </div>
                </div>

                {/* Notes */}
                <div>
                    <div className="flex justify-between items-center mb-1">
                        <label className="block text-sm font-medium text-gray-700">Notes / Conditions</label>
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
                        rows={3}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Conditions de paiement, validité du devis..."
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    />
                </div>
            </div>
            {/* Signature Modal */}
            <SignatureModal
                isOpen={showSignatureModal}
                onClose={() => setShowSignatureModal(false)}
                onSave={handleSignatureSave}
            />
        </div>
    );
};

export default DevisForm;
