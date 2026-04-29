import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Plus, Download, Save, Trash2, Printer, Send, Upload, FileText, Check, Calculator, Mic, MicOff, FileCheck, Layers, PenTool, Eye, Star, Loader2, ArrowUp, ArrowDown, Mail, Link, MoreVertical, X, Sparkles, Copy, ExternalLink, ZoomIn, ZoomOut, Clock, Info } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useTestMode } from '../context/TestModeContext';
import { toast } from 'sonner';
import { generateDevisPDF } from '../utils/pdfGenerator';
import { generateQuoteItems } from '../utils/aiService';
import { checkLimit } from '../utils/planLimits';
import { useConfirm } from '../context/ConfirmContext';
import { recordFollowUp, getFollowUpSettings } from '../utils/followUpService';
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
import PaymentSchedule from '../components/PaymentSchedule';
import AmendmentFields from '../components/AmendmentFields'; // New Component
import InvoiceTransmissionStatus from '../components/InvoiceTransmissionStatus';
import { useAutoSave, getDraft } from '../hooks/useAutoSave';
import { useInvalidateCache } from '../hooks/useDataCache';
import { usePushNotifications } from '../hooks/usePushNotifications';
import QuoteViewHistory from '../components/QuoteViewHistory';
import SituationModal from '../components/SituationModal';
import AITrialOfferModal from '../components/AITrialOfferModal';
import AITrialComparisonModal from '../components/AITrialComparisonModal';

