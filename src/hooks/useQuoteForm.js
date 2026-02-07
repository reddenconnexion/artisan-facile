import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { getTradeConfig } from '../constants/trades';
import { getCoordinates, calculateDistance, getZoneFee } from '../utils/geoService';

/**
 * Hook personnalisé pour gérer toute la logique du formulaire de devis
 * Cela permet de :
 * - Réduire la taille du composant DevisForm
 * - Réutiliser la logique si nécessaire
 * - Faciliter les tests
 */
export function useQuoteForm() {
    const navigate = useNavigate();
    const { id } = useParams();
    const location = useLocation();
    const { user } = useAuth();
    const isEditing = !!id && id !== 'new';

    // États principaux
    const [loading, setLoading] = useState(false);
    const [clients, setClients] = useState([]);
    const [userProfile, setUserProfile] = useState(null);
    const [priceLibrary, setPriceLibrary] = useState([]);
    const [signature, setSignature] = useState(null);
    const [initialStatus, setInitialStatus] = useState('draft');

    // Données du formulaire
    const [formData, setFormData] = useState({
        client_id: '',
        title: '',
        public_token: '',
        date: new Date().toISOString().split('T')[0],
        valid_until: '',
        items: [{ id: 1, description: '', quantity: 1, price: 0, buying_price: 0, type: 'service' }],
        notes: '',
        status: 'draft',
        type: 'quote',
        include_tva: true,
        original_pdf_url: null,
        is_external: false,
        manual_total_ht: 0,
        manual_total_tva: 0,
        manual_total_ttc: 0,
        operation_category: 'service',
        vat_on_debits: false,
        parent_quote_id: null,
        amendment_details: {},
        parent_quote_data: null // Pour l'affichage
    });

    // Configuration métier
    const tradeConfig = useMemo(() =>
        getTradeConfig(userProfile?.trade || 'general'),
        [userProfile?.trade]
    );

    // Calcul des totaux (mémorisé pour éviter les recalculs inutiles)
    const totals = useMemo(() => {
        if (formData.is_external) {
            return {
                subtotal: parseFloat(formData.manual_total_ht) || 0,
                tva: parseFloat(formData.manual_total_tva) || 0,
                total: parseFloat(formData.manual_total_ttc) || 0,
                totalCost: 0
            };
        }
        const subtotal = formData.items.reduce(
            (sum, item) => sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0)),
            0
        );
        const totalCost = formData.items.reduce(
            (sum, item) => sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.buying_price) || 0)),
            0
        );
        const tva = formData.include_tva ? subtotal * 0.20 : 0;
        const total = subtotal + tva;
        return { subtotal, tva, total, totalCost };
    }, [formData.items, formData.include_tva, formData.is_external, formData.manual_total_ht, formData.manual_total_tva, formData.manual_total_ttc]);

    // Fonctions de fetch (mémorisées pour éviter les re-renders)
    const fetchClients = useCallback(async () => {
        const { data } = await supabase.from('clients').select('*');
        setClients(data || []);
        return data || [];
    }, []);

    const fetchUserProfile = useCallback(async () => {
        if (!user?.id) return;
        const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
        if (data) {
            const aiPrefs = data.ai_preferences || {};
            const settings = user.user_metadata?.activity_settings || {};
            setUserProfile({
                ...data,
                ...aiPrefs,
                email: user.email,
                ...settings
            });
        }
    }, [user]);

    const fetchPriceLibrary = useCallback(async () => {
        const { data } = await supabase.from('price_library').select('*');
        setPriceLibrary(data || []);
    }, []);

    const fetchDevis = useCallback(async () => {
        if (!id || id === 'new') return;
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
                    items: (data.items || []).map(i => ({
                        ...i,
                        buying_price: i.buying_price || 0,
                        type: i.type || 'service'
                    })),
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
                    vat_on_debits: data.vat_on_debits === true,
                    last_followup_at: data.last_followup_at || null,
                    updated_at: data.updated_at || null,
                    parent_quote_id: data.parent_quote_id || null,
                    amendment_details: data.amendment_details || {}
                });

                // Fetch Parent Quote Data if needed
                if (data.parent_quote_id) {
                    const { data: parentData } = await supabase
                        .from('quotes')
                        .select('id, total_ttc, total_ht, items, date, title')
                        .eq('id', data.parent_quote_id)
                        .single();
                    if (parentData) {
                        setFormData(prev => ({ ...prev, parent_quote_data: parentData }));
                    }
                }

                setSignature(data.signature || null);
                setInitialStatus(data.status || 'draft');
            }
        } catch (error) {
            toast.error('Erreur lors du chargement du devis');
            navigate('/app/devis');
        }
    }, [id, navigate]);

    // Gestion des items
    const addItem = useCallback(() => {
        setFormData(prev => ({
            ...prev,
            items: [...prev.items, {
                id: Date.now(),
                description: '',
                quantity: 1,
                unit: tradeConfig.defaultUnit,
                price: 0,
                buying_price: 0,
                type: 'service'
            }]
        }));
    }, [tradeConfig.defaultUnit]);

    const removeItem = useCallback((itemId) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.filter(item => item.id !== itemId)
        }));
    }, []);

    const moveItem = useCallback((index, direction) => {
        setFormData(prev => {
            const newItems = [...prev.items];
            if (direction === 'up' && index > 0) {
                [newItems[index], newItems[index - 1]] = [newItems[index - 1], newItems[index]];
            } else if (direction === 'down' && index < newItems.length - 1) {
                [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
            }
            return { ...prev, items: newItems };
        });
    }, []);

    const updateItem = useCallback((itemId, field, value) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.map(item =>
                item.id === itemId ? { ...item, [field]: value } : item
            )
        }));
    }, []);

    // Calcul automatique des frais de déplacement
    const calculateTravelFee = useCallback(async (clientId) => {
        if (!clientId) return;

        const client = clients.find(c => c.id.toString() === clientId.toString());
        if (!client || !userProfile) return;

        const hasZones = [1, 2, 3].some(i =>
            userProfile[`zone${i}_radius`] || localStorage.getItem(`zone${i}_radius`)
        );
        if (!hasZones) return;

        const clientAddress = [client.address, client.postal_code, client.city].filter(Boolean).join(', ');
        const artisanAddress = [userProfile.address, userProfile.postal_code, userProfile.city].filter(Boolean).join(', ');

        if (!client.address || !userProfile.address) return;

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
                        const existingItemIndex = prev.items.findIndex(item =>
                            item.description.toLowerCase().includes('frais de déplacement')
                        );

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
    }, [clients, userProfile]);

    // Changement de client avec calcul automatique des frais
    const handleClientChange = useCallback(async (clientId) => {
        setFormData(prev => ({ ...prev, client_id: clientId }));
        if (clientId) {
            await calculateTravelFee(clientId);
        }
    }, [calculateTravelFee]);

    // Mise à jour du statut CRM client
    const updateClientCRMStatus = useCallback(async (clientId, quoteStatus) => {
        if (!clientId) return;

        let newStatus = null;
        if (quoteStatus === 'sent') newStatus = 'proposal';
        else if (['accepted', 'signed', 'billed', 'paid'].includes(quoteStatus)) newStatus = 'signed';
        else if (quoteStatus === 'refused') newStatus = 'lost';
        else if (quoteStatus === 'draft') newStatus = 'contacted';

        if (newStatus) {
            try {
                await supabase.from('clients').update({ status: newStatus }).eq('id', clientId);
            } catch (err) {
                console.error("Auto-update CRM error", err);
            }
        }
    }, []);

    // Effet d'initialisation
    useEffect(() => {
        if (user) {
            fetchClients().then((loadedClients) => {
                if (location.state) {
                    const { client_id, voiceData, parent_quote_id } = location.state;

                    const initAmendment = async () => {
                        // Initialization for Amendment
                        if (parent_quote_id) {
                            const { data: parentQuote } = await supabase
                                .from('quotes')
                                .select('*')
                                .eq('id', parent_quote_id)
                                .single();

                            if (parentQuote) {
                                setFormData(prev => ({
                                    ...prev,
                                    client_id: parentQuote.client_id,
                                    title: `Avenant - ${parentQuote.title}`,
                                    type: 'amendment',
                                    parent_quote_id: parentQuote.id,
                                    items: [], // Start empty for amendment (delta)
                                    status: 'draft',
                                    parent_quote_data: parentQuote // Store parent data for display
                                }));
                                toast.info("Création d'un avenant liée au devis #" + parentQuote.id);
                            }
                        }
                    };
                    initAmendment();

                    if (client_id && loadedClients) {
                        const foundClient = loadedClients.find(c => c.id.toString() === client_id.toString());
                        if (foundClient) {
                            setFormData(prev => ({ ...prev, client_id: foundClient.id }));
                        }
                    }

                    if (voiceData) {
                        const { clientName, notes } = voiceData;
                        if (clientName && loadedClients) {
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
                            }
                        }
                    }
                }
            });
            fetchUserProfile();
            fetchPriceLibrary();
            if (isEditing) {
                fetchDevis();
            }
        }
    }, [user, id, isEditing, location.state, fetchClients, fetchUserProfile, fetchPriceLibrary, fetchDevis]);

    return {
        // États
        loading,
        setLoading,
        clients,
        userProfile,
        priceLibrary,
        signature,
        setSignature,
        initialStatus,
        setInitialStatus,
        formData,
        setFormData,
        tradeConfig,
        isEditing,
        id,
        user,
        navigate,

        // Totaux calculés
        ...totals,

        // Fonctions de fetch
        fetchClients,
        fetchUserProfile,
        fetchPriceLibrary,
        fetchDevis,

        // Gestion des items
        addItem,
        removeItem,
        moveItem,
        updateItem,

        // Autres fonctions
        handleClientChange,
        updateClientCRMStatus,
        calculateTravelFee
    };
}
