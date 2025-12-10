import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Plus, Trash2, Save, ArrowLeft, FileText, Download, Mail, Send, Eye, Link, PenTool, MoreVertical, X, Star, FileCheck, Upload, Mic, Loader2 } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { generateDevisPDF } from '../utils/pdfGenerator';
import SignatureModal from '../components/SignatureModal';
import MarginGauge from '../components/MarginGauge';
import { useVoice } from '../hooks/useVoice';
import { extractTextFromPDF, parseQuoteItems } from '../utils/pdfImport';
import { getTradeConfig } from '../constants/trades';

const DevisForm = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const location = useLocation();
    const { user } = useAuth();
    const isEditing = !!id && id !== 'new';
    const [loading, setLoading] = useState(false);
    const [clients, setClients] = useState([]);
    const [userProfile, setUserProfile] = useState(null);
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [signature, setSignature] = useState(null);
    const { isListening, transcript, startListening, stopListening, resetTranscript } = useVoice();
    const [activeField, setActiveField] = useState(null); // 'notes' or 'item-description-{index}'
    const [priceLibrary, setPriceLibrary] = useState([]);
    const [showReviewMenu, setShowReviewMenu] = useState(false);
    const [showActionsMenu, setShowActionsMenu] = useState(false);
    const [importing, setImporting] = useState(false);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [emailPreview, setEmailPreview] = useState(null);
    const fileInputRef = React.useRef(null);

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
        title: '',
        public_token: '',
        date: new Date().toISOString().split('T')[0],
        valid_until: '',
        items: [
            { id: 1, description: '', quantity: 1, price: 0, buying_price: 0, type: 'service' }
        ],
        notes: '',
        status: 'draft',
        type: 'quote', // 'quote' or 'invoice'
        include_tva: true,
        original_pdf_url: null,
        is_external: false,
        manual_total_ht: 0,
        manual_total_tva: 0,
        manual_total_ttc: 0
    });

    useEffect(() => {
        if (user) {
            fetchClients().then((loadedClients) => {
                // Handle Navigation State (Client ID or Voice Data)
                if (location.state) {
                    const { client_id, voiceData } = location.state;

                    if (client_id && loadedClients) {
                        const foundClient = loadedClients.find(c => c.id.toString() === client_id.toString());
                        if (foundClient) {
                            setFormData(prev => ({ ...prev, client_id: foundClient.id }));
                        }
                    }

                    if (voiceData) {
                        const { clientName, notes } = voiceData;

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
                    title: data.title || '',
                    public_token: data.public_token || '',
                    date: data.date,
                    valid_until: data.valid_until || '',
                    items: data.items.map(i => ({ ...i, buying_price: i.buying_price || 0, type: i.type || 'service' })) || [],
                    notes: data.notes || '',
                    status: data.status || 'draft',
                    type: data.type || 'quote',
                    include_tva: data.total_tva > 0 || (data.total_ht === 0 && data.total_tva === 0),
                    original_pdf_url: data.original_pdf_url || null,
                    is_external: data.is_external || false,
                    manual_total_ht: data.is_external ? data.total_ht : 0,
                    manual_total_tva: data.is_external ? data.total_tva : 0,
                    manual_total_ttc: data.is_external ? data.total_ttc : 0
                });
                setSignature(data.signature || null);
            }
        } catch (error) {
            toast.error('Erreur lors du chargement du devis');
            navigate('/app/devis');
        }
    };

    const tradeConfig = getTradeConfig(userProfile?.trade || 'general');

    const addItem = () => {
        setFormData(prev => ({
            ...prev,
            items: [...prev.items, { id: Date.now(), description: '', quantity: 1, unit: tradeConfig.defaultUnit, price: 0, buying_price: 0, type: 'service' }]
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
        if (formData.is_external) {
            return {
                subtotal: parseFloat(formData.manual_total_ht) || 0,
                tva: parseFloat(formData.manual_total_tva) || 0,
                total: parseFloat(formData.manual_total_ttc) || 0,
                totalCost: 0
            };
        }
        const subtotal = formData.items.reduce((sum, item) => sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0)), 0);
        const totalCost = formData.items.reduce((sum, item) => sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.buying_price) || 0)), 0);
        const tva = formData.include_tva ? subtotal * 0.20 : 0;
        const total = subtotal + tva;
        return { subtotal, tva, total, totalCost };
    };



    const handlePreview = () => {
        if (!formData.client_id) {
            toast.error('Veuillez sélectionner un client');
            return;
        }
        const selectedClient = clients.find(c => c.id.toString() === formData.client_id.toString());
        if (!selectedClient) {
            toast.error('Erreur : Client introuvable');
            return;
        }

        const devisData = {
            id: isEditing ? id : 'PROVISOIRE',
            ...formData,
            items: formData.items.map(i => ({
                ...i,
                quantity: parseFloat(i.quantity) || 0,
                price: parseFloat(i.price) || 0,
                buying_price: parseFloat(i.buying_price) || 0
            })),
            total_ht: subtotal,
            total_tva: tva,
            total_ttc: total,
            include_tva: formData.include_tva
        };

        const url = generateDevisPDF(devisData, selectedClient, userProfile, formData.status === 'accepted', true);
        setPreviewUrl(url);
    };

    const handleSendQuoteEmail = () => {
        if (!formData.client_id) {
            toast.error('Veuillez d\'abord sélectionner un client');
            return;
        }

        const selectedClient = clients.find(c => c.id.toString() === formData.client_id.toString());
        if (!selectedClient || !selectedClient.email) {
            toast.error('Le client sélectionné n\'a pas d\'adresse email');
            return;
        }

        const signatureLink = `${window.location.origin} /q/${formData.public_token} `;
        const companyName = userProfile?.company_name || userProfile?.full_name || 'Votre Artisan';

        const isInvoice = formData.type === 'invoice';
        const docRef = `${isInvoice ? 'Facture' : 'Devis'} ${id}`;

        const subject = encodeURIComponent(`${docRef} - ${formData.title || 'Projet'} - ${companyName} `);

        const bodyLines = [
            `Bonjour ${selectedClient.name}, `,
            ``,
            isInvoice
                ? `Veuillez trouver ci-joint votre facture pour ${formData.title ? 'le projet "' + formData.title + '"' : 'votre projet'}.`
                : `Veuillez trouver ci-joint notre proposition pour ${formData.title ? 'le projet "' + formData.title + '"' : 'votre projet'}.`,
            ``,
            `Vous pouvez consulter le document en ligne via le lien suivant : `,
            `${signatureLink} `,
            ``,
            `Nous restons à votre disposition pour toute question.`,
            ``,
            `Cordialement, `,
            `${companyName} `,
            ``,
            `---`,
            `${userProfile?.full_name || ''} `,
            `${userProfile?.address || ''} `,
            `${userProfile?.postal_code || ''} ${userProfile?.city || ''} `,
            `Tél: ${userProfile?.phone || ''} `,
            `Email: ${userProfile?.professional_email || userProfile?.email || ''} `,
            `Web: ${userProfile?.website || ''} `,
            `SIRET: ${userProfile?.siret || ''} `
        ].filter(line => line.trim() !== ''); // Clean empty lines if data is missing

        const body = bodyLines.join('\n'); // Keep raw for editing in textarea

        setEmailPreview({
            email: selectedClient.email,
            subject, // Already URL safe? No, wait. 
            // In the modal we want readable text. 
            // The previous code did encodeURIComponent immediately. 
            // Let's store readable strings here and encode only when clicking Send.
            rawSubject: `${docRef} - ${formData.title || 'Projet'} - ${companyName} `,
            rawBody: bodyLines.join('\n')
        });
    };

    const handleConfirmSendEmail = (subject, body) => {
        if (!emailPreview) return;

        const mailtoUrl = `mailto:${emailPreview.email}?subject = ${encodeURIComponent(subject)}& body=${encodeURIComponent(body)} `;
        window.location.href = mailtoUrl;
        toast.success('Application de messagerie ouverte');
        setEmailPreview(null);
    };

    const { subtotal, tva, total, totalCost } = calculateTotal();

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
                title: formData.title,
                date: formData.date,
                valid_until: formData.valid_until || null,
                items: formData.items.map(i => ({
                    ...i,
                    quantity: parseFloat(i.quantity) || 0,
                    price: parseFloat(i.price) || 0,
                    buying_price: parseFloat(i.buying_price) || 0
                })),
                total_ht: subtotal,
                total_tva: tva,
                total_ttc: total,
                notes: formData.notes,
                status: formData.status,
                type: formData.type,
                original_pdf_url: formData.original_pdf_url,
                is_external: formData.is_external
            };

            // If status is reverted from accepted/signed to draft/sent/refused, clear signature data
            if (['draft', 'sent', 'refused'].includes(formData.status)) {
                quoteData.signature = null;
                quoteData.signed_at = null;
            }

            let error;
            if (isEditing) {
                // For updates: exclude user_id, include updated_at
                const { user_id, ...updateData } = quoteData;
                const { data, error: updateError } = await supabase
                    .from('quotes')
                    .update({ ...updateData, updated_at: new Date() })
                    .eq('id', id)
                    .select(); // Ensure we get return data to verify

                if (!updateError && (!data || data.length === 0)) {
                    throw new Error("L'enregistrement a échoué (devis introuvable ou permissions insuffisantes).");
                }
                error = updateError;
            } else {
                const { error: insertError } = await supabase
                    .from('quotes')
                    .insert([quoteData])
                    .select();
                error = insertError;
            }

            if (error) throw error;

            toast.success(isEditing ? 'Devis modifié avec succès' : 'Devis créé avec succès');
            navigate('/app/devis');
        } catch (error) {
            console.error('Error saving quote:', error);
            toast.error('Erreur lors de la sauvegarde : ' + (error.message || error.details || error.hint || 'Erreur inconnue'));
        } finally {
            setLoading(false);
        }
    };

    const handleCreateDeposit = async () => {
        const percentageStr = window.prompt("Quel pourcentage d'acompte souhaitez-vous ? (ex: 30)", "30");
        if (!percentageStr) return;

        const percentage = parseFloat(percentageStr);
        if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
            toast.error("Pourcentage invalide");
            return;
        }

        try {
            setLoading(true);
            const depositAmount = (total * percentage) / 100;
            const depositItem = {
                id: Date.now(),
                description: `Acompte de ${percentage}% sur devis n°${id} - ${formData.title} `,
                quantity: 1,
                unit: 'forfait',
                price: depositAmount,
                buying_price: 0,
                type: 'service'
            };

            const depositData = {
                user_id: user.id,
                client_id: formData.client_id,
                client_name: clients.find(c => c.id.toString() === formData.client_id.toString())?.name || 'Client',
                title: `Facture d'Acompte - ${formData.title}`,
                date: new Date().toISOString().split('T')[0],
                status: 'billed', // Directly billed
                type: 'invoice',
                items: [depositItem],
                total_ht: depositAmount / (1 + (formData.include_tva ? 0.2 : 0)), // Approx back-calc if needed, or just use raw
                total_tva: formData.include_tva ? (depositAmount - (depositAmount / 1.2)) : 0,
                total_ttc: depositAmount,
                parent_id: id,
                notes: `Facture d'acompte générée le ${new Date().toLocaleDateString()}`
            };

            // Recalculate strict HT/TVA based on item price which is TTC if include_tva is true? 
            // The logic in local calculateTotal is: price * qty = HT? No, logic depends on simple app. 
            // In calculateTotal: total = subtotal + tva. 
            // subtotal = sum(qty * price). 
            // So if `depositAmount` is the target TTC, and include_tva is true (20%), then price should be HT.

            if (formData.include_tva) {
                // If we want the final line to be 'depositAmount', and that is TTC.
                // price = depositAmount / 1.2
                depositItem.price = depositAmount / 1.2;
                depositData.total_ht = depositItem.price;
                depositData.total_tva = depositAmount - depositItem.price;
                depositData.total_ttc = depositAmount;
            } else {
                depositItem.price = depositAmount;
                depositData.total_ht = depositAmount;
                depositData.total_tva = 0;
                depositData.total_ttc = depositAmount;
            }

            const { data, error } = await supabase
                .from('quotes')
                .insert([depositData])
                .select()
                .single();

            if (error) throw error;

            toast.success("Facture d'acompte créée !");
            navigate(`/app/devis/${data.id}`);
            setShowActionsMenu(false);

        } catch (error) {
            console.error('Error creating deposit:', error);
            toast.error("Erreur lors de la création de l'acompte");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce devis ? Cette action est irréversible.')) {
            return;
        }

        try {
            const { error } = await supabase
                .from('quotes')
                .delete()
                .eq('id', id);

            if (error) throw error;

            toast.success('Devis supprimé avec succès');
            navigate('/app/devis');
        } catch (error) {
            console.error('Error deleting quote:', error);
            toast.error('Erreur lors de la suppression');
        }
    };

    const handleDownloadPDF = (forceInvoice = false) => {
        try {
            const isInvoice = forceInvoice || formData.type === 'invoice';
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
                items: formData.items.map(i => ({
                    ...i,
                    quantity: parseFloat(i.quantity) || 0,
                    price: parseFloat(i.price) || 0,
                    buying_price: parseFloat(i.buying_price) || 0
                })),
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
                .update({ status: 'accepted', type: 'invoice' })
                .eq('id', id);

            if (error) throw error;

            if (error) throw error;

            setFormData(prev => ({ ...prev, status: 'accepted', type: 'invoice' }));
            toast.success('Devis converti en facture');
            handleDownloadPDF(true); // Auto-generate invoice PDF
        } catch (error) {
            toast.error('Erreur lors de la conversion');
            console.error('Error converting to invoice:', error);
        }
    };

    const handleSignatureSave = async (signatureData) => {
        try {
            const { error } = await supabase
                .from('quotes')
                .update({
                    signature: signatureData,
                    status: 'accepted',
                    signed_at: new Date().toISOString()
                })
                .eq('id', id);

            if (error) throw error;

            setSignature(signatureData);
            setFormData(prev => ({ ...prev, status: 'accepted' }));
            setShowSignatureModal(false);
            toast.success('Devis signé avec succès');
        } catch (error) {
            console.error('Error saving signature:', error);
            toast.error('Erreur lors de la sauvegarde de la signature');
        }
    };


    const handleReviewAction = (action) => {
        const reviewUrl = userProfile?.google_review_url;
        if (!reviewUrl) {
            toast.error("Veuillez d'abord configurer votre lien Google Avis dans votre profil");
            navigate('/app/settings');
            return;
        }

        switch (action) {
            case 'copy':
                navigator.clipboard.writeText(reviewUrl);
                toast.success('Lien copié dans le presse-papier');
                break;
            case 'open':
                window.open(reviewUrl, '_blank');
                break;
            case 'email':
                const subject = encodeURIComponent(`Votre avis compte pour ${userProfile.company_name || 'nous'}`);
                const body = encodeURIComponent(`Bonjour,\n\nMerci de nous avoir fait confiance pour vos travaux.\n\nNous serions ravis d'avoir votre retour d'expérience. Cela ne prend que quelques secondes via ce lien :\n${reviewUrl}\n\nCordialement,\n${userProfile.full_name || ''}`);
                window.location.href = `mailto:?subject=${subject}&body=${body}`;
                break;
        }
        setShowReviewMenu(false);
    };

    // Updated Handle Import to support File Upload + Extraction
    const handleImportFile = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (file.type !== 'application/pdf') {
            toast.error('Seuls les fichiers PDF sont supportés');
            return;
        }

        try {
            setImporting(true);
            toast.message('Traitement du PDF en cours...');

            // 1. Upload File to Supabase Storage
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = `${user.id}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('quote_files')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('quote_files')
                .getPublicUrl(filePath);

            toast.success("Fichier PDF stocké avec succès !");

            // 2. Extract Text (for data filling)
            const text = await extractTextFromPDF(file);
            const { items: newItems, notes: extraNotes } = parseQuoteItems(text);

            // Update Form Data
            setFormData(prev => ({
                ...prev,
                original_pdf_url: publicUrl, // Save the URL!
                items: newItems.length > 0 ? newItems : prev.items, // Replace items if found, else keep default
                notes: extraNotes ? prev.notes + '\n' + extraNotes : prev.notes
            }));

            if (newItems.length > 0) {
                toast.success(`${newItems.length} éléments détectés. Mode PDF Authentique activé.`);
            } else {
                toast.info("Aucun élément chiffré détecté, mais le PDF est joint.");
            }

        } catch (error) {
            console.error('Import error:', error);
            toast.error("Erreur lors de l'import : " + error.message);
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleExternalImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.type !== 'application/pdf') {
            toast.error('Seuls les fichiers PDF sont supportés');
            return;
        }

        try {
            setImporting(true);
            toast.message('Importation du PDF en cours...');

            // 1. Upload File to Supabase Storage
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = `${user.id}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('quote_files')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('quote_files')
                .getPublicUrl(filePath);

            toast.success("PDF importé avec succès !");

            // Update Form Data for External Mode
            setFormData(prev => ({
                ...prev,
                original_pdf_url: publicUrl,
                is_external: true,
                // Optional: Try to parse totals if possible, otherwise default to 0
                manual_total_ht: 0,
                manual_total_tva: 0,
                manual_total_ttc: 0
            }));

        } catch (error) {
            console.error('External import error:', error);
            toast.error("Erreur lors de l'import : " + error.message);
        } finally {
            setImporting(false);
            e.target.value = ''; // Reset input
        }
    };

    return (
        <div className="max-w-4xl mx-auto pb-12">
            <div className="flex items-center justify-between mb-6">
                <button
                    onClick={() => navigate('/app/devis')}
                    className="flex items-center text-gray-600 hover:text-gray-900"
                >
                    <ArrowLeft className="w-5 h-5 mr-2" />
                    Retour
                </button>

                {/* Type Switch - Only for new or drafts? Or allows conversion? allow anytime for flexibility */}
                <div className="flex bg-gray-100 p-1 rounded-lg mx-4">
                    <button
                        type="button"
                        onClick={() => setFormData(p => ({ ...p, type: 'quote' }))}
                        className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${formData.type !== 'invoice'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-gray-500 hover:text-gray-900'
                            }`}
                    >
                        Devis
                    </button>
                    <button
                        type="button"
                        onClick={() => setFormData(p => ({ ...p, type: 'invoice' }))}
                        className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${formData.type === 'invoice'
                            ? 'bg-white text-green-600 shadow-sm'
                            : 'text-gray-500 hover:text-gray-900'
                            }`}
                    >
                        Facture
                    </button>
                </div>

                <div className="flex gap-2">
                    {/* Primary Actions */}
                    <button
                        type="button"
                        onClick={handleSendQuoteEmail}
                        className="hidden sm:flex items-center px-4 py-2 text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
                        title="Envoyer par email"
                    >
                        <Send className="w-4 h-4 mr-2" />
                        Envoyer
                    </button>

                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="flex items-center px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        {loading ? '...' : 'Enregistrer'}
                    </button>

                    {/* More Actions Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setShowActionsMenu(!showActionsMenu)}
                            className="flex items-center justify-center w-10 h-10 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            title="Plus d'actions"
                        >
                            <MoreVertical className="w-5 h-5 text-gray-600" />
                        </button>

                        {showActionsMenu && (
                            <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-100 z-50 py-1">
                                {/* Mobile only Send button */}
                                <button
                                    onClick={() => { handleSendQuoteEmail(); setShowActionsMenu(false); }}
                                    className="sm:hidden flex items-center w-full px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                    <Send className="w-4 h-4 mr-3 text-blue-600" />
                                    Envoyer le devis
                                </button>

                                {id && formData.public_token && (
                                    <button
                                        onClick={() => {
                                            const url = `${window.location.origin}/q/${formData.public_token}`;
                                            navigator.clipboard.writeText(url);
                                            toast.success('Lien de signature copié !');
                                            setShowActionsMenu(false);
                                        }}
                                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                    >
                                        <Link className="w-4 h-4 mr-3 text-gray-400" />
                                        Copier le lien public
                                    </button>
                                )}

                                {id && !signature && formData.status !== 'accepted' && (
                                    <button
                                        onClick={() => { setShowSignatureModal(true); setShowActionsMenu(false); }}
                                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                    >
                                        <PenTool className="w-4 h-4 mr-3 text-purple-600" />
                                        Faire signer sur l'appareil
                                    </button>
                                )}

                                <button
                                    onClick={() => { handlePreview(); setShowActionsMenu(false); }}
                                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                    <Eye className="w-4 h-4 mr-3 text-gray-400" />
                                    Aperçu PDF
                                </button>

                                <button
                                    onClick={() => { handleDownloadPDF(formData.status === 'accepted'); setShowActionsMenu(false); }}
                                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                    <Download className="w-4 h-4 mr-3 text-gray-400" />
                                    Télécharger {formData.status === 'accepted' ? 'Facture' : 'Devis'}
                                </button>

                                {id && (formData.status === 'accepted' || formData.status === 'sent') && (
                                    <button
                                        onClick={handleCreateDeposit}
                                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 bg-blue-50/50"
                                    >
                                        <FileCheck className="w-4 h-4 mr-3 text-blue-600" />
                                        Générer Facture d'Acompte
                                    </button>
                                )}

                                {id && id !== 'new' && (
                                    <>
                                        <div className="border-t border-gray-100 my-1"></div>
                                        <button
                                            onClick={handleDelete}
                                            className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                        >
                                            <Trash2 className="w-4 h-4 mr-3" />
                                            Supprimer
                                        </button>
                                    </>
                                )}

                                <div className="border-t border-gray-100 my-1"></div>

                                {formData.status === 'accepted' && (
                                    <button
                                        onClick={() => { setShowReviewMenu(!showReviewMenu); setShowActionsMenu(false); }}
                                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                    >
                                        <Star className="w-4 h-4 mr-3 text-yellow-500" />
                                        Demander un avis
                                    </button>
                                )}
                                {/* ReviewMenu removed as component is missing */}

                                <button
                                    onClick={() => { fileInputRef.current?.click(); setShowActionsMenu(false); }}
                                    disabled={importing}
                                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                    {importing ? <Loader2 className="w-4 h-4 mr-3 animate-spin" /> : <Upload className="w-4 h-4 mr-3 text-gray-400" />}
                                    Importer un PDF (Conversion)
                                </button>

                                <button
                                    onClick={() => { document.getElementById('external-pdf-input')?.click(); setShowActionsMenu(false); }}
                                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                    <FileText className="w-4 h-4 mr-3 text-purple-600" />
                                    Importer PDF Externe (Brut)
                                </button>

                            </div>
                        )}
                    </div>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="application/pdf"
                        onChange={handleImportFile}
                    />
                    <input
                        type="file"
                        id="external-pdf-input"
                        className="hidden"
                        accept="application/pdf"
                        onChange={handleExternalImport}
                    />
                </div>
            </div>

            {/* External PDF Mode / Manual Totals */}
            {formData.is_external ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-gray-900 flex items-center">
                            <FileText className="w-5 h-5 mr-2 text-blue-600" />
                            Document Externe (PDF)
                        </h3>
                        <button
                            onClick={() => setFormData(prev => ({ ...prev, is_external: false, original_pdf_url: null }))}
                            className="text-sm text-red-600 hover:text-red-800"
                        >
                            Supprimer / Revenir au mode standard
                        </button>
                    </div>

                    {formData.original_pdf_url && (
                        <div className="mb-8 border border-gray-200 rounded-lg overflow-hidden h-[600px]">
                            <iframe
                                src={formData.original_pdf_url}
                                className="w-full h-full"
                                title="Aperçu PDF"
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-gray-50 p-6 rounded-xl">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Total HT</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="0.01"
                                    className="block w-full pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    value={formData.manual_total_ht}
                                    onChange={(e) => setFormData(prev => ({ ...prev, manual_total_ht: parseFloat(e.target.value) || 0 }))}
                                />
                                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                    <span className="text-gray-500 sm:text-sm">€</span>
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Total TVA</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="0.01"
                                    className="block w-full pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    value={formData.manual_total_tva}
                                    onChange={(e) => setFormData(prev => ({ ...prev, manual_total_tva: parseFloat(e.target.value) || 0 }))}
                                />
                                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                    <span className="text-gray-500 sm:text-sm">€</span>
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Total TTC</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="0.01"
                                    className="block w-full pl-3 pr-8 py-2 border border-blue-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-blue-50 font-bold text-blue-900"
                                    value={formData.manual_total_ttc}
                                    onChange={(e) => setFormData(prev => ({ ...prev, manual_total_ttc: parseFloat(e.target.value) || 0 }))}
                                />
                                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                    <span className="text-gray-500 sm:text-sm">€</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <p className="mt-2 text-sm text-gray-500 italic">
                        * Saisissez les montants manuellement car ils ne sont pas calculés automatiquement depuis le PDF.
                    </p>
                </div>
            ) : null}

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 space-y-8">
                {/* En-tête Devis */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-sm font-medium text-gray-700">Client</label>
                            {formData.client_id && (
                                <button
                                    type="button"
                                    onClick={() => navigate(`/app/clients/${formData.client_id}`)}
                                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                    Voir la fiche client
                                </button>
                            )}
                        </div>
                        <select
                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 mb-4"
                            value={formData.client_id}
                            onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                        >
                            <option value="">Sélectionner un client</option>
                            {clients.map(client => (
                                <option key={client.id} value={client.id}>{client.name}</option>
                            ))}
                        </select>

                        <div className="mb-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Titre / Objet du devis</label>
                            <input
                                type="text"
                                className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Ex: Rénovation Salle de Bain"
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            />
                        </div>
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
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
                        <select
                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            value={formData.status}
                            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        >
                            <option value="draft">Brouillon</option>
                            <option value="sent">Envoyé</option>
                            <option value="accepted">Accepté / Signé</option>
                            <option value="refused">Refusé</option>
                            <option value="billed">Facturé</option>
                            <option value="paid">Payé</option>
                            <option value="cancelled">Annulé</option>
                        </select>
                    </div>
                </div>

                {/* Lignes du devis */}
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        Détails : {tradeConfig.terms.task}s ({tradeConfig.terms.materials})
                    </h3>
                    <div className="space-y-4">
                        {formData.items.map((item, index) => (
                            <div key={item.id} className="flex flex-col sm:flex-row gap-4 items-start border-b border-gray-100 pb-4 last:border-0">
                                <div className="flex-1 w-full space-y-2">
                                    <div className="flex gap-2">
                                        <select
                                            className="w-32 px-2 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50"
                                            value={item.type || 'service'}
                                            onChange={(e) => updateItem(item.id, 'type', e.target.value)}
                                        >
                                            <option value="service">Main d'oeuvre</option>
                                            <option value="material">Matériel</option>
                                        </select>
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
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <span>Coût unitaire (interne) :</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            className="w-24 px-2 py-1 border border-gray-300 rounded text-right"
                                            placeholder="0.00"
                                            value={item.buying_price || ''}
                                            onChange={(e) => updateItem(item.id, 'buying_price', e.target.value)}
                                        />
                                        <span>€</span>
                                    </div>
                                </div>
                                <div className="flex gap-2 w-full sm:w-auto">
                                    <div className="w-20">
                                        <input
                                            type="number"
                                            placeholder="Qté"
                                            min="1"
                                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-right"
                                            value={item.quantity}
                                            onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                                        />
                                    </div>
                                    <div className="w-28">
                                        <input
                                            type="number"
                                            placeholder="Prix U."
                                            min="0"
                                            step="0.01"
                                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-right"
                                            value={item.price}
                                            onChange={(e) => updateItem(item.id, 'price', e.target.value)}
                                        />
                                    </div>
                                    <div className="w-28 py-2 text-right font-medium text-gray-900">
                                        {((parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0)).toFixed(2)} €
                                    </div>
                                    <button
                                        onClick={() => removeItem(item.id)}
                                        className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
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
                    <div className="w-72 space-y-4">
                        {/* MarginGauge removed here as it was used with incorrect props causing crash */}

                        <div className="space-y-3">
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
                </div>

                {/* Signature Display */}
                {signature && (
                    <div className="border-t border-gray-100 pt-6 mt-6">
                        <h4 className="text-sm font-medium text-gray-900 mb-2">Signature du client</h4>
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 inline-block">
                            <img src={signature} alt="Signature Client" className="h-24 object-contain" />
                            <p className="text-xs text-gray-500 mt-2">
                                Signé le {formData.signed_at ? new Date(formData.signed_at).toLocaleDateString() : new Date().toLocaleDateString()}
                            </p>
                        </div>
                    </div>
                )}

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

            {/* Preview Modal */}
            {
                previewUrl && (
                    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
                            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                                <h3 className="font-semibold text-lg text-gray-800 flex items-center">
                                    <Eye className="w-5 h-5 mr-2 text-blue-600" />
                                    Prévisualisation du document
                                </h3>
                                <button
                                    onClick={() => setPreviewUrl(null)}
                                    className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500 hover:text-gray-700"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                            <div className="flex-1 bg-gray-100 p-0 overflow-hidden relative">
                                <iframe
                                    src={previewUrl}
                                    className="w-full h-full border-none"
                                    title="Aperçu PDF"
                                />
                            </div>
                            <div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-white rounded-b-xl">
                                <button
                                    onClick={() => setPreviewUrl(null)}
                                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                                >
                                    Fermer
                                </button>
                                <button
                                    onClick={() => {
                                        handleDownloadPDF(formData.status === 'accepted');
                                        setPreviewUrl(null);
                                    }}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
                                >
                                    <Download className="w-4 h-4 mr-2" />
                                    Télécharger
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Email Preview Modal */}
            {
                emailPreview && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full flex flex-col max-h-[90vh]">
                            <div className="flex items-center justify-between p-4 border-b border-gray-100">
                                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                                    <Mail className="w-5 h-5 mr-2 text-blue-600" />
                                    Prévisualisation de l'email
                                </h3>
                                <button
                                    onClick={() => setEmailPreview(null)}
                                    className="p-1 hover:bg-gray-100 rounded-full"
                                >
                                    <X className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>

                            <div className="p-6 space-y-4 overflow-y-auto">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Pour</label>
                                    <input
                                        type="text"
                                        readOnly
                                        value={emailPreview.email}
                                        className="block w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-600"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Objet</label>
                                    <input
                                        type="text"
                                        value={emailPreview.rawSubject}
                                        onChange={(e) => setEmailPreview({ ...emailPreview, rawSubject: e.target.value })}
                                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                                    <textarea
                                        rows={12}
                                        value={emailPreview.rawBody}
                                        onChange={(e) => setEmailPreview({ ...emailPreview, rawBody: e.target.value })}
                                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-gray-100 flex justify-end gap-3 rounded-b-xl">
                            <button
                                type="button"
                                onClick={() => setEmailPreview(null)}
                                className="px-4 py-2 text-gray-700 hover:bg-gray-50 rounded-lg"
                            >
                                Annuler
                            </button>
                            <button
                                type="button"
                                onClick={() => handleConfirmSendEmail(emailPreview.rawSubject, emailPreview.rawBody)}
                                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg flex items-center"
                            >
                                <Send className="w-4 h-4 mr-2" />
                                Envoyer
                            </button>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default DevisForm;