const DevisForm = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const location = useLocation();
    const confirm = useConfirm();
    const { user } = useAuth();
    const { isTestMode, captureEmail } = useTestMode();
    const isEditing = !!id && id !== 'new';
    const [loading, setLoading] = useState(false);

    // Bandeau d'aide premier devis
    const tipDismissKey = user ? `devis_tip_dismissed_${user.id}` : null;
    const [showFirstDevisTip, setShowFirstDevisTip] = useState(() => {
        if (!tipDismissKey || (!!id && id !== 'new')) return false;
        return localStorage.getItem(tipDismissKey) !== '1';
    });
    const dismissDevisTip = () => {
        if (tipDismissKey) localStorage.setItem(tipDismissKey, '1');
        setShowFirstDevisTip(false);
    };
    const [dataLoaded, setDataLoaded] = useState(!isEditing);
    const [clients, setClients] = useState([]);
    const [userProfile, setUserProfile] = useState(null);
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [signature, setSignature] = useState(null);
    const { invalidateQuotes, invalidateQuote } = useInvalidateCache();
    const { isSupported: isPushSupported, isSubscribed: isPushSubscribed, subscribe: subscribePush } = usePushNotifications();

    const [showSmartVoice, setShowSmartVoice] = useState(false); // New Smart Voice State
    const [voiceContext, setVoiceContext] = useState(null); // 'quote_item' or 'note'
    const [activeField, setActiveField] = useState(null); // 'notes' or 'item-description-{index}'
    const [priceLibrary, setPriceLibrary] = useState([]);
    const [showReviewMenu, setShowReviewMenu] = useState(false);
    const [showActionsMenu, setShowActionsMenu] = useState(false);
    const [importing, setImporting] = useState(false);
    const [showImportZone, setShowImportZone] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [emailPreview, setEmailPreview] = useState(null);
    const fileInputRef = useRef(null);
    // Guard to prevent useEffect re-run when user object reference changes (e.g. auth token refresh)
    // without the actual user.id or quote id changing.
    const initKeyRef = useRef(null);
    const [showCalculator, setShowCalculator] = useState(false);
    const [activeCalculatorItem, setActiveCalculatorItem] = useState(null);
    const [showReviewRequestModal, setShowReviewRequestModal] = useState(false);
    const [initialStatus, setInitialStatus] = useState('draft');
    const [focusedInput, setFocusedInput] = useState(null);
    const [fullScreenEditItem, setFullScreenEditItem] = useState(null);
    const [showAdvancedQuoteOptions, setShowAdvancedQuoteOptions] = useState(false);
    const [isExiting, setIsExiting] = useState(false);
    const [showSendSuccess, setShowSendSuccess] = useState(false);

    // Follow-up state
    const [followUpSteps, setFollowUpSteps] = useState([]);
    const [markingFollowUp, setMarkingFollowUp] = useState(false);

    // AI Assistant State
    const [showAIModal, setShowAIModal] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState([]);
    const [aiDuration, setAiDuration] = useState(null);
    const [showAISuggestions, setShowAISuggestions] = useState(false);

    // Client Presence State
    const [isClientOnline, setIsClientOnline] = useState(false);

    // Quote View History State
    const [showViewHistory, setShowViewHistory] = useState(false);
    const [viewCount, setViewCount] = useState(0);

    // --- Chronométrage et essai IA ---
    // Heure de début de création (ref pour ne pas déclencher de re-render)
    const creationStartRef = useRef(Date.now());
    // Indique si l'IA a généré des lignes pendant cette session
    const [usedAiInSession, setUsedAiInSession] = useState(false);
    // Nombre de devis existants au moment de l'ouverture du formulaire (null = pas encore chargé)
    const [existingQuoteCount, setExistingQuoteCount] = useState(null);
    // Affichage de la modale d'offre d'essai IA
    const [showAiTrialOffer, setShowAiTrialOffer] = useState(false);
    // L'utilisateur a accepté l'essai IA et la session est en cours
    const [isAiTrialSession, setIsAiTrialSession] = useState(false);
    // Données pour la modale de comparaison post-essai
    const [comparisonData, setComparisonData] = useState(null);
    const [showComparisonModal, setShowComparisonModal] = useState(false);

    useEffect(() => {
        if (!id || id === 'new') return;

        const channel = supabase.channel(`quote_presence:${id}`, {
            config: {
                presence: {
                    key: 'artisan',
                },
            },
        });

        channel
            .on('presence', { event: 'sync' }, () => {
                const newState = channel.presenceState();
                const hasClient = Object.keys(newState).some(k => k === 'client' && newState[k].length > 0);
                setIsClientOnline(hasClient);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [id]);

    // Subscription Realtime aux ouvertures du devis par le client
    useEffect(() => {
        if (!id || id === 'new') return;

        // Charger le nombre d'ouvertures existantes
        supabase
            .from('quote_views')
            .select('id', { count: 'exact', head: true })
            .eq('quote_id', id)
            .then(({ count }) => setViewCount(count ?? 0));

        const viewChannel = supabase
            .channel(`quote_views:${id}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'quote_views', filter: `quote_id=eq.${id}` },
                (payload) => {
                    setViewCount(prev => prev + 1);
                    toast.info('Votre devis vient d\'être consulté !', {
                        icon: '👁️',
                        duration: 5000,
                        action: {
                            label: 'Voir l\'historique',
                            onClick: () => setShowViewHistory(true),
                        },
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(viewChannel);
        };
    }, [id]);

    // Voice Dictation for AI (reusing hook from line 29)

    // --- Effet : comptage des devis existants (une seule fois à l'ouverture) ---
    useEffect(() => {
        if (isEditing || !user) return;
        supabase
            .from('quotes')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('type', 'quote')
            .then(({ count }) => {
                setExistingQuoteCount(count ?? 0);
            });
    }, [user?.id, isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

    // --- Effet : déclencher l'offre essai IA quand toutes les données sont prêtes ---
    const hasTrialOfferBeenEvaluated = useRef(false);
    useEffect(() => {
        if (
            !isEditing &&
            existingQuoteCount === 1 &&
            userProfile &&
            !userProfile.has_used_ai_trial &&
            !['pro', 'owner'].includes(userProfile.plan) && // Inutile pour les abonnés Pro
            !hasTrialOfferBeenEvaluated.current
        ) {
            hasTrialOfferBeenEvaluated.current = true;
            setShowAiTrialOffer(true);
        }
    }, [existingQuoteCount, userProfile?.has_used_ai_trial, userProfile?.plan, isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleAIGenerate = async () => {
        if (!aiPrompt.trim()) return;

        setAiLoading(true);
        try {
            // Check quota for free users without a personal API key
            const hasPersonalKey = !!(userProfile?.openai_api_key || userProfile?.ai_preferences?.openai_api_key);
            const plan = userProfile?.plan || 'free';
            const isPro = plan === 'pro' || plan === 'owner';

            if (!hasPersonalKey && !isPro && userProfile?.id) {
                const { allowed, remaining, limit } = await checkLimit(userProfile.id, 'ai_generation', plan);
                if (!allowed) {
                    toast.error(`Limite atteinte : ${limit} générations IA/mois. Passez au plan Pro pour un accès illimité.`);
                    setShowAIModal(false);
                    return;
                }
                if (remaining === 1) {
                    toast.info(`Dernière génération IA disponible ce mois-ci (${limit}/${limit}).`);
                }
            }

            const context = {
                hourlyRate: userProfile?.ai_hourly_rate || '',
                instructions: userProfile?.ai_instructions || '',
                customSystemPrompt: userProfile?.ai_preferences?.quote_system_prompt || userProfile?.quote_system_prompt || ''
            };

            const result = await generateQuoteItems(aiPrompt, context);
            const { items, suggestions, estimated_duration } = result;

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

                // Marquer que l'IA a été utilisée dans cette session
                setUsedAiInSession(true);

                setAiSuggestions(suggestions || []);
                setAiDuration(estimated_duration || null);

                if (suggestions && suggestions.length > 0) {
                    setShowAISuggestions(true);
                } else {
                    toast.success(`${newItems.length} lignes générées !`);
                    setShowAIModal(false);
                    setAiPrompt('');
                }
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

    const handleAddAISuggestion = (suggestion) => {
        setFormData(prev => ({
            ...prev,
            items: [...prev.items, {
                id: Date.now() + Math.random(),
                description: suggestion,
                quantity: 1,
                unit: 'forfait',
                price: 0,
                buying_price: 0,
                type: 'service'
            }]
        }));
        setUsedAiInSession(true);
        setAiSuggestions(prev => prev.filter(s => s !== suggestion));
        toast.success('Ligne ajoutée — pensez à renseigner le prix');
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
        valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
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
        vat_on_debits: false,
        has_material_deposit: true,
        intervention_address: '',
        intervention_postal_code: '',
        intervention_city: '',
        payment_method: '',
        paid_at: '',
        require_otp: false,
        transmission_status: null,
        transmission_ref: null,
        transmitted_at: null,
        transmission_error: null,
        transmission_service: null,
    });

    const [showSituationModal, setShowSituationModal] = useState(false);
    const [diffAddress, setDiffAddress] = useState(false);

    // Derived: client currently selected in the form (used in JSX and handlers)
    const selectedClient = clients.find(c => formData.client_id && c.id.toString() === formData.client_id.toString()) || null;

    // --- AUTO SAVE LOGIC ---
    const draftKey = user ? `quote_draft_${id || 'new'}` : null;
    const { clearAutoSave, lastSaved } = useAutoSave(draftKey, formData, !!user && !loading && dataLoaded);

    // Immediately save to localStorage when the tab becomes hidden, bypassing the debounce.
    // This prevents losing the last typed line when the user switches tabs before the 1-second
    // debounce fires.
    useEffect(() => {
        if (!draftKey || !user || !dataLoaded) return;

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                try {
                    const dataToSave = {
                        ...formData,
                        _draft_saved_at: new Date().toISOString()
                    };
                    localStorage.setItem(draftKey, JSON.stringify(dataToSave));
                } catch (e) {
                    console.error('Visibility auto-save error:', e);
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [formData, draftKey, user, dataLoaded]);

    useEffect(() => {
        if (user) {
            // Prevent re-run when only the user object reference changes (e.g. Supabase auth token
            // refresh). Only re-initialize if user.id or quote id actually changed.
            const currentKey = `${user.id}:${id || 'new'}`;
            if (initKeyRef.current === currentKey) return;
            initKeyRef.current = currentKey;

            const loadData = async () => {
                // For editing mode: load DB data FIRST, then restore draft if available
                if (isEditing) {
                    // Capture any draft (unsaved user changes) BEFORE fetching overwrites formData
                    const existingDraft = getDraft(draftKey);
                    await fetchDevis();
                    // If a draft exists it means the user had unsaved changes: restore them on top
                    // of the DB data so nothing is lost.
                    if (existingDraft) {
                        const { _draft_saved_at, ...restoredDraft } = existingDraft;
                        setFormData(prev => {
                            // If the DB has deduction items (negative price) that the draft lacks,
                            // the draft was saved before the closing invoice deductions were added
                            // (stale draft from before the fix). Keep DB items to preserve deductions
                            // and only restore other draft fields.
                            if (restoredDraft.items !== undefined) {
                                const dbHasDeductions = (prev.items || []).some(i => i.price < 0);
                                const draftHasDeductions = (restoredDraft.items || []).some(i => i.price < 0);
                                if (dbHasDeductions && !draftHasDeductions) {
                                    const { items: _staleItems, ...draftWithoutItems } = restoredDraft;
                                    return { ...prev, ...draftWithoutItems };
                                }
                            }
                            return { ...prev, ...restoredDraft };
                        });
                    }
                    setDataLoaded(true);
                } else {
                    // New quote: restore draft immediately
                    const draft = getDraft(draftKey);
                    if (draft) {
                        const { _draft_saved_at, ...restored } = draft;
                        setFormData(prev => ({ ...prev, ...restored }));
                    }
                }
            };

            loadData();

            fetchClients().then(async (loadedClients) => {
                // Handle Navigation State (Client ID or Voice Data or Import File or Merge)
                if (location.state) {
                    const { client_id, voiceData, importFile, mergeIds, siteVisitItems, siteVisitTitle, fromReport } = location.state;

                    // Pré-remplissage depuis un rapport d'intervention
                    if (fromReport) {
                        const now = Date.now();
                        setFormData(prev => ({
                            ...prev,
                            client_id: fromReport.client_id || prev.client_id,
                            title: fromReport.title || prev.title,
                            type: 'invoice',
                            status: 'draft',
                            notes: fromReport.notes || prev.notes,
                            items: fromReport.items?.length
                                ? fromReport.items.map((item, i) => ({ ...item, id: now + i }))
                                : prev.items,
                        }));
                        toast.success('Facture pré-remplie depuis le rapport d\'intervention');
                    }

                    if (siteVisitItems?.length > 0) {
                        const now = Date.now();
                        setFormData(prev => ({
                            ...prev,
                            title: siteVisitTitle || prev.title,
                            items: siteVisitItems.map((item, i) => ({
                                id: now + i,
                                description: item.description || '',
                                quantity: parseFloat(item.quantity) || 1,
                                unit: item.unit || 'u',
                                price: parseFloat(item.price) || 0,
                                buying_price: parseFloat(item.buying_price) || 0,
                                type: item.type || 'service',
                            })),
                        }));
                        toast.success(`${siteVisitItems.length} lignes importées depuis la visite chantier ✓`);
                    }

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

                    if (mergeIds?.length >= 2) {
                        const { data: quotesToMerge } = await supabase
                            .from('quotes')
                            .select('id, title, quote_number, client_id, items, include_tva')
                            .in('id', mergeIds)
                            .order('created_at');

                        if (quotesToMerge?.length >= 2) {
                            const firstQuote = quotesToMerge[0];
                            const now = Date.now();
                            const mergedItems = [];

                            quotesToMerge.forEach((q, qi) => {
                                // Séparateur de section avec le titre du devis d'origine
                                mergedItems.push({
                                    id: now + qi * 10000,
                                    description: q.title || `Devis #${q.quote_number || q.id}`,
                                    quantity: 1,
                                    unit: 'u',
                                    price: 0,
                                    buying_price: 0,
                                    type: 'section',
                                });
                                // Items du devis avec de nouveaux IDs pour éviter les conflits
                                (q.items || []).forEach((item, ii) => {
                                    mergedItems.push({ ...item, id: now + qi * 10000 + ii + 1 });
                                });
                            });

                            setFormData(prev => ({
                                ...prev,
                                client_id: firstQuote.client_id?.toString() || '',
                                include_tva: firstQuote.include_tva ?? true,
                                items: mergedItems,
                                title: quotesToMerge.map(q => q.title || `Devis #${q.quote_number || q.id}`).join(' + '),
                            }));

                            toast.success(`${quotesToMerge.length} devis fusionnés — vérifiez et enregistrez`);
                        }
                    }
                }
            });
            fetchUserProfile();
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

            setShowImportZone(false);
            if (newItems.length > 0) {
                toast.success(`${newItems.length} éléments détectés et importés.`);
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
        let query = supabase.from('clients').select('*');
        if (!import.meta.env.DEV) {
            query = query.not('name', 'ilike', '%test%');
        }
        const { data } = await query;
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
                    vat_on_debits: data.vat_on_debits === true,
                    last_followup_at: data.last_followup_at || null,
                    follow_up_count: data.follow_up_count || 0,
                    updated_at: data.updated_at || null,
                    has_material_deposit: data.has_material_deposit !== false,
                    intervention_address: data.intervention_address || '',
                    intervention_postal_code: data.intervention_postal_code || '',
                    intervention_city: data.intervention_city || '',
                    amendment_details: data.amendment_details || {},
                    parent_quote_id: data.parent_quote_id || null,
                    parent_id: data.parent_id ?? null,
                    payment_method: data.payment_method || '',
                    paid_at: data.paid_at ? data.paid_at.split('T')[0] : '',
                    report_pdf_url: data.report_pdf_url || null,
                    require_otp: data.require_otp === true,
                    quote_number: data.quote_number || null,
                    transmission_status: data.transmission_status ?? null,
                    transmission_ref: data.transmission_ref ?? null,
                    transmitted_at: data.transmitted_at ?? null,
                    transmission_error: data.transmission_error ?? null,
                    transmission_service: data.transmission_service ?? null,
                });

                if (data.intervention_address || data.intervention_city) {
                    setDiffAddress(true);
                }

                if (data.parent_quote_id) {
                    const { data: parentData } = await supabase
                        .from('quotes')
                        .select('id, total_ttc, total_ht, items, date, title')
                        .eq('id', data.parent_quote_id)
                        .single();

                    if (parentData) {
                        // Calculate progress total (Situation invoices sums)
                        // This mirrors get_public_quote RPC logic to ensure inconsistent PDF preview
                        const { data: progressInvoices } = await supabase
                            .from('quotes')
                            .select('total_ttc')
                            .eq('parent_id', data.parent_quote_id) // Situations are children of the Original Quote
                            .eq('type', 'invoice')
                            .neq('status', 'cancelled');

                        const progressTotal = (progressInvoices || []).reduce((sum, inv) => sum + (inv.total_ttc || 0), 0);

                        setFormData(prev => ({
                            ...prev,
                            parent_quote_data: {
                                ...parentData,
                                progress_total: progressTotal
                            }
                        }));
                    }
                }

                setSignature(data.signature || null);
                setInitialStatus(data.status || 'draft');

                // Load follow-up steps for the "Marquer comme relancé" button
                if (data.status === 'sent') {
                    getFollowUpSettings(user.id).then(settings => {
                        setFollowUpSteps(settings.steps || []);
                    });
                }
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

    const addItem = (type = 'service') => {
        setFormData(prev => ({
            ...prev,
            items: [...prev.items, { id: Date.now(), description: '', quantity: 1, unit: tradeConfig.defaultUnit, price: 0, buying_price: 0, type }]
        }));
    };

    const insertItemAfter = (index) => {
        setFormData(prev => {
            const newItems = [...prev.items];
            newItems.splice(index + 1, 0, { id: Date.now(), description: '', quantity: 1, unit: tradeConfig.defaultUnit, price: 0, buying_price: 0, type: 'service' });
            return { ...prev, items: newItems };
        });
    };

    const addSection = () => {
        setFormData(prev => ({
            ...prev,
            items: [...prev.items, { id: Date.now(), description: '', type: 'section' }]
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
        const lineItems = formData.items.filter(item => item.type !== 'section');
        const subtotal = lineItems.reduce((sum, item) => sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0)), 0);
        const totalCost = lineItems.reduce((sum, item) => sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.buying_price) || 0)), 0);
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
        // Pas de blocage si l'email est absent — le mailto s'ouvre sans destinataire
        // et l'utilisateur l'ajoute manuellement dans sa messagerie

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
            const subjectPrefix = isInvoice ? 'Facture' : 'Devis';
            const subject = `${subjectPrefix}${formData.id ? ` N°${formData.quote_number || formData.id}` : ''} - ${formData.title || 'Votre projet'} - ${companyName}`;

            const introduction = isInvoice
                ? `Bonjour ${selectedClient.name},\n\nJe vous transmets votre facture pour le projet "${formData.title || 'Travaux'}".\nVous trouverez ci-dessous le lien pour y accéder.`
                : `Bonjour ${selectedClient.name},\n\nSuite à nos échanges, je vous transmets ma proposition de devis pour le projet "${formData.title || 'Travaux'}".\nVous trouverez ci-dessous le lien pour le consulter.`;

            const actionText = isInvoice ? 'Consulter et télécharger votre facture' : 'Consulter, télécharger et signer votre devis';
            const callToAction = `${actionText} :\n${publicUrl}`;

            // Client Portal Link Logic
            let portalUrl = null;
            if (isInvoice) {
                let clientPortalToken = selectedClient.portal_token;

                if (!clientPortalToken) {
                    clientPortalToken = crypto.randomUUID();
                    const { error: clientUpdateError } = await supabase
                        .from('clients')
                        .update({ portal_token: clientPortalToken })
                        .eq('id', selectedClient.id);

                    if (clientUpdateError) {
                        console.error("Error creating portal token", clientUpdateError);
                    } else {
                        selectedClient.portal_token = clientPortalToken;
                    }
                }

                if (clientPortalToken) {
                    portalUrl = `${window.location.origin}/p/${clientPortalToken}`;
                }
            }

            // Chercher le lien du rapport : d'abord sur la facture, sinon via intervention_reports lié
            let reportPdfUrl = formData.report_pdf_url || null;
            if (isInvoice && !reportPdfUrl) {
                const { data: linkedReport } = await supabase
                    .from('intervention_reports')
                    .select('report_pdf_url, report_number, user_id')
                    .eq('quote_id', id)
                    .in('status', ['completed', 'signed'])
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (linkedReport) {
                    reportPdfUrl = linkedReport.report_pdf_url || null;
                    if (!reportPdfUrl && linkedReport.report_number) {
                        const reportPath = `interventions/${linkedReport.user_id}/rapport-${linkedReport.report_number}.pdf`;
                        const { data: urlData } = supabase.storage.from('project-photos').getPublicUrl(reportPath);
                        reportPdfUrl = urlData?.publicUrl || null;
                    }
                }
            }

            const signatureBlock = [
                companyName,
                userProfile?.full_name || '',
                userProfile?.phone || '',
                userProfile?.professional_email || userProfile?.email || '',
                userProfile?.website || ''
            ].filter(Boolean).join('\n');

            // Assembler les sections — uniquement des URLs du domaine artisanfacile.fr
            // Le rapport PDF est accessible depuis le lien de la facture (pas besoin d'URL Supabase)
            const bodyParts = [introduction, callToAction];
            if (reportPdfUrl) {
                bodyParts.push(`Le rapport d'intervention est egalement disponible depuis ce lien.`);
            }
            if (portalUrl) {
                bodyParts.push(`Votre espace client (documents et suivi de chantier) :\n${portalUrl}`);
            }
            bodyParts.push(`N'hesitez pas a me contacter pour toute question.\n\nBien cordialement,`);
            bodyParts.push(signatureBlock);

            const body = bodyParts.join('\n\n');

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
        if (isTestMode) {
            captureEmail({ email: emailPreview.email, subject, body });
            toast.success('📬 Email capturé dans l\'inbox test', { duration: 4000 });
        } else {
            window.location.href = mailtoUrl;
            toast.success('Application de messagerie ouverte');
        }

        setShowSendSuccess(true);
        setTimeout(() => setShowSendSuccess(false), 2600);

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

        // Update quote last_followup_at
        if (id && id !== 'new') {
            supabase.from('quotes')
                .update({ last_followup_at: new Date().toISOString() })
                .eq('id', id)
                .then(({ error }) => {
                    if (error) console.error('Error updating follow-up date:', error);
                    else {
                        setFormData(prev => ({ ...prev, last_followup_at: new Date().toISOString() }));
                        toast.success('Date de relance mise à jour');
                    }
                });
        }

        setEmailPreview(null);

        // After send: nudge user to enable push notifications if not yet subscribed
        if (isPushSupported && !isPushSubscribed) {
            setTimeout(() => {
                toast('Activez les notifications pour savoir quand votre client signe', {
                    duration: 8000,
                    action: {
                        label: 'Activer',
                        onClick: async () => {
                            const result = await subscribePush();
                            if (result.success) {
                                toast.success('Notifications activées !');
                            }
                        },
                    },
                });
            }, 1500);
        }
    };

    const handleMarkAsFollowedUp = async () => {
        if (!id || id === 'new') return;
        setMarkingFollowUp(true);
        try {
            const currentCount = formData.follow_up_count || 0;
            const nextCount = currentCount + 1;
            const quoteObj = {
                id,
                client_id: formData.client_id,
                follow_up_count: currentCount
            };
            await recordFollowUp(quoteObj, user.id, '(Relance hors appli)', 'manual', nextCount);
            setFormData(prev => ({
                ...prev,
                follow_up_count: nextCount,
                last_followup_at: new Date().toISOString()
            }));
            toast.success(`Relance ${nextCount} enregistrée`);
        } catch (err) {
            console.error(err);
            toast.error("Erreur lors de l'enregistrement");
        } finally {
            setMarkingFollowUp(false);
        }
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

    const autoCreateAgendaEvent = async (quoteTitle, clientId) => {
        try {
            const client = clients.find(c => c.id.toString() === (clientId || formData.client_id)?.toString());
            const eventDate = new Date();
            eventDate.setDate(eventDate.getDate() + 7);
            const dateStr = eventDate.toISOString().split('T')[0];

            const address = formData.intervention_address
                ? [formData.intervention_address, formData.intervention_postal_code, formData.intervention_city].filter(Boolean).join(', ')
                : client ? [client.address, client.postal_code, client.city].filter(Boolean).join(', ') : '';

            await supabase.from('events').insert([{
                user_id: user.id,
                title: `Chantier : ${quoteTitle || formData.title}`,
                date: dateStr,
                time: '08:00',
                client_name: client?.name || '',
                client_id: clientId || formData.client_id || null,
                address,
                details: `Créé automatiquement depuis le devis #${id} — Date à confirmer avec le client`
            }]);

            toast.success('Événement chantier ajouté à l\'agenda (dans 7 jours par défaut)', {
                action: { label: 'Voir l\'agenda', onClick: () => navigate('/app/agenda') },
                duration: 6000
            });
        } catch (err) {
            console.error('Erreur création événement agenda:', err);
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

            // Calcul de la durée de création (uniquement pour les nouveaux devis)
            const creationTimeSec = !isEditing
                ? Math.round((Date.now() - creationStartRef.current) / 1000)
                : undefined;

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
                is_external: formData.is_external,
                has_material_deposit: formData.has_material_deposit,
                intervention_address: formData.intervention_address,
                intervention_postal_code: formData.intervention_postal_code,

                intervention_city: formData.intervention_city,
                parent_quote_id: formData.parent_quote_id,
                amendment_details: formData.amendment_details,
                payment_method: formData.payment_method || null,
                paid_at: formData.paid_at ? new Date(formData.paid_at).toISOString() : (formData.status === 'paid' ? new Date().toISOString() : null),
                operation_category: formData.operation_category || 'service',
                vat_on_debits: formData.vat_on_debits || false,
                require_otp: formData.require_otp || false,
                ...(creationTimeSec !== undefined && { creation_time_seconds: creationTimeSec }),
                ...(!isEditing && { used_ai_generation: usedAiInSession })
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

            // Auto-create Agenda Event if status transitions to Accepted/Signed
            if (['accepted', 'signed'].includes(quoteData.status) && !['accepted', 'signed'].includes(initialStatus)) {
                await autoCreateAgendaEvent(quoteData.title, quoteData.client_id);
            }

            // Auto-create Project (Dossier Chantier) if Signed/Accepted
            if (['accepted', 'signed'].includes(quoteData.status) && quoteData.title && error === null) {
                try {
                    // Check if project exists
                    const { data: existingProject } = await supabase
                        .from('projects')
                        .select('id')
                        .eq('name', quoteData.title)
                        .eq('client_id', formData.client_id)
                        .single();

                    if (!existingProject) {
                        await supabase.from('projects').insert([{
                            user_id: user.id,
                            client_id: formData.client_id,
                            name: quoteData.title,
                            status: 'in_progress',
                            description: `Chantier généré depuis le devis: ${quoteData.title}`
                        }]);
                        // Silent success, no toast needed for background automation
                    }
                } catch (projErr) {
                    console.error("Error creating project folder:", projErr);
                }
            }

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
            clearAutoSave();
            invalidateQuotes();
            if (isEditing) invalidateQuote(id);

            // Update CRM
            updateClientCRMStatus(formData.client_id, formData.status);

            // --- Suivi du 1er devis traditionnel (pour comparaison future) ---
            if (!isEditing && existingQuoteCount === 0 && !usedAiInSession && creationTimeSec > 0) {
                // Premier devis créé manuellement : stocker la durée dans le profil
                await supabase
                    .from('profiles')
                    .update({ first_traditional_quote_time: creationTimeSec })
                    .eq('id', user.id);
            }

            // --- Comparaison post-essai IA ---
            // Conditions : 2ème devis, IA utilisée, essai pas encore consommé, plan free
            const isAiTrial =
                !isEditing &&
                existingQuoteCount === 1 &&
                usedAiInSession &&
                userProfile &&
                !userProfile.has_used_ai_trial &&
                !['pro', 'owner'].includes(userProfile.plan);

            if (isAiTrial) {
                // Marquer l'essai comme consommé dans le profil
                await supabase
                    .from('profiles')
                    .update({ has_used_ai_trial: true })
                    .eq('id', user.id);

                // Ouvrir la modale de comparaison
                const firstTime = userProfile?.first_traditional_quote_time ?? null;
                setComparisonData({
                    traditionalTime: firstTime,
                    aiTime: creationTimeSec,
                    hourlyRate: userProfile?.ai_hourly_rate || 50,
                });
                setShowComparisonModal(true);
                // Ne pas naviguer : la modale prend le relais
                return;
            }

            // Check if we switched to Paid
            if (formData.status === 'paid' && initialStatus !== 'paid') {
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
            const isForMaterial = await confirm({ title: "Type d'acompte", message: "Cet acompte est-il destiné principalement à l'achat de fournitures ?\n\nOui → comptabilisé comme Matériel (exclu du Résultat Net)\nNon → comptabilisé comme Service (Marge 100%)", confirmLabel: 'Oui (Matériel)', cancelLabel: 'Non (Service)' });

            const depositItem = {
                id: Date.now(),
                description: `Acompte de ${percentage}% sur devis n°${id} - ${formData.title} `,
                quantity: 1,
                unit: 'forfait',
                price: depositAmount,
                buying_price: 0,
                type: isForMaterial ? 'material' : 'service'
            };

            if (formData.include_tva) {
                depositItem.price = depositAmount / 1.2;
            } else {
                depositItem.price = depositAmount;
            }

            const depHT = depositItem.price;
            const depTVA = formData.include_tva ? (depositAmount - depHT) : 0;

            const depositData = {
                user_id: user.id,
                client_id: formData.client_id,
                client_name: clients.find(c => c.id.toString() === formData.client_id.toString())?.name || 'Client',
                title: `Facture d'Acompte - ${formData.title}`,
                date: new Date().toISOString().split('T')[0],
                status: 'billed',
                type: 'invoice',
                items: [depositItem],
                total_ht: depHT,
                total_tva: depTVA,
                total_ttc: depositAmount,
                parent_id: parseInt(id, 10),
                notes: `Facture d'acompte générée le ${new Date().toLocaleDateString("fr-FR")}

RÉCAPITULATIF :
• Montant total du devis : ${total.toFixed(2)} € TTC
• Montant de cet acompte : ${depositAmount.toFixed(2)} € TTC
• Reste à payer sur devis : ${(total - depositAmount).toFixed(2)} € TTC

Conditions de règlement : Paiement à réception de facture.`
            };

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

        const okMat = await confirm({ title: 'Acompte matériel', message: `Générer un acompte pour le montant du matériel (${materialTotalTTC.toFixed(2)} € TTC) ?`, confirmLabel: 'Générer' });
        if (!okMat) return;

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

            if (formData.include_tva) {
                depositItem.price = depositAmount / 1.2;
            } else {
                depositItem.price = depositAmount;
            }

            const depositHT = depositItem.price;
            const depositTVA = formData.include_tva ? (depositAmount - depositHT) : 0;

            const depositData = {
                user_id: user.id,
                client_id: formData.client_id,
                client_name: clients.find(c => c.id.toString() === formData.client_id.toString())?.name || 'Client',
                title: `Facture Acompte Matériel - ${formData.title}`,
                date: new Date().toISOString().split('T')[0],
                status: 'billed',
                type: 'invoice',
                items: [depositItem],
                parent_id: parseInt(id, 10),
                total_ht: depositHT,
                total_tva: depositTVA,
                total_ttc: depositAmount,
                notes: `Facture d'acompte matériel générée le ${new Date().toLocaleDateString("fr-FR")}

RÉCAPITULATIF :
• Montant total du devis : ${total.toFixed(2)} € TTC
• Montant de cet acompte : ${depositAmount.toFixed(2)} € TTC
• Reste à payer sur devis : ${(total - depositAmount).toFixed(2)} € TTC

Conditions de règlement : Paiement à réception de facture.`
            };

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

    const handleCreateSituation = () => {
        setShowSituationModal(true);
        setShowActionsMenu(false);
    };

    const handleSaveSituation = async (title, situationItems) => {
        try {
            setLoading(true);

            // Calculate totals from items
            let total_ht = 0;
            situationItems.forEach(i => total_ht += i.price);

            // Re-calc TVA based on quote settings (or item specific if complex, but assuming global tva boolean for now)
            // Ideally we check each item type/vat rate if we had that detail. 
            // For now, simple standard logic as per original code
            let total_tva = formData.include_tva ? total_ht * 0.20 : 0;
            let total_ttc = total_ht + total_tva;

            const situationData = {
                user_id: user.id,
                client_id: formData.client_id,
                client_name: clients.find(c => c.id.toString() === formData.client_id.toString())?.name || 'Client',
                title: title,
                date: new Date().toISOString().split('T')[0],
                status: 'draft', // Draft to allow verification
                type: 'invoice',
                items: situationItems,
                total_ht: total_ht,
                total_tva: total_tva,
                total_ttc: total_ttc,
                parent_id: parseInt(id, 10),
                notes: `Facture de situation générée le ${new Date().toLocaleDateString("fr-FR")} depuis devis ${id}`
            };

            const { data, error } = await supabase
                .from('quotes')
                .insert([situationData])
                .select()
                .single();

            if (error) throw error;

            toast.success("Facture de situation créée !");
            navigate(`/app/devis/${data.id}`);
            setShowSituationModal(false);

        } catch (error) {
            console.error('Error creating situation:', error);
            toast.error("Erreur lors de la création de la situation");
        } finally {
            setLoading(false);
        }
    };



    const handleCreateAvenant = async () => {
        const avenantTitle = window.prompt("Titre de l'avenant (ex: Ajout prises électriques) ?", `Avenant au devis - ${formData.title}`);
        if (!avenantTitle) return;

        try {
            setLoading(true);

            const avenantData = {
                user_id: user.id,
                client_id: formData.client_id,
                client_name: clients.find(c => c.id.toString() === formData.client_id.toString())?.name || 'Client',
                title: avenantTitle,
                date: new Date().toISOString().split('T')[0],
                status: 'draft',
                type: 'amendment', // Correct type
                parent_id: parseInt(id, 10),
                parent_quote_id: parseInt(id, 10),
                items: [],
                notes: `Avenant au devis n°${id} (${formData.title})\n\nCet avenant vient compléter le devis initial.`,
                total_ht: 0,
                total_tva: 0,
                total_ttc: 0
            };

            const { data, error } = await supabase
                .from('quotes')
                .insert([avenantData])
                .select()
                .single();

            if (error) throw error;

            toast.success("Avenant créé avec succès !");
            navigate(`/app/devis/${data.id}`);
            setShowActionsMenu(false);

        } catch (error) {
            console.error('Error creating avenant:', error);
            toast.error("Erreur lors de la création de l'avenant");
        } finally {
            setLoading(false);
        }
    };

    const handleCreateClosingInvoice = async () => {
        // Safety check: closing invoice must be generated from the original quote/invoice,
        // not from a child document (deposit, situation, etc.) which would result in
        // the deposit deductions not being found.
        if (formData.parent_id) {
            toast.error("La facture de clôture doit être générée depuis le devis original, pas depuis une facture enfant.");
            return;
        }

        const okClose = await confirm({ title: 'Facture de clôture', message: "Cela créera une nouvelle facture reprenant l'ensemble du devis moins les acomptes déjà versés.", confirmLabel: 'Générer' });
        if (!okClose) return;

        setLoading(true);
        try {
            // 1. Fetch existing deposits/situations linked to this quote
            // Use parseInt to ensure parent_id comparison uses the correct numeric type
            const quoteId = parseInt(id, 10);

            const { data: linkedInvoices, error: fetchError } = await supabase
                .from('quotes')
                .select('id, title, date, total_ht, total_ttc, type, status')
                .eq('parent_id', quoteId)
                .neq('status', 'cancelled');

            if (fetchError) throw fetchError;

            // Filter: keep only invoices (not amendments), exclude previous closing invoices
            const deposits = (linkedInvoices || []).filter(inv =>
                inv.type === 'invoice' &&
                !inv.title?.toLowerCase().includes('clôture')
            );

            if (deposits.length === 0) {
                toast.info("Aucun acompte trouvé. La facture de clôture reprendra le devis intégralement.");
            }

            // 2. Prepare items: Copy original items
            let finalItems = formData.items.map(item => ({
                ...item,
                id: Date.now() + Math.random(),
                quantity: parseFloat(item.quantity) || 0,
                price: parseFloat(item.price) || 0,
                buying_price: parseFloat(item.buying_price) || 0
            }));

            // 3. Add deduction lines for each deposit/advance already paid
            let totalDeducted = 0;
            const deductionItems = deposits.map(inv => {
                const amountHT = parseFloat(inv.total_ht) || 0;
                totalDeducted += amountHT;
                return {
                    id: Date.now() + Math.random(),
                    description: `Déduction ${inv.title || 'Acompte'} du ${inv.date ? new Date(inv.date).toLocaleDateString("fr-FR") : 'Date inconnue'}`,
                    quantity: 1,
                    unit: 'forfait',
                    price: -Math.abs(amountHT),
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

            const deductionSummary = deposits.length > 0
                ? `\n\nDéductions appliquées (${deposits.length} acompte${deposits.length > 1 ? 's' : ''}) : -${totalDeducted.toFixed(2)} € HT`
                : '';

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
                parent_id: quoteId,
                notes: (formData.notes || '') + `\n\nFacture de clôture générée le ${new Date().toLocaleDateString("fr-FR")}${deductionSummary}`
            };

            const { data, error } = await supabase
                .from('quotes')
                .insert([invoiceData])
                .select()
                .single();

            if (error) throw error;

            // Proactively clear any stale draft that might exist for the new invoice's key
            // (e.g. from a previous navigation side-effect). This ensures the closing invoice
            // always loads its items — including the deduction lines — from the DB on first visit.
            if (user) {
                localStorage.removeItem(`quote_draft_${data.id}`);
            }

            const successMsg = deposits.length > 0
                ? `Facture de clôture générée avec ${deposits.length} déduction${deposits.length > 1 ? 's' : ''} !`
                : "Facture de clôture générée !";
            toast.success(successMsg);
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
        const okDel = await confirm({ title: 'Supprimer ce devis', message: 'Cette action est irréversible.', confirmLabel: 'Supprimer', danger: true });
        if (!okDel) return;

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

            if (isInvoice && (!userProfile?.iban || userProfile.iban.length < 5)) {
                toast.warning("Attention : Votre IBAN n'est pas renseigné dans votre profil.", {
                    description: "La facture sera générée sans coordonnées bancaires.",
                    duration: 5000,
                    action: {
                        label: 'Configurer',
                        onClick: () => navigate('/app/profile')
                    }
                });
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
                include_tva: formData.include_tva,
                has_material_deposit: formData.has_material_deposit,
                amendment_details: formData.amendment_details || {}
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
                fetchUserProfile();
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

            setPreviewLoading(true);

            const isInvoice = formData.type === 'invoice';
            if (isInvoice && (!userProfile?.iban || userProfile.iban.length < 5)) {
                toast.warning("Attention : Votre IBAN n'est pas renseigné.", {
                    description: "Pensez à l'ajouter dans votre profil pour qu'il apparaisse sur la facture.",
                    duration: 4000
                });
            }
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
                include_tva: formData.include_tva,
                has_material_deposit: formData.has_material_deposit,
                amendment_details: formData.amendment_details || {}
            };

            const url = await generateDevisPDF(devisData, selectedClient, userProfile, isInvoice, 'bloburl');

            if (url) {
                window.open(url, '_blank');
            } else {
                throw new Error("La génération du PDF n'a retourné aucune URL");
            }

        } catch (error) {
            console.error('Error handling preview:', error);
            toast.error("Impossible de générer l'aperçu PDF : " + error.message);
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleConvertToInvoice = async () => {
        const okConv = await confirm({
            title: 'Convertir en facture',
            message: 'Ce devis sera transformé en facture (statut : Accepté). Vous pourrez ensuite la télécharger et l\'envoyer au client.',
            confirmLabel: 'Convertir en facture',
        });
        if (!okConv) return;

        try {
            const { error } = await supabase
                .from('quotes')
                .update({ status: 'accepted', type: 'invoice' })
                .eq('id', id);

            if (error) throw error;

            setFormData(prev => ({ ...prev, status: 'accepted', type: 'invoice' }));
            setInitialStatus('accepted');
            toast.success('Devis converti en facture — pensez à l\'envoyer au client');
            invalidateQuotes();
            updateClientCRMStatus(formData.client_id, 'accepted');
            await handleDownloadPDF(true);
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
            invalidateQuotes();
            updateClientCRMStatus(formData.client_id, 'signed');
            setShowSignatureModal(false);
            toast.success('Devis signé avec succès');
            await autoCreateAgendaEvent(formData.title, formData.client_id);
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
                const reviewSubject = `Votre avis compte pour ${userProfile.company_name || 'nous'}`;
                const reviewBody = [
                    `Bonjour,`,
                    `Merci de nous avoir fait confiance pour vos travaux !`,
                    `Votre avis nous aiderait beaucoup. Cela ne prend que 30 secondes :\n${reviewUrl}`,
                    `N'hésitez pas à nous contacter pour tout futur projet.\n\nBien cordialement,\n${userProfile.full_name || ''}`
                ].join('\n\n');
                if (isTestMode) {
                    captureEmail({ email: selectedClient?.email || '', subject: reviewSubject, body: reviewBody });
                    toast.success('📬 Demande d\'avis capturée dans l\'inbox test', { duration: 4000 });
                } else {
                    window.location.href = `mailto:?subject=${encodeURIComponent(reviewSubject)}&body=${encodeURIComponent(reviewBody)}`;
                }
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

    const handleBack = () => {
        setIsExiting(true);
        setTimeout(() => navigate('/app/devis'), 260);
    };

    // Verrouillage si Signé/Facturé/Payé/Annulé
    const isLocked = ['accepted', 'billed', 'paid', 'cancelled'].includes(formData.status);

    if (isEditing && !dataLoaded) {
        return (
            <div className="max-w-4xl mx-auto pb-12 flex items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-3 text-gray-500">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <span className="text-sm">Chargement du document...</span>
                </div>
            </div>
        );
    }

    return (
        <div className={`max-w-4xl mx-auto pb-12 sm:pb-12 pb-28 ${isExiting ? 'animate-slide-out-right' : 'animate-slide-in-right'}`}>
            {isLocked && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
                    <div className="p-1 bg-amber-100 rounded-full text-amber-600">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-lock w-4 h-4"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    </div>
                    <div>
                        <h4 className="text-sm font-semibold text-amber-800">Document Verrouillé</h4>
                        <p className="text-sm text-amber-700 mt-1">
                            Ce document est <strong>{formData.status === 'accepted' ? 'signé' : 'clôturé'}</strong>. Pour garantir l'intégrité légale, les modifications sont désactivées.<br />
                            Pour modifier le périmètre, veuillez créer un avenant ou repasser le statut en "Brouillon" (déconseillé si déjà envoyé).
                        </p>
                    </div>
                </div>
            )}
            {/* Bandeau "Essai IA actif" — visible pendant toute la session d'essai */}
            {isAiTrialSession && !isEditing && (
                <div className="bg-indigo-600 text-white rounded-xl px-4 py-2.5 mb-4 flex items-center gap-2 text-sm">
                    <Sparkles className="w-4 h-4 flex-shrink-0" />
                    <span className="font-medium">Essai IA actif</span>
                    <span className="text-indigo-200">— Le temps de création est mesuré. Enregistrez quand votre devis est prêt.</span>
                </div>
            )}

            {/* Bandeau premier devis — masquable, localStorage */}
            {showFirstDevisTip && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6 relative">
                    <button
                        type="button"
                        onClick={dismissDevisTip}
                        className="absolute top-3 right-3 p-1 text-blue-300 hover:text-blue-500 rounded transition-colors"
                        title="Ne plus afficher"
                    >
                        <X className="w-4 h-4" />
                    </button>
                    <div className="flex items-start gap-3 pr-6">
                        <span className="text-xl flex-shrink-0">💡</span>
                        <div>
                            <p className="text-sm font-semibold text-blue-800 mb-2">Créez votre devis en 3 étapes</p>
                            <ol className="space-y-1.5">
                                <li className="flex items-start gap-2 text-sm text-blue-700">
                                    <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-800 flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5">1</span>
                                    <span><strong>Choisissez un client</strong> — recherchez son nom ou cliquez "Nouveau client" juste en dessous</span>
                                </li>
                                <li className="flex items-start gap-2 text-sm text-blue-700">
                                    <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-800 flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5">2</span>
                                    <span><strong>Ajoutez vos prestations</strong> — cliquez "+ Main d'œuvre" pour votre travail, "+ Matériel" pour vos fournitures</span>
                                </li>
                                <li className="flex items-start gap-2 text-sm text-blue-700">
                                    <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-800 flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5">3</span>
                                    <span><strong>Envoyez et faites signer</strong> — votre client reçoit un lien et signe directement depuis son téléphone</span>
                                </li>
                            </ol>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between mb-6">
                <button
                    onClick={handleBack}
                    className="flex items-center text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
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

                {/* Presence Indicator */}
                <div className="flex flex-col items-center justify-center mr-auto ml-2">
                    {isClientOnline && (
                        <div className="flex items-center gap-1 text-green-600 bg-green-50 px-3 py-1 rounded-full text-xs font-bold border border-green-200 animate-pulse transition-all">
                            <span className="relative flex h-2 w-2 mr-1">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                            </span>
                            CLIENT EN LIGNE
                        </div>
                    )}
                    {!isClientOnline && formData.last_viewed_at && (
                        <button
                            onClick={() => setShowViewHistory(true)}
                            className="flex items-center gap-1 text-gray-400 hover:text-blue-500 text-[10px] transition-colors"
                            title={`Dernière ouverture : ${new Date(formData.last_viewed_at).toLocaleString()}`}
                        >
                            <Eye className="w-3 h-3" />
                            Vu {new Date(formData.last_viewed_at).toLocaleDateString()}
                            {viewCount > 1 && (
                                <span className="bg-blue-100 text-blue-600 font-bold px-1 rounded text-[9px]">
                                    ×{viewCount}
                                </span>
                            )}
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* Indicateur de chronométrage (nouveau devis uniquement) */}
                    {!isEditing && (
                        <span
                            className="hidden sm:flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500"
                            title="Votre temps de création est mesuré pour générer des statistiques"
                        >
                            <Clock className="w-3 h-3" />
                            Chrono actif
                        </span>
                    )}
                    {/* Auto-save indicator */}
                    {lastSaved && !isEditing && (
                        <span className="hidden sm:flex items-center gap-1 text-xs text-gray-400" title={`Brouillon sauvegardé à ${lastSaved.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}>
                            <Clock className="w-3 h-3" />
                            Brouillon
                        </span>
                    )}
                    {/* Primary Actions */}
                    <button
                        type="button"
                        onClick={handleSendQuoteEmail}
                        className="flex items-center px-3 sm:px-4 py-2 text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
                        title="Envoyer par email"
                    >
                        <Send className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">Envoyer</span>
                    </button>

                    {id && id !== 'new' && formData.type !== 'invoice' && !['billed', 'paid', 'cancelled'].includes(formData.status) && (
                        <button
                            type="button"
                            onClick={handleConvertToInvoice}
                            className="flex items-center px-3 sm:px-4 py-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 font-medium transition-colors"
                            title="Convertir ce devis en facture"
                        >
                            <FileCheck className="w-4 h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Facturer</span>
                        </button>
                    )}

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
                            <div className="absolute right-0 mt-2 w-60 bg-white rounded-lg shadow-xl border border-gray-100 z-50 py-1">
                                {/* ─── Partage & Signature ─── */}
                                <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Partage & Signature</p>
                                {/* Mobile only Send button */}
                                <button
                                    onClick={() => { handleSendQuoteEmail(); setShowActionsMenu(false); }}
                                    className="sm:hidden flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
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

                                {id && !signature && formData.status !== 'accepted' && formData.type !== 'invoice' && (
                                    <button
                                        onClick={() => { setShowSignatureModal(true); setShowActionsMenu(false); }}
                                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                    >
                                        <PenTool className="w-4 h-4 mr-3 text-purple-600" />
                                        Faire signer sur l'appareil
                                    </button>
                                )}

                                <div className="border-t border-gray-100 my-1"></div>
                                {/* ─── PDF ─── */}
                                <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">PDF</p>
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

                                {id && id !== 'new' && formData.type !== 'invoice' && !['billed', 'paid', 'cancelled'].includes(formData.status) && (
                                    <>
                                        <div className="border-t border-gray-100 my-1"></div>
                                        <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Facturation</p>
                                        <button
                                            onClick={() => { handleConvertToInvoice(); setShowActionsMenu(false); }}
                                            className="flex items-center w-full px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-50"
                                        >
                                            <FileCheck className="w-4 h-4 mr-3 text-emerald-600" />
                                            Convertir en facture
                                        </button>
                                    </>
                                )}

                                {id && (formData.status === 'accepted' || formData.status === 'sent' || formData.status === 'billed') && !formData.parent_id && (
                                    <>
                                        <div className="border-t border-gray-100 my-1"></div>
                                        <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Documents liés</p>
                                        <button
                                            onClick={() => { handleCreateAvenant(); setShowActionsMenu(false); }}
                                            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                        >
                                            <FileText className="w-4 h-4 mr-3 text-indigo-600" />
                                            Créer un avenant
                                        </button>
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

            {/* ── Zone d'import PDF (nouveau devis uniquement) ─────────────────── */}
            {!isEditing && showImportZone && (
                <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setIsDragOver(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) processImportedFile(file);
                    }}
                    className={`relative mb-6 rounded-xl border-2 border-dashed transition-colors cursor-pointer
                        ${isDragOver
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:border-blue-400 hover:bg-blue-50/40'
                        }`}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setShowImportZone(false); }}
                        className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        title="Masquer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                    <div className="flex flex-col items-center justify-center gap-3 py-8 px-4 text-center select-none">
                        {importing ? (
                            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                        ) : (
                            <Upload className={`w-10 h-10 ${isDragOver ? 'text-blue-500' : 'text-gray-400'}`} />
                        )}
                        <div>
                            <p className="font-semibold text-gray-700 dark:text-gray-200">
                                {importing ? 'Traitement en cours…' : 'Importer un devis existant (PDF ou Word)'}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                Déposez le fichier ici, ou <span className="text-blue-600 underline">parcourez</span>
                            </p>
                        </div>
                    </div>
                </div>
            )}

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
                        <div className="mb-8 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-800">
                            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
                                    <Eye className="w-4 h-4 text-blue-500" />
                                    Aperçu du document importé
                                </div>
                                <a
                                    href={displayPdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    Nouvel onglet
                                </a>
                            </div>
                            <div className="h-[550px] bg-gray-200 dark:bg-gray-950">
                                <iframe
                                    src={displayPdfUrl}
                                    title="Aperçu document importé"
                                    className="w-full h-full border-0"
                                    style={{ background: '#525659' }}
                                />
                            </div>
                            {/* Mobile fallback */}
                            <div className="p-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-center sm:hidden">
                                <a
                                    href={displayPdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    <ExternalLink className="w-4 h-4 mr-2" />
                                    Ouvrir le PDF
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
                                disabled={isLocked}
                            />
                        </div>

                        <div className="mb-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Titre / Objet du devis</label>
                            <input
                                type="text"
                                className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                                placeholder="Ex: Rénovation Salle de Bain"
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                disabled={isLocked}
                            />
                        </div>


                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Date d'émission</label>
                            <input
                                type="date"
                                className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                                value={formData.date}
                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                disabled={isLocked}
                            />
                        </div>
                        {formData.type !== 'invoice' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Validité jusqu'au</label>
                                <input
                                    type="date"
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                                    value={formData.valid_until}
                                    onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                                    disabled={isLocked}
                                />
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Statut</label>
                        {/* Pipeline visuel cliquable */}
                        {(() => {
                            const pipeline = formData.type === 'invoice'
                                ? [{ key: 'accepted', label: 'Émise' }, { key: 'billed', label: 'Facturée' }, { key: 'paid', label: 'Payée' }]
                                : [{ key: 'draft', label: 'Brouillon' }, { key: 'sent', label: 'Envoyé' }, { key: 'accepted', label: 'Accepté' }, { key: 'billed', label: 'Facturé' }, { key: 'paid', label: 'Payé' }];
                            const currentIdx = pipeline.findIndex(s => s.key === formData.status);
                            if (currentIdx === -1) return null;
                            return (
                                <div className="flex items-center mb-2">
                                    {pipeline.map((step, idx) => (
                                        <React.Fragment key={step.key}>
                                            <button
                                                type="button"
                                                onClick={() => setFormData(p => ({ ...p, status: step.key }))}
                                                className={`text-[10px] font-semibold px-2 py-1 rounded whitespace-nowrap transition-colors ${
                                                    idx === currentIdx ? 'animate-shimmer-step text-white' :
                                                    idx < currentIdx ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' :
                                                    'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                                }`}
                                            >
                                                {step.label}
                                            </button>
                                            {idx < pipeline.length - 1 && (
                                                <div className={`h-px flex-1 mx-0.5 min-w-[4px] ${idx < currentIdx ? 'bg-blue-300' : 'bg-gray-200'}`} />
                                            )}
                                        </React.Fragment>
                                    ))}
                                </div>
                            );
                        })()}
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
                            <option value="postponed">Reporté</option>
                            <option value="cancelled">Annulé</option>
                        </select>
                        {formData.last_followup_at && (
                            <p className="text-xs text-amber-600 mt-1 font-medium flex items-center">
                                <span className="w-2 h-2 bg-amber-500 rounded-full mr-1.5"></span>
                                Relancé le {new Date(formData.last_followup_at).toLocaleDateString()}
                                {formData.follow_up_count > 0 && (
                                    <span className="ml-1 text-amber-500">
                                        (étape {formData.follow_up_count})
                                    </span>
                                )}
                            </p>
                        )}
                        {formData.status === 'sent' && (
                            <button
                                type="button"
                                onClick={handleMarkAsFollowedUp}
                                disabled={markingFollowUp}
                                className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-60 rounded-lg transition-colors"
                            >
                                <Check className="w-4 h-4" />
                                {markingFollowUp ? 'Enregistrement…' : (() => {
                                    const nextStep = followUpSteps[formData.follow_up_count];
                                    return nextStep
                                        ? `Relancé — ${nextStep.label}`
                                        : `Relancé — étape ${(formData.follow_up_count || 0) + 1}`;
                                })()}
                            </button>
                        )}
                    </div>
                    {/* Mode de règlement - visible quand statut = Payé */}
                    {formData.status === 'paid' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Mode de règlement</label>
                                <select
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    value={formData.payment_method}
                                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                                >
                                    <option value="">-- Sélectionner --</option>
                                    <option value="virement">Virement bancaire</option>
                                    <option value="cheque">Chèque</option>
                                    <option value="especes">Espèces</option>
                                    <option value="carte">Carte bancaire</option>
                                    <option value="paypal">PayPal</option>
                                    <option value="wero">Wero</option>
                                    <option value="autre">Autre</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Date d'encaissement</label>
                                <input
                                    type="date"
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    value={formData.paid_at}
                                    onChange={(e) => setFormData({ ...formData, paid_at: e.target.value })}
                                />
                                <p className="text-xs text-gray-500 mt-1">Obligatoire pour le livre de recettes</p>
                            </div>
                        </>
                    )}
                    {/* Options avancées (Factur-X, TVA, OTP) */}
                    <div className="border-t border-gray-100 pt-3 mt-1">
                        <button
                            type="button"
                            onClick={() => setShowAdvancedQuoteOptions(v => !v)}
                            className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            <svg className={`w-3.5 h-3.5 transition-transform ${showAdvancedQuoteOptions ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            Options avancées
                        </button>
                        {showAdvancedQuoteOptions && (
                            <div className="mt-3 space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie (Factur-X)</label>
                                    <select
                                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 mb-2 disabled:bg-gray-100 disabled:text-gray-500"
                                        value={formData.operation_category}
                                        onChange={(e) => setFormData({ ...formData, operation_category: e.target.value })}
                                        disabled={isLocked}
                                    >
                                        <option value="service">Prestation de services</option>
                                        <option value="goods">Livraison de biens</option>
                                        <option value="mixed">Mixte</option>
                                    </select>
                                    <div className="flex items-center gap-2 mt-2">
                                        <input
                                            type="checkbox"
                                            id="vat_on_debits"
                                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 disabled:opacity-50"
                                            checked={formData.vat_on_debits}
                                            onChange={(e) => setFormData({ ...formData, vat_on_debits: e.target.checked })}
                                            disabled={isLocked}
                                        />
                                        <label htmlFor="vat_on_debits" className="text-sm text-gray-700">
                                            Option TVA sur les débits
                                        </label>
                                    </div>
                                    <div className="flex items-center gap-2 mt-2">
                                        <input
                                            type="checkbox"
                                            id="require_otp"
                                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 disabled:opacity-50"
                                            checked={formData.require_otp}
                                            onChange={(e) => setFormData({ ...formData, require_otp: e.target.checked })}
                                            disabled={isLocked}
                                        />
                                        <label htmlFor="require_otp" className="text-sm text-gray-700">
                                            Exiger la vérification par email (OTP) pour signer
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Intervention Address Toggle - Full Width */}
                    <div className="md:col-span-2 border-t border-gray-100 pt-4 mt-2">
                        <div className="flex items-center mb-2">
                            <input
                                type="checkbox"
                                id="diffAddress"
                                checked={diffAddress}
                                onChange={(e) => setDiffAddress(e.target.checked)}
                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
                                disabled={isLocked}
                            />
                            <label htmlFor="diffAddress" className="ml-2 text-sm text-gray-700 dark:text-gray-300 font-medium">
                                Adresse d'intervention différente (ex: locataire, chantier secondaire)
                            </label>
                        </div>

                        {diffAddress && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-700 mt-2">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Adresse du chantier
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.intervention_address}
                                        onChange={(e) => setFormData({ ...formData, intervention_address: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                                        placeholder="12 rue des Fleurs"
                                        disabled={isLocked}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Code Postal
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.intervention_postal_code}
                                        onChange={(e) => setFormData({ ...formData, intervention_postal_code: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                                        placeholder="75001"
                                        disabled={isLocked}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Ville
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.intervention_city}
                                        onChange={(e) => setFormData({ ...formData, intervention_city: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                                        placeholder="Paris"
                                        disabled={isLocked}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Amendment Configuration Fields */}
                {formData.type === 'amendment' && (
                    <div className="mb-8">
                        <AmendmentFields formData={formData} setFormData={setFormData} />
                    </div>
                )}

                {/* Lignes du devis */}
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        Détails : {tradeConfig.terms.task}s ({tradeConfig.terms.materials})
                    </h3>
                    {/* Column headers — desktop only */}
                    <div className="hidden sm:flex gap-4 items-end mb-2 pb-2 border-b border-gray-200 text-xs font-semibold text-gray-400 uppercase tracking-wider select-none">
                        <div className="flex-1 pl-1">Désignation</div>
                        <div className="w-20 text-right">Qté</div>
                        <div
                            className="w-28 text-right cursor-help flex items-center justify-end gap-1"
                            title="Prix Unitaire Hors Taxes — la TVA est calculée automatiquement en bas du devis"
                        >
                            Prix U. HT
                            <Info className="w-3 h-3 text-gray-300 flex-shrink-0" />
                        </div>
                        <div className="w-28 text-right">Total HT</div>
                        <div className="w-16"></div>
                    </div>
                    <div>
                        {formData.items.map((item, index) => (
                            <React.Fragment key={item.id}>
                            {item.type === 'section' ? (
                                <div key={item.id} className="flex items-center gap-2 pt-2 pb-1 border-b-2 border-blue-200">
                                    <Layers className="w-4 h-4 text-blue-500 shrink-0" />
                                    <input
                                        type="text"
                                        placeholder="Titre de la section (ex: Création prise de terre)"
                                        className="flex-1 px-3 py-1.5 text-sm font-semibold border-0 border-b border-blue-300 focus:outline-none focus:border-blue-500 bg-transparent text-blue-700 placeholder-blue-300"
                                        value={item.description}
                                        onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                                        disabled={isLocked}
                                    />
                                    <div className="flex gap-1">
                                        <button
                                            type="button"
                                            onClick={() => moveItem(index, 'up')}
                                            disabled={index === 0 || isLocked}
                                            className="p-1 text-gray-400 hover:text-blue-600 rounded disabled:opacity-30"
                                            title="Monter"
                                        >
                                            <ArrowUp className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => moveItem(index, 'down')}
                                            disabled={index === formData.items.length - 1 || isLocked}
                                            className="p-1 text-gray-400 hover:text-blue-600 rounded disabled:opacity-30"
                                            title="Descendre"
                                        >
                                            <ArrowDown className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => removeItem(item.id)}
                                            className="p-1 text-gray-400 hover:text-red-600 rounded disabled:opacity-30"
                                            disabled={isLocked}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                            <div key={item.id} className={`flex flex-col sm:flex-row gap-4 items-start border-b pb-4 last:border-0 ${item.is_optional ? 'border-purple-100 border-l-2 border-l-purple-300 pl-2 -ml-2' : 'border-gray-100'}`}>
                                <div className="flex-1 w-full space-y-2">
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <select
                                            className="w-full sm:w-32 px-2 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 disabled:bg-gray-100 disabled:text-gray-500"
                                            value={item.type || 'service'}
                                            onChange={(e) => updateItem(item.id, 'type', e.target.value)}
                                            disabled={isLocked}
                                        >
                                            <option value="service">Main d'oeuvre</option>
                                            <option value="material">Matériel</option>
                                        </select>
                                        <div className="flex-1 relative">
                                            <textarea
                                                placeholder="Description"
                                                rows={2}
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
                                                disabled={isLocked}
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
                                </div>
                                <div className="flex gap-2 w-full sm:w-auto">
                                    <div className="w-20 relative">
                                        <input
                                            type="number"
                                            placeholder="Qté"
                                            step="0.01"
                                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-right pr-2"
                                            value={item.quantity}
                                            onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                                            disabled={isLocked}
                                        />
                                        {userProfile?.enable_calculator !== false && (
                                            <button
                                                type="button"
                                                onClick={() => { setActiveCalculatorItem(item.id); setShowCalculator(true); }}
                                                className="absolute -top-3 -right-2 bg-blue-100 text-blue-600 rounded-full p-1 shadow-sm hover:bg-blue-200 disabled:opacity-50 disabled:bg-gray-100 disabled:text-gray-400"
                                                title="Calculatrice Matériaux"
                                                disabled={isLocked}
                                            >
                                                <Calculator className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                    <div className="w-28">
                                        <input
                                            type="number"
                                            placeholder="Prix U."
                                            step="0.01"
                                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-right"
                                            value={item.price}
                                            onChange={(e) => updateItem(item.id, 'price', e.target.value)}
                                            disabled={isLocked}
                                        />
                                    </div>
                                    <div className="w-28 py-2 text-right font-medium text-gray-900">
                                        {((parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0)).toFixed(2)} €
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <button
                                            type="button"
                                            onClick={() => moveItem(index, 'up')}
                                            disabled={index === 0 || isLocked}
                                            className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50 disabled:opacity-30 disabled:hover:bg-transparent"
                                            title="Monter"
                                        >
                                            <ArrowUp className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => moveItem(index, 'down')}
                                            disabled={index === formData.items.length - 1 || isLocked}
                                            className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50 disabled:opacity-30 disabled:hover:bg-transparent"
                                            title="Descendre"
                                        >
                                            <ArrowDown className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => removeItem(item.id)}
                                        className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-30"
                                        disabled={isLocked}
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => updateItem(item.id, 'is_optional', !item.is_optional)}
                                        disabled={isLocked}
                                        className={`text-[10px] px-1.5 py-1 rounded border font-semibold transition-colors ${item.is_optional ? 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100' : 'text-gray-300 border-gray-200 hover:text-gray-500 hover:border-gray-300'}`}
                                        title={item.is_optional ? 'Option — cliquer pour rendre obligatoire' : 'Rendre cette ligne optionnelle'}
                                    >
                                        OPT
                                    </button>
                                </div>
                            </div>
                            )}
                            {/* Zone d'insertion entre lignes */}
                            {!isLocked && index < formData.items.length - 1 && (
                                <div className="group relative flex items-center my-1 -mx-1">
                                    <div className="flex-1 h-px bg-gray-100 group-hover:bg-blue-200 transition-colors" />
                                    <button
                                        type="button"
                                        onClick={() => insertItemAfter(index)}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity mx-2 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 bg-white border border-blue-200 hover:border-blue-400 rounded px-2 py-0.5 shadow-sm"
                                        title="Insérer une ligne ici"
                                    >
                                        <Plus className="w-3 h-3" /> Insérer ici
                                    </button>
                                    <div className="flex-1 h-px bg-gray-100 group-hover:bg-blue-200 transition-colors" />
                                </div>
                            )}
                            </React.Fragment>
                        ))}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                        <button
                            onClick={() => addItem('service')}
                            className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 transition-colors disabled:opacity-50"
                            disabled={isLocked}
                            title="Votre temps de travail : pose, installation, déplacement, diagnostic..."
                        >
                            <Plus className="w-4 h-4" />
                            Main d'œuvre
                        </button>

                        <button
                            onClick={() => addItem('material')}
                            className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-800 hover:bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-100 transition-colors disabled:opacity-50"
                            disabled={isLocked}
                            title="Fournitures et pièces : câbles, raccords, carrelage, peinture... Les matériaux que vous achetez pour le chantier."
                        >
                            <Plus className="w-4 h-4" />
                            Matériel
                        </button>

                        <button
                            type="button"
                            onClick={addSection}
                            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200 transition-colors disabled:opacity-50"
                            disabled={isLocked}
                            title="Ajoute un titre de groupe pour organiser vos lignes (ex: Cuisine, Salle de bain, Extérieur). Facultatif."
                        >
                            <Layers className="w-4 h-4" />
                            Section
                        </button>

                        <button
                            onClick={() => setShowAIModal(true)}
                            className="flex items-center gap-1.5 text-sm font-medium text-purple-600 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg border border-purple-100 shadow-sm transition-all disabled:opacity-50 ml-auto"
                            disabled={isLocked}
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            Générer avec l'IA
                        </button>
                    </div>

                    {/* Légende pour les débutants */}
                    <p className="mt-3 text-xs text-gray-400 flex items-start gap-1.5">
                        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span>
                            <strong className="text-gray-500">Main d'œuvre</strong> = votre temps de travail ·{' '}
                            <strong className="text-gray-500">Matériel</strong> = fournitures achetées ·{' '}
                            <strong className="text-gray-500">Section</strong> = titre de regroupement (facultatif) ·{' '}
                            <strong className="text-gray-500">HT</strong> = hors taxes — la TVA est ajoutée automatiquement en bas
                        </span>
                    </p>
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
                                    {showAISuggestions ? 'Postes à ne pas oublier détectés par l\'IA' : 'Décrivez les travaux et l\'IA générera le devis pour vous.'}
                                </p>
                            </div>

                            <div className="p-6">
                                {!showAISuggestions ? (
                                    <>
                                        <textarea
                                            className="w-full h-32 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
                                            placeholder="Ex: Rénovation complète sdb 6m2 avec carrelage métro, douche italienne, meuble vasque..."
                                            value={aiPrompt}
                                            onChange={(e) => setAiPrompt(e.target.value)}
                                            autoFocus
                                        />
                                        <div className="mt-2 flex justify-between items-center text-xs text-gray-400">
                                            <span>Décrivez les travaux ci-dessus.</span>
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
                                    </>
                                ) : (
                                    <>
                                        {aiDuration && (
                                            <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">
                                                <Clock className="w-4 h-4 flex-shrink-0" />
                                                <span>Durée estimée du chantier : <strong>{aiDuration}</strong></span>
                                            </div>
                                        )}
                                        <p className="text-sm text-gray-600 mb-3">
                                            Ces postes sont souvent oubliés pour ce type de travaux. Voulez-vous les ajouter ?
                                        </p>
                                        <ul className="space-y-2 max-h-60 overflow-y-auto">
                                            {aiSuggestions.map((suggestion, idx) => (
                                                <li key={idx} className="flex items-center justify-between gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                                                    <span className="text-sm text-gray-700">{suggestion}</span>
                                                    <button
                                                        onClick={() => handleAddAISuggestion(suggestion)}
                                                        className="flex-shrink-0 px-3 py-1 text-xs font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600"
                                                    >
                                                        + Ajouter
                                                    </button>
                                                </li>
                                            ))}
                                            {aiSuggestions.length === 0 && (
                                                <li className="text-sm text-gray-500 text-center py-2">Tous les postes ont été ajoutés !</li>
                                            )}
                                        </ul>
                                        <div className="mt-6 flex justify-end">
                                            <button
                                                onClick={() => {
                                                    setShowAIModal(false);
                                                    setShowAISuggestions(false);
                                                    setAiPrompt('');
                                                    setAiSuggestions([]);
                                                    setAiDuration(null);
                                                    toast.success('Devis généré avec succès !');
                                                }}
                                                className="px-6 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700"
                                            >
                                                Terminer
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Payment Schedule (Invoices) */}
                {formData.type === 'invoice' && !formData.is_external && (
                    <div className="mb-6">
                        <PaymentSchedule
                            invoiceId={id}
                            totalAmount={total}
                        />
                    </div>
                )}

                {/* Transmission e-facture (PDP/PPF) — factures sauvegardées uniquement */}
                {formData.type === 'invoice' && id && (
                    <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                        <h4 className="text-sm font-semibold text-indigo-800 mb-1">
                            Transmission e-facture (PDP/PPF)
                        </h4>
                        <p className="text-xs text-indigo-600 mb-3">
                            Obligatoire pour les factures B2B à partir de sept. 2026.
                            Le PDF Factur-X EN 16931 sera transmis à votre plateforme configurée.
                        </p>
                        <InvoiceTransmissionStatus
                            devis={{ ...formData, id }}
                            client={selectedClient}
                            userProfile={userProfile}
                        />
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
                                    disabled={isLocked}
                                />
                                <label htmlFor="include_tva" className="ml-2 block text-sm text-gray-900">
                                    Appliquer la TVA (20%)
                                </label>
                            </div>
                            <div className="flex items-center justify-end mb-4">
                                <input
                                    type="checkbox"
                                    id="has_material_deposit"
                                    className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                                    checked={formData.has_material_deposit}
                                    onChange={(e) => setFormData({ ...formData, has_material_deposit: e.target.checked })}
                                    disabled={isLocked}
                                />
                                <label htmlFor="has_material_deposit" className="ml-2 block text-sm text-gray-900">
                                    Demander un acompte matériel
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
                            {/* Marge estimée — visible seulement si coût matière renseigné */}
                            {totalCost > 0 && subtotal > 0 && (() => {
                                const margin = (subtotal - totalCost) / subtotal;
                                const pct = Math.round(margin * 100);
                                const color = margin >= 0.35 ? 'text-green-600' : margin >= 0.20 ? 'text-orange-500' : 'text-red-500';
                                return (
                                    <div className="flex justify-between text-sm pt-2 border-t border-dashed border-gray-100">
                                        <span className="text-gray-400">Marge estimée</span>
                                        <span className={`font-semibold ${color}`} title={`Coût matière : ${totalCost.toFixed(2)} €`}>
                                            {pct} %
                                        </span>
                                    </div>
                                );
                            })()}
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
                                Signé le {new Date(formData.signed_at || formData.updated_at || new Date()).toLocaleDateString()}
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
                            className="p-1 rounded-full hover:bg-gray-100 text-indigo-500 hover:text-indigo-700 disabled:opacity-50"
                            title="Dicter une note"
                            disabled={isLocked}
                        >
                            <Sparkles className="w-4 h-4" />
                        </button>
                    </div>
                    <textarea
                        rows={3}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                        placeholder="Conditions de paiement, validité du devis..."
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        disabled={isLocked}
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
                requiresOtp={false}
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

            {showViewHistory && (
                <QuoteViewHistory
                    quoteId={id}
                    onClose={() => setShowViewHistory(false)}
                />
            )}

            {/* Email Preview Modal */}
            {
                emailPreview && createPortal(
                    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center sm:p-4 z-50">
                        <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl max-w-2xl w-full flex flex-col h-[92vh] sm:h-auto sm:max-h-[90vh]">
                            <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-shrink-0">
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

                            <div className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">
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
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={emailPreview.rawSubject}
                                            onChange={(e) => setEmailPreview({ ...emailPreview, rawSubject: e.target.value })}
                                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                navigator.clipboard.writeText(emailPreview.rawSubject);
                                                toast.success('Objet copié !');
                                            }}
                                            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg flex-shrink-0"
                                            title="Copier l'objet"
                                        >
                                            <Copy className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                                    <div className="relative">
                                        <textarea
                                            rows={8}
                                            value={emailPreview.rawBody}
                                            onChange={(e) => setEmailPreview({ ...emailPreview, rawBody: e.target.value })}
                                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                navigator.clipboard.writeText(emailPreview.rawBody);
                                                toast.success('Message copié !');
                                            }}
                                            className="absolute top-2 right-2 p-2 bg-white/80 hover:bg-white border border-gray-200 rounded-lg text-gray-500 hover:text-blue-600 shadow-sm transition-colors"
                                            title="Copier le message"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 flex-shrink-0">
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
                                    className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg flex items-center justify-center"
                                >
                                    <Send className="w-4 h-4 mr-2" />
                                    Envoyer
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
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
                                {/* --- Items Table --- */}
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

                                </div>
                            </div>
                        );
                    })()
                )
            }
            <SituationModal
                isOpen={showSituationModal}
                onClose={() => setShowSituationModal(false)}
                quote={{ ...formData, id: id }}
                onSave={handleSaveSituation}
            />

            {/* Modale d'offre d'essai IA (2ème devis) */}
            <AITrialOfferModal
                isOpen={showAiTrialOffer}
                firstQuoteTime={userProfile?.first_traditional_quote_time ?? null}
                onTryAI={() => {
                    setShowAiTrialOffer(false);
                    setIsAiTrialSession(true);
                    setShowAIModal(true);
                }}
                onSkip={() => setShowAiTrialOffer(false)}
            />

            {/* Modale de comparaison après essai IA */}
            {comparisonData && (
                <AITrialComparisonModal
                    isOpen={showComparisonModal}
                    traditionalTime={comparisonData.traditionalTime}
                    aiTime={comparisonData.aiTime}
                    hourlyRate={comparisonData.hourlyRate}
                    onSubscribe={() => {
                        setShowComparisonModal(false);
                        navigate('/app/subscription');
                    }}
                    onClose={() => {
                        setShowComparisonModal(false);
                        navigate('/app/devis');
                    }}
                />
            )}

            {/* Mobile sticky bottom bar — Send + Save */}
            {!isLocked && (
                <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-4 py-3 flex gap-3 safe-area-bottom">
                    <button
                        type="button"
                        onClick={handleSendQuoteEmail}
                        className="flex-1 flex items-center justify-center gap-2 py-3 text-blue-700 bg-blue-50 border border-blue-200 rounded-xl font-semibold text-sm active:bg-blue-100"
                    >
                        <Send className="w-4 h-4" />
                        Envoyer
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="flex-1 flex items-center justify-center gap-2 py-3 text-white bg-blue-600 rounded-xl font-semibold text-sm disabled:opacity-50 active:bg-blue-700"
                    >
                        <Save className="w-4 h-4" />
                        {loading ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                </div>
            )}

            {/* ── Animation de succès après envoi au client ── */}
            {showSendSuccess && (
                <div className="fixed inset-0 z-[300] pointer-events-none">
                    <div className="animate-send-success flex flex-col items-center gap-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl px-10 py-8 border border-gray-100 dark:border-gray-800">
                        <div className="animate-circle-pop w-20 h-20 rounded-full bg-green-50 dark:bg-green-900/30 flex items-center justify-center">
                            <svg viewBox="0 0 50 50" width="50" height="50" fill="none">
                                <circle cx="25" cy="25" r="20" stroke="#22c55e" strokeWidth="2.5" />
                                <polyline
                                    points="14,26 22,34 36,17"
                                    stroke="#22c55e"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="animate-check-draw"
                                />
                            </svg>
                        </div>
                        <p className="text-lg font-bold text-gray-900 dark:text-white">Envoyé au client !</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Application de messagerie ouverte</p>
                    </div>
                </div>
            )}
        </div>
    );

};

export default DevisForm;
