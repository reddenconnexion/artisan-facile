import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Loader2, Sparkles, Info } from 'lucide-react';
import CopilotChat from '../components/CopilotChat';
import { buildQuoteCopilotFacts } from '../utils/copilotContext';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useTestMode } from '../context/TestModeContext';
import { toast } from 'sonner';
import { generateDevisPDF } from '../utils/pdfGenerator';
import { isIosLikeDevice, renderPdfBlobToPageImages } from '../utils/pdfPageImages';
import { clientFacingItems } from '../utils/clientView';
import { useConfirm } from '../context/ConfirmContext';
import { recordFollowUp, getFollowUpSettings } from '../utils/followUpService';
import SignatureModal from '../components/SignatureModal';
import ReviewRequestModal from '../components/ReviewRequestModal';

// import { useVoice } from '../hooks/useVoice'; // Removed direct hook usage
import SmartVoiceModal from '../components/SmartVoiceModal'; // Added Smart Modal
import { getTradeConfig } from '../constants/trades';
import MaterialsCalculator from '../components/MaterialsCalculator';
import { getCoordinates, calculateDistance, getZoneFee } from '../utils/geoService';
import PaymentSchedule from '../components/PaymentSchedule';
import AmendmentFields from '../components/AmendmentFields'; // New Component
import InvoiceTransmissionStatus from '../components/InvoiceTransmissionStatus';
import DismissibleHelp from '../components/ui/DismissibleHelp';
import { useAutoSave, getDraft } from '../hooks/useAutoSave';
import { useOfflinePendingSave } from '../hooks/useOfflinePendingSave';
import { isOffline, isNetworkError, offlineSaveMessage } from '../utils/offlineSave';
import DevisProgress from '../components/DevisProgress';
import { useInvalidateCache } from '../hooks/useDataCache';
import { useQuoteMargin } from '../hooks/useQuoteMargin';
import { useAvenantLogic } from '../hooks/useAvenantLogic';
import { useQuoteSignature } from '../hooks/useQuoteSignature';
import { usePushNotifications } from '../hooks/usePushNotifications';
import QuoteViewHistory from '../components/QuoteViewHistory';
import AITrialOfferModal from '../components/AITrialOfferModal';
import AITrialComparisonModal from '../components/AITrialComparisonModal';
import DevisEmailModal from '../components/DevisEmailModal';
import DevisAIModal from '../components/DevisAIModal';
import QuoteSupplyListModal from '../components/QuoteSupplyListModal';
import QuoteSupplierListModal from '../components/QuoteSupplierListModal';
import QuoteCsvPasteModal from '../components/QuoteCsvPasteModal';
import { effectiveLineCost } from '../utils/quoteInternalDetail';
import DepositNextStepCard from '../components/DepositNextStepCard';
import AffaireLink from './devis-form/AffaireLink';
import { formatDate, formatCurrency } from '../utils/format';
import ClientDisplayModeBar from './devis-form/ClientDisplayModeBar';
import DocumentActionModals from './devis-form/DocumentActionModals';
import DocumentActionsMenuItems from './devis-form/DocumentActionsMenuItems';
import { CompetitorImportBanner, FirstDevisTip, LockedDocumentBanner, SuspendedSignatureBanner } from './devis-form/EditorBanners';
import { FullScreenItemEditor, MobileActionBar, SendSuccessOverlay } from './devis-form/EditorOverlays';
import EditorToolbar from './devis-form/EditorToolbar';
import ExternalDocumentPanel from './devis-form/ExternalDocumentPanel';
import ImportDropZone from './devis-form/ImportDropZone';
import ItemsToolbar from './devis-form/ItemsToolbar';
import PdfOverview from './devis-form/PdfOverview';
import QuoteHeaderFields from './devis-form/QuoteHeaderFields';
import QuoteItemRow from './devis-form/QuoteItemRow';
import QuoteNotesSection from './devis-form/QuoteNotesSection';
import QuoteTotalsPanel from './devis-form/QuoteTotalsPanel';
import QuoteVersionsPanel from './devis-form/QuoteVersionsPanel';
import { DISMISSED_HELPS_KEY, readDismissedHelps } from './devis-form/dismissedHelps';
import { applyNavigationState } from './devis-form/navigationState';
import { createInitialFormData, isBlankItem, quoteRowToFormData, updateClientCRMStatus } from './devis-form/quoteHelpers';
import { useCreditNote } from './devis-form/useCreditNote';
import { useDepositActions } from './devis-form/useDepositActions';
import { useQuoteEmail } from './devis-form/useQuoteEmail';
import { useQuoteImport } from './devis-form/useQuoteImport';

