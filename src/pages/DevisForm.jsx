import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Plus, Download, Save, Trash2, Printer, Send, Upload, FileText, Check, Calculator, Mic, MicOff, FileCheck, Layers, PenTool, Eye, Star, Loader2, ArrowUp, ArrowDown, Mail, Link, MoreVertical, X, Sparkles } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { generateDevisPDF } from '../utils/pdfGenerator';
import { generateQuoteItems } from '../utils/aiService';
import SignatureModal from '../components/SignatureModal';
import ReviewRequestModal from '../components/ReviewRequestModal';
import MarginGauge from '../components/MarginGauge';

// import { useVoice } from '../hooks/useVoice'; // Removed direct hook usage
import SmartVoiceModal from '../components/SmartVoiceModal'; // Added Smart Modal
import { extractTextFromPDF, extractTextFromDocx, parseQuoteItems } from '../utils/documentParser';
import { getTradeConfig } from '../constants/trades';
import MaterialsCalculator from '../components/MaterialsCalculator';
import ClientSelector from '../components/ClientSelector';
import { getCoordinates, calculateDistance, getZoneFee } from '../utils/geoService';

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

    const [showSmartVoice, setShowSmartVoice] = useState(false); // New Smart Voice State
    const [voiceContext, setVoiceContext] = useState(null); // 'quote_item' or 'note'
    const [activeField, setActiveField] = useState(null); // 'notes' or 'item-description-{index}'
    const [priceLibrary, setPriceLibrary] = useState([]);
    const [showReviewMenu, setShowReviewMenu] = useState(false);
    const [showActionsMenu, setShowActionsMenu] = useState(false);
    const [importing, setImporting] = useState(false);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [emailPreview, setEmailPreview] = useState(null);
    const fileInputRef = React.useRef(null);
    const [showCalculator, setShowCalculator] = useState(false);
    const [activeCalculatorItem, setActiveCalculatorItem] = useState(null);
    const [showReviewRequestModal, setShowReviewRequestModal] = useState(false);
    const [initialStatus, setInitialStatus] = useState('draft');
    const [focusedInput, setFocusedInput] = useState(null);
    const [fullScreenEditItem, setFullScreenEditItem] = useState(null);

    // AI Assistant State
    const [showAIModal, setShowAIModal] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('');
    const [aiLoading, setAiLoading] = useState(false);

    // Voice Dictation for AI (reusing hook from line 29)



    const handleAIGenerate = async () => {
        if (!aiPrompt.trim()) return;

        setAiLoading(true);
        try {
            // Retrieve settings from userProfile (which now includes flattened ai_preferences)
            // Fallback to localStorage for any missing values during transition
            const context = {
                apiKey: userProfile?.openai_api_key || localStorage.getItem('openai_api_key'),
                provider: userProfile?.ai_provider || localStorage.getItem('ai_provider'),
                hourlyRate: userProfile?.ai_hourly_rate || localStorage.getItem('ai_hourly_rate') || '',
                travelFee: {
                    zone1: { radius: userProfile?.zone1_radius || localStorage.getItem('zone1_radius'), price: userProfile?.zone1_price || localStorage.getItem('zone1_price') },
                    zone2: { radius: userProfile?.zone2_radius || localStorage.getItem('zone2_radius'), price: userProfile?.zone2_price || localStorage.getItem('zone2_price') },
                    zone3: { radius: userProfile?.zone3_radius || localStorage.getItem('zone3_radius'), price: userProfile?.zone3_price || localStorage.getItem('zone3_price') }
                },
                instructions: userProfile?.ai_instructions || localStorage.getItem('ai_instructions') || ''
            };

            const items = await generateQuoteItems(aiPrompt, context);
            if (items && items.length > 0) {
                const newItems = items.map(item => ({
                    id: Date.now() + Math.random(),
                    description: item.description,
                    quantity: parseFloat(item.quantity) || 1,
                    unit: item.unit || 'u',
                    price: parseFloat(item.price) || 0,
                    buying_price: 0,
                    type: item.type || 'service'
                }));

                setFormData(prev => ({
                    ...prev,
                    items: [...prev.items, ...newItems]
                }));

                toast.success(`${newItems.length} lignes générées !`);
                setShowAIModal(false);
                setAiPrompt('');
            } else {
                toast.warning("L'IA n'a pas généré de lignes valides.");
            }
        } catch (error) {
            console.error("AI Error:", error);
            toast.error(error.message);
        } finally {
            setAiLoading(false);
        }
    };

    const handleCalculatorApply = (quantity) => {
        if (activeCalculatorItem !== null) {
            updateItem(activeCalculatorItem, 'quantity', quantity);
            setShowCalculator(false);
            setActiveCalculatorItem(null);
            toast.success('Quantité mise à jour');
        }
    };

    useEffect(() => {
        if (user) {
            fetchPriceLibrary();
        }
    }, [user]);

    const fetchPriceLibrary = async () => {
        const { data } = await supabase.from('price_library').select('*');
        setPriceLibrary(data || []);
    };

    // Handle Smart Voice Result
    const handleVoiceResult = (data) => {
        if (voiceContext === 'quote_item') {
            // Add new item from voice
            if (data.description) {
                setFormData(prev => ({
                    ...prev,
                    items: [...prev.items, {
                        id: Date.now(),
                        description: data.description,
                        quantity: data.quantity || 1,
                        unit: 'u', // default unit or try to parse
                        price: data.price || 0,
                        buying_price: 0,
                        type: 'service' // default
                    }]
                }));
                toast.success('Ligne ajoutée !');
            } else {
                toast.warning("Je n'ai pas compris la ligne à ajouter.");
            }
        } else if (voiceContext === 'note') {
            // Append to notes
            if (data.text || data.notes) {
                const textToAdd = data.text || data.notes;
                setFormData(prev => ({
                    ...prev,
                    notes: prev.notes ? prev.notes + '\n' + textToAdd : textToAdd
                }));
            }
        }
        setVoiceContext(null);
    };

    const handleClientChange = async (clientId) => {
        setFormData(prev => ({ ...prev, client_id: clientId }));
        if (!clientId) return;

        const client = clients.find(c => c.id.toString() === clientId.toString());
        if (!client || !userProfile) return;

        // Auto-calculate travel fee if zones are configured
        const hasZones = [1, 2, 3].some(i => userProfile[`zone${i}_radius`] || localStorage.getItem(`zone${i}_radius`));
        if (!hasZones) return;

        // Check addresses
        const clientAddress = [client.address, client.postal_code, client.city].filter(Boolean).join(', ');
        const artisanAddress = [userProfile.address, userProfile.postal_code, userProfile.city].filter(Boolean).join(', ');

        if (!client.address || !userProfile.address) {
            console.log("Missing address for travel calculation");
            return;
        }

        const toastId = toast.loading("Calcul des frais de déplacement...");

        try {
            const clientCoords = await getCoordinates(clientAddress);
            const artisanCoords = await getCoordinates(artisanAddress);

            if (clientCoords && artisanCoords) {
                const distance = calculateDistance(artisanCoords, clientCoords);

                const zones = [];
                for (let i = 1; i <= 3; i++) {
                    const radius = parseFloat(userProfile[`zone${i}_radius`] || localStorage.getItem(`zone${i}_radius`));
                    const price = parseFloat(userProfile[`zone${i}_price`] || localStorage.getItem(`zone${i}_price`));
                    if (!isNaN(radius) && !isNaN(price)) {
                        zones.push({ radius, price });
                    }
                }

                const fee = getZoneFee(distance, zones);

                if (fee > 0) {
                    setFormData(prev => {
                        const existingItemIndex = prev.items.findIndex(item => item.description.toLowerCase().includes('frais de déplacement'));

                        let newItems = [...prev.items];
                        const feeItem = {
                            description: `Frais de déplacement (${Math.round(distance)}km)`,
                            quantity: 1,
                            price: fee,
                            buying_price: 0,
                            type: 'service'
                        };

                        if (existingItemIndex >= 0) {
                            newItems[existingItemIndex] = { ...newItems[existingItemIndex], ...feeItem };
                            toast.success(`Frais de déplacement mis à jour: ${fee}€ (${Math.round(distance)}km)`, { id: toastId });
                        } else {
                            // Insert before first service item or at end? Typically generic fees are at start or end. Let's append.
                            newItems.push({ ...feeItem, id: Date.now() });
                            toast.success(`Frais de déplacement ajoutés: ${fee}€ (${Math.round(distance)}km)`, { id: toastId });
                        }

                        return { ...prev, items: newItems };
                    });
                } else {
                    toast.info(`Aucun frais de zone applicable (${Math.round(distance)}km)`, { id: toastId });
                }
            } else {
                toast.error("Impossible de géolocaliser les adresses.", { id: toastId });
            }
        } catch (err) {
            console.error(err);
            toast.error("Erreur calcul déplacement", { id: toastId });
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
        manual_total_ttc: 0,
        operation_category: 'service',
        vat_on_debits: false
    });

    useEffect(() => {
        if (user) {
            fetchClients().then((loadedClients) => {
                // Handle Navigation State (Client ID or Voice Data or Import File)
                if (location.state) {
                    const { client_id, voiceData, importFile } = location.state;

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
                    }

                    if (importFile) {
                        processImportedFile(importFile);
                    }

                    // Clear state to avoid re-triggering on refresh, but keep client selection if valid
                    // window.history.replaceState({}, document.title); // Removed aggressive clearing to ensure stability during render
                }
            });
            fetchUserProfile();
            if (isEditing) {
                fetchDevis();
            }
        }
    }, [user, id]);

    // Reusable function to process imported file
    const processImportedFile = async (file) => {
        if (!file) return;

        const isPdf = file.type === 'application/pdf';
        const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx');

        if (!isPdf && !isDocx) {
            toast.error('Seuls les fichiers PDF et Word (.docx) sont supportés');
            return;
        }

        try {
            setImporting(true);
            toast.message('Traitement du fichier en cours...');

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

            toast.success("Fichier importé avec succès !");

            // 2. Extract Text (for data filling)
            let text = '';
            if (isPdf) {
                text = await extractTextFromPDF(file);
            } else if (isDocx) {
                text = await extractTextFromDocx(file);
            }

            const { items: newItems, notes: extraNotes } = parseQuoteItems(text);

            // Update Form Data
            setFormData(prev => ({
                ...prev,
                original_pdf_url: publicUrl,
                items: newItems.length > 0 ? newItems : prev.items,
                notes: extraNotes ? (prev.notes ? prev.notes + '\n' + extraNotes : extraNotes) : prev.notes
            }));

            if (newItems.length > 0) {
                toast.success(`${newItems.length} éléments détectés. Mode Conversion activé.`);
            } else {
                toast.info("Aucun élément chiffré détecté (Document image ?), document joint.");
            }

        } catch (error) {
            console.error('Import error:', error);
            toast.error("Erreur lors de l'import : " + error.message);
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const fetchUserProfile = async () => {
        const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
        if (data) {
            // Merge DB preferences into top level if simplified access is needed, 
            // OR keep them in ai_preferences. 
            // In Profile.jsx we flattened them for form state.
            // Here we can keep them in ai_preferences or spread them.
            // Let's spread ai_preferences into userProfile for easier access in handleAIGenerate
            const aiPrefs = data.ai_preferences || {};
            const settings = user.user_metadata?.activity_settings || {};

            setUserProfile({
                ...data,
                ...aiPrefs, // Flatten AI prefs to top level for easy access
                email: user.email,
                ...settings
            });
        }
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
                    items: (data.items || []).map(i => ({ ...i, buying_price: i.buying_price || 0, type: i.type || 'service' })) || [],
                    notes: data.notes || '',
                    status: data.status || 'draft',
                    type: data.type || 'quote',
                    include_tva: data.total_tva > 0 || (data.total_ht === 0 && data.total_tva === 0),
                    original_pdf_url: data.original_pdf_url || null,
                    is_external: data.is_external || false,
                    manual_total_ht: data.is_external ? data.total_ht : 0,
                    manual_total_tva: data.is_external ? data.total_tva : 0,
                    manual_total_ttc: data.is_external ? data.total_ttc : 0,
                    operation_category: data.operation_category || 'service',
                    vat_on_debits: data.vat_on_debits === true
                });
                setSignature(data.signature || null);
                setInitialStatus(data.status || 'draft');
            }
        } catch (error) {
            toast.error('Erreur lors du chargement du devis');
            navigate('/app/devis');
        }
    };

    // --- SECURITY FIX: SUPPORT PRIVATE BUCKET ---
    const [displayPdfUrl, setDisplayPdfUrl] = useState(null);

    useEffect(() => {
        const loadSignedUrl = async () => {
            if (formData.original_pdf_url) {
                const url = formData.original_pdf_url;
                // If it looks like a supabase storage URL for quote_files, we need to sign it
                if (url.includes('/quote_files/')) {
                    try {
                        // Extract path: everything after '/quote_files/'
                        // This handles both old public URLs and potential new formats
                        const path = url.split('/quote_files/')[1];
                        if (path) {
                            // Generate a signed URL for display (valid 1 hour)
                            const { data, error } = await supabase.storage
                                .from('quote_files')
                                .createSignedUrl(decodeURIComponent(path), 3600);

                            if (data?.signedUrl) {
                                setDisplayPdfUrl(data.signedUrl);
                                return;
                            }
                        }
                    } catch (e) {
                        console.error("Error signing URL:", e);
                    }
                }
                // Fallback: use usage as-is (might fail if private, but worth a try or it's external)
                setDisplayPdfUrl(url);
            } else {
                setDisplayPdfUrl(null);
            }
        };
        loadSignedUrl();
    }, [formData.original_pdf_url]);
    // ------------------------------------------

    const tradeConfig = getTradeConfig(userProfile?.trade || 'general');

    const addItem = () => {
        setFormData(prev => ({
            ...prev,
            items: [...prev.items, { id: Date.now(), description: '', quantity: 1, unit: tradeConfig.defaultUnit, price: 0, buying_price: 0, type: 'service' }]
        }));
    };

    const removeItem = (id) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.filter(item => item.id !== id)
        }));
    };

    const moveItem = (index, direction) => {
        setFormData(prev => {
            const newItems = [...prev.items];
            if (direction === 'up' && index > 0) {
                [newItems[index], newItems[index - 1]] = [newItems[index - 1], newItems[index]];
            } else if (direction === 'down' && index < newItems.length - 1) {
                [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
            }
            return { ...prev, items: newItems };
        });
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





    const handleSendQuoteEmail = async () => {
        if (!isEditing) {
            toast.error("Veuillez d'abord enregistrer le devis pour l'envoyer");
            return;
        }

        if (!formData.client_id) {
            toast.error('Veuillez d\'abord sélectionner un client');
            return;
        }

        const selectedClient = clients.find(c => c.id.toString() === formData.client_id.toString());
        if (!selectedClient || !selectedClient.email) {
            toast.error('Le client sélectionné n\'a pas d\'adresse email');
            return;
        }

        try {
            toast.loading("Génération du lien sécurisé...", { id: 'upload-toast' });

            // Ensure public_token exists
            let token = formData.public_token;
            if (!token) {
                token = crypto.randomUUID();
                const { error: tokenError } = await supabase
                    .from('quotes')
                    .update({ public_token: token })
                    .eq('id', id);

                if (tokenError) throw tokenError;

                setFormData(prev => ({ ...prev, public_token: token }));
            }

            const publicUrl = `${window.location.origin}/q/${token}`;
            const isInvoice = formData.type === 'invoice';
            const docRef = `${isInvoice ? 'Facture' : 'Devis'} ${id} `;
            const companyName = userProfile?.company_name || userProfile?.full_name || 'Votre Artisan';

            // Still generate PDF for direct access (optional, but good backup)
            const devisData = {
                id: id,
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

            // We can skip PDF upload if we trust the public link, but let's keep it simply as a backup link or just rely on public portal which has download button.
            // Simplified: Just send Public Link.

            toast.dismiss('upload-toast');
            toast.success("Lien sécurisé généré !");

            const isDeposit = (formData.title || '').toLowerCase().includes('acompte');
            const showReviewRequest = isInvoice && !isDeposit && userProfile?.google_review_url;

            // Template Construction
            // Template Construction
            let subjectPrefix = isInvoice ? '🧾 Facture' : '📄 Proposition';
            if (isInvoice && formData.status === 'paid') {
                subjectPrefix = '🧾 Facture ACQUITTÉE';
            }
            const subject = `${subjectPrefix} : ${formData.title || 'Votre projet'} - ${companyName}`;

            const introduction = isInvoice
                ? `Bonjour ${selectedClient.name},\n\nVoici la facture correspondant à votre projet "${formData.title || 'Travaux'}".`
                : `Bonjour ${selectedClient.name},\n\nSuite à nos échanges, j'ai le plaisir de vous transmettre ma proposition pour votre projet "${formData.title || 'Travaux'}".`;

            const actionText = isInvoice ? 'consulter et télécharger' : 'consulter, télécharger et signer';
            const callToAction = `👉 Vous pouvez ${actionText} le document via ce lien sécurisé :\n${publicUrl}`;

            const reviewSection = showReviewRequest
                ? `\n⭐⭐⭐⭐⭐\nVotre satisfaction est ma priorité.\nSi vous avez apprécié le travail réalisé, un petit avis Google prend 30 secondes et m'aide énormément :\n${userProfile.google_review_url}`
                : '';

            const politeClosing = `Je reste à votre entière disposition pour toute question.\n\nBien cordialement,`;

            const signatureBlock = [
                `${companyName}`,
                `${userProfile?.full_name || ''}`,
                `${userProfile?.phone || ''}`,
                `${userProfile?.website || ''}`
            ].filter(Boolean).join('\n');

            const body = `${introduction}\n\n${callToAction}\n${reviewSection}\n\n${politeClosing}\n\n${signatureBlock}`;

            setEmailPreview({
                email: selectedClient.email,
                rawSubject: subject,
                rawBody: body
            });

        } catch (error) {
            console.error(error);
            toast.dismiss('upload-toast');
            toast.error("Erreur lors de la préparation du document");
        }
    };

    const handleConfirmSendEmail = (subject, body) => {
        if (!emailPreview) return;

        const mailtoUrl = `mailto:${emailPreview.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailtoUrl;
        toast.success('Application de messagerie ouverte');

        // Log interaction
        if (formData.client_id) {
            supabase.from('client_interactions').insert([{
                user_id: user.id,
                client_id: formData.client_id,
                type: 'email',
                date: new Date(),
                details: `Envoi document par email`
            }]).then(({ error }) => {
                if (error) console.error('Error logging email interaction:', error);
                else toast.success('Interaction enregistrée dans l\'historique client');
            });
        }

        setEmailPreview(null);
    };

    const { subtotal, tva, total, totalCost } = calculateTotal();

    // Helper to auto-update CRM status
    const updateClientCRMStatus = async (clientId, quoteStatus) => {
        if (!clientId) return;

        let newStatus = null;
        if (quoteStatus === 'sent') newStatus = 'proposal';
        else if (['accepted', 'signed', 'billed', 'paid'].includes(quoteStatus)) newStatus = 'signed';
        else if (quoteStatus === 'refused') newStatus = 'lost';
        else if (quoteStatus === 'draft') newStatus = 'contacted'; // Working on it

        if (newStatus) {
            try {
                await supabase.from('clients').update({ status: newStatus }).eq('id', clientId);
                // removing toast to avoid noise, silent update is better for "magic" feel
            } catch (err) {
                console.error("Auto-update CRM error", err);
            }
        }
    };

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

            // Auto-update/add to library
            try {
                const toInsert = [];
                const toUpdate = [];
                const seenDescriptions = new Set();

                // Map description to existing item for quick lookup
                const libraryMap = new Map();
                if (priceLibrary && priceLibrary.length > 0) {
                    priceLibrary.forEach(i => {
                        if (i.description) libraryMap.set(i.description.trim().toLowerCase(), i);
                    });
                }

                for (const item of quoteData.items) {
                    const desc = item.description?.trim();
                    if (!desc) continue;

                    const normalizeDesc = desc.toLowerCase();
                    const price = parseFloat(item.price) || 0;

                    if (seenDescriptions.has(normalizeDesc)) continue;
                    seenDescriptions.add(normalizeDesc);

                    const existing = libraryMap.get(normalizeDesc);

                    if (existing) {
                        // Update price if different
                        if (Math.abs((existing.price || 0) - price) > 0.01) {
                            toUpdate.push({
                                ...existing,
                                price: price,
                                updated_at: new Date()
                            });
                        }
                    } else {
                        // Insert new
                        toInsert.push({
                            user_id: user.id,
                            description: desc,
                            price: price,
                            unit: item.unit || 'u',
                            type: item.type || 'service'
                        });
                    }
                }

                let addedCount = 0;
                let updatedCount = 0;

                if (toInsert.length > 0) {
                    const { error: insertError } = await supabase
                        .from('price_library')
                        .insert(toInsert);

                    if (insertError) throw insertError;
                    addedCount = toInsert.length;
                }

                if (toUpdate.length > 0) {
                    const { error: updateError } = await supabase
                        .from('price_library')
                        .upsert(toUpdate);

                    if (updateError) throw updateError;
                    updatedCount = toUpdate.length;
                }

                if (addedCount > 0 || updatedCount > 0) {
                    toast.success(`Bibliothèque : ${addedCount} ajouté(s), ${updatedCount} mis à jour`);
                    fetchPriceLibrary();
                }

            } catch (libErr) {
                console.error("Auto-add library error", libErr);
                toast.error("Erreur sauvegarde bibliothèque : " + (libErr.message || libErr.details));
            }

            toast.success(isEditing ? 'Devis modifié avec succès' : 'Devis créé avec succès');

            // Update CRM
            updateClientCRMStatus(formData.client_id, formData.status);

            // Check if we switched to Paid
            console.log('Status check:', { current: formData.status, initial: initialStatus });
            if (formData.status === 'paid' && initialStatus !== 'paid') {
                console.log('Triggering Review Modal');
                setShowReviewRequestModal(true);
                setInitialStatus('paid');
                // Don't navigate yet, let user see the modal
            } else {
                navigate('/app/devis');
            }
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

            // Ask user if this deposit is for materials (to exclude from Net Result)
            const isForMaterial = window.confirm("Cet acompte est-il destiné principalement à l'achat de fournitures ?\n\nSi OUI, il sera comptabilisé comme 'Matériel' et n'augmentera pas artificiellement votre Résultat Net.\nSi NON, il sera considéré comme du Service (Marge 100%).");

            const depositItem = {
                id: Date.now(),
                description: `Acompte de ${percentage}% sur devis n°${id} - ${formData.title} `,
                quantity: 1,
                unit: 'forfait',
                price: depositAmount,
                buying_price: 0,
                type: isForMaterial ? 'material' : 'service'
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
                notes: `Facture d'acompte générée le ${new Date().toLocaleDateString()}

RÉCAPITULATIF :
• Montant total du devis : ${total.toFixed(2)} € TTC
• Montant de cet acompte : ${depositAmount.toFixed(2)} € TTC
• Reste à payer sur devis : ${(total - depositAmount).toFixed(2)} € TTC

Conditions de règlement : Paiement à réception de facture.`
            };

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

    const handleCreateMaterialDeposit = async () => {
        // Calculate total amount for items with type 'material'
        const materialItems = formData.items.filter(i => i.type === 'material');

        if (materialItems.length === 0) {
            toast.error("Aucun article de type 'Matériel' trouvé dans ce devis.");
            return;
        }

        const materialTotalHT = materialItems.reduce((sum, item) => sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0)), 0);

        if (materialTotalHT <= 0) {
            toast.error("Le montant total du matériel est de 0€.");
            return;
        }

        const materialTotalTTC = formData.include_tva ? materialTotalHT * 1.2 : materialTotalHT;

        if (!window.confirm(`Générer un acompte pour le montant du matériel (${materialTotalTTC.toFixed(2)}€ TTC) ?`)) {
            return;
        }

        try {
            setLoading(true);
            const depositAmount = materialTotalTTC;

            const depositItem = {
                id: Date.now(),
                description: `Acompte Matériel (100%) sur devis n°${id} - ${formData.title}`,
                quantity: 1,
                unit: 'forfait',
                price: 0, // Will be set below
                buying_price: 0,
                type: 'service'
            };

            const depositData = {
                user_id: user.id,
                client_id: formData.client_id,
                client_name: clients.find(c => c.id.toString() === formData.client_id.toString())?.name || 'Client',
                title: `Facture Acompte Matériel - ${formData.title}`,
                date: new Date().toISOString().split('T')[0],
                status: 'billed', // Default to billed as it is a deposit request
                type: 'invoice',
                items: [depositItem],
                parent_id: id,
                notes: `Facture d'acompte matériel générée le ${new Date().toLocaleDateString()}

RÉCAPITULATIF :
• Montant total du devis : ${total.toFixed(2)} € TTC
• Montant de cet acompte : ${depositAmount.toFixed(2)} € TTC
• Reste à payer sur devis : ${(total - depositAmount).toFixed(2)} € TTC

Conditions de règlement : Paiement à réception de facture.`
            };

            if (formData.include_tva) {
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

            toast.success("Facture d'acompte matériel créée !");
            navigate(`/app/devis/${data.id}`);
            setShowActionsMenu(false);

        } catch (error) {
            console.error('Error creating material deposit:', error);
            toast.error("Erreur lors de la création de l'acompte matériel");
        } finally {
            setLoading(false);
        }
    };

    const handleCreateSituation = async () => {
        const situationTitle = window.prompt("Intitulé de la situation (ex: Fin des fondations) ?", "Situation de travaux");
        if (!situationTitle) return;

        const percentageStr = window.prompt("Pourcentage à facturer sur le total TTC ? (ex: 30)", "30");
        if (!percentageStr) return;

        const percentage = parseFloat(percentageStr);
        if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
            toast.error("Pourcentage invalide");
            return;
        }

        try {
            setLoading(true);
            const situationAmount = (total * percentage) / 100;
            const situationItem = {
                id: Date.now(),
                description: `${situationTitle} (${percentage}% sur devis n°${id} - ${formData.title})`,
                quantity: 1,
                unit: 'forfait',
                price: 0, // Calculated below
                buying_price: 0,
                type: 'service'
            };

            const situationData = {
                user_id: user.id,
                client_id: formData.client_id,
                client_name: clients.find(c => c.id.toString() === formData.client_id.toString())?.name || 'Client',
                title: `Facture Situation - ${situationTitle}`,
                date: new Date().toISOString().split('T')[0],
                status: 'billed', // Default to billed/draft? Usually draft but user flow suggests creating it ready. Let's say draft to allow edit? Deposit generates 'billed'. Let's stick to 'draft' or 'sent'. Billed implies valid invoice.
                type: 'invoice',
                items: [situationItem],
                total_ht: 0,
                total_tva: 0,
                total_ttc: 0,
                parent_id: id,
                notes: `Facture de situation générée le ${new Date().toLocaleDateString()} depuis devis ${id}`
            };

            if (formData.include_tva) {
                situationItem.price = situationAmount / 1.2;
                situationData.total_ht = situationItem.price;
                situationData.total_tva = situationAmount - situationItem.price;
                situationData.total_ttc = situationAmount;
            } else {
                situationItem.price = situationAmount;
                situationData.total_ht = situationAmount;
                situationData.total_tva = 0;
                situationData.total_ttc = situationAmount;
            }

            const { data, error } = await supabase
                .from('quotes')
                .insert([situationData])
                .select()
                .single();

            if (error) throw error;

            toast.success("Facture de situation créée !");
            navigate(`/app/devis/${data.id}`);
            setShowActionsMenu(false);

        } catch (error) {
            console.error('Error creating situation:', error);
            toast.error("Erreur lors de la création de la situation");
        } finally {
            setLoading(false);
        }
    };


    const handleCreateClosingInvoice = async () => {
        if (!window.confirm("Générer la facture de clôture ? Cela créera une nouvelle facture reprenant l'ensemble du devis moins les acomptes déjà versés.")) {
            return;
        }

        setLoading(true);
        try {
            // 1. Fetch existing deposits/situations linked to this quote
            const { data: linkedInvoices, error: fetchError } = await supabase
                .from('quotes')
                .select('id, title, date, total_ht, total_ttc, type, status')
                .eq('parent_id', id)
                .neq('status', 'cancelled'); // Ignore cancelled

            if (fetchError) throw fetchError;

            // Filter out self (previous closing invoices)
            const deposits = (linkedInvoices || []).filter(inv =>
                inv.type === 'invoice' &&
                !inv.title?.toLowerCase().includes('clôture')
            );

            // 2. Prepare items: Copy original items
            let finalItems = formData.items.map(item => ({
                ...item,
                id: Date.now() + Math.random(), // New IDs to avoid conflict
                quantity: parseFloat(item.quantity) || 0,
                price: parseFloat(item.price) || 0,
                buying_price: parseFloat(item.buying_price) || 0
            }));

            // 3. Add deduction lines
            const deductionItems = deposits.map(inv => {
                const amountHT = parseFloat(inv.total_ht) || 0;
                return {
                    id: Date.now() + Math.random(),
                    description: `Déduction ${inv.title || 'Acompte'} du ${inv.date ? new Date(inv.date).toLocaleDateString("fr-FR") : 'Date inconnue'}`,
                    quantity: 1,
                    unit: 'forfait',
                    price: -Math.abs(amountHT), // Negative Price HT
                    buying_price: 0,
                    type: 'service'
                };
            });

            finalItems = [...finalItems, ...deductionItems];

            // 4. Calculate totals
            const subtotal = finalItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
            const tva = formData.include_tva ? subtotal * 0.20 : 0;
            const total = subtotal + tva;

            // Create Invoice Data
            const clientName = (clients && clients.length > 0)
                ? (clients.find(c => c.id.toString() === formData.client_id?.toString())?.name || 'Client')
                : 'Client';

            const invoiceData = {
                user_id: user.id,
                client_id: formData.client_id,
                client_name: clientName,
                title: `Facture de Clôture - ${formData.title || 'Projet'}`,
                date: new Date().toISOString().split('T')[0],
                status: 'draft',
                type: 'invoice',
                items: finalItems,
                total_ht: subtotal,
                total_tva: tva,
                total_ttc: total,
                parent_id: id,
                notes: (formData.notes || '') + `\n\nFacture de clôture générée le ${new Date().toLocaleDateString("fr-FR")}`
            };

            const { data, error } = await supabase
                .from('quotes')
                .insert([invoiceData])
                .select()
                .single();

            if (error) throw error;

            toast.success("Facture de clôture générée !");
            navigate(`/app/devis/${data.id}`);
            setShowActionsMenu(false);

        } catch (error) {
            console.error('Error creating closing invoice:', error);
            toast.error("Erreur génération facture : " + (error.message || error.details || "Erreur inconnue"));
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

    const handleDownloadPDF = async (forceInvoice = false) => {
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

            // console.log('Generating PDF with data:', { devisData, selectedClient, user: userProfile });
            await generateDevisPDF(devisData, selectedClient, userProfile, isInvoice);
            toast.success(isInvoice ? 'Facture générée avec succès' : 'PDF généré avec succès');
        } catch (error) {
            console.error('Error generating PDF:', error);
            toast.error('Erreur lors de la génération du PDF : ' + error.message);
        }
    };

    const handlePreview = async () => {
        try {
            if (!userProfile) {
                toast.error("Profil utilisateur en cours de chargement, veuillez patienter...");
                fetchUserProfile(); // Try to fetch again just in case
                return;
            }

            if (!formData.client_id) {
                toast.error('Veuillez sélectionner un client pour prévisualiser le PDF');
                return;
            }

            const selectedClient = clients.find(c => c.id.toString() === formData.client_id.toString());
            if (!selectedClient) {
                toast.error('Client introuvable');
                return;
            }

            const isInvoice = formData.type === 'invoice';
            const devisData = {
                id: isEditing ? id : 'PROVISOIRE',
                ...formData,
                items: formData.items.map(i => ({
                    ...i,
                    quantity: parseFloat(i.quantity) || 0,
                    price: parseFloat(i.price) || 0
                })),
                total_ht: subtotal,
                total_tva: tva,
                total_ttc: total,
                include_tva: formData.include_tva
            };

            // console.log("Generating preview with:", { devisData, selectedClient, userProfile });
            // Use 'bloburl' for better compatibility with iframes
            const url = await generateDevisPDF(devisData, selectedClient, userProfile, isInvoice, 'bloburl');

            if (url) {
                setPreviewUrl(url);
                console.log("Preview URL set (Blob URL)");
            } else {
                throw new Error("La génération du PDF n'a retourné aucune URL");
            }

        } catch (error) {
            console.error('Error handling preview:', error);
            toast.error("Impossible de générer l'aperçu PDF : " + error.message);
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
            updateClientCRMStatus(formData.client_id, 'accepted');
            await handleDownloadPDF(true); // Auto-generate invoice PDF
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
            updateClientCRMStatus(formData.client_id, 'signed');
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
    const handleImportFile = (event) => {
        const file = event.target.files?.[0];
        if (file) {
            processImportedFile(file);
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

            toast.success("PDF stocké avec succès !");

            // 2. Extract Items for Library
            try {
                const text = await extractTextFromPDF(file);
                const { items: extractedItems } = parseQuoteItems(text);

                if (extractedItems.length > 0) {
                    // Reuse Upsert Logic
                    const toInsert = [];
                    const toUpdate = [];
                    const seenDescriptions = new Set();

                    const libraryMap = new Map();
                    if (priceLibrary && priceLibrary.length > 0) {
                        priceLibrary.forEach(i => {
                            if (i.description) libraryMap.set(i.description.trim().toLowerCase(), i);
                        });
                    }

                    for (const item of extractedItems) {
                        const desc = item.description?.trim();
                        if (!desc) continue;

                        const normalizeDesc = desc.toLowerCase();
                        const price = parseFloat(item.price) || 0;

                        if (seenDescriptions.has(normalizeDesc)) continue;
                        seenDescriptions.add(normalizeDesc);

                        const existing = libraryMap.get(normalizeDesc);

                        if (existing) {
                            if (Math.abs((existing.price || 0) - price) > 0.01) {
                                toUpdate.push({
                                    ...existing,
                                    price: price,
                                    updated_at: new Date()
                                });
                            }
                        } else {
                            toInsert.push({
                                user_id: user.id,
                                description: desc,
                                price: price,
                                unit: item.unit || 'u',
                                type: item.type || 'service'
                            });
                        }
                    }

                    let addedCount = 0;
                    let updatedCount = 0;

                    if (toInsert.length > 0) {
                        const { error: insertError } = await supabase.from('price_library').insert(toInsert);
                        if (!insertError) addedCount = toInsert.length;
                    }
                    if (toUpdate.length > 0) {
                        const { error: updateError } = await supabase.from('price_library').upsert(toUpdate);
                        if (!updateError) updatedCount = toUpdate.length;
                    }

                    if (addedCount > 0 || updatedCount > 0) {
                        toast.success(`Extraction : ${addedCount} articles ajoutés, ${updatedCount} mis à jour en bibliothèque.`);
                        fetchPriceLibrary();
                    }
                }
            } catch (extractError) {
                console.error("Extraction error during external import:", extractError);
                toast.warning("Le PDF est importé, mais l'extraction des articles a échoué.");
            }

            // Update Form Data for External Mode
            setFormData(prev => ({
                ...prev,
                original_pdf_url: publicUrl,
                is_external: true,
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
                    <ArrowLeft className="w-5 h-5 sm:mr-2" />
                    <span className="hidden sm:inline">Retour</span>
                </button>

                {/* Type Switch - Only for new or drafts? Or allows conversion? allow anytime for flexibility */}
                <div className="flex bg-gray-100 p-1 rounded-lg mx-2 sm:mx-4">
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
                        Fac<span className="hidden sm:inline">ture</span>
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
                        className="flex items-center px-3 sm:px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm"
                    >
                        <Save className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">{loading ? '...' : 'Enregistrer'}</span>
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
                                    <>
                                        <button
                                            onClick={handleCreateDeposit}
                                            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 bg-blue-50/50"
                                        >
                                            <FileCheck className="w-4 h-4 mr-3 text-blue-600" />
                                            Générer Facture d'Acompte
                                        </button>
                                        <button
                                            onClick={handleCreateMaterialDeposit}
                                            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 bg-orange-50/50"
                                        >
                                            <FileCheck className="w-4 h-4 mr-3 text-orange-600" />
                                            Générer Acompte Matériel
                                        </button>
                                        <button
                                            onClick={handleCreateSituation}
                                            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 bg-purple-50/50"
                                        >
                                            <Layers className="w-4 h-4 mr-3 text-purple-600" />
                                            Créer Situation de Travaux
                                        </button>
                                        <button
                                            onClick={handleCreateClosingInvoice}
                                            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 bg-green-50/50"
                                        >
                                            <Check className="w-4 h-4 mr-3 text-green-600" />
                                            Générer Facture de Clôture
                                        </button>
                                    </>
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

                                {['accepted', 'paid', 'billed'].includes(formData.status) && (
                                    <button
                                        onClick={() => { setShowReviewRequestModal(true); setShowActionsMenu(false); }}
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
                                    Importer (PDF / Word)
                                </button>

                                <button
                                    onClick={() => { document.getElementById('external-pdf-input')?.click(); setShowActionsMenu(false); }}
                                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                    <FileText className="w-4 h-4 mr-3 text-purple-600" />
                                    Importer Externe (Brut)
                                </button>

                            </div>
                        )}
                    </div>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="application/pdf, .docx, application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        onChange={handleImportFile}
                    />
                    <input
                        type="file"
                        id="external-pdf-input"
                        className="hidden"
                        accept="application/pdf, .docx, application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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

                    {displayPdfUrl && (
                        <div className="mb-8 border border-gray-200 rounded-lg overflow-hidden h-[600px] flex flex-col">
                            <object
                                data={displayPdfUrl}
                                type="application/pdf"
                                className="w-full h-full flex-grow"
                            >
                                <div className="flex items-center justify-center h-full bg-gray-50 flex-col">
                                    <p className="text-gray-500 mb-4">L'aperçu n'est pas disponible directement.</p>
                                    <a
                                        href={displayPdfUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                    >
                                        <Download className="w-4 h-4 mr-2" />
                                        Ouvrir le PDF
                                    </a>
                                </div>
                            </object>
                            <div className="p-2 bg-gray-50 text-center text-sm border-t border-gray-200">
                                <a
                                    href={displayPdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 hover:underline flex items-center justify-center gap-2"
                                >
                                    <Eye className="w-4 h-4" />
                                    Ouvrir le document complet dans un nouvel onglet
                                </a>
                            </div>
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
                        <div className="mb-4">
                            <ClientSelector
                                clients={clients}
                                selectedClientId={formData.client_id}
                                onChange={handleClientChange}
                                onCreateNew={() => navigate('/app/clients/new')}
                            />
                        </div>

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
                        {formData.type !== 'invoice' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Validité jusqu'au</label>
                                <input
                                    type="date"
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    value={formData.valid_until}
                                    onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                                />
                            </div>
                        )}
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
                    {/* Factur-X Options */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie (Factur-X)</label>
                        <select
                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 mb-2"
                            value={formData.operation_category}
                            onChange={(e) => setFormData({ ...formData, operation_category: e.target.value })}
                        >
                            <option value="service">Prestation de services</option>
                            <option value="goods">Livraison de biens</option>
                            <option value="mixed">Mixte</option>
                        </select>
                        <div className="flex items-center gap-2 mt-2">
                            <input
                                type="checkbox"
                                id="vat_on_debits"
                                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                checked={formData.vat_on_debits}
                                onChange={(e) => setFormData({ ...formData, vat_on_debits: e.target.checked })}
                            />
                            <label htmlFor="vat_on_debits" className="text-sm text-gray-700">
                                Option TVA sur les débits
                            </label>
                        </div>
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
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <select
                                            className="w-full sm:w-32 px-2 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50"
                                            value={item.type || 'service'}
                                            onChange={(e) => updateItem(item.id, 'type', e.target.value)}
                                        >
                                            <option value="service">Main d'oeuvre</option>
                                            <option value="material">Matériel</option>
                                        </select>
                                        <div className="flex-1 relative">
                                            <textarea
                                                placeholder="Description"
                                                rows={3}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg pr-8 resize-y text-sm"
                                                value={item.description}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    updateItem(item.id, 'description', val);

                                                    // Auto-detect type
                                                    if (val.toLowerCase().match(/fourniture|matériel|materiel|pièce|consommable/)) {
                                                        const currentType = item.type || 'service';
                                                        if (currentType === 'service') {
                                                            updateItem(item.id, 'type', 'material');
                                                        }
                                                    }

                                                    // Auto-price logic (Exact Match)
                                                    const libraryItem = priceLibrary.find(lib => lib.description === val);
                                                    if (libraryItem) {
                                                        updateItem(item.id, 'price', libraryItem.price);
                                                        // Also sync type from library if it exists
                                                        if (libraryItem.type) {
                                                            updateItem(item.id, 'type', libraryItem.type);
                                                        }
                                                    }
                                                }}
                                                onFocus={(e) => {
                                                    if (window.innerWidth < 1024) {
                                                        e.target.blur();
                                                        setFullScreenEditItem(item.id);
                                                    } else {
                                                        setFocusedInput(`item-${item.id}`);
                                                    }
                                                }}
                                                onBlur={() => setTimeout(() => setFocusedInput(null), 200)}
                                                required
                                            />

                                            {/* Custom Suggestions (Price Library) */}
                                            {focusedInput === `item-${item.id}` && item.description && item.description.length > 1 && !priceLibrary.some(p => p.description === item.description) && (
                                                (() => {
                                                    const matches = priceLibrary.filter(lib =>
                                                        lib.description.toLowerCase().includes(item.description.toLowerCase())
                                                    ).slice(0, 5);

                                                    if (matches.length === 0) return null;

                                                    return (
                                                        <div className="absolute z-20 w-full bg-white border border-gray-200 shadow-lg rounded-b-lg mt-1 overflow-hidden">
                                                            {matches.map(lib => (
                                                                <button
                                                                    key={lib.id}
                                                                    type="button"
                                                                    className="block w-full text-left px-4 py-2 hover:bg-blue-50 text-sm border-b border-gray-50 last:border-0"
                                                                    onClick={() => {
                                                                        updateItem(item.id, 'description', lib.description);
                                                                        updateItem(item.id, 'price', lib.price);
                                                                    }}
                                                                >
                                                                    <span className="font-medium text-gray-900">{lib.description}</span>
                                                                    <span className="text-gray-500 ml-2 text-xs">{lib.price} €</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    );
                                                })()
                                            )}

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    // For inline editing of existing item, we might need a different context 
                                                    // or just use generic "update item" logic? 
                                                    // For now, let's keep it simple: Add New Item via Voice is better supported.
                                                    // If user wants to replace description, they can type.
                                                    // Or we can open modal to "Replace Description"?
                                                    // Let's remove the inline mic for now as per request "replace mic button" 
                                                    // and rely on the big "Add Item via Voice" button we will add.
                                                    // OR: Use modal to set description only.
                                                    // Let's try to map it to "note" context but applied to this item?
                                                    // Complex. Let's just remove the inline mic to declutter, 
                                                    // or replace with a small "Sparkles" that opens modal for this specific item?
                                                    // User said "replace mic button".
                                                    // Let's replace with a small button that says "IA" or Sparkles icon
                                                    // and opens modal with context 'item_description_update' -> updateItem?
                                                    // For MVP "Free AI", adding new lines is the main feature.
                                                    // I will remove this inline mic to simplify UI as requested.
                                                }}
                                                className="hidden" // Hiding inline mic
                                                title="Dicter"
                                            >
                                                {/* <Mic className="w-4 h-4" /> */}
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
                                    <div className="w-20 relative">
                                        <input
                                            type="number"
                                            placeholder="Qté"
                                            min="0"
                                            step="0.01"
                                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-right pr-2"
                                            value={item.quantity}
                                            onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                                        />
                                        {userProfile?.enable_calculator !== false && (
                                            <button
                                                type="button"
                                                onClick={() => { setActiveCalculatorItem(item.id); setShowCalculator(true); }}
                                                className="absolute -top-3 -right-2 bg-blue-100 text-blue-600 rounded-full p-1 shadow-sm hover:bg-blue-200"
                                                title="Calculatrice Matériaux"
                                            >
                                                <Calculator className="w-3 h-3" />
                                            </button>
                                        )}
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
                                    <div className="flex flex-col gap-1">
                                        <button
                                            type="button"
                                            onClick={() => moveItem(index, 'up')}
                                            disabled={index === 0}
                                            className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50 disabled:opacity-30 disabled:hover:bg-transparent"
                                            title="Monter"
                                        >
                                            <ArrowUp className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => moveItem(index, 'down')}
                                            disabled={index === formData.items.length - 1}
                                            className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50 disabled:opacity-30 disabled:hover:bg-transparent"
                                            title="Descendre"
                                        >
                                            <ArrowDown className="w-4 h-4" />
                                        </button>
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

                    <div className="mt-4 flex gap-4">
                        <button
                            onClick={addItem}
                            className="flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
                        >
                            <Plus className="w-4 h-4 mr-1" />
                            Ajouter une ligne
                        </button>



                        <button
                            onClick={() => setShowAIModal(true)}
                            className="flex items-center text-sm font-medium text-purple-600 hover:text-purple-800 bg-purple-50 px-3 py-1 rounded-full border border-purple-100 shadow-sm hover:shadow-md transition-all"
                        >
                            <Sparkles className="w-3 h-3 mr-2" />
                            Assistant Devis IA
                        </button>
                    </div>
                </div>

                {/* AI Modal */}
                {showAIModal && (
                    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-200">
                            <div className="p-6 bg-gradient-to-r from-purple-600 to-indigo-600">
                                <h3 className="text-xl font-bold text-white flex items-center">
                                    <Sparkles className="w-6 h-6 mr-3" />
                                    Assistant Intelligent
                                </h3>
                                <p className="text-purple-100 text-sm mt-1">
                                    Décrivez les travaux et l'IA générera le devis pour vous.
                                </p>
                            </div>

                            <div className="p-6">
                                <textarea
                                    className="w-full h-32 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
                                    placeholder="Ex: Rénovation complète sdb 6m2 avec carrelage métro, douche italienne, meuble vasque..."
                                    value={aiPrompt}
                                    onChange={(e) => setAiPrompt(e.target.value)}
                                    autoFocus
                                />
                                <div className="mt-2 flex justify-between items-center text-xs text-gray-400">
                                    <span>
                                        Décrivez les travaux ci-dessus.
                                    </span>
                                    <span>{aiPrompt.length} caractères</span>
                                </div>

                                <div className="mt-6 flex justify-end gap-3">
                                    <button
                                        onClick={() => setShowAIModal(false)}
                                        className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                                    >
                                        Annuler
                                    </button>
                                    <button
                                        onClick={handleAIGenerate}
                                        disabled={aiLoading || !aiPrompt.trim()}
                                        className="px-6 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center"
                                    >
                                        {aiLoading ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Génération...
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles className="w-4 h-4 mr-2" />
                                                Générer
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

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
                            onClick={() => {
                                setVoiceContext('note');
                                setShowSmartVoice(true);
                            }}
                            className="p-1 rounded-full hover:bg-gray-100 text-indigo-500 hover:text-indigo-700"
                            title="Dicter une note"
                        >
                            <Sparkles className="w-4 h-4" />
                        </button>
                    </div>
                    <textarea
                        rows={3}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Conditions de paiement, validité du devis..."
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    />
                    {/* Auto-calculate Material Deposit Hint */}
                    {formData.type !== 'invoice' && formData.items.some(i => i.type === 'material') && (
                        <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700 flex items-start gap-2">
                            <div className="mt-0.5"><Star className="w-4 h-4" /></div>
                            <div>
                                <strong>Note automatique : Acompte Matériel</strong><br />
                                Le devis contient du matériel. Une mention sera ajoutée automatiquement au PDF :<br />
                                <span className="italic opacity-80">
                                    "Un acompte correspondant à la totalité du matériel (
                                    {(() => {
                                        const mItems = formData.items.filter(i => i.type === 'material');
                                        const mHT = mItems.reduce((sum, i) => sum + ((parseFloat(i.price) || 0) * (parseFloat(i.quantity) || 0)), 0);
                                        const mTTC = formData.include_tva ? mHT * 1.2 : mHT;
                                        return mTTC.toFixed(2);
                                    })()} € TTC) est requis à la signature."
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <SmartVoiceModal
                isOpen={showSmartVoice}
                onClose={() => setShowSmartVoice(false)}
                onResult={handleVoiceResult}
                context={voiceContext}
            />

            <MaterialsCalculator
                isOpen={showCalculator}
                onClose={() => setShowCalculator(false)}
                onApply={handleCalculatorApply}
            />

            {/* Signature Modal */}
            <SignatureModal
                isOpen={showSignatureModal}
                onClose={() => setShowSignatureModal(false)}
                onSave={handleSignatureSave}
            />

            <ReviewRequestModal
                isOpen={showReviewRequestModal}
                onClose={() => {
                    setShowReviewRequestModal(false);
                    navigate('/app/devis');
                }}
                client={clients.find(c => c.id == formData.client_id)}
                userProfile={userProfile}
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
            {/* Full Screen Description Editor (Mobile) */}
            {
                fullScreenEditItem && (
                    (() => {
                        const item = formData.items.find(i => i.id === fullScreenEditItem);
                        if (!item) {
                            // reset if item not found (e.g. deleted)
                            if (fullScreenEditItem) setFullScreenEditItem(null);
                            return null;
                        }
                        const itemIndex = formData.items.findIndex(i => i.id === item.id);

                        return (
                            <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in slide-in-from-bottom duration-200">
                                {/* Header */}
                                <div className="flex items-center justify-between p-4 border-b border-gray-100 shadow-sm bg-white safe-area-top">
                                    <button
                                        onClick={() => setFullScreenEditItem(null)}
                                        className="text-gray-500 p-2 hover:bg-gray-100 rounded-full"
                                    >
                                        <ArrowLeft className="w-6 h-6" />
                                    </button>
                                    <h3 className="font-semibold text-lg">Description</h3>
                                    <button
                                        onClick={() => setFullScreenEditItem(null)}
                                        className="text-blue-600 font-medium px-4 py-2 bg-blue-50 rounded-lg hover:bg-blue-100"
                                    >
                                        Valider
                                    </button>
                                </div>

                                {/* Suggestions Area (Sticky under header) */}
                                {(() => {
                                    const matches = priceLibrary.filter(lib =>
                                        lib.description.toLowerCase().includes((item.description || '').toLowerCase())
                                    ).slice(0, 10);

                                    if (matches.length > 0) {
                                        return (
                                            <div className="bg-blue-50/50 border-b border-blue-100 overflow-x-auto">
                                                <div className="flex p-3 gap-3">
                                                    {matches.map(lib => (
                                                        <button
                                                            key={lib.id}
                                                            onClick={() => {
                                                                updateItem(item.id, 'description', lib.description);
                                                                updateItem(item.id, 'price', lib.price);
                                                            }}
                                                            className="flex-shrink-0 bg-white border border-blue-200 rounded-lg px-4 py-2 text-left shadow-sm min-w-[200px]"
                                                        >
                                                            <div className="font-medium text-blue-900 truncate">{lib.description}</div>
                                                            <div className="text-blue-500 text-xs">{lib.price} €</div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}

                                {/* Text Area */}
                                <div className="flex-1 p-4 relative bg-white">
                                    <textarea
                                        className="w-full h-full text-lg resize-none outline-none placeholder-gray-300 font-sans leading-relaxed"
                                        placeholder="Saisissez la description détaillée..."
                                        value={item.description}
                                        onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                                        autoFocus
                                    />

                                    {/* Dictation Button Floating */}
                                    <button
                                        type="button"
                                        onClick={() => toggleDictation(`item-description-${itemIndex}`)}
                                        className={`absolute bottom-8 right-6 p-4 rounded-full shadow-xl transition-all active:scale-95 ${isListening && activeField === `item-description-${itemIndex}`
                                            ? 'bg-red-500 text-white animate-pulse ring-4 ring-red-200'
                                            : 'bg-blue-600 text-white hover:bg-blue-700'
                                            }`}
                                    >
                                        <Mic className="w-6 h-6" />
                                    </button>
                                </div>
                            </div>
                        );
                    })()
                )
            }
        </div >
    );
};

export default DevisForm;