const DevisForm = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const location = useLocation();
    const confirm = useConfirm();
    const { user } = useAuth();
    const { isTestMode, captureEmail } = useTestMode();
    const isEditing = !!id && id !== 'new';
    const [loading, setLoading] = useState(false);
    // Passe à true dès que l'artisan coche/décoche lui-même l'OTP sur ce
    // devis : au-delà, la suggestion automatique par montant ne l'écrase plus.
    const otpTouchedRef = useRef(false);

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
    const { invalidateQuotes, invalidateQuote } = useInvalidateCache();
    const { isSupported: isPushSupported, isSubscribed: isPushSubscribed, subscribe: subscribePush } = usePushNotifications();

    const [showSmartVoice, setShowSmartVoice] = useState(false); // New Smart Voice State
    const [voiceContext, setVoiceContext] = useState(null); // 'quote_item' or 'note'
    const [priceLibrary, setPriceLibrary] = useState([]);
    const [showActionsMenu, setShowActionsMenu] = useState(false);
    // Menu « Documents » de l'aperçu PDF (mêmes entrées que le menu « … » de l'éditeur)
    const [showOverviewDocsMenu, setShowOverviewDocsMenu] = useState(false);
    // Vue « aperçu PDF » d'un devis finalisé : à l'ouverture d'un document déjà
    // finalisé (envoyé, signé, facturé, payé…), on présente d'abord le PDF pour
    // une vue d'ensemble claire, avec un bouton « Modifier » vers l'éditeur.
    const [pdfOverviewMode, setPdfOverviewMode] = useState(false);
    const [overviewPdfUrl, setOverviewPdfUrl] = useState(null);
    // Aperçu rastérisé page par page : sur mobile (iOS/iPadOS, Android), une
    // <iframe> n'affiche pas un PDF blob:, d'où un cadre vide qui obligeait à
    // « ouvrir en plein écran ». On rend alors les pages en images, comme la
    // page publique du devis.
    const [overviewPageImages, setOverviewPageImages] = useState([]);
    const [overviewImagesFailed, setOverviewImagesFailed] = useState(false);
    const [overviewLoading, setOverviewLoading] = useState(false);
    const [overviewError, setOverviewError] = useState(null);
    const overviewInitedRef = useRef(false);
    const overviewRenderIdRef = useRef(0);
    const overviewPageImagesRef = useRef([]);
    // Appareil dont l'<iframe> ne rend pas un PDF blob: → on bascule sur les images.
    const overviewUsesImages = typeof navigator !== 'undefined' &&
        (isIosLikeDevice() || /Android/i.test(navigator.userAgent));
    const fileInputRef = useRef(null);
    // Guard to prevent useEffect re-run when user object reference changes (e.g. auth token refresh)
    // without the actual user.id or quote id changing.
    const initKeyRef = useRef(null);
    const [showCalculator, setShowCalculator] = useState(false);
    // Menu « ⋯ » d'une ligne du devis (monter, descendre, option, calculatrice…)
    const [lineMenuId, setLineMenuId] = useState(null);
    useEffect(() => {
        if (!lineMenuId) return;
        const close = () => setLineMenuId(null);
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
    }, [lineMenuId]);
    const [activeCalculatorItem, setActiveCalculatorItem] = useState(null);
    const [showReviewRequestModal, setShowReviewRequestModal] = useState(false);
    // Quand le modal s'ouvre automatiquement après l'envoi/paiement, on renvoie
    // l'utilisateur vers la liste à la fermeture. Lorsqu'il l'ouvre manuellement
    // (bouton "Demander un avis"), on reste sur la facture en cours.
    const [reviewNavigateOnClose, setReviewNavigateOnClose] = useState(true);
    const [initialStatus, setInitialStatus] = useState('draft');
    const [focusedInput, setFocusedInput] = useState(null);
    const [fullScreenEditItem, setFullScreenEditItem] = useState(null);
    const [showAdvancedQuoteOptions, setShowAdvancedQuoteOptions] = useState(false);
    const [showGroupedModeHelp, setShowGroupedModeHelp] = useState(false);
    const [showItemTypesHelp, setShowItemTypesHelp] = useState(false);
    const [showCsvFormatHelp, setShowCsvFormatHelp] = useState(false);
    const [showMaterialDepositHelp, setShowMaterialDepositHelp] = useState(false);
    const [showSpecialStatuses, setShowSpecialStatuses] = useState(false);
    const [dismissedHelps, setDismissedHelps] = useState(readDismissedHelps);
    const dismissHelp = (key) => {
        setDismissedHelps(prev => {
            const next = { ...prev, [key]: true };
            try { localStorage.setItem(DISMISSED_HELPS_KEY, JSON.stringify(next)); } catch { /* stockage indisponible */ }
            return next;
        });
    };
    const [isExiting, setIsExiting] = useState(false);

    // Follow-up state
    const [followUpSteps, setFollowUpSteps] = useState([]);
    const [markingFollowUp, setMarkingFollowUp] = useState(false);

    // AI Assistant State
    const [showAIModal, setShowAIModal] = useState(false);

    // Chiffrage interne : id de la ligne dont le panneau privé est déplié
    const [internalDetailItemId, setInternalDetailItemId] = useState(null);
    // Modale « Commander le matériel » (envoi des fournitures vers la liste d'achats)
    const [showSupplyModal, setShowSupplyModal] = useState(false);
    // Modale « Liste fournisseur » (matériel sans prix, à transmettre au fournisseur)
    const [showSupplierListModal, setShowSupplierListModal] = useState(false);

    // Client Presence State
    const [isClientOnline, setIsClientOnline] = useState(false);

    // Quote View History State
    const [showViewHistory, setShowViewHistory] = useState(false);
    const [viewCount, setViewCount] = useState(0);

    // Versions archivées (table quote_versions) — chaque version envoyée au client
    // est conservée ; un devis envoyé ne peut plus être modifié silencieusement.
    const [quoteVersions, setQuoteVersions] = useState([]);
    const [versionPdfLoading, setVersionPdfLoading] = useState(null);
    // L'artisan a explicitement déverrouillé un devis envoyé pour créer une nouvelle version
    const [revisionUnlocked, setRevisionUnlocked] = useState(false);

    // --- Chronométrage et essai IA ---
    // Heure de début de création (ref pour ne pas déclencher de re-render)
    const creationStartRef = useRef(Date.now());
    // Langue d'un envoi demandé avant le premier enregistrement (repris après).
    const pendingSendRef = useRef(null);
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
                () => {
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
            if (data?.description) {
                setFormData(prev => ({
                    ...prev,
                    items: [...prev.items, {
                        id: Date.now(),
                        description: data.description,
                        quantity: data.quantity || 1,
                        unit: data.unit || tradeConfig.defaultUnit,
                        price: data.price || 0,
                        buying_price: 0,
                        type: data.type || 'service'
                    }]
                }));
                const qty = (data.quantity || 1).toLocaleString('fr-FR');
                const price = formatCurrency(data.price);
                toast.success('Ligne ajoutée', {
                    description: `${qty} ${data.unit || ''} × ${data.description} — ${price}${data.price ? '' : ' (prix à compléter)'}`,
                });
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
        const client = clients.find(c => c.id.toString() === clientId?.toString());
        setFormData(prev => ({
            ...prev,
            client_id: clientId,
            client_name: client?.name || prev.client_name,
        }));
        if (!clientId) return;

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

    const [formData, setFormData] = useState(createInitialFormData());

    const [showSituationModal, setShowSituationModal] = useState(false);
    const {
        signature,
        setSignature,
        showSignatureModal,
        setShowSignatureModal,
        handleSignatureSave,
        signatureSuspended,
        linkExpired,
        togglingSuspension,
        fetchLinkSuspended,
        suspensionBlockMessage,
        handleToggleSignatureSuspension,
        isDocumentClosed,
    } = useQuoteSignature({
        id,
        formData,
        setFormData,
        onSigned: () => {
            invalidateQuotes();
            updateClientCRMStatus(formData.client_id, 'signed');
        },
    });
    const {
        showDeductionModal,
        setShowDeductionModal,
        loadParentQuoteData,
        handleCreateAvenant,
        handleAddDeductionItems,
    } = useAvenantLogic({
        id,
        formData,
        setFormData,
        user,
        clients,
        navigate,
        setLoading,
        setShowActionsMenu,
    });
    // Avenant : modal de déduction des prestations du devis initial non réalisées
    const [diffAddress, setDiffAddress] = useState(false);

    // Avoir (facture rectificative) : document émis à montants négatifs,
    // immuable comme une facture — la plupart des actions (conversion,
    // acomptes, signature…) n'ont pas de sens pour lui.
    const isCreditNote = formData.type === 'credit_note';
    // Avenant : le périmètre est décrit par les blocs Constat / Nouvelle solution,
    // l'objet des travaux ferait double emploi (et n'est pas rendu sur le PDF).
    const isAmendmentDoc = formData.type === 'amendment';
    // Objet des travaux : replié par défaut pour ne pas alourdir un devis court,
    // proposé d'emblée dès que le devis s'organise en lots (2 sections ou plus)
    // — c'est là que le client a besoin de savoir ce que les lots forment
    // ensemble, surtout s'il doit justifier sa décision à un tiers.
    const [workObjectOpen, setWorkObjectOpen] = useState(false);
    const sectionCount = React.useMemo(
        () => (formData.items || []).filter(i => i.type === 'section').length,
        [formData.items]
    );
    const canHaveWorkObject = !isAmendmentDoc && !isCreditNote;
    const showWorkObject = canHaveWorkObject
        && (workObjectOpen || !!formData.work_object || sectionCount >= 2);

    // Derived: client currently selected in the form (used in JSX and handlers)
    const selectedClient = clients.find(c => formData.client_id && c.id.toString() === formData.client_id.toString()) || null;

    // --- AUTO SAVE LOGIC ---
    const draftKey = user ? `quote_draft_${id || 'new'}` : null;
    const { clearAutoSave, lastSaved, saving } = useAutoSave(draftKey, formData, !!user && !loading && dataLoaded);

    // Hors-ligne (sous-sol, chantier sans 4G) : l'enregistrement en base est
    // impossible, la saisie reste en brouillon local et on propose de
    // l'enregistrer dès le retour du réseau.
    const { isOnline, markPending, clearPending } = useOfflinePendingSave({
        label: 'Le devis',
        onSave: () => handleSubmit({ preventDefault: () => {} }),
    });
    const persistDraftNow = () => {
        if (!draftKey || !dataLoaded) return;
        try {
            localStorage.setItem(draftKey, JSON.stringify({ ...formData, _draft_saved_at: new Date().toISOString() }));
        } catch (e) {
            console.error('Draft save error:', e);
        }
    };
    const keepOfflineDraft = () => {
        persistDraftNow();
        markPending();
        pendingSendRef.current = null;
        toast.warning(offlineSaveMessage('le devis'), { id: 'offline-save', duration: 8000 });
    };

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
                            // Si le devis a été modifié ailleurs (autre appareil)
                            // depuis la dernière sauvegarde du brouillon local, on
                            // écarte le brouillon : il contient d'anciennes lignes
                            // qui écraseraient les chiffres frais de la base.
                            const dbUpdatedAt = prev.updated_at ? new Date(prev.updated_at).getTime() : 0;
                            const draftSavedAt = _draft_saved_at ? new Date(_draft_saved_at).getTime() : 0;
                            if (dbUpdatedAt && draftSavedAt && dbUpdatedAt > draftSavedAt) {
                                localStorage.removeItem(draftKey);
                                return prev;
                            }
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
                    await applyNavigationState(location.state, loadedClients, { setFormData, processImportedFile });
                }
            });
            fetchUserProfile();
        }
    }, [user, id]);

    // ── Imports : fichier PDF / Word / CSV, document externe, « Coller un tableau »
    const {
        importing,
        showImportZone,
        setShowImportZone,
        competitorImport,
        setCompetitorImport,
        isDragOver,
        setIsDragOver,
        showCsvPasteModal,
        setShowCsvPasteModal,
        pastedCsvText,
        setPastedCsvText,
        openCsvPasteModal,
        applyPastedCsv,
        processImportedFile,
        handleImportFile,
        handleExternalImport,
    } = useQuoteImport({
        fetchPriceLibrary,
        fileInputRef,
        isAiTrialSession,
        isEditing,
        priceLibrary,
        setFormData,
        user,
        userProfile,
    });

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

            // Pour un nouveau devis, un artisan en franchise de TVA
            // (micro-entreprise / auto-entrepreneur) ne facture pas la TVA —
            // décocher par défaut pour faire apparaître la mention « TVA non
            // applicable, art. 293 B du CGI » sur le PDF. Attention : sur la
            // route /app/devis/new, `id` vaut la chaîne 'new' (truthy) — il
            // faut tester isEditing, pas `!id`.
            if (!isEditing && aiPrefs.artisan_status === 'micro_entreprise') {
                setFormData(prev => ({ ...prev, include_tva: false }));
            }
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
                setFormData(quoteRowToFormData(data));

                if (data.intervention_address || data.intervention_city) {
                    setDiffAddress(true);
                }

                // Avenant : total du devis initial, situations et acomptes déjà facturés,
                // avenants précédents signés.
                if (data.parent_quote_id) await loadParentQuoteData(data.parent_quote_id, data.id);

                // Marge réalisée consolidée du chantier (voir useQuoteMargin).
                await quoteMargins.loadChantierDocs(data);

                // Facture de situation : (re)calcule le contexte d'avancement depuis
                // le devis parent à chaque ouverture, pour que le récapitulatif du PDF
                // et le mail d'envoi reflètent les situations créées ou annulées
                // entre-temps. Les situations créées avant cette fonctionnalité (sans
                // contexte mémorisé) sont reconnues via leur titre.
                const isSituationInvoice = data.type === 'invoice' && data.parent_id &&
                    (data.amendment_details?.situation || /situation/i.test(data.title || ''));
                if (isSituationInvoice) {
                    const { data: parentQuote } = await supabase
                        .from('quotes')
                        .select('id, quote_number, date, title, total_ttc')
                        .eq('id', data.parent_id)
                        .single();

                    if (parentQuote) {
                        const { data: siblingInvoices } = await supabase
                            .from('quotes')
                            .select('id, total_ttc, title, amendment_details')
                            .eq('parent_id', data.parent_id)
                            .eq('type', 'invoice')
                            .neq('status', 'cancelled');

                        // "Déjà facturé" = factures rattachées au même devis émises
                        // avant celle-ci (l'id croît avec l'ordre de création).
                        const previous = (siblingInvoices || []).filter(inv => inv.id < data.id);
                        const previouslyBilled = previous.reduce((sum, inv) => sum + (inv.total_ttc || 0), 0);
                        const situation = {
                            parent_quote_id: parentQuote.id,
                            parent_quote_number: parentQuote.quote_number || parentQuote.id,
                            parent_date: parentQuote.date,
                            parent_title: parentQuote.title || '',
                            parent_total_ttc: parentQuote.total_ttc || 0,
                            previously_billed_ttc: previouslyBilled,
                            remaining_ttc: Math.max((parentQuote.total_ttc || 0) - previouslyBilled - (data.total_ttc || 0), 0),
                            index: previous.filter(inv =>
                                inv.amendment_details?.situation || /situation/i.test(inv.title || '')
                            ).length + 1,
                        };
                        setFormData(prev => ({
                            ...prev,
                            amendment_details: { ...(prev.amendment_details || {}), situation }
                        }));
                    }
                }

                setSignature(data.signature || null);
                setInitialStatus(data.status || 'draft');

                // Versions archivées du document (envois, modifications, restaurations)
                supabase
                    .from('quote_versions')
                    .select('id, version_number, reason, created_at, pdf_url, snapshot')
                    .eq('quote_id', id)
                    .order('version_number', { ascending: false })
                    .then(({ data: versions }) => setQuoteVersions(versions || []));

                // Load follow-up steps for the "Marquer comme relancé" button
                if (data.status === 'sent') {
                    getFollowUpSettings(user.id).then(settings => {
                        setFollowUpSteps(settings.steps || []);
                    });
                }
            }
        } catch {
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
                            const { data } = await supabase.storage
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

    // Auto-derive operation_category from item types so the Factur-X category
    // always reflects the actual content without manual intervention.
    useEffect(() => {
        const locked = ['accepted', 'billed', 'paid', 'cancelled'].includes(formData.status);
        if (locked) return;
        const billableItems = (formData.items || []).filter(i => i.type !== 'section');
        if (billableItems.length === 0) return;
        const hasService = billableItems.some(i => (i.type || 'service') !== 'material');
        const hasMaterial = billableItems.some(i => i.type === 'material');
        const derived = hasService && hasMaterial ? 'mixed' : hasMaterial ? 'goods' : 'service';
        if (derived !== formData.operation_category) {
            setFormData(prev => ({ ...prev, operation_category: derived }));
        }
    }, [formData.items]); // eslint-disable-line react-hooks/exhaustive-deps

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
        const index = formData.items.findIndex(item => item.id === id);
        if (index === -1) return;
        const removed = formData.items[index];
        setFormData(prev => ({
            ...prev,
            items: prev.items.filter(item => item.id !== id)
        }));
        // Suppression annulable : un tap involontaire (gants, chantier) ne doit pas faire perdre une ligne
        const label = removed.type === 'section' ? 'Section supprimée' : 'Ligne supprimée';
        toast(label, {
            description: removed.description ? removed.description.slice(0, 80) : undefined,
            duration: 6000,
            action: {
                label: 'Annuler',
                onClick: () => setFormData(prev => {
                    if (prev.items.some(item => item.id === id)) return prev;
                    const items = [...prev.items];
                    items.splice(Math.min(index, items.length), 0, removed);
                    return { ...prev, items };
                }),
            },
        });
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

    // Applique un article de la Bibliothèque de Prix à une ligne : le prix de
    // vente, le prix d'achat (BPU) et le type suivent ensemble — la marge du
    // devis est juste sans ressaisie du coût fournisseur.
    const applyLibraryItem = (itemId, lib, { withDescription = false } = {}) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.map(item =>
                item.id === itemId
                    ? {
                        ...item,
                        ...(withDescription ? { description: lib.description } : {}),
                        price: lib.price,
                        buying_price: parseFloat(lib.buying_price) || 0,
                        ...(lib.type ? { type: lib.type } : {})
                    }
                    : item
            )
        }));
    };

    // Toggling option_group_required affects every item in the same group, so
    // they stay consistent (the public client view reads this flag from the
    // first item of the group).
    const setOptionGroupRequired = (groupName, required) => {
        if (!groupName) return;
        setFormData(prev => ({
            ...prev,
            items: prev.items.map(item =>
                item.option_group === groupName
                    ? { ...item, option_group_required: required }
                    : item
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
        // Les lignes optionnelles (is_optional) ne font PAS partie du total ferme :
        // le devis public, le PDF et la RPC select_quote_options les excluent tous.
        // On aligne le total interne (listes, tableau de bord, acomptes, clôture)
        // sur cette même règle, sans quoi il est gonflé par des options non retenues.
        const lineItems = formData.items.filter(item => item.type !== 'section' && !item.is_optional);
        const subtotal = lineItems.reduce((sum, item) => sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0)), 0);
        // Coût matière : prix d'achat de la ligne, ou à défaut la somme des
        // fournitures du chiffrage interne (lignes groupées sans buying_price)
        const totalCost = lineItems.reduce((sum, item) => sum + effectiveLineCost(item), 0);
        const tva = formData.include_tva ? subtotal * 0.20 : 0;
        const total = subtotal + tva;
        return { subtotal, tva, total, totalCost };
    };

    // Génère le PDF tel que le CLIENT le verra. En présentation « poste global »,
    // la fusion des lignes (et son contrôle d'égalité) est demandée au serveur —
    // source de vérité unique, identique au lien public — avant le rendu ; les
    // modes detailed/grouped passent les items inchangés. Une incohérence
    // détectée côté serveur remonte ici sous forme d'erreur (pas de PDF faux).
    const generateClientPDF = async (devisData, ...rest) => {
        const data = devisData?.client_display_mode === 'poste_global'
            ? { ...devisData, items: await clientFacingItems(devisData.items, 'poste_global') }
            : devisData;
        return generateDevisPDF(data, ...rest);
    };

    // Titre de la section (Lot) courant pour chaque ligne, par index — sert au
    // défaut « à l'unité » du mode poste global (une ligne d'une section
    // technique fusionne dans le poste au lieu d'être détaillée).
    const sectionTitleByIndex = React.useMemo(() => {
        let current = '';
        return (formData.items || []).map((it) => {
            if (it.type === 'section') { current = it.description || ''; return current; }
            return current;
        });
    }, [formData.items]);






    // Ouvre le PDF d'une version archivée : le PDF figé s'il existe,
    // sinon une régénération à partir de l'instantané.
    const handleViewVersionPdf = async (version) => {
        try {
            setVersionPdfLoading(version.id);
            if (version.pdf_url) {
                let url = version.pdf_url;
                if (url.includes('/quote_files/')) {
                    const path = url.split('/quote_files/')[1];
                    const { data: signed } = await supabase.storage
                        .from('quote_files')
                        .createSignedUrl(decodeURIComponent(path), 3600);
                    if (signed?.signedUrl) url = signed.signedUrl;
                }
                window.open(url, '_blank');
                return;
            }
            const snap = version.snapshot || {};
            const snapClient = clients.find(c => c.id?.toString() === (snap.client_id ?? '').toString())
                || { name: snap.client_name || 'Client' };
            const blobUrl = await generateClientPDF(snap, snapClient, userProfile, snap.type === 'invoice', 'bloburl');
            window.open(blobUrl, '_blank');
        } catch (err) {
            console.error('Version PDF error:', err);
            toast.error('Impossible d\'afficher le PDF de cette version');
        } finally {
            setVersionPdfLoading(null);
        }
    };

    // Déverrouillage explicite d'un devis envoyé : l'artisan acte que la
    // version transmise reste archivée et que le client verra la nouvelle version.
    const handleUnlockRevision = async () => {
        const ok = await confirm({
            title: 'Modifier un devis envoyé',
            message: "Ce devis a déjà été transmis au client. La version envoyée reste archivée dans l'historique des versions, et le lien client affichera la nouvelle version après enregistrement. Continuer ?",
            confirmLabel: 'Créer une nouvelle version'
        });
        if (ok) setRevisionUnlocked(true);
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

    const { subtotal, tva, total } = calculateTotal();
    const quoteMargins = useQuoteMargin({
        id,
        formData,
        subtotal,
        laborCostRate: userProfile?.labor_cost_rate,
    });

    // Suggestion d'OTP à la signature : activée par défaut au-delà de 3000 €
    // pour un nouveau devis, tant que l'artisan n'a pas lui-même tranché (case
    // cochée/décochée à la main). Un devis déjà enregistré garde le choix fait
    // à l'époque, quel que soit le montant actuel — on ne réécrit jamais un
    // choix explicite en rouvrant un devis existant.
    useEffect(() => {
        if (isEditing || otpTouchedRef.current) return;
        const shouldRequireOtp = total >= 3000;
        setFormData(prev => (
            prev.require_otp === shouldRequireOtp ? prev : { ...prev, require_otp: shouldRequireOtp }
        ));
    }, [total, isEditing]);


    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        if (!formData.client_id) {
            toast.error('Veuillez sélectionner un client');
            setLoading(false);
            return;
        }

        if (isOffline()) {
            keepOfflineDraft();
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
                work_object: formData.work_object || null,
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
                include_tva: formData.include_tva,
                notes: formData.notes,
                status: formData.status,
                urgency: formData.urgency || 'normal',
                type: formData.type,
                client_display_mode: formData.client_display_mode || 'detailed',
                original_pdf_url: formData.original_pdf_url,
                is_external: formData.is_external,
                has_material_deposit: formData.has_material_deposit,
                deposit_percentage: formData.deposit_percentage || 0,
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
            let savedQuoteId = isEditing ? id : null;
            let savedRow = null;
            if (isEditing) {
                // For updates: exclude user_id, include updated_at
                const { user_id: _userId, ...updateData } = quoteData;
                const { data, error: updateError } = await supabase
                    .from('quotes')
                    .update({ ...updateData, updated_at: new Date() })
                    .eq('id', id)
                    .select(); // Ensure we get return data to verify

                if (!updateError && (!data || data.length === 0)) {
                    throw new Error("L'enregistrement a échoué (devis introuvable ou permissions insuffisantes).");
                }
                error = updateError;
                savedRow = data?.[0] ?? null;
            } else {
                const { data: insertData, error: insertError } = await supabase
                    .from('quotes')
                    .insert([quoteData])
                    .select();
                error = insertError;
                savedQuoteId = insertData?.[0]?.id ?? null;
                savedRow = insertData?.[0] ?? null;
            }

            if (error) throw error;

            // Numéro légal attribué par la base à l'émission (facture sortie du
            // statut brouillon) : on le remonte dans le formulaire et on prévient.
            if (savedRow?.invoice_number && savedRow.invoice_number !== formData.invoice_number) {
                setFormData(prev => ({ ...prev, invoice_number: savedRow.invoice_number }));
                toast.success(`${formData.type === 'credit_note' ? 'Avoir émis' : 'Facture émise'} sous le numéro ${savedRow.invoice_number}`);
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
                    const buyingPrice = parseFloat(item.buying_price) || 0;

                    if (seenDescriptions.has(normalizeDesc)) continue;
                    seenDescriptions.add(normalizeDesc);

                    const existing = libraryMap.get(normalizeDesc);

                    if (existing) {
                        // Update if price or known buying price differ — a
                        // buying price of 0 (unknown) never overwrites a real one
                        const priceChanged = Math.abs((existing.price || 0) - price) > 0.01;
                        const buyingChanged = buyingPrice > 0 && Math.abs((existing.buying_price || 0) - buyingPrice) > 0.01;
                        if (priceChanged || buyingChanged) {
                            toUpdate.push({
                                ...existing,
                                price: price,
                                ...(buyingPrice > 0 ? { buying_price: buyingPrice } : {}),
                                updated_at: new Date()
                            });
                        }
                    } else {
                        // Insert new
                        toInsert.push({
                            user_id: user.id,
                            description: desc,
                            price: price,
                            buying_price: buyingPrice,
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
            clearPending();
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

            // Demande d'avis Google dès la fin du chantier : on la déclenche
            // au passage en "Facturé" (facture émise), sans attendre le
            // paiement — c'est le moment idéal, le chantier vient d'être
            // terminé. On la déclenche aussi directement au passage en "Payé"
            // si l'étape "Facturé" a été sautée. On l'exclut sur les factures
            // intermédiaires (acompte / situation de travaux) où le chantier
            // n'est pas encore terminé.
            const justBilled = formData.status === 'billed' && initialStatus !== 'billed' && initialStatus !== 'paid';
            const justPaid = formData.status === 'paid' && initialStatus !== 'paid' && initialStatus !== 'billed';
            setInitialStatus(formData.status);
            if (justBilled || justPaid) {
                const titleLower = (formData.title || '').toLowerCase();
                const isIntermediateInvoice = titleLower.includes('acompte') || titleLower.includes('situation');
                if (!isIntermediateInvoice) {
                    setReviewNavigateOnClose(true);
                    setShowReviewRequestModal(true);
                    // Don't navigate, let user see the modal
                    return;
                }
            }
            // On reste sur le devis après l'enregistrement : il faut pouvoir
            // l'envoyer ensuite. Un nouveau devis bascule sur son URL d'édition.
            if (!isEditing && savedQuoteId) {
                navigate(`/app/devis/${savedQuoteId}`, { replace: true });
            }
        } catch (error) {
            pendingSendRef.current = null;
            console.error('Error saving quote:', error);
            if (isNetworkError(error)) {
                keepOfflineDraft();
                return;
            }
            toast.error('Erreur lors de la sauvegarde : ' + (error.message || error.details || error.hint || 'Erreur inconnue'));
        } finally {
            setLoading(false);
        }
    };

    // ── Envoi au client (mail, lien de signature, archivage de la version) ──
    const {
        emailPreview,
        setEmailPreview,
        showSendSuccess,
        handleNotifyWithdrawal,
        handleSendQuoteEmail,
        handleConfirmSendEmail,
    } = useQuoteEmail({
        captureEmail,
        clients,
        fetchLinkSuspended,
        formData,
        generateClientPDF,
        handleSubmit,
        id,
        isAmendmentDoc,
        isCreditNote,
        isEditing,
        isPushSubscribed,
        isPushSupported,
        isTestMode,
        pendingSendRef,
        persistDraftNow,
        quoteVersions,
        setFormData,
        setInitialStatus,
        setQuoteVersions,
        setRevisionUnlocked,
        subscribePush,
        subtotal,
        suspensionBlockMessage,
        total,
        tva,
        user,
        userProfile,
    });

    // ── Documents liés : acomptes, situation, clôture ───────────────────────
    const {
        depositNextStep,
        handleCreateDeposit,
        handleCreateMaterialDeposit,
        handleCreateSituation,
        handleSaveSituation,
        handleCreateClosingInvoice,
    } = useDepositActions({
        clients,
        confirm,
        formData,
        id,
        navigate,
        setLoading,
        setShowActionsMenu,
        setShowSituationModal,
        total,
        user,
    });

    // ── Avoir sur facture émise ──────────────────────────────────────────────
    const {
        creditNoteModal,
        setCreditNoteModal,
        openCreditNoteModal,
        handleCreateCreditNote,
    } = useCreditNote({
        formData,
        id,
        invalidateQuotes,
        navigate,
        selectedClient,
        setShowActionsMenu,
        total,
        user,
    });

    const handleDelete = async () => {
        // Une facture émise (numéro légal attribué) ne se supprime jamais : la
        // continuité de la séquence est une obligation fiscale. La base bloque
        // aussi (trigger protect_issued_invoices) — ceci évite l'appel inutile.
        if (formData.invoice_number) {
            toast.error(`La facture ${formData.invoice_number} a été émise : la réglementation interdit sa suppression. Créez un avoir pour l'annuler.`);
            return;
        }
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

    // `detailed: true` → copie interne : le PDF est rendu ligne à ligne quelle que
    // soit la présentation choisie pour le client, et reste disponible une fois le
    // devis verrouillé (accepté, facturé, payé). La présentation enregistrée n'est
    // pas modifiée : l'exemplaire du client, lui, ne change jamais.
    // `overrides` : champs fraîchement renvoyés par la base (ex. invoice_number
    // attribué à la conversion) pas encore visibles dans le formData de cette
    // closure — fusionnés dans le snapshot pour que le PDF les reflète.
    const handleDownloadPDF = async (forceInvoice = false, { detailed = false, overrides = null } = {}) => {
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
                amendment_details: formData.amendment_details || {},
                ...(detailed ? { client_display_mode: 'detailed', internal_copy: true } : {}),
                ...(overrides || {})
            };

            // console.log('Generating PDF with data:', { devisData, selectedClient, user: userProfile });
            await generateClientPDF(devisData, selectedClient, userProfile, isInvoice);
            toast.success(
                detailed
                    ? 'Copie interne détaillée générée'
                    : (isInvoice ? 'Facture générée avec succès' : 'PDF généré avec succès')
            );
        } catch (error) {
            console.error('Error generating PDF:', error);
            toast.error('Erreur lors de la génération du PDF : ' + error.message);
        }
    };

    // « Aperçu PDF » depuis l'éditeur : bascule vers la même vue aperçu qu'un
    // devis déjà finalisé, sur place (pas de nouvelle fenêtre/onglet — un
    // window.open() ouvrait le PDF hors de l'application, dans une fenêtre à
    // part que l'artisan ne repérait pas toujours). L'aperçu déjà en cache
    // est jeté pour refléter les modifications faites depuis la dernière
    // vue (édition en cours, ou entrée automatique sur un document non-brouillon).
    const handlePreview = () => {
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

        if (formData.type === 'invoice' && (!userProfile?.iban || userProfile.iban.length < 5)) {
            toast.warning("Attention : Votre IBAN n'est pas renseigné.", {
                description: "Pensez à l'ajouter dans votre profil pour qu'il apparaisse sur la facture.",
                duration: 4000
            });
        }

        setOverviewPdfUrl(prev => {
            if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
            return null;
        });
        setOverviewError(null);
        setPdfOverviewMode(true);
    };

    // Génère (en mémoire) le PDF affiché dans la vue « aperçu » d'un devis finalisé.
    // Réutilise la génération client — le rendu est identique à ce que voit le client.
    const generateOverviewPdf = async () => {
        // Document externe : on affiche directement le PDF importé, pas de génération.
        if (formData.is_external) return;
        if (!userProfile) {
            fetchUserProfile();
            return;
        }
        const selectedClient = clients.find(c => c.id?.toString() === formData.client_id?.toString());
        if (!selectedClient) {
            setOverviewError('client');
            return;
        }
        setOverviewLoading(true);
        setOverviewError(null);
        try {
            const isInvoice = formData.type === 'invoice';
            const devisData = {
                id: isEditing ? id : 'PROVISOIRE',
                ...formData,
                items: formData.items.map(i => ({
                    ...i,
                    quantity: parseFloat(i.quantity) || 0,
                    price: parseFloat(i.price) || 0,
                })),
                total_ht: subtotal,
                total_tva: tva,
                total_ttc: total,
                include_tva: formData.include_tva,
                has_material_deposit: formData.has_material_deposit,
                amendment_details: formData.amendment_details || {},
            };
            const blob = await generateClientPDF(devisData, selectedClient, userProfile, isInvoice, 'blob');
            if (!blob) throw new Error("La génération du PDF n'a retourné aucun document");
            const url = URL.createObjectURL(blob);
            setOverviewPdfUrl(prev => {
                if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
                return url;
            });

            // Sur mobile, l'<iframe> ne rend pas le PDF blob: → on rastérise les
            // pages en images (affichées au fur et à mesure). Un nouvel appel
            // invalide le rendu précédent via overviewRenderIdRef.
            if (overviewUsesImages) {
                const renderId = ++overviewRenderIdRef.current;
                const isStale = () => overviewRenderIdRef.current !== renderId;
                let rendered = 0;
                setOverviewImagesFailed(false);
                setOverviewPageImages(prev => {
                    prev.forEach(u => { if (u.startsWith('blob:')) URL.revokeObjectURL(u); });
                    return [];
                });
                renderPdfBlobToPageImages(blob, isStale, (pageUrl) => {
                    if (isStale()) {
                        if (pageUrl.startsWith('blob:')) URL.revokeObjectURL(pageUrl);
                        return;
                    }
                    rendered++;
                    setOverviewPageImages(prev => [...prev, pageUrl]);
                }).catch(err => {
                    console.error('Overview page rendering failed:', err);
                    // Rastérisation en échec sans aucune page : on évite le spinner
                    // infini et on montre le repli (télécharger / plein écran).
                    if (!isStale() && rendered === 0) setOverviewImagesFailed(true);
                });
            }
        } catch (error) {
            console.error('Error generating overview PDF:', error);
            setOverviewError(error.message || 'unknown');
        } finally {
            setOverviewLoading(false);
        }
    };

    // À l'ouverture d'un devis déjà finalisé (statut ≠ brouillon), on bascule
    // automatiquement en vue « aperçu PDF ». On ne le fait qu'une seule fois pour
    // ne pas repiéger l'utilisateur qui a cliqué « Modifier ».
    useEffect(() => {
        if (overviewInitedRef.current) return;
        if (!isEditing || !dataLoaded) return;
        overviewInitedRef.current = true;
        if (formData.status && formData.status !== 'draft') {
            setPdfOverviewMode(true);
        }
    }, [isEditing, dataLoaded, formData.status]);

    // Envoi demandé sur un devis pas encore enregistré : reprend une fois le
    // devis rechargé depuis la base sous son URL d'édition (updated_at posé).
    useEffect(() => {
        if (!isEditing || !dataLoaded || !formData.updated_at || !pendingSendRef.current) return;
        const lang = pendingSendRef.current;
        pendingSendRef.current = null;
        handleSendQuoteEmail(lang);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEditing, dataLoaded, formData.updated_at]);

    // Génère le PDF dès qu'on entre en vue aperçu (une fois les données prêtes).
    useEffect(() => {
        if (!pdfOverviewMode) return;
        if (formData.is_external) return;              // PDF externe : affiché tel quel
        if (overviewPdfUrl || overviewLoading) return; // déjà généré / en cours
        if (!dataLoaded || !userProfile) return;       // attendre les données
        generateOverviewPdf();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pdfOverviewMode, dataLoaded, userProfile, clients]);

    // Libère l'URL blob de l'aperçu au démontage.
    useEffect(() => () => {
        if (overviewPdfUrl && overviewPdfUrl.startsWith('blob:')) URL.revokeObjectURL(overviewPdfUrl);
    }, [overviewPdfUrl]);

    // Miroir des URLs d'images d'aperçu + libération au démontage (les rendus
    // successifs révoquent déjà les précédents dans generateOverviewPdf).
    useEffect(() => { overviewPageImagesRef.current = overviewPageImages; }, [overviewPageImages]);
    useEffect(() => () => {
        overviewPageImagesRef.current.forEach(u => { if (u.startsWith('blob:')) URL.revokeObjectURL(u); });
    }, []);


    const handleConvertToInvoice = async () => {
        const okConv = await confirm({
            title: 'Facturer ce devis',
            message: 'Le devis devient une facture finale : mêmes lignes, numéro légal attribué, PDF prêt à envoyer. À utiliser quand les travaux sont terminés. Pour un acompte ou une facturation par avancement, passez plutôt par « Acompte matériel » ou « Situation de travaux » dans le menu ⋮.',
            confirmLabel: 'Convertir en facture',
        });
        if (!okConv) return;

        try {
            // Le trigger set_invoice_number attribue le numéro légal (FAC-AAAA-NNNN)
            // au moment de l'émission : on le récupère pour l'afficher et le
            // reporter sur le PDF généré dans la foulée.
            const { data: converted, error } = await supabase
                .from('quotes')
                .update({ status: 'accepted', type: 'invoice' })
                .eq('id', id)
                .select('invoice_number')
                .single();

            if (error) throw error;

            const invoiceNumber = converted?.invoice_number || null;
            setFormData(prev => ({ ...prev, status: 'accepted', type: 'invoice', invoice_number: invoiceNumber }));
            setInitialStatus('accepted');
            toast.success(`Devis converti en facture${invoiceNumber ? ` ${invoiceNumber}` : ''} — pensez à l'envoyer au client`);
            invalidateQuotes();
            updateClientCRMStatus(formData.client_id, 'accepted');
            await handleDownloadPDF(true, { overrides: { type: 'invoice', status: 'accepted', invoice_number: invoiceNumber } });
        } catch (error) {
            toast.error('Erreur lors de la conversion');
            console.error('Error converting to invoice:', error);
        }
    };

    const handleBack = () => {
        setIsExiting(true);
        setTimeout(() => navigate('/app/devis'), 260);
    };

    // Verrouillage si Signé/Facturé/Payé/Annulé
    // Un devis envoyé est verrouillé par défaut : la version transmise au client
    // fait foi. L'artisan peut le déverrouiller explicitement (nouvelle version,
    // l'ancienne restant archivée dans quote_versions).
    const isLocked = ['accepted', 'billed', 'paid', 'cancelled'].includes(formData.status)
        || (formData.status === 'sent' && !revisionUnlocked);

    // Étapes de la barre de progression mobile (DevisProgress)
    const progressSteps = [
        { id: 'client', label: 'Client', done: !!formData.client_id, targetId: 'devis-step-client' },
        { id: 'title', label: 'Titre', done: !!(formData.title || '').trim(), targetId: 'devis-title' },
        {
            id: 'lines',
            label: 'Lignes',
            done: (formData.items || []).some(i =>
                i.type !== 'section' && (i.description || '').trim() && (parseFloat(i.price) || 0) > 0),
            targetId: 'devis-step-lines',
        },
        { id: 'send', label: 'Envoi', done: !!formData.status && formData.status !== 'draft', targetId: 'devis-step-top' },
    ];

    if (isEditing && !dataLoaded) {
        return (
            <div className="max-w-4xl mx-auto pb-12 flex items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <span className="text-sm">Chargement du document...</span>
                </div>
            </div>
        );
    }

    // ─── Vue « aperçu PDF » d'un devis finalisé ───────────────────────────────
    // Présente le document tel que le client le voit, avec accès direct à
    // l'éditeur via « Modifier ». Le PDF affiché est soit le document importé
    // (mode externe), soit le PDF généré à la volée.
    // ── Documents liés : entrées de menu et modales partagées ────────────────
    // Ouvrir un devis depuis la liste mène à l'aperçu PDF ; devoir passer par
    // « Modifier » pour générer un acompte ou une facture de clôture n'avait pas
    // lieu d'être. Les mêmes entrées servent donc au menu « … » de l'éditeur et
    // au menu de l'aperçu — une seule source de vérité pour leurs conditions
    // d'affichage, et les modales qu'elles ouvrent sont rendues dans les deux vues.
    const canConvertToInvoice = id && id !== 'new' && formData.type === 'quote'
        && !['billed', 'paid', 'cancelled'].includes(formData.status);
    // Acompte, situation, clôture, avenant : réservés au document racine — une
    // facture enfant ne retrouverait pas les acomptes à déduire.
    const canCreateLinkedDocs = !!id && ['accepted', 'sent', 'billed'].includes(formData.status)
        && !formData.parent_id;
    const canCreateCreditNote = id && id !== 'new' && formData.type === 'invoice' && !!formData.invoice_number;
    const hasDocumentActions = canConvertToInvoice || canCreateLinkedDocs || canCreateCreditNote;

    const renderDocumentActions = (closeMenu = () => {}) => (
        <DocumentActionsMenuItems
            canConvertToInvoice={canConvertToInvoice}
            canCreateCreditNote={canCreateCreditNote}
            canCreateLinkedDocs={canCreateLinkedDocs}
            closeMenu={closeMenu}
            handleConvertToInvoice={handleConvertToInvoice}
            handleCreateAvenant={handleCreateAvenant}
            handleCreateClosingInvoice={handleCreateClosingInvoice}
            handleCreateDeposit={handleCreateDeposit}
            handleCreateMaterialDeposit={handleCreateMaterialDeposit}
            handleCreateSituation={handleCreateSituation}
            openCreditNoteModal={openCreditNoteModal}
        />
    );

    const renderDocumentActionModals = () => (
        <DocumentActionModals
            creditNoteModal={creditNoteModal}
            formData={formData}
            handleAddDeductionItems={handleAddDeductionItems}
            handleCreateCreditNote={handleCreateCreditNote}
            handleSaveSituation={handleSaveSituation}
            id={id}
            setCreditNoteModal={setCreditNoteModal}
            setShowDeductionModal={setShowDeductionModal}
            setShowSituationModal={setShowSituationModal}
            showDeductionModal={showDeductionModal}
            showSituationModal={showSituationModal}
            total={total}
        />
    );

    // Bandeau « signature suspendue » — rendu à l'identique dans l'éditeur et
    // dans l'aperçu : depuis l'aperçu aussi, l'artisan doit voir que son client
    // ne peut plus signer, et pouvoir rouvrir sans passer par l'éditeur.
    const suspendedSignatureBanner = signatureSuspended ? (
        <SuspendedSignatureBanner
            handleNotifyWithdrawal={handleNotifyWithdrawal}
            handleToggleSignatureSuspension={handleToggleSignatureSuspension}
            togglingSuspension={togglingSuspension}
        />
    ) : null;

    // Accès au suivi de l'affaire : dès que le devis est parti chez le client,
    // ou depuis un document lié (acompte, avenant, clôture). Un avoir se
    // rattache à une facture, pas au devis : il n'y donne pas accès.
    const affaireLink = isEditing && id && id !== 'new' && formData.type !== 'credit_note'
        && (formData.parent_id || (formData.status && formData.status !== 'draft'))
        ? <AffaireLink id={formData.parent_id || id} />
        : null;

    if (dataLoaded && pdfOverviewMode) {
        return (
            <div className="max-w-5xl mx-auto pb-12 animate-slide-in-right">
                <PdfOverview
                    displayPdfUrl={displayPdfUrl}
                    formData={formData}
                    generateOverviewPdf={generateOverviewPdf}
                    handleBack={handleBack}
                    handleDownloadPDF={handleDownloadPDF}
                    hasDocumentActions={hasDocumentActions}
                    id={id}
                    isEditing={isEditing}
                    linkExpired={linkExpired}
                    overviewError={overviewError}
                    overviewImagesFailed={overviewImagesFailed}
                    overviewPageImages={overviewPageImages}
                    overviewPdfUrl={overviewPdfUrl}
                    overviewUsesImages={overviewUsesImages}
                    renderDocumentActionModals={renderDocumentActionModals}
                    renderDocumentActions={renderDocumentActions}
                    setOverviewError={setOverviewError}
                    setPdfOverviewMode={setPdfOverviewMode}
                    setShowOverviewDocsMenu={setShowOverviewDocsMenu}
                    showOverviewDocsMenu={showOverviewDocsMenu}
                    signatureSuspended={signatureSuspended}
                    suspendedSignatureBanner={suspendedSignatureBanner}
                    affaireLink={affaireLink}
                />
            </div>
        );
    }

    return (
        <div className={`max-w-4xl mx-auto pb-12 sm:pb-12 pb-28 ${isExiting ? 'animate-slide-out-right' : 'animate-slide-in-right'}`}>

            {/* Bandeau contre-proposition — affiché tant que l'artisan n'a pas masqué */}
            {competitorImport && (
                <CompetitorImportBanner
                    competitorImport={competitorImport}
                    formData={formData}
                    setCompetitorImport={setCompetitorImport}
                />
            )}

            {suspendedSignatureBanner}

            {isLocked && (
                <LockedDocumentBanner
                    formData={formData}
                    handleCreateAvenant={handleCreateAvenant}
                    handleUnlockRevision={handleUnlockRevision}
                />
            )}

            {affaireLink}

            {depositNextStep && (() => {
                const toTTC = (ht) => (depositNextStep.root.include_tva ? ht * 1.2 : ht);
                return (
                    <DepositNextStepCard
                        variant={depositNextStep.variant}
                        rootId={depositNextStep.root.id}
                        rootRef={depositNextStep.root.quote_number || depositNextStep.root.id}
                        amountTTC={toTTC(depositNextStep.remainingHT)}
                        alreadyIssuedTTC={toTTC(depositNextStep.alreadyIssuedHT)}
                        previousLabels={depositNextStep.previous.map(d => d.invoice_number || `n°${d.id}`)}
                        amendmentLabels={depositNextStep.amendmentShare.labels}
                        onGenerate={handleCreateMaterialDeposit}
                        loading={loading}
                    />
                );
            })()}

            {/* Historique des versions archivées — la trace de ce qui a été envoyé au client */}
            {isEditing && quoteVersions.length > 0 && (
                <QuoteVersionsPanel
                    handleViewVersionPdf={handleViewVersionPdf}
                    quoteVersions={quoteVersions}
                    versionPdfLoading={versionPdfLoading}
                />
            )}
            {/* Bandeau "Essai IA actif" — visible pendant toute la session d'essai */}
            {isAiTrialSession && !isEditing && (
                <div className="bg-indigo-600 text-white rounded-2xl px-4 py-2.5 mb-4 flex items-center gap-2 text-sm">
                    <Sparkles className="w-4 h-4 flex-shrink-0" />
                    <span className="font-medium">Essai IA actif</span>
                    <span className="text-indigo-200">— Le temps de création est mesuré. Enregistrez quand votre devis est prêt.</span>
                </div>
            )}

            {/* Bandeau premier devis — masquable, localStorage */}
            {showFirstDevisTip && (
                <FirstDevisTip
                    dismissDevisTip={dismissDevisTip}
                />
            )}

            <EditorToolbar
                canConvertToInvoice={canConvertToInvoice}
                fetchLinkSuspended={fetchLinkSuspended}
                fileInputRef={fileInputRef}
                formData={formData}
                handleBack={handleBack}
                handleConvertToInvoice={handleConvertToInvoice}
                handleDelete={handleDelete}
                handleDownloadPDF={handleDownloadPDF}
                handleExternalImport={handleExternalImport}
                handleImportFile={handleImportFile}
                handleNotifyWithdrawal={handleNotifyWithdrawal}
                handlePreview={handlePreview}
                handleSendQuoteEmail={handleSendQuoteEmail}
                handleSubmit={handleSubmit}
                handleToggleSignatureSuspension={handleToggleSignatureSuspension}
                id={id}
                importing={importing}
                isClientOnline={isClientOnline}
                isCreditNote={isCreditNote}
                isDocumentClosed={isDocumentClosed}
                isEditing={isEditing}
                isLocked={isLocked}
                isOnline={isOnline}
                lastSaved={lastSaved}
                loading={loading}
                openCsvPasteModal={openCsvPasteModal}
                renderDocumentActions={renderDocumentActions}
                saving={saving}
                setFormData={setFormData}
                setPdfOverviewMode={setPdfOverviewMode}
                setReviewNavigateOnClose={setReviewNavigateOnClose}
                setShowActionsMenu={setShowActionsMenu}
                setShowReviewRequestModal={setShowReviewRequestModal}
                setShowSignatureModal={setShowSignatureModal}
                setShowViewHistory={setShowViewHistory}
                showActionsMenu={showActionsMenu}
                signature={signature}
                signatureSuspended={signatureSuspended}
                suspensionBlockMessage={suspensionBlockMessage}
                togglingSuspension={togglingSuspension}
                viewCount={viewCount}
            />

            {/* ── Zone d'import PDF (nouveau devis uniquement) ─────────────────── */}
            {!isEditing && showImportZone && (
                <ImportDropZone
                    dismissHelp={dismissHelp}
                    dismissedHelps={dismissedHelps}
                    fileInputRef={fileInputRef}
                    importing={importing}
                    isDragOver={isDragOver}
                    openCsvPasteModal={openCsvPasteModal}
                    processImportedFile={processImportedFile}
                    setIsDragOver={setIsDragOver}
                    setShowCsvFormatHelp={setShowCsvFormatHelp}
                    setShowImportZone={setShowImportZone}
                    showCsvFormatHelp={showCsvFormatHelp}
                />
            )}

            {/* External PDF Mode / Manual Totals */}
            {formData.is_external ? (
                <ExternalDocumentPanel
                    displayPdfUrl={displayPdfUrl}
                    formData={formData}
                    setFormData={setFormData}
                />
            ) : null}

            {/* Progression (mobile) : où en est la saisie sur chantier */}
            {!formData.is_external && !isLocked && (
                <DevisProgress steps={progressSteps} />
            )}

            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-8 space-y-8">
                {/* En-tête Devis */}
                <QuoteHeaderFields
                    canHaveWorkObject={canHaveWorkObject}
                    clients={clients}
                    diffAddress={diffAddress}
                    followUpSteps={followUpSteps}
                    formData={formData}
                    handleClientChange={handleClientChange}
                    handleMarkAsFollowedUp={handleMarkAsFollowedUp}
                    id={id}
                    isCreditNote={isCreditNote}
                    isLocked={isLocked}
                    markingFollowUp={markingFollowUp}
                    navigate={navigate}
                    otpTouchedRef={otpTouchedRef}
                    setDiffAddress={setDiffAddress}
                    setFormData={setFormData}
                    setShowAdvancedQuoteOptions={setShowAdvancedQuoteOptions}
                    setShowSpecialStatuses={setShowSpecialStatuses}
                    setShowViewHistory={setShowViewHistory}
                    setWorkObjectOpen={setWorkObjectOpen}
                    showAdvancedQuoteOptions={showAdvancedQuoteOptions}
                    showSpecialStatuses={showSpecialStatuses}
                    showWorkObject={showWorkObject}
                    total={total}
                    viewCount={viewCount}
                />

                {/* Amendment Configuration Fields */}
                {formData.type === 'amendment' && (
                    <div className="mb-8">
                        {/* Guide contextuel : évite les erreurs courantes sur les avenants
                            (saisie du delta, signature, facturation via la clôture). Masquable. */}
                        <DismissibleHelp storageKey="avenant_lifecycle" className="mb-4">
                            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-4 pr-10 text-sm">
                                <p className="font-semibold flex items-center gap-2 mb-1.5 text-orange-900 dark:text-orange-200">
                                    <Info className="w-4 h-4 flex-shrink-0" /> Comment fonctionne un avenant
                                </p>
                                <ul className="list-disc list-inside space-y-1 text-orange-800 dark:text-orange-300/90 text-[13px] leading-relaxed">
                                    <li>Saisissez uniquement les lignes <strong>ajoutées ou retirées</strong> (le delta, en +/−). Le nouveau total du projet se calcule automatiquement.</li>
                                    <li>Pour retirer des prestations du devis initial <strong>non réalisées</strong>, utilisez le bouton « Déduire du devis initial » sous les lignes : elles sont reprises en négatif, sans ressaisie.</li>
                                    <li>Faites‑le <strong>signer par le client</strong> (bouton « Envoyer ») : il passera en « Accepté ».</li>
                                    <li>Il sera <strong>facturé via la « Facture de Clôture »</strong> du devis initial (menu Actions du devis) — inutile, et déconseillé, de le convertir en facture.</li>
                                </ul>
                            </div>
                        </DismissibleHelp>
                        <AmendmentFields formData={formData} setFormData={setFormData} />
                    </div>
                )}

                {/* Lignes du devis */}
                <div id="devis-step-lines">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Détails : {tradeConfig.terms.task}s ({tradeConfig.terms.materials})
                    </h3>
                    {/* Présentation client : le devis reste détaillé ici (commandes,
                        chantiers) ; « Groupée » ne change que le PDF et le lien public. */}
                    {!formData.is_external && (
                        <ClientDisplayModeBar
                            dismissHelp={dismissHelp}
                            dismissedHelps={dismissedHelps}
                            formData={formData}
                            handleDownloadPDF={handleDownloadPDF}
                            isLocked={isLocked}
                            setFormData={setFormData}
                            setShowGroupedModeHelp={setShowGroupedModeHelp}
                            showGroupedModeHelp={showGroupedModeHelp}
                        />
                    )}
                    {/* Column headers — desktop only */}
                    <div className="hidden lg:flex gap-4 items-end mb-2 pb-2 border-b border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-400 uppercase tracking-wider select-none">
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
                            <QuoteItemRow
                                key={item.id}
                                applyLibraryItem={applyLibraryItem}
                                focusedInput={focusedInput}
                                formData={formData}
                                index={index}
                                insertItemAfter={insertItemAfter}
                                internalDetailItemId={internalDetailItemId}
                                isLocked={isLocked}
                                item={item}
                                lineMenuId={lineMenuId}
                                moveItem={moveItem}
                                priceLibrary={priceLibrary}
                                removeItem={removeItem}
                                sectionTitleByIndex={sectionTitleByIndex}
                                setActiveCalculatorItem={setActiveCalculatorItem}
                                setFocusedInput={setFocusedInput}
                                setFullScreenEditItem={setFullScreenEditItem}
                                setInternalDetailItemId={setInternalDetailItemId}
                                setLineMenuId={setLineMenuId}
                                setOptionGroupRequired={setOptionGroupRequired}
                                setShowCalculator={setShowCalculator}
                                updateItem={updateItem}
                                userProfile={userProfile}
                            />
                        ))}
                    </div>

                    <ItemsToolbar
                        addItem={addItem}
                        addSection={addSection}
                        dismissHelp={dismissHelp}
                        dismissedHelps={dismissedHelps}
                        formData={formData}
                        isLocked={isLocked}
                        openCsvPasteModal={openCsvPasteModal}
                        setShowAIModal={setShowAIModal}
                        setShowDeductionModal={setShowDeductionModal}
                        setShowItemTypesHelp={setShowItemTypesHelp}
                        setShowSmartVoice={setShowSmartVoice}
                        setShowSupplierListModal={setShowSupplierListModal}
                        setShowSupplyModal={setShowSupplyModal}
                        setVoiceContext={setVoiceContext}
                        showItemTypesHelp={showItemTypesHelp}
                    />
                </div>

                <DevisAIModal
                    open={showAIModal}
                    onClose={() => setShowAIModal(false)}
                    onItemsGenerated={(newItems) => {
                        setFormData(prev => ({ ...prev, items: [...prev.items, ...newItems] }));
                        setUsedAiInSession(true);
                    }}
                    userProfile={userProfile}
                />

                <QuoteSupplyListModal
                    open={showSupplyModal}
                    onClose={() => setShowSupplyModal(false)}
                    quoteId={isEditing ? id : null}
                    quoteLabel={formData.title || (isEditing ? `Devis #${id}` : null)}
                    clientId={formData.client_id}
                    items={formData.items}
                />

                <QuoteSupplierListModal
                    open={showSupplierListModal}
                    onClose={() => setShowSupplierListModal(false)}
                    quoteLabel={formData.title || (isEditing ? `Devis #${id}` : null)}
                    items={formData.items}
                />

                {showCsvPasteModal && (
                    <QuoteCsvPasteModal
                        onClose={() => { setShowCsvPasteModal(false); setPastedCsvText(''); }}
                        onImport={applyPastedCsv}
                        hasExistingItems={formData.items.some(item => !isBlankItem(item))}
                        initialText={pastedCsvText}
                    />
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

                {/* Transmission e-facture — factures et avoirs sauvegardés, hors documents importés */}
                {['invoice', 'credit_note'].includes(formData.type) && id && !formData.is_external && (
                    <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                        <h4 className="text-sm font-semibold text-indigo-800 mb-1">
                            Facture électronique (Plateforme Agréée)
                        </h4>
                        <p className="text-xs text-indigo-600 mb-3">
                            Entre professionnels uniquement. Obligatoire pour les micro-entreprises et PME
                            à partir de septembre 2027 (les grandes entreprises depuis septembre 2026).
                        </p>
                        <InvoiceTransmissionStatus
                            devis={{ ...formData, id }}
                            client={selectedClient}
                            userProfile={userProfile}
                            onStatusChange={({ status, reference, error, reset }) => setFormData(prev => ({
                                ...prev,
                                transmission_status: reset ? null : (status ?? prev.transmission_status),
                                transmission_ref: reset ? null : (reference ?? prev.transmission_ref),
                                transmission_error: error ?? null,
                            }))}
                        />
                    </div>
                )}

                {/* Totaux */}
                <QuoteTotalsPanel
                    dismissHelp={dismissHelp}
                    dismissedHelps={dismissedHelps}
                    formData={formData}
                    isLocked={isLocked}
                    navigate={navigate}
                    quoteMargins={quoteMargins}
                    setFormData={setFormData}
                    setShowMaterialDepositHelp={setShowMaterialDepositHelp}
                    showMaterialDepositHelp={showMaterialDepositHelp}
                    subtotal={subtotal}
                    total={total}
                    tva={tva}
                />

                {/* Signature Display */}
                {signature && (
                    <div className="border-t border-gray-100 dark:border-gray-800 pt-6 mt-6">
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Signature du client</h4>
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 inline-block">
                            <img src={signature} alt="Signature Client" className="h-24 object-contain" />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                Signé le {formatDate(formData.signed_at || formData.updated_at || new Date())}
                            </p>
                        </div>
                    </div>
                )}

                {/* Notes */}
                <QuoteNotesSection
                    formData={formData}
                    isLocked={isLocked}
                    setFormData={setFormData}
                    setShowSmartVoice={setShowSmartVoice}
                    setVoiceContext={setVoiceContext}
                    subtotal={subtotal}
                    total={total}
                    tva={tva}
                />
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
                    if (reviewNavigateOnClose) {
                        navigate('/app/devis');
                    }
                }}
                client={clients.find(c => c.id == formData.client_id)}
                userProfile={userProfile}
                intervention={{
                    title: formData.title,
                    workDone: formData.description,
                    city: formData.intervention_city,
                    address: formData.intervention_address,
                }}
            />

            {showViewHistory && createPortal(
                <QuoteViewHistory
                    quoteId={id}
                    onClose={() => setShowViewHistory(false)}
                />,
                document.body
            )}

            {/* Email Preview Modal */}
            <DevisEmailModal
                preview={emailPreview}
                onClose={() => setEmailPreview(null)}
                onConfirm={handleConfirmSendEmail}
                formData={formData}
                clients={clients}
                userProfile={userProfile}
                quoteId={id}
                isEditing={isEditing}
                totals={{ subtotal, tva, total }}
            />
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

                        return (
                            <FullScreenItemEditor
                                applyLibraryItem={applyLibraryItem}
                                item={item}
                                priceLibrary={priceLibrary}
                                setFullScreenEditItem={setFullScreenEditItem}
                                updateItem={updateItem}
                            />
                        );
                    })()
                )
            }
            {renderDocumentActionModals()}

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

            {/* Mobile sticky bottom bar — Send + Save (reste visible pour un devis
                envoyé : ré-envoi et changement de statut restent possibles) */}
            {(!isLocked || formData.status === 'sent') && (
                <MobileActionBar
                    handleSendQuoteEmail={handleSendQuoteEmail}
                    handleSubmit={handleSubmit}
                    loading={loading}
                />
            )}

            {/* ── Animation de succès après envoi au client ── */}
            {showSendSuccess && (
                <SendSuccessOverlay />
            )}

            {/* Copilot Artisan : assistant IA avec contexte du devis courant */}
            <CopilotChat
                context={{
                    page: formData.type === 'invoice' ? 'Édition de facture' : 'Édition de devis',
                    today: formatDate(new Date(), { day: 'numeric', month: 'long', year: 'numeric' }),
                    facts: buildQuoteCopilotFacts(formData, { subtotal, total }),
                }}
                presets={[
                    { label: 'Rédige un email de relance',  prompt: 'Rédige un email de relance court et courtois pour ce devis. Ton professionnel, 4-5 phrases max, pas de relance trop insistante.' },
                    { label: 'Vérifie la cohérence',        prompt: 'Relis les lignes de ce devis : quantités, prix unitaires, lignes à 0 €, oublis probables (fournitures, main d\'œuvre, déplacement, mise en service) et marge. Signale seulement les points à revoir avant envoi.' },
                    { label: 'Suggère une remise commerciale', prompt: 'Quelle remise commerciale serait raisonnable sur ce devis pour augmenter mes chances qu\'il soit signé sans trop entamer ma marge ?' },
                ]}
            />
        </div>
    );

};

export default DevisForm;
