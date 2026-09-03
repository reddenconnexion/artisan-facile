import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Plus, Download, Save, Trash2, Printer, Send, Upload, FileText, Check, Calculator, Mic, MicOff, FileCheck, Layers, PenTool, Eye, Star, Loader2, ArrowUp, ArrowDown, Mail, Link, MoreVertical, MoreHorizontal, X, Sparkles, Copy, ExternalLink, ZoomIn, ZoomOut, Clock, Info, Lock, Unlock, ShoppingCart, HelpCircle, ChevronDown, Pencil, RefreshCw, AlertTriangle, Truck, ClipboardPaste, FilePlus, MinusCircle } from 'lucide-react';
import CopilotChat from '../components/CopilotChat';
import { validateFileForUpload, UPLOAD_PRESETS } from '../utils/uploadValidation';
import { isSignatureBlocked, isSignatureSuspended } from '../utils/quoteSignability';
import { publicLinkExpiry, publicLinkValidityLabel } from '../constants/publicLink';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useTestMode } from '../context/TestModeContext';
import { toast } from 'sonner';
import { generateDevisPDF } from '../utils/pdfGenerator';
import { isIosLikeDevice, renderPdfBlobToPageImages } from '../utils/pdfPageImages';
import { clientFacingItems, isPerUnit } from '../utils/clientView';
import { extractQuoteFromPdfText, translateQuoteContent } from '../utils/aiService';
import { useConfirm } from '../context/ConfirmContext';
import { recordFollowUp, getFollowUpSettings } from '../utils/followUpService';
import { clientGreetingName } from '../utils/clientGreeting';
import SignatureModal from '../components/SignatureModal';
import ReviewRequestModal from '../components/ReviewRequestModal';
import MarginGauge from '../components/MarginGauge';

// import { useVoice } from '../hooks/useVoice'; // Removed direct hook usage
import SmartVoiceModal from '../components/SmartVoiceModal'; // Added Smart Modal
import { extractTextFromPDF, extractTextFromDocx, parseQuoteItems, extractQuoteMetadata } from '../utils/documentParser';
import { parseQuoteCsv } from '../utils/quoteCsvImport';
import { buildCreditNotePayload, depositsNetOfCreditNotes } from '../utils/creditNote';
import { WORK_OBJECT_MAX_CHARS, workObjectLength } from '../utils/workObject';
import { getTradeConfig } from '../constants/trades';
import MaterialsCalculator from '../components/MaterialsCalculator';
import ClientSelector from '../components/ClientSelector';
import { getCoordinates, calculateDistance, getZoneFee } from '../utils/geoService';
import PaymentSchedule from '../components/PaymentSchedule';
import AmendmentFields from '../components/AmendmentFields'; // New Component
import AmendmentDeductionModal from '../components/AmendmentDeductionModal';
import InvoiceTransmissionStatus from '../components/InvoiceTransmissionStatus';
import { Input, Field, SegmentedControl } from '../components/ui';
import DismissibleHelp from '../components/ui/DismissibleHelp';
import { useAutoSave, getDraft } from '../hooks/useAutoSave';
import AutoSaveIndicator from '../components/AutoSaveIndicator';
import { useInvalidateCache, useProcurementCostByQuote, useSpentHoursByQuote } from '../hooks/useDataCache';
import { realizedQuoteMargin, isPartialScopeDoc } from '../utils/realizedMargin';
import { usePushNotifications } from '../hooks/usePushNotifications';
import QuoteViewHistory from '../components/QuoteViewHistory';
import SituationModal from '../components/SituationModal';
import AITrialOfferModal from '../components/AITrialOfferModal';
import AITrialComparisonModal from '../components/AITrialComparisonModal';
import DevisEmailModal from '../components/DevisEmailModal';
import DevisAIModal from '../components/DevisAIModal';
import LineInternalDetail from '../components/LineInternalDetail';
import QuoteSupplyListModal from '../components/QuoteSupplyListModal';
import QuoteSupplierListModal from '../components/QuoteSupplierListModal';
import QuoteCsvPasteModal from '../components/QuoteCsvPasteModal';
import { lineComponents, effectiveLineCost, supplyEntries, quoteMargin } from '../utils/quoteInternalDetail';
import { estimatedHoursFromItems, formatHours } from '../utils/timeTracking';
import { materialDepositAmounts, amendmentsTotalTTC, materialDepositInvoices, materialDepositStatus } from '../utils/materialDeposit';
import DepositNextStepCard from '../components/DepositNextStepCard';

// Aides « ? » du formulaire : chacune peut être supprimée définitivement
// (petite croix) une fois comprise — mémorisé par navigateur.
const DISMISSED_HELPS_KEY = 'devis_dismissed_helps';
const readDismissedHelps = () => {
    try { return JSON.parse(localStorage.getItem(DISMISSED_HELPS_KEY)) || {}; } catch { return {}; }
};

// Construit la version HTML du corps d'un email de devis. Le lien de
// signature (URL brute sur sa propre ligne dans le texte) est remplacé par
// un bouton « Signer » bien visible : sans ça, le client ne distingue pas le
// lien de signature d'un simple lien de consultation, et beaucoup renvoient
// le devis signé par mail. Le reste du texte est échappé, les sauts de ligne
// préservés et les autres URLs rendues cliquables. La signature (après le
// marqueur RFC 3676 "-- ") est retirée : l'edge function y rajoute sa propre
// signature HTML riche, sinon elle serait dupliquée.
const buildQuoteEmailHtml = (bodyText, signUrl, signLabel) => {
    const esc = (s) => s
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const marker = '\n\n-- \n';
    const sigIdx = bodyText.indexOf(marker);
    const main = sigIdx >= 0 ? bodyText.slice(0, sigIdx) : bodyText;

    // Bouton « bulletproof » (table + styles inline) pour un rendu fiable sur
    // la majorité des clients mail (Gmail, Outlook, Apple Mail…).
    const button = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;"><tr><td align="center" style="border-radius:12px;background-color:#2563eb;"><a href="${esc(signUrl)}" target="_blank" style="display:inline-block;padding:15px 34px;font-family:-apple-system,system-ui,'Segoe UI',sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">✍️ ${esc(signLabel)}</a></td></tr></table>`;

    const urlRe = /(https?:\/\/[^\s<>"]+)/g;
    const out = [];
    let inserted = false;
    for (const line of main.split('\n')) {
        // La ligne qui ne contient que l'URL de signature devient le bouton.
        if (signUrl && line.trim() === signUrl.trim()) {
            if (!inserted) { out.push(button); inserted = true; }
            continue;
        }
        const linked = esc(line).replace(urlRe, (u) => `<a href="${u}" style="color:#2563eb;">${u}</a>`);
        out.push(linked);
    }
    // Filet de sécurité : si l'URL a été modifiée/supprimée dans l'aperçu, on
    // ajoute quand même le bouton (avec l'URL d'origine) à la fin du corps.
    let html = out.join('<br>');
    if (!inserted) html += button;

    return `<div style="font-family:-apple-system,system-ui,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;color:#1f2937;">${html}</div>`;
};

// Entrée du menu « ⋯ » d'une ligne de devis.
const LineMenuItem = ({ icon, label, onClick, disabled = false, active = false }) => {
    const Icon = icon;
    return (
    <button
        type="button"
        role="menuitem"
        disabled={disabled}
        onClick={onClick}
        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:hover:bg-transparent ${active ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-200'}`}
    >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="flex-1">{label}</span>
        {active && <Check className="w-4 h-4 shrink-0" />}
    </button>
    );
};

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
    // Coûts d'achat réels (« Matériel à commander ») et heures pointées
    // (task_tracking) agrégés par devis, pour l'indicateur « Marge réalisée »
    // — lecture seule, le devis n'est pas modifié.
    const procurementCosts = useProcurementCostByQuote();
    const spentHoursMap = useSpentHoursByQuote();
    const { isSupported: isPushSupported, isSubscribed: isPushSubscribed, subscribe: subscribePush } = usePushNotifications();

    const [showSmartVoice, setShowSmartVoice] = useState(false); // New Smart Voice State
    const [voiceContext, setVoiceContext] = useState(null); // 'quote_item' or 'note'
    const [activeField, setActiveField] = useState(null); // 'notes' or 'item-description-{index}'
    const [priceLibrary, setPriceLibrary] = useState([]);
    const [showReviewMenu, setShowReviewMenu] = useState(false);
    const [showActionsMenu, setShowActionsMenu] = useState(false);
    // Menu « Documents » de l'aperçu PDF (mêmes entrées que le menu « … » de l'éditeur)
    const [showOverviewDocsMenu, setShowOverviewDocsMenu] = useState(false);
    const [importing, setImporting] = useState(false);
    const [showImportZone, setShowImportZone] = useState(false);
    const [competitorImport, setCompetitorImport] = useState(null);   // { filename, importedAt } quand on est en contre-proposition
    const [isDragOver, setIsDragOver] = useState(false);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [emailPreview, setEmailPreview] = useState(null);
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
    const [showSendSuccess, setShowSendSuccess] = useState(false);

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
    // Modale « Coller un tableau » : import CSV sans fichier (copie de cellules
    // Excel, CSV reçu par mail) — voir QuoteCsvPasteModal.
    const [showCsvPasteModal, setShowCsvPasteModal] = useState(false);
    const [pastedCsvText, setPastedCsvText] = useState('');

    // Client Presence State
    const [isClientOnline, setIsClientOnline] = useState(false);

    // Quote View History State
    const [showViewHistory, setShowViewHistory] = useState(false);
    const [viewCount, setViewCount] = useState(0);

    // Versions archivées (table quote_versions) — chaque version envoyée au client
    // est conservée ; un devis envoyé ne peut plus être modifié silencieusement.
    const [quoteVersions, setQuoteVersions] = useState([]);
    // « Prochaine étape » de facturation (acompte matériel restant), calculée
    // depuis le devis racine du chantier — affichée sur l'avenant signé et sur
    // le devis quand un avenant a laissé du matériel non couvert.
    const [depositNextStep, setDepositNextStep] = useState(null);
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

    const handleCalculatorApply = (quantity) => {
        if (activeCalculatorItem !== null) {
            updateItem(activeCalculatorItem, 'quantity', quantity);
            setShowCalculator(false);
            setActiveCalculatorItem(null);
            toast.success('Quantité mise à jour');
        }
    };

    // Agrandit un textarea à la hauteur de son contenu pour qu'une longue
    // description s'affiche en entier sans scroll interne. Plafonné pour ne pas
    // qu'une ligne très longue prenne tout l'écran.
    const autoGrow = (el) => {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
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

    const [formData, setFormData] = useState({
        client_id: '',
        title: '',
        work_object: '',
        public_token: '',
        // Lien public suspendu : le client peut avoir reçu le lien et ne doit
        // plus pouvoir signer tant que l'artisan ne le rouvre pas. C'est
        // `signature_suspended_at` qui l'atteste — `token_revoked` est aussi
        // levé par le ménage nocturne des liens expirés.
        token_revoked: false,
        signature_suspended_at: null,
        date: new Date().toISOString().split('T')[0],
        valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        items: [
            { id: 1, description: '', quantity: 1, price: 0, buying_price: 0, type: 'service' }
        ],
        notes: '',
        status: 'draft',
        type: 'quote', // 'quote' or 'invoice'
        client_display_mode: 'detailed', // 'detailed' | 'grouped' (présentation PDF/lien public)
        include_tva: true,
        original_pdf_url: null,
        is_external: false,
        manual_total_ht: 0,
        manual_total_tva: 0,
        manual_total_ttc: 0,
        operation_category: 'service',
        vat_on_debits: false,
        has_material_deposit: true,
        deposit_percentage: 0,
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
    // Avenant : modal de déduction des prestations du devis initial non réalisées
    const [showDeductionModal, setShowDeductionModal] = useState(false);
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
    // Modal de création d'avoir depuis une facture émise
    const [creditNoteModal, setCreditNoteModal] = useState(null); // null | { mode, amountTTC, reason, saving, existing }

    // Derived: client currently selected in the form (used in JSX and handlers)
    const selectedClient = clients.find(c => formData.client_id && c.id.toString() === formData.client_id.toString()) || null;

    // --- AUTO SAVE LOGIC ---
    const draftKey = user ? `quote_draft_${id || 'new'}` : null;
    const { clearAutoSave, lastSaved, saving } = useAutoSave(draftKey, formData, !!user && !loading && dataLoaded);

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
                    const { client_id, voiceData, importFile, importMode, mergeIds, siteVisitItems, siteVisitTitle, siteVisitWorkObject, fromReport } = location.state;

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
                            // Proposition issue de la visite : l'artisan la relit et la
                            // corrige dans le formulaire avant l'envoi.
                            work_object: prev.work_object || siteVisitWorkObject || '',
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
                        processImportedFile(importFile, importMode);
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

    // ── Coller un tableau (import CSV sans fichier) ───────────────────────────
    // Le même parseur que l'import de fichier, alimenté par le presse-papiers :
    // l'artisan copie ses cellules dans Excel et colle, sans avoir à exporter
    // puis retrouver un .csv sur son ordinateur.

    /** Ligne vide du formulaire (celle posée par défaut) : rien à préserver. */
    const isBlankItem = (item) => !String(item?.description || '').trim()
        && !Number(item?.price) && !Number(item?.buying_price);

    const openCsvPasteModal = (initialText = '') => {
        setPastedCsvText(initialText);
        setShowCsvPasteModal(true);
    };

    const applyPastedCsv = ({ items, notes, skipped, headerless, mode }) => {
        const base = Date.now();
        const imported = items.map((item, i) => ({ ...item, id: base + i }));
        setFormData(prev => {
            const kept = mode === 'append' ? prev.items.filter(item => !isBlankItem(item)) : [];
            return {
                ...prev,
                items: [...kept, ...imported],
                // Réserves et notes du tableau : ajoutées aux notes déjà saisies
                // plutôt que de les écraser (même règle que l'import de fichier).
                notes: notes ? (prev.notes ? `${prev.notes}\n${notes}` : notes) : prev.notes,
            };
        });
        setShowCsvPasteModal(false);
        setPastedCsvText('');
        setShowImportZone(false);

        const lineCount = imported.filter(item => item.type !== 'section').length;
        const plural = lineCount > 1 ? 's' : '';
        toast.success(
            `${lineCount} ligne${plural} ${mode === 'append' ? `ajoutée${plural}` : `importée${plural}`} depuis le tableau collé.`
            + `${skipped > 0 ? ` (${skipped} ignorée${skipped > 1 ? 's' : ''})` : ''}`
            + `${notes ? ' Réserves et notes reprises dans « Notes / Conditions ».' : ''}`
        );
        if (headerless) {
            toast.message('Colonnes devinées faute d\'en-têtes — vérifiez quantités et prix.');
        }
    };

    // Ctrl/⌘+V sur un devis neuf : un tableau copié depuis un tableur ouvre
    // directement l'aperçu d'import — le chemin le plus court entre Excel et le
    // devis. Les collages dans un champ de saisie sont laissés tranquilles, et
    // un simple mot copié n'ouvre rien.
    useEffect(() => {
        if (isEditing || showCsvPasteModal) return;
        const onPaste = (e) => {
            const target = e.target;
            if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return;
            const text = e.clipboardData?.getData('text/plain') || '';
            const looksTabular = /[;\t]/.test(text) || text.trim().split(/\r?\n/).filter(Boolean).length >= 2;
            if (!text.trim() || !looksTabular) return;
            e.preventDefault();
            openCsvPasteModal(text);
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [isEditing, showCsvPasteModal]);

    // Reusable function to process imported file
    const processImportedFile = async (file, mode = 'archive') => {
        if (!file) return;

        // CSV : parsing local pur (pas d'archive PDF, pas d'upload, pas d'IA).
        // Un CSV n'a pas de magic bytes — validation par extension + taille.
        const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
        if (isCsv) {
            if (file.size > 2 * 1024 * 1024) {
                toast.error('Fichier CSV trop volumineux (2 MB maximum).');
                return;
            }
            try {
                setImporting(true);
                const text = await file.text();
                const { items: csvItems, notes: csvNotes, skipped, headerless, error: parseError } = parseQuoteCsv(text);
                if (parseError) {
                    toast.error(parseError);
                    return;
                }
                setFormData(prev => ({
                    ...prev,
                    title: prev.title || file.name.replace(/\.csv$/i, '').replace(/[_-]+/g, ' ').trim(),
                    items: csvItems,
                    // Réserves et notes du fichier : ajoutées aux notes déjà
                    // saisies plutôt que de les écraser (même règle que l'import PDF).
                    notes: csvNotes ? (prev.notes ? `${prev.notes}\n${csvNotes}` : csvNotes) : prev.notes,
                }));
                setShowImportZone(false);
                const lineCount = csvItems.filter(i => i.type !== 'section').length;
                toast.success(
                    `${lineCount} ligne${lineCount > 1 ? 's' : ''} importée${lineCount > 1 ? 's' : ''} depuis le CSV`
                    + `${skipped > 0 ? ` (${skipped} ignorée${skipped > 1 ? 's' : ''})` : ''}.`
                    + `${csvNotes ? ' Réserves et notes reprises dans « Notes / Conditions ».' : ''}`
                );
                if (headerless) {
                    // Colonnes lues d'après leur ordre : à contrôler avant d'envoyer le devis.
                    toast.message('Colonnes devinées faute d\'en-têtes — vérifiez quantités et prix.');
                }
            } catch (error) {
                console.error('Import CSV error:', error);
                toast.error("Erreur lors de l'import CSV : " + error.message);
            } finally {
                setImporting(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
            return;
        }

        // Validation stricte : magic bytes + taille (PDF ou DOCX uniquement, max 20 MB)
        const validation = await validateFileForUpload(file, UPLOAD_PRESETS.quoteDocument);
        if (!validation.ok) {
            toast.error(validation.error);
            return;
        }

        const isPdf = file.type === 'application/pdf';
        const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx');

        try {
            setImporting(true);
            toast.message('Traitement du fichier en cours...');

            // 1. Upload File to Supabase Storage
            const fileExt = file.name.split('.').pop();
            const fileName = `${crypto.randomUUID()}.${fileExt}`;
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

            // 2a. Local regex parsing — fast, free, handles most well-structured PDFs.
            const { items: regexItems, notes: regexNotes } = parseQuoteItems(text);
            const meta = extractQuoteMetadata(text);

            // 2b. Regex-first strategy: the local parser is reliable for the
            // common, well-structured quotes and never silently drops lines, so
            // it stays the default. The AI is only called as a *fallback* when
            // the regex result looks weak (no/few lines, or mostly unpriced) and
            // we only keep the AI result when it recovers MORE lines — this
            // avoids replacing a complete regex extraction with a shorter one.
            const zeroPriced = regexItems.filter(i => !i.price).length;
            const looksWeak =
                regexItems.length === 0 ||
                regexItems.length < 3 ||
                (regexItems.length > 0 && zeroPriced / regexItems.length > 0.5);

            const hasPersonalKey = !!userProfile?.has_openai_api_key;
            const planNow = userProfile?.plan || 'free';
            const isPro = planNow === 'pro' || planNow === 'owner';
            const canUseAi = (hasPersonalKey || isPro || isAiTrialSession) && text && text.trim().length > 50;

            let finalItems = regexItems;
            let finalNotes = regexNotes;
            let finalTitle = meta.title;
            let aiUsed = false;

            if (looksWeak && canUseAi) {
                try {
                    toast.info("Affinage de l'extraction par IA…");
                    const aiResult = await extractQuoteFromPdfText(text);
                    if (aiResult.items.length > regexItems.length) {
                        finalItems = aiResult.items;
                        finalNotes = aiResult.notes || regexNotes;
                        finalTitle = aiResult.title || meta.title;
                        aiUsed = true;
                    }
                } catch (aiErr) {
                    console.warn('AI extraction fallback failed, keeping regex result:', aiErr);
                    // Silent: regex result still applies.
                }
            }

            // Pour une contre-proposition, on préfixe le titre et on bascule en mode externe
            // (preserve l'original PDF pour comparaison) — l'artisan ajustera les prix.
            const isCompetitor = mode === 'competitor';
            const proposedTitle = finalTitle || '';
            const competitorTitle = proposedTitle
                ? `Contre-proposition — ${proposedTitle}`
                : 'Contre-proposition';

            setFormData(prev => ({
                ...prev,
                original_pdf_url: publicUrl,
                title: prev.title || (isCompetitor ? competitorTitle : proposedTitle),
                items: finalItems.length > 0 ? finalItems : prev.items,
                notes: finalNotes ? (prev.notes ? prev.notes + '\n' + finalNotes : finalNotes) : prev.notes
            }));

            // Mémoriser le mode pour afficher le bandeau d'aide à la contre-proposition
            if (isCompetitor) setCompetitorImport({ filename: file.name, importedAt: Date.now() });

            setShowImportZone(false);
            if (finalItems.length > 0) {
                toast.success(
                    isCompetitor
                        ? `Devis concurrent analysé : ${finalItems.length} lignes importées${aiUsed ? ' (IA)' : ''}. Ajustez vos prix pour la contre-proposition.`
                        : `${finalItems.length} éléments détectés et importés${aiUsed ? ' (IA)' : ''}.`,
                );
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
                setFormData({
                    client_id: data.client_id || '',
                    title: data.title || '',
                    work_object: data.work_object || '',
                    public_token: data.public_token || '',
                    token_revoked: data.token_revoked === true,
                    signature_suspended_at: data.signature_suspended_at || null,
                    date: data.date,
                    valid_until: data.valid_until || '',
                    items: (data.items || []).map(i => ({ ...i, buying_price: i.buying_price || 0, type: i.type || 'service' })) || [],
                    notes: data.notes || '',
                    content_en: data.content_en || null,
                    status: data.status || 'draft',
                    type: data.type || 'quote',
                    client_display_mode: data.client_display_mode || 'detailed',
                    include_tva: typeof data.include_tva === 'boolean'
                        ? data.include_tva
                        : (data.total_tva > 0 || (data.total_ht === 0 && data.total_tva === 0)),
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
                    deposit_percentage: data.deposit_percentage || 0,
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
                    invoice_number: data.invoice_number || null,
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
                        .select('id, total_ttc, total_ht, items, date, title, quote_number, status')
                        .eq('id', data.parent_quote_id)
                        .single();

                    if (parentData) {
                        // Un avenant COMPLÈTE le devis (modèle additif), il ne le remplace pas.
                        // On distingue donc, parmi les factures rattachées au devis :
                        //  - les vraies situations d'avancement (facturation par tranches qui
                        //    remplace le devis comme base de calcul) → progress_total ;
                        //  - les simples acomptes déjà versés → deposit_total, à DÉDUIRE du
                        //    solde, en gardant le devis initial comme référence.
                        // Sans cette distinction, un acompte (ex. acompte matériel) était pris
                        // pour une situation et faussait le « Nouveau Total Projet » de l'avenant.
                        const { data: childInvoices } = await supabase
                            .from('quotes')
                            .select('total_ttc, title, amendment_details')
                            .eq('parent_id', data.parent_quote_id)
                            .eq('type', 'invoice')
                            .neq('status', 'cancelled');

                        const isSituationInv = (inv) =>
                            inv.amendment_details?.situation || /situation/i.test(inv.title || '');
                        const isClosingInv = (inv) => /cl[oô]ture/i.test(inv.title || '');

                        let progressTotal = 0;
                        let depositTotal = 0;
                        (childInvoices || []).forEach((inv) => {
                            if (isClosingInv(inv)) return; // ni situation ni acompte
                            if (isSituationInv(inv)) progressTotal += inv.total_ttc || 0;
                            else depositTotal += inv.total_ttc || 0;
                        });

                        setFormData(prev => ({
                            ...prev,
                            parent_quote_data: {
                                ...parentData,
                                progress_total: progressTotal,
                                deposit_total: depositTotal
                            }
                        }));
                    }
                }

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
        setFormData(prev => ({
            ...prev,
            items: prev.items.filter(item => item.id !== id)
        }));
    };

    // Avenant : ajoute en négatif les prestations du devis initial qui ne
    // seront pas réalisées (lignes construites par buildDeductionItems).
    const handleAddDeductionItems = ({ items: deductionItems, totalHT, count }) => {
        setFormData(prev => ({ ...prev, items: [...prev.items, ...deductionItems] }));
        toast.success(`${count} prestation${count > 1 ? 's' : ''} déduite${count > 1 ? 's' : ''} du devis initial (${totalHT.toFixed(2)} € HT).`);
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





    // ── Suspension de la signature ───────────────────────────────────────────
    // Un devis ou un avenant déjà envoyé peut devoir être repris : chantier
    // reporté, erreur de chiffrage, client qui négocie encore. Tant que le lien
    // est actif, il reste signable et engage les deux parties. `token_revoked`
    // ferme le lien sans toucher au statut du document : la page publique ne
    // s'ouvre plus (get_public_quote l'exclut) et la signature est refusée côté
    // serveur (sign_public_quote), y compris pour un lien déjà dans la boîte
    // mail du client. Un clic suffit à rouvrir.
    //
    // Mais `token_revoked` seul ne dit pas QUI l'a levé : le ménage nocturne
    // (`cleanup_expired_tokens`) le pose sur tout lien expiré depuis plus de
    // 7 jours. S'y fier annonçait « Signature suspendue » sur la moitié du
    // portefeuille, devis signés compris. C'est `signature_suspended_at`, écrite
    // ici et nulle part ailleurs, qui atteste une décision de l'artisan.
    const [togglingSuspension, setTogglingSuspension] = useState(false);
    const signatureSuspended = isSignatureSuspended(formData);
    // Lien fermé par le ménage, sans décision : l'artisan doit pouvoir le
    // comprendre au lieu de croire à une suspension qu'il n'a pas faite.
    const linkExpired = !signatureSuspended && formData.token_revoked === true;

    // Lit l'état réel du lien en base avant toute action qui le rouvrirait.
    // Se fier au seul formData rouvrirait silencieusement une signature
    // suspendue depuis un autre appareil ou un autre onglet.
    const fetchLinkSuspended = async () => {
        const { data, error } = await supabase
            .from('quotes')
            .select('signature_suspended_at')
            .eq('id', id)
            .single();
        if (error) return signatureSuspended;
        const suspended = !!data?.signature_suspended_at;
        if (suspended !== signatureSuspended) {
            setFormData(prev => ({ ...prev, signature_suspended_at: data?.signature_suspended_at || null }));
        }
        return suspended;
    };

    const suspensionBlockMessage = 'Signature suspendue — rouvrez-la d’abord (menu « … » → Rouvrir la signature).';

    const handleToggleSignatureSuspension = async () => {
        if (!id || id === 'new') return;
        const suspend = !signatureSuspended;
        setTogglingSuspension(true);
        try {
            // Rouvrir prolonge la validité : un lien suspendu plusieurs semaines
            // serait sinon rouvert déjà expiré. Rouvrir efface aussi la date de
            // suspension : elle ne vaut que tant qu'elle est vraie.
            const suspendedAt = new Date().toISOString();
            const payload = suspend
                ? { token_revoked: true, signature_suspended_at: suspendedAt }
                : {
                    token_revoked: false,
                    signature_suspended_at: null,
                    token_expires_at: publicLinkExpiry(),
                };
            const { error } = await supabase.from('quotes').update(payload).eq('id', id);
            if (error) throw error;
            setFormData(prev => ({
                ...prev,
                token_revoked: suspend,
                signature_suspended_at: suspend ? suspendedAt : null,
            }));
            toast.success(suspend
                ? 'Signature suspendue — le lien envoyé au client ne s’ouvre plus.'
                : `Signature rouverte — le lien redevient valable ${publicLinkValidityLabel()}.`);
        } catch (err) {
            console.error('Error toggling signature suspension:', err);
            toast.error(suspend
                ? "La signature n'a pas pu être suspendue — réessayez."
                : "La signature n'a pas pu être rouverte — réessayez.");
        } finally {
            setTogglingSuspension(false);
        }
    };

    // ── Prévenir le client du retrait ────────────────────────────────────────
    //
    // Suspendre le lien et changer le statut sont des mesures internes : le
    // client, lui, ne voit rien tant qu'il ne rouvre pas le lien. Or un devis
    // est une offre — la retirer suppose que le client en soit informé avant
    // qu'il l'accepte, et rien n'empêche qu'il ait déjà imprimé le PDF pour le
    // signer à la main. Ce mail est donc la seule action qui compte vraiment,
    // et il laisse une trace datée dans l'historique du client.
    const isDocumentClosed = signatureSuspended || isSignatureBlocked(formData.status);

    const handleNotifyWithdrawal = () => {
        if (!isEditing) {
            toast.error("Enregistrez d'abord le document");
            return;
        }
        const selectedClient = clients.find(c => c.id?.toString() === formData.client_id?.toString());
        if (!selectedClient) {
            toast.error("Sélectionnez d'abord un client");
            return;
        }

        const docLabel = formData.type === 'amendment' ? "l'avenant" : 'le devis';
        const docNo = formData.quote_number || id;
        const projectTitle = formData.title || 'vos travaux';
        const greetingName = clientGreetingName(selectedClient.name, 'fr');
        const companyName = userProfile?.company_name || userProfile?.full_name || 'Votre artisan';

        const signatureBlock = [
            companyName,
            userProfile?.full_name || '',
            userProfile?.phone || '',
            userProfile?.professional_email || userProfile?.email || '',
        ].filter(Boolean).join('\n');

        const subject = `Retrait ${docLabel === "l'avenant" ? "de l'avenant" : 'du devis'} N°${docNo} - ${projectTitle} - ${companyName}`;
        const body = [
            `Bonjour ${greetingName},`,
            `Je vous informe que ${docLabel} n°${docNo} « ${projectTitle} » que je vous ai transmis est retiré : il ne peut plus être signé et n'engage plus aucune des deux parties. Le lien de signature en ligne a été désactivé.`,
            `Si vous en avez déjà téléchargé ou imprimé un exemplaire, merci de ne pas y donner suite.`,
            `Je reste à votre disposition pour en établir une nouvelle version si vous souhaitez poursuivre ce projet.`,
            `Bien cordialement,`,
            '-- \n' + signatureBlock,
        ].join('\n\n');

        setEmailPreview({
            email: selectedClient.email,
            rawSubject: subject,
            rawBody: body,
            lang: 'fr',
            // Ni lien ni bouton de signature : ce mail retire l'offre.
            signUrl: null,
            // Distingue ce mail d'un envoi de document : pas d'archivage de
            // version, pas de passage en « envoyé », pas de date de relance.
            kind: 'withdrawal',
        });
    };

    const handleSendQuoteEmail = async (lang = 'fr') => {
        if (!formData.client_id) {
            toast.error('Veuillez d\'abord sélectionner un client');
            return;
        }

        // Devis jamais enregistré : on l'enregistre (ce qui le bascule sur son
        // URL d'édition) et l'envoi reprend une fois les données rechargées.
        if (!isEditing) {
            pendingSendRef.current = lang;
            await handleSubmit({ preventDefault: () => {} });
            return;
        }

        // L'envoi remet le lien en service (token_revoked: false, cf. plus bas) :
        // sur un document dont la signature a été suspendue, ce serait la
        // rouvrir sans le dire. On s'arrête et on renvoie l'artisan vers
        // l'action explicite.
        if (await fetchLinkSuspended()) {
            toast.error(suspensionBlockMessage);
            return;
        }

        const selectedClient = clients.find(c => c.id.toString() === formData.client_id.toString());
        // Pas de blocage si l'email est absent — le mailto s'ouvre sans destinataire
        // et l'utilisateur l'ajoute manuellement dans sa messagerie

        try {
            toast.loading("Génération du lien sécurisé...", { id: 'upload-toast' });

            // Ensure public_token exists and refresh its validity (un-revoke + extend expiry)
            // so re-sharing an old quote always produces a working link.
            let token = formData.public_token;
            const newExpiry = publicLinkExpiry();
            if (!token) {
                token = crypto.randomUUID();
            }
            const { error: tokenError } = await supabase
                .from('quotes')
                .update({
                    public_token: token,
                    token_revoked: false,
                    token_expires_at: newExpiry,
                    // Facture de situation : persiste le contexte d'avancement
                    // (recalculé à l'ouverture) pour que le PDF téléchargé depuis
                    // le lien public affiche le même récapitulatif que l'aperçu.
                    ...(formData.type === 'invoice' && formData.amendment_details?.situation
                        ? { amendment_details: formData.amendment_details }
                        : {}),
                })
                .eq('id', id);

            if (tokenError) throw tokenError;

            setFormData(prev => ({ ...prev, public_token: token }));

            // ── Traduction du contenu (envoi en anglais) ──
            // Traduit titre, notes et descriptions de lignes via l'IA, puis
            // mémorise le résultat sur le devis (content_en) pour que le PDF
            // (aperçu + portail client) l'affiche. Les lignes déjà traduites
            // et inchangées sont réutilisées : on ne traduit que ce qui manque.
            let contentEn = formData.content_en || null;
            if (lang === 'en') {
                try {
                    const sourceDescriptions = [...new Set(
                        (formData.items || [])
                            .map(i => (i.description || '').trim())
                            .filter(Boolean)
                    )];
                    const existing = contentEn?.lines || {};
                    const missing = sourceDescriptions.filter(d => !existing[d]);
                    const titleChanged = !contentEn || contentEn.sourceTitle !== (formData.title || '');
                    const notesChanged = !contentEn || contentEn.sourceNotes !== (formData.notes || '');
                    const workObjectChanged = !contentEn
                        || (contentEn.sourceWorkObject || '') !== (formData.work_object || '');

                    if (missing.length > 0 || titleChanged || notesChanged || workObjectChanged) {
                        toast.loading('Traduction du devis en anglais…', { id: 'translate-toast' });
                        const result = await translateQuoteContent({
                            title: formData.title || '',
                            workObject: formData.work_object || '',
                            notes: formData.notes || '',
                            descriptions: missing,
                        }, 'en');
                        const lines = { ...existing };
                        missing.forEach((src, i) => { lines[src] = result.descriptions[i] || src; });
                        contentEn = {
                            title: result.title || formData.title || '',
                            work_object: result.workObject || '',
                            notes: result.notes || '',
                            lines,
                            // Mémorise les sources pour détecter une modification ultérieure.
                            sourceTitle: formData.title || '',
                            sourceNotes: formData.notes || '',
                            sourceWorkObject: formData.work_object || '',
                        };
                        await supabase.from('quotes').update({ content_en: contentEn }).eq('id', id);
                        setFormData(prev => ({ ...prev, content_en: contentEn }));
                        toast.dismiss('translate-toast');
                    }
                } catch (translateErr) {
                    toast.dismiss('translate-toast');
                    console.error('Quote translation failed:', translateErr);
                    toast.error("La traduction automatique a échoué — le devis reste en français.");
                    contentEn = formData.content_en || null;
                }
            }

            // La langue est transmise dans l'URL publique afin que le PDF
            // téléchargé depuis le portail client soit dans la même langue
            // que le mail d'accompagnement.
            const publicUrl = `${window.location.origin}/q/${token}${lang && lang !== 'fr' ? `?lang=${lang}` : ''}`;
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
                include_tva: formData.include_tva,
                content_en: contentEn
            };

            // We can skip PDF upload if we trust the public link, but let's keep it simply as a backup link or just rely on public portal which has download button.
            // Simplified: Just send Public Link.

            toast.dismiss('upload-toast');

            const isDeposit = (formData.title || '').toLowerCase().includes('acompte');
            const showReviewRequest = isInvoice && !isDeposit && userProfile?.google_review_url;

            // Facture de situation : mail dédié qui explique au client qu'il ne
            // s'agit que de la part des travaux réalisés, avec un point chiffré.
            const situationInfo = isInvoice ? formData.amendment_details?.situation : null;
            const fmtAmount = (n) => `${(Number(n) || 0).toFixed(2)} €${formData.include_tva ? ' TTC' : ''}`;
            const buildSituationRecap = (labels) => {
                const parentTotal = Number(situationInfo?.parent_total_ttc) || 0;
                const previouslyBilled = Number(situationInfo?.previously_billed_ttc) || 0;
                const remaining = Math.max(parentTotal - previouslyBilled - total, 0);
                return [
                    `• ${labels.total} : ${fmtAmount(parentTotal)}`,
                    previouslyBilled > 0 ? `• ${labels.billed} : ${fmtAmount(previouslyBilled)}` : null,
                    `• ${labels.current} : ${fmtAmount(total)}`,
                    `• ${labels.remaining} : ${fmtAmount(remaining)}`,
                ].filter(Boolean).join('\n');
            };

            // Facture acquittée : le mail est un justificatif de paiement, pas
            // une demande de règlement — texte dédié, avec la date du paiement
            // si elle est renseignée.
            const isPaidInvoice = isInvoice && formData.status === 'paid';
            const paidDate = (isPaidInvoice && formData.paid_at)
                ? new Date(formData.paid_at).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR')
                : '';

            // Template Construction — bilingue (fr par défaut, en sur demande)
            const EMAIL_I18N = {
                fr: {
                    subjectPrefix: isInvoice
                        ? `${situationInfo ? 'Facture de situation' : 'Facture'}${isPaidInvoice ? ' acquittée' : ''}`
                        : (isCreditNote ? 'Avoir' : 'Devis'),
                    defaultProject: 'Votre projet',
                    defaultWorks: 'Travaux',
                    introCreditNote: (name, title) => `Bonjour ${name},\n\nJe vous transmets un avoir${formData.amendment_details?.credit_note?.parent_invoice_number ? ` sur la facture ${formData.amendment_details.credit_note.parent_invoice_number}` : ''} concernant le projet "${title}".\nVous trouverez ci-dessous le lien pour y accéder.`,
                    introInvoice: (name, title) => `Bonjour ${name},\n\nJe vous transmets votre facture pour le projet "${title}".\nVous trouverez ci-dessous le lien pour y accéder.`,
                    introInvoicePaid: (name, title) => `Bonjour ${name},\n\nVotre règlement${paidDate ? ` du ${paidDate}` : ''} a bien été reçu — je vous en remercie.\nJe vous transmets votre facture acquittée pour le projet "${title}", à conserver comme justificatif de paiement.\nVous trouverez ci-dessous le lien pour y accéder.`,
                    introSituation: (name, title) => `Bonjour ${name},\n\n${isPaidInvoice
                        ? `Votre règlement${paidDate ? ` du ${paidDate}` : ''} a bien été reçu — je vous en remercie. Je vous transmets la facture de situation n°${situationInfo?.index || 1} acquittée pour le projet "${title}", à conserver comme justificatif de paiement.`
                        : `Les travaux du projet "${title}" suivent leur cours. Je vous transmets la facture de situation n°${situationInfo?.index || 1} : elle correspond uniquement à la part des travaux réalisés à ce jour, et non au montant total du devis.`}\n\nOù en est le chantier :\n${buildSituationRecap({
                        total: 'Montant total du devis',
                        billed: 'Déjà facturé avant cette situation',
                        current: isPaidInvoice ? 'Cette situation (réglée)' : 'Cette situation (montant à régler)',
                        remaining: "Restera à facturer d'ici la fin du chantier",
                    })}\n\nVous trouverez ci-dessous le lien pour accéder à la facture.`,
                    introQuote: (name, title) => `Bonjour ${name},\n\nSuite à nos échanges, je vous transmets ma proposition de devis pour le projet "${title}".\nVous trouverez ci-dessous le lien pour le consulter.`,
                    actionInvoice: isPaidInvoice ? 'Consulter et télécharger votre facture acquittée' : 'Consulter et télécharger votre facture',
                    actionQuote: 'Consulter et signer votre devis en ligne',
                    signButtonLabel: 'Signer mon devis',
                    signCaption: 'Signature directement en ligne, sans impression — en moins d\'une minute.',
                    reportLine: `Le rapport d'intervention est egalement disponible depuis ce lien.`,
                    portalLine: (url) => `Votre espace client (documents et suivi de chantier) :\n${url}`,
                    closing: `N'hesitez pas a me contacter pour toute question.\n\nBien cordialement,`,
                },
                en: {
                    subjectPrefix: isInvoice
                        ? `${situationInfo ? 'Progress invoice' : 'Invoice'}${isPaidInvoice ? ' (paid)' : ''}`
                        : (isCreditNote ? 'Credit note' : 'Quote'),
                    defaultProject: 'Your project',
                    defaultWorks: 'Works',
                    introCreditNote: (name, title) => `Hello ${name},\n\nPlease find attached a credit note${formData.amendment_details?.credit_note?.parent_invoice_number ? ` for invoice ${formData.amendment_details.credit_note.parent_invoice_number}` : ''} regarding the project "${title}".\nYou will find the link to access it below.`,
                    introInvoice: (name, title) => `Hello ${name},\n\nPlease find attached your invoice for the project "${title}".\nYou will find the link to access it below.`,
                    introInvoicePaid: (name, title) => `Hello ${name},\n\nYour payment${paidDate ? ` of ${paidDate}` : ''} has been received — thank you.\nPlease find your paid invoice for the project "${title}", to keep as proof of payment.\nYou will find the link to access it below.`,
                    introSituation: (name, title) => `Hello ${name},\n\n${isPaidInvoice
                        ? `Your payment${paidDate ? ` of ${paidDate}` : ''} has been received — thank you. Please find paid progress invoice No. ${situationInfo?.index || 1} for the project "${title}", to keep as proof of payment.`
                        : `Work on the project "${title}" is progressing. Please find progress invoice No. ${situationInfo?.index || 1}: it only covers the share of the works completed to date, not the full amount of the quote.`}\n\nWhere the project stands:\n${buildSituationRecap({
                        total: 'Total amount of the quote',
                        billed: 'Previously billed before this invoice',
                        current: isPaidInvoice ? 'This progress invoice (paid)' : 'This progress invoice (amount due)',
                        remaining: 'Remaining to be billed by the end of the project',
                    })}\n\nYou will find the link to access the invoice below.`,
                    introQuote: (name, title) => `Hello ${name},\n\nFollowing our discussions, please find my quote proposal for the project "${title}".\nYou will find the link to view it below.`,
                    actionInvoice: isPaidInvoice ? 'View and download your paid invoice' : 'View and download your invoice',
                    actionQuote: 'View and sign your quote online',
                    signButtonLabel: 'Sign my quote',
                    signCaption: 'Signed directly online, no printing needed — in under a minute.',
                    reportLine: `The intervention report is also available from this link.`,
                    portalLine: (url) => `Your client area (documents and project tracking):\n${url}`,
                    closing: `Please do not hesitate to contact me with any questions.\n\nKind regards,`,
                },
            };
            const E = EMAIL_I18N[lang] || EMAIL_I18N.fr;

            // En anglais, on utilise le titre traduit (mémorisé dans content_en)
            // pour l'objet ET le corps du mail, afin qu'ils restent cohérents
            // avec le PDF traduit (sinon l'objet anglais cite un titre français).
            const localizedTitle = (lang === 'en' && contentEn?.title)
                ? contentEn.title
                : formData.title;

            // `formData.id` n'existe pas (l'id vient de l'URL) : depuis toujours
            // l'objet du mail omettait le numéro du document. On utilise l'id
            // de la route — l'envoi exige un document déjà enregistré (isEditing).
            const docNo = ['invoice', 'credit_note'].includes(formData.type) && formData.invoice_number
                ? formData.invoice_number
                : (formData.quote_number || id);
            const subject = `${E.subjectPrefix}${id ? ` N°${docNo}` : ''} - ${localizedTitle || E.defaultProject} - ${companyName}`;

            const projectTitle = localizedTitle || E.defaultWorks;
            // « M. Cohignac Erwan » → « Bonjour M. Cohignac » (civilité + nom
            // seul) ; sans civilité dans la fiche, nom complet inchangé.
            const greetingName = clientGreetingName(selectedClient.name, lang);
            const introduction = isInvoice
                ? (situationInfo
                    ? E.introSituation(greetingName, situationInfo.parent_title || projectTitle)
                    : (isPaidInvoice
                        ? E.introInvoicePaid(greetingName, projectTitle)
                        : E.introInvoice(greetingName, projectTitle)))
                : (isCreditNote && E.introCreditNote
                    ? E.introCreditNote(greetingName, projectTitle)
                    : E.introQuote(greetingName, projectTitle));

            const actionText = (isInvoice || isCreditNote) ? E.actionInvoice : E.actionQuote;
            // Pour un devis, on ajoute la mention « sans impression » sous le lien
            // afin que même les clients en texte brut comprennent que la signature
            // se fait en ligne, sans imprimer. En HTML, le lien devient un bouton.
            const callToAction = isInvoice
                ? `${actionText} :\n${publicUrl}`
                : `${actionText} :\n${publicUrl}\n${E.signCaption}`;

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
                bodyParts.push(E.reportLine);
            }
            if (portalUrl) {
                bodyParts.push(E.portalLine(portalUrl));
            }
            bodyParts.push(E.closing);
            // Marqueur RFC 3676 "-- " (dash dash space) : signale la signature.
            // L'edge function SMTP s'en sert pour remplacer la signature texte
            // par une version HTML riche dans la partie HTML du mail.
            bodyParts.push('-- \n' + signatureBlock);

            const body = bodyParts.join('\n\n');

            setEmailPreview({
                email: selectedClient.email,
                rawSubject: subject,
                rawBody: body,
                lang,
                // Signature en ligne : uniquement pour les devis (ni factures ni avoirs).
                // Sert à transformer le lien en bouton dans la version HTML du mail.
                signUrl: (isInvoice || isCreditNote) ? null : publicUrl,
                signLabel: E.signButtonLabel,
            });

        } catch (error) {
            console.error(error);
            toast.dismiss('upload-toast');
            toast.error("Erreur lors de la préparation du document");
        }
    };

    const handleConfirmSendEmail = async (subject, body, overrideEmail) => {
        if (!emailPreview) return;

        // Un mail de retrait n'est pas un envoi de document : il ne doit ni
        // archiver une version transmise, ni repasser le devis en « envoyé »,
        // ni compter comme une relance.
        const isWithdrawal = emailPreview.kind === 'withdrawal';

        // L'adresse saisie dans la modale prime sur l'email enregistré du client
        // (ex : devis adressé à un tuteur/mandataire au nom du client protégé).
        const recipientEmail = (overrideEmail ?? emailPreview.email)?.trim() || '';

        const smtpConfigured = !!userProfile?.smtp_config?.host && !!userProfile?.smtp_config?.from_email;
        const mailtoUrl = `mailto:${recipientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

        if (isTestMode) {
            captureEmail({ email: recipientEmail, subject, body });
            toast.success('📬 Email capturé dans l\'inbox test', { duration: 4000 });
        } else if (smtpConfigured && recipientEmail) {
            // Envoi direct depuis l'adresse pro de l'artisan via Edge Function
            const sendingToast = toast.loading('Envoi en cours depuis votre adresse pro...');
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                // Devis : on envoie une version HTML où le lien de signature
                // devient un bouton « Signer ». Le texte brut (avec l'URL) reste
                // le fallback pour les clients mail sans HTML. Les factures gardent
                // le rendu texte→HTML par défaut de l'edge function (pas de bouton).
                const htmlBody = emailPreview.signUrl
                    ? buildQuoteEmailHtml(body, emailPreview.signUrl, emailPreview.signLabel)
                    : undefined;
                const res = await fetch(`${supabaseUrl}/functions/v1/send-document-email`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({
                        to: recipientEmail,
                        subject,
                        text: body,
                        ...(htmlBody ? { html: htmlBody } : {}),
                        quote_id: id,
                        client_id: formData.client_id,
                    }),
                });
                const result = await res.json();
                toast.dismiss(sendingToast);
                if (!res.ok) throw new Error(result.error || 'Échec de l\'envoi');
                toast.success(`Email envoyé à ${recipientEmail}`);
            } catch (err) {
                toast.dismiss(sendingToast);
                console.error('Direct email send failed:', err);
                toast.error(err.message || 'Échec de l\'envoi direct — ouverture du client mail');
                window.location.href = mailtoUrl;
            }
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
                details: isWithdrawal
                    ? `Retrait du document notifié au client par email`
                    : `Envoi document par email`
            }]).then(({ error }) => {
                if (error) console.error('Error logging email interaction:', error);
            });
        }

        // Update quote last_followup_at
        if (id && id !== 'new' && !isWithdrawal) {
            supabase.from('quotes')
                .update({ last_followup_at: new Date().toISOString() })
                .eq('id', id)
                .then(({ error }) => {
                    if (error) console.error('Error updating follow-up date:', error);
                    else setFormData(prev => ({ ...prev, last_followup_at: new Date().toISOString() }));
                });
        }

        setEmailPreview(null);

        // Archive la version transmise (instantané + PDF figé) et passe le devis
        // en "envoyé" : c'est cette archive qui fait foi en cas de modification ultérieure.
        if (!isWithdrawal) {
            archiveSentVersion().catch(err => console.error('Sent version archive failed:', err));
        }

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

    // Archive la version envoyée au client : instantané complet du devis + PDF
    // figé dans le storage. C'est la référence en cas de litige ou de modification.
    const archiveSentVersion = async () => {
        if (!id || id === 'new') return;

        // L'envoi confirme le document : un brouillon passe en "envoyé" AVANT de
        // figer le PDF. Pour une facture, c'est ce passage hors brouillon qui
        // attribue le numéro légal (trigger set_invoice_number) — il doit donc
        // exister avant la génération du PDF archivé et envoyé au client.
        let sentInvoiceNumber = formData.invoice_number || null;
        if (formData.status === 'draft') {
            const { data: sentRow, error: statusError } = await supabase
                .from('quotes')
                .update({ status: 'sent', updated_at: new Date() })
                .eq('id', id)
                .select('invoice_number')
                .single();
            if (!statusError) {
                sentInvoiceNumber = sentRow?.invoice_number || null;
                setFormData(prev => ({ ...prev, status: 'sent', invoice_number: sentInvoiceNumber }));
                setInitialStatus('sent');
                setRevisionUnlocked(false);
                if (sentInvoiceNumber && !formData.invoice_number) {
                    toast.success(`Facture émise sous le numéro ${sentInvoiceNumber}`);
                }
            }
        }

        const selectedClient = clients.find(c => c.id?.toString() === formData.client_id?.toString());

        const snapshot = {
            id: parseInt(id, 10),
            user_id: user.id,
            client_id: formData.client_id,
            client_name: selectedClient?.name || 'Client',
            quote_number: formData.quote_number || null,
            invoice_number: sentInvoiceNumber,
            title: formData.title,
            work_object: formData.work_object || null,
            date: formData.date,
            valid_until: formData.valid_until || null,
            status: 'sent',
            type: formData.type,
            items: formData.items.map(i => ({
                ...i,
                quantity: parseFloat(i.quantity) || 0,
                price: parseFloat(i.price) || 0,
                buying_price: parseFloat(i.buying_price) || 0,
            })),
            total_ht: subtotal,
            total_tva: tva,
            total_ttc: total,
            include_tva: formData.include_tva,
            notes: formData.notes,
            has_material_deposit: formData.has_material_deposit,
            deposit_percentage: formData.deposit_percentage || 0,
            amendment_details: formData.amendment_details || {},
            parent_quote_id: formData.parent_quote_id || null,
            content_en: formData.content_en || null,
            client_display_mode: formData.client_display_mode || 'detailed',
        };

        // Ré-envoi à l'identique : ne pas dupliquer l'archive existante
        const latest = quoteVersions[0];
        const sameAsLatest = latest
            && JSON.stringify(latest.snapshot?.items) === JSON.stringify(snapshot.items)
            && Number(latest.snapshot?.total_ttc) === Number(snapshot.total_ttc)
            && (latest.snapshot?.notes || '') === (snapshot.notes || '');

        if (!sameAsLatest) {
            // PDF figé — l'instantané reste archivé même si la génération échoue
            let pdfUrl = null;
            try {
                const blob = await generateClientPDF(snapshot, selectedClient || { name: snapshot.client_name }, userProfile, formData.type === 'invoice', 'blob');
                const pdfPath = `${user.id}/versions/devis-${id}-${Date.now()}.pdf`;
                const { error: uploadError } = await supabase.storage
                    .from('quote_files')
                    .upload(pdfPath, blob, { contentType: 'application/pdf' });
                if (!uploadError) {
                    const { data: { publicUrl } } = supabase.storage.from('quote_files').getPublicUrl(pdfPath);
                    pdfUrl = publicUrl;
                }
            } catch (pdfErr) {
                console.error('Sent PDF archive failed:', pdfErr);
            }

            const { data: maxRow } = await supabase
                .from('quote_versions')
                .select('version_number')
                .eq('quote_id', id)
                .order('version_number', { ascending: false })
                .limit(1)
                .maybeSingle();

            const { data: inserted, error } = await supabase
                .from('quote_versions')
                .insert([{
                    quote_id: parseInt(id, 10),
                    user_id: user.id,
                    version_number: (maxRow?.version_number || 0) + 1,
                    reason: 'sent',
                    snapshot,
                    pdf_url: pdfUrl,
                }])
                .select()
                .single();

            if (error) {
                console.error('Error archiving sent version:', error);
            } else if (inserted) {
                setQuoteVersions(prev => [inserted, ...prev]);
            }
        }

        // (Le passage brouillon → "envoyé" est fait en tête de fonction, avant
        // la génération du PDF, pour que le numéro de facture y figure.)
    };

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
            toast.error('Erreur lors de la sauvegarde : ' + (error.message || error.details || error.hint || 'Erreur inconnue'));
        } finally {
            setLoading(false);
        }
    };

    const handleCreateDeposit = async () => {
        // L'assiette du pourcentage est le CHANTIER, pas le seul devis initial :
        // un avenant signé engage le client sur des travaux supplémentaires, et
        // la facture de clôture les facture déjà. Sans eux dans l'assiette,
        // « 30 % du chantier » n'en couvrait plus 30 % dès qu'un avenant était
        // signé, et l'écart se reportait entièrement sur le solde final.
        // (Règle et statuts retenus dans materialDeposit.js — mêmes que ceux de
        // la clôture. L'action n'étant proposée que sur le document racine, les
        // avenants cherchés ici sont bien les enfants du devis courant.)
        const { data: linkedDocs, error: linkedError } = await supabase
            .from('quotes')
            .select('id, type, status, total_ttc')
            .eq('parent_id', parseInt(id, 10))
            .neq('status', 'cancelled');

        if (linkedError) {
            console.error('Error fetching linked amendments:', linkedError);
            toast.error("Impossible de vérifier les avenants liés à ce devis.");
            return;
        }

        const amendmentsTTC = amendmentsTotalTTC(linkedDocs);
        const projectTotal = total + amendmentsTTC;
        // L'assiette est annoncée : l'artisan doit savoir sur quoi porte le
        // pourcentage qu'il saisit, surtout quand elle dépasse le montant du
        // devis qu'il a sous les yeux.
        const baseLabel = amendmentsTTC !== 0
            ? `Base : ${projectTotal.toFixed(2)} € TTC (devis ${total.toFixed(2)} € + avenants signés ${amendmentsTTC.toFixed(2)} €).`
            : `Base : ${projectTotal.toFixed(2)} € TTC.`;

        const percentageStr = window.prompt(`${baseLabel}\n\nQuel pourcentage d'acompte souhaitez-vous ? (ex: 30)`, "30");
        if (!percentageStr) return;

        const percentage = parseFloat(percentageStr);
        if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
            toast.error("Pourcentage invalide");
            return;
        }

        try {
            setLoading(true);
            const depositAmount = (projectTotal * percentage) / 100;

            // Ask user if this deposit is for materials (to exclude from Net Result)
            const isForMaterial = await confirm({ title: "Type d'acompte", message: "Cet acompte est-il destiné principalement à l'achat de fournitures ?\n\nOui → comptabilisé comme Matériel (exclu du Résultat Net)\nNon → comptabilisé comme Service (Marge 100%)", confirmLabel: 'Oui (Matériel)', cancelLabel: 'Non (Service)' });

            const depositItem = {
                id: Date.now(),
                // Le client reconnaît son devis à son NUMÉRO, pas à l'identifiant
                // interne de la base.
                description: `Acompte de ${percentage}% sur devis n°${formData.quote_number || id} - ${formData.title}${amendmentsTTC !== 0 ? ' (avenants signés inclus)' : ''} `,
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
                include_tva: formData.include_tva,
                total_ht: depHT,
                total_tva: depTVA,
                total_ttc: depositAmount,
                parent_id: parseInt(id, 10),
                notes: `Facture d'acompte générée le ${new Date().toLocaleDateString("fr-FR")}

RÉCAPITULATIF :
• Montant total du devis : ${total.toFixed(2)} € TTC${amendmentsTTC !== 0 ? `
• Avenants signés : ${amendmentsTTC.toFixed(2)} € TTC
• Total du chantier : ${projectTotal.toFixed(2)} € TTC` : ''}
• Montant de cet acompte : ${depositAmount.toFixed(2)} € TTC
• Reste à payer sur le chantier : ${(projectTotal - depositAmount).toFixed(2)} € TTC

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

    // Devis racine du chantier : le document courant s'il n'a pas de parent,
    // sinon son parent (avenant, acompte…). L'acompte matériel se raisonne
    // toujours à l'échelle du chantier, quel que soit l'écran d'où on part.
    const materialDepositRootId = () => (formData.parent_id ? parseInt(formData.parent_id, 10) : parseInt(id, 10));

    // Charge tout ce qu'il faut pour raisonner sur l'acompte matériel : le
    // devis racine, ses documents liés (avenants, acomptes…) et les avoirs
    // rattachés aux acomptes déjà émis.
    const loadMaterialDepositStatus = async (rootId) => {
        const { data: root, error: rootError } = await supabase
            .from('quotes')
            .select('id, quote_number, title, client_id, client_name, include_tva, items, total_ttc, has_material_deposit, status')
            .eq('id', rootId)
            .single();
        if (rootError || !root) throw rootError || new Error('Devis racine introuvable');

        const { data: linkedDocs, error: linkedError } = await supabase
            .from('quotes')
            .select('id, title, type, status, items, quote_number, invoice_number, total_ht, total_ttc')
            .eq('parent_id', rootId)
            .neq('status', 'cancelled');
        if (linkedError) throw linkedError;

        // Les avoirs s'accrochent à la facture qu'ils annulent, pas au devis.
        const previousDeposits = materialDepositInvoices(linkedDocs);
        let creditNotes = [];
        if (previousDeposits.length > 0) {
            const { data: notes, error: notesError } = await supabase
                .from('quotes')
                .select('id, parent_id, total_ht, invoice_number')
                .eq('type', 'credit_note')
                .in('parent_id', previousDeposits.map(inv => inv.id))
                .neq('status', 'cancelled');
            if (notesError) throw notesError;
            creditNotes = notes || [];
        }
        return { root, linkedDocs: linkedDocs || [], status: materialDepositStatus(root, linkedDocs || [], creditNotes) };
    };

    // Acompte matériel : 100 % des fournitures fermes du chantier (devis +
    // avenants signés, options exclues — cf. materialDeposit.js), moins ce qui
    // a déjà été facturé en acompte. Utilisable depuis le devis racine (menu
    // Actions) comme depuis un avenant signé (carte « prochaine étape »).
    const handleCreateMaterialDeposit = async () => {
        let loaded;
        try {
            loaded = await loadMaterialDepositStatus(materialDepositRootId());
        } catch (error) {
            console.error('Error loading material deposit status:', error);
            toast.error("Impossible de vérifier les acomptes de ce chantier.");
            return;
        }
        const { root, linkedDocs, status } = loaded;
        const { materialTotalHT, alreadyIssuedHT, remainingHT, previous, amendmentShare, isComplement } = status;
        const previousLabels = previous.map(d => d.invoice_number || `n°${d.id}`);
        const { totalHT: amendmentTotalHT, labels: amendmentLabels } = amendmentShare;
        const rootRef = root.quote_number || root.id;

        if (materialTotalHT <= 0) {
            toast.error("Aucune fourniture à facturer sur ce chantier.");
            return;
        }
        if (remainingHT <= 0.005) {
            toast.info(`Le matériel est déjà entièrement couvert par ${previousLabels.join(', ')}. Le solde sera facturé à la clôture.`);
            return;
        }

        const toTTC = (ht) => (root.include_tva ? ht * 1.2 : ht);
        const materialTotalTTC = toTTC(materialTotalHT);
        const depositAmount = toTTC(remainingHT);
        const rootTotalTTC = parseFloat(root.total_ttc) || 0;

        // Une seule question, en clair : combien, pour quoi, et ce qui n'est
        // pas refacturé. Le détail chiffré complet reste dans les notes de la
        // facture créée.
        const what = amendmentTotalHT > 0
            ? `les fournitures ${amendmentLabels.length > 1 ? 'des' : "de l'"}${amendmentLabels.join(', ')}`
            : `100 % des fournitures du devis n°${rootRef}`;
        const notAgain = isComplement
            ? `\n\nLe matériel déjà réglé (${toTTC(alreadyIssuedHT).toFixed(2)} € TTC, ${previousLabels.join(', ')}) n'est pas refacturé.`
            : '';
        const okMat = await confirm({
            title: isComplement ? 'Acompte matériel complémentaire' : 'Acompte matériel',
            message: `Facturer au client un acompte matériel de ${depositAmount.toFixed(2)} € TTC pour ${what} ?${notAgain}`,
            confirmLabel: 'Créer la facture'
        });
        if (!okMat) return;

        try {
            setLoading(true);

            const depositItem = {
                id: Date.now(),
                // Le client reconnaît son devis à son NUMÉRO, pas à
                // l'identifiant interne de la base.
                description: `Acompte Matériel ${isComplement ? 'complémentaire' : '(100%)'} sur devis n°${rootRef} - ${root.title}${amendmentTotalHT > 0 ? ` (avenants inclus : ${amendmentLabels.join(', ')})` : ''}`,
                quantity: 1,
                unit: 'forfait',
                price: root.include_tva ? depositAmount / 1.2 : depositAmount,
                buying_price: 0,
                type: 'material'
            };
            const depositHT = depositItem.price;
            const depositTVA = root.include_tva ? (depositAmount - depositHT) : 0;

            const depositData = {
                user_id: user.id,
                client_id: root.client_id,
                client_name: clients.find(c => c.id.toString() === String(root.client_id))?.name || root.client_name || 'Client',
                title: `Facture Acompte Matériel${isComplement ? ' complémentaire' : ''} - ${root.title}`,
                date: new Date().toISOString().split('T')[0],
                status: 'billed',
                type: 'invoice',
                items: [depositItem],
                parent_id: root.id,
                include_tva: root.include_tva,
                total_ht: depositHT,
                total_tva: depositTVA,
                total_ttc: depositAmount,
                notes: `Facture d'acompte matériel générée le ${new Date().toLocaleDateString("fr-FR")}

RÉCAPITULATIF :
• Montant total du devis : ${rootTotalTTC.toFixed(2)} € TTC${amendmentTotalHT > 0 ? `
• Fournitures d'avenants signés incluses : ${amendmentTotalHT.toFixed(2)} € HT (${amendmentLabels.join(', ')})` : ''}
• Matériel total : ${materialTotalTTC.toFixed(2)} € TTC${isComplement ? `
• Acompte matériel déjà facturé : ${toTTC(alreadyIssuedHT).toFixed(2)} € TTC (${previousLabels.join(', ')})` : ''}
• Montant de cet acompte : ${depositAmount.toFixed(2)} € TTC
• Reste à payer sur devis : ${(rootTotalTTC + amendmentsTotalTTC(linkedDocs) - toTTC(alreadyIssuedHT) - depositAmount).toFixed(2)} € TTC

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

    // « Prochaine étape » : après la signature d'un avenant, dire à l'artisan
    // ce qu'il reste à facturer et le lui proposer en un clic, ici même — sans
    // avoir à retrouver le devis parent ni son menu Actions. Sur le devis
    // racine, la carte n'apparaît que si un avenant signé a laissé du matériel
    // non couvert : le premier acompte reste dans le menu, et on ne relance
    // pas l'artisan quand tout est réglé.
    useEffect(() => {
        let cancelled = false;
        setDepositNextStep(null);
        if (!id || id === 'new') return undefined;
        const signed = ['accepted', 'billed', 'paid'].includes(formData.status);
        const onSignedAmendment = formData.type === 'amendment' && signed && !!formData.parent_id;
        const onRootQuote = formData.type === 'quote' && !formData.parent_id && ['accepted', 'billed'].includes(formData.status);
        if (!onSignedAmendment && !onRootQuote) return undefined;
        (async () => {
            try {
                const { root, status } = await loadMaterialDepositStatus(materialDepositRootId());
                if (cancelled || root.has_material_deposit !== true) return;
                if (onRootQuote && !(status.isComplement && status.remainingHT > 0.005)) return;
                setDepositNextStep({ root, variant: onSignedAmendment ? 'amendment' : 'root', ...status });
            } catch (error) {
                console.error('Error computing deposit next step:', error);
            }
        })();
        return () => { cancelled = true; };
    }, [id, formData.type, formData.status, formData.parent_id]); // eslint-disable-line react-hooks/exhaustive-deps

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

            // Contexte d'avancement mémorisé sur la facture (amendment_details.situation) :
            // le PDF (app, lien public, portail) peut ainsi afficher le récapitulatif
            // "total du devis / déjà facturé / reste" sans recharger le devis parent.
            const parentId = parseInt(id, 10);
            const { data: siblingInvoices } = await supabase
                .from('quotes')
                .select('id, total_ttc, title, amendment_details')
                .eq('parent_id', parentId)
                .eq('type', 'invoice')
                .neq('status', 'cancelled');
            const previouslyBilled = (siblingInvoices || []).reduce((sum, inv) => sum + (inv.total_ttc || 0), 0);
            // Les situations antérieures à cette fonctionnalité n'ont pas de
            // contexte mémorisé : on les reconnaît via leur titre.
            const situationIndex = (siblingInvoices || []).filter(inv =>
                inv.amendment_details?.situation || /situation/i.test(inv.title || '')
            ).length + 1;
            const parentRef = formData.quote_number || parentId;

            const situationData = {
                user_id: user.id,
                client_id: formData.client_id,
                client_name: clients.find(c => c.id.toString() === formData.client_id.toString())?.name || 'Client',
                title: title,
                date: new Date().toISOString().split('T')[0],
                status: 'draft', // Draft to allow verification
                type: 'invoice',
                items: situationItems,
                include_tva: formData.include_tva,
                total_ht: total_ht,
                total_tva: total_tva,
                total_ttc: total_ttc,
                parent_id: parentId,
                amendment_details: {
                    situation: {
                        parent_quote_id: parentId,
                        parent_quote_number: parentRef,
                        parent_date: formData.date,
                        parent_title: formData.title || '',
                        parent_total_ttc: total,
                        previously_billed_ttc: previouslyBilled,
                        remaining_ttc: Math.max(total - previouslyBilled - total_ttc, 0),
                        index: situationIndex,
                    }
                },
                notes: `Facture de situation n°${situationIndex} du ${new Date().toLocaleDateString("fr-FR")}, établie selon l'avancement des travaux du devis n°${parentRef} « ${formData.title || 'Travaux'} ».`
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
                include_tva: formData.include_tva,
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
                .select('id, title, date, total_ht, total_ttc, type, status, items, quote_number')
                .eq('parent_id', quoteId)
                .neq('status', 'cancelled');

            if (fetchError) throw fetchError;

            // Filter: keep only invoices (not amendments), exclude previous closing invoices
            const deposits = (linkedInvoices || []).filter(inv =>
                inv.type === 'invoice' &&
                !inv.title?.toLowerCase().includes('clôture')
            );

            // Signed amendments must be included in the closing invoice — their
            // extra work was agreed by the client but isn't yet billed.
            const signedAmendmentStatuses = ['accepted', 'billed', 'paid'];
            const amendments = (linkedInvoices || []).filter(inv =>
                inv.type === 'amendment' &&
                signedAmendmentStatuses.includes(inv.status)
            );

            // Les avoirs s'accrochent à la FACTURE qu'ils annulent, pas au devis :
            // ils ne figurent donc pas parmi les enfants récupérés ci-dessus et
            // demandent leur propre requête. Sans eux, un acompte annulé restait
            // déduit de la clôture.
            let creditNotes = [];
            if (deposits.length > 0) {
                const { data: notes, error: notesError } = await supabase
                    .from('quotes')
                    .select('id, parent_id, total_ht, invoice_number')
                    .eq('type', 'credit_note')
                    .in('parent_id', deposits.map(inv => inv.id))
                    .neq('status', 'cancelled');

                if (notesError) throw notesError;
                creditNotes = notes || [];
            }

            const netDeposits = depositsNetOfCreditNotes(deposits, creditNotes);

            if (netDeposits.length === 0) {
                toast.info("Aucun acompte à déduire. La facture de clôture reprendra le devis intégralement.");
            }

            // 2. Prepare items: Copy original items
            // Les lignes optionnelles sont écartées : une option retenue par le
            // client a perdu son flag à la signature, celles qui le portent
            // encore n'ont pas été retenues (elles restent au devis comme trace
            // de l'offre) et ne sont donc pas dues.
            let finalItems = formData.items
                .filter(item => !item.is_optional)
                .map(item => ({
                    ...item,
                    id: Date.now() + Math.random(),
                    quantity: parseFloat(item.quantity) || 0,
                    price: parseFloat(item.price) || 0,
                    buying_price: parseFloat(item.buying_price) || 0
                }));

            // 2b. Append items from signed amendments (extra work agreed after the initial quote)
            const amendmentItems = amendments.flatMap(amd => {
                const label = amd.quote_number ? `Avenant n°${amd.quote_number}` : (amd.title || 'Avenant');
                const items = (Array.isArray(amd.items) ? amd.items : []).filter(i => !i.is_optional);
                return items.map(item => ({
                    ...item,
                    id: Date.now() + Math.random(),
                    quantity: parseFloat(item.quantity) || 0,
                    price: parseFloat(item.price) || 0,
                    buying_price: parseFloat(item.buying_price) || 0,
                    description: `[${label}] ${item.description || ''}`.trim()
                }));
            });
            finalItems = [...finalItems, ...amendmentItems];

            // 3. Add deduction lines for each deposit/advance already paid
            let totalDeducted = 0;
            const deductionItems = netDeposits.map(inv => {
                // netHT : le montant encore dû sur cet acompte, avoirs déduits
                // (cf. depositsNetOfCreditNotes). Le récap reflète le montant
                // RÉELLEMENT déduit, toujours en valeur absolue — la ligne de
                // déduction est -Math.abs(...). Sans ce Math.abs, un acompte
                // négatif (avenant moins-value converti en facture) faussait le
                // total récapitulatif de la note.
                const amountHT = inv.netHT;
                totalDeducted += Math.abs(amountHT);
                // Inherit the type from the deposit's items so the deduction offsets
                // the right category (material vs service) in accounting and net income.
                const depositItems = Array.isArray(inv.items) ? inv.items : [];
                const materialSum = depositItems.filter(i => i.type === 'material').reduce((sum, i) => sum + Math.abs((parseFloat(i.price) || 0) * (parseFloat(i.quantity) || 0)), 0);
                const serviceSum = depositItems.filter(i => i.type !== 'material').reduce((sum, i) => sum + Math.abs((parseFloat(i.price) || 0) * (parseFloat(i.quantity) || 0)), 0);
                const deductionType = materialSum >= serviceSum ? 'material' : 'service';
                return {
                    id: Date.now() + Math.random(),
                    description: `Déduction ${inv.title || 'Acompte'} du ${inv.date ? new Date(inv.date).toLocaleDateString("fr-FR") : 'Date inconnue'}`,
                    quantity: 1,
                    unit: 'forfait',
                    price: -Math.abs(amountHT),
                    buying_price: 0,
                    type: deductionType
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

            const creditedCount = deposits.length - netDeposits.length;
            const deductionSummary = netDeposits.length > 0
                ? `\n\nDéductions appliquées (${netDeposits.length} acompte${netDeposits.length > 1 ? 's' : ''}) : -${totalDeducted.toFixed(2)} € HT`
                  + (creditedCount > 0 ? `\n${creditedCount} acompte${creditedCount > 1 ? 's' : ''} annulé${creditedCount > 1 ? 's' : ''} par avoir, non déduit${creditedCount > 1 ? 's' : ''}.` : '')
                : '';
            const amendmentSummary = amendments.length > 0
                ? `\n${amendments.length} avenant${amendments.length > 1 ? 's' : ''} signé${amendments.length > 1 ? 's' : ''} intégré${amendments.length > 1 ? 's' : ''} : ${amendments.map(a => a.quote_number ? `n°${a.quote_number}` : (a.title || 'sans titre')).join(', ')}`
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
                include_tva: formData.include_tva,
                total_ht: subtotal,
                total_tva: tva,
                total_ttc: total,
                parent_id: quoteId,
                notes: (formData.notes || '') + `\n\nFacture de clôture générée le ${new Date().toLocaleDateString("fr-FR")}${amendmentSummary}${deductionSummary}`
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

            const successParts = [];
            if (amendments.length > 0) successParts.push(`${amendments.length} avenant${amendments.length > 1 ? 's' : ''}`);
            if (deposits.length > 0) successParts.push(`${deposits.length} déduction${deposits.length > 1 ? 's' : ''}`);
            const successMsg = successParts.length > 0
                ? `Facture de clôture générée (${successParts.join(' + ')}) !`
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

            const url = await generateClientPDF(devisData, selectedClient, userProfile, isInvoice, 'bloburl');

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


    // Ouvre la modal d'avoir en chargeant les avoirs déjà émis sur cette
    // facture (plusieurs avoirs partiels sont légitimes ; un second avoir
    // total est presque toujours une erreur — on prévient sans bloquer).
    const openCreditNoteModal = async () => {
        setShowActionsMenu(false);
        let existing = [];
        try {
            const { data } = await supabase
                .from('quotes')
                .select('id, invoice_number, total_ttc, date')
                .eq('parent_id', id)
                .eq('type', 'credit_note');
            existing = data || [];
        } catch (e) {
            console.error('Error loading existing credit notes:', e);
        }
        setCreditNoteModal({ mode: 'total', amountTTC: '', reason: '', saving: false, existing });
    };

    const handleCreateCreditNote = async () => {
        if (!creditNoteModal || creditNoteModal.saving) return;
        try {
            const payload = buildCreditNotePayload(
                { ...formData, id: parseInt(id, 10), total_ttc: total },
                {
                    mode: creditNoteModal.mode,
                    amountTTC: parseFloat(String(creditNoteModal.amountTTC).replace(',', '.')),
                    reason: creditNoteModal.reason,
                },
            );

            setCreditNoteModal(prev => ({ ...prev, saving: true }));

            const { data: created, error } = await supabase
                .from('quotes')
                .insert([{
                    ...payload,
                    user_id: user.id,
                    client_id: formData.client_id,
                    client_name: selectedClient?.name || formData.client_name || 'Client',
                    intervention_address: formData.intervention_address,
                    intervention_postal_code: formData.intervention_postal_code,
                    intervention_city: formData.intervention_city,
                }])
                .select('id, invoice_number')
                .single();

            if (error) throw error;

            // Un avoir TOTAL annule la facture : elle doit cesser d'être comptée.
            // Sans ce marquage, la facture de clôture continuait de déduire un
            // acompte annulé (elle ne retient que les enfants du devis, et un
            // avoir s'accroche à la facture, pas au devis) — le client était
            // crédité d'un montant qu'il n'avait jamais réglé. Le numéro reste
            // figé par le trigger : la séquence légale garde sa trace.
            if (creditNoteModal.mode === 'total') {
                const { error: cancelError } = await supabase
                    .from('quotes')
                    .update({ status: 'cancelled' })
                    .eq('id', parseInt(id, 10));
                if (cancelError) {
                    console.error('Error cancelling credited invoice:', cancelError);
                    toast.warning(`Avoir ${created.invoice_number || ''} émis, mais la facture n'a pas pu être marquée annulée — faites-le à la main pour qu'elle ne soit plus déduite.`);
                }
            }

            toast.success(`Avoir ${created.invoice_number || ''} émis — pensez à l'envoyer au client`.replace('  ', ' '));
            invalidateQuotes();
            setCreditNoteModal(null);
            navigate(`/app/devis/${created.id}`);
        } catch (error) {
            console.error('Error creating credit note:', error);
            toast.error(error.message || "Erreur lors de la création de l'avoir");
            setCreditNoteModal(prev => (prev ? { ...prev, saving: false } : prev));
        }
    };

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

    const handleSignatureSave = async (signatureData, _otpCode, bonPourAccord) => {
        try {
            const now = new Date().toISOString();
            const { error } = await supabase
                .from('quotes')
                .update({
                    signature: signatureData,
                    status: 'accepted',
                    signed_at: now,
                    bon_pour_accord: bonPourAccord || null
                })
                .eq('id', id);

            if (error) throw error;

            setSignature(signatureData);
            setFormData(prev => ({ ...prev, status: 'accepted', signature: signatureData, signed_at: now, bon_pour_accord: bonPourAccord || null }));
            invalidateQuotes();
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
            const fileName = `${crypto.randomUUID()}.${fileExt}`;
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
                        const buyingPrice = parseFloat(item.buying_price) || 0;

                        if (seenDescriptions.has(normalizeDesc)) continue;
                        seenDescriptions.add(normalizeDesc);

                        const existing = libraryMap.get(normalizeDesc);

                        if (existing) {
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
    // Un devis envoyé est verrouillé par défaut : la version transmise au client
    // fait foi. L'artisan peut le déverrouiller explicitement (nouvelle version,
    // l'ancienne restant archivée dans quote_versions).
    const isLocked = ['accepted', 'billed', 'paid', 'cancelled'].includes(formData.status)
        || (formData.status === 'sent' && !revisionUnlocked);

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
        <>
            {canConvertToInvoice && (
                <>
                    <div className="border-t border-gray-100 dark:border-gray-800 my-1 first:hidden"></div>
                    <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Facturation</p>
                    <button
                        onClick={() => { handleConvertToInvoice(); closeMenu(); }}
                        className="flex items-center w-full px-4 py-2 text-sm text-emerald-700 dark:text-green-400 hover:bg-emerald-50"
                    >
                        <FileCheck className="w-4 h-4 mr-3 text-emerald-600" />
                        Convertir en facture
                    </button>
                </>
            )}

            {canCreateLinkedDocs && (
                <>
                    <div className="border-t border-gray-100 dark:border-gray-800 my-1 first:hidden"></div>
                    <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Documents liés</p>
                    <button
                        onClick={() => { handleCreateAvenant(); closeMenu(); }}
                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                        <FileText className="w-4 h-4 mr-3 text-indigo-600" />
                        Créer un avenant
                    </button>
                    <button
                        onClick={() => { handleCreateDeposit(); closeMenu(); }}
                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 bg-blue-50/50"
                    >
                        <FileCheck className="w-4 h-4 mr-3 text-blue-600" />
                        Générer Facture d'Acompte
                    </button>
                    <button
                        onClick={() => { handleCreateMaterialDeposit(); closeMenu(); }}
                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 bg-orange-50/50"
                    >
                        <FileCheck className="w-4 h-4 mr-3 text-orange-600" />
                        Générer Acompte Matériel
                    </button>
                    <button
                        onClick={() => { handleCreateSituation(); closeMenu(); }}
                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 bg-purple-50/50"
                    >
                        <Layers className="w-4 h-4 mr-3 text-purple-600" />
                        Créer Situation de Travaux
                    </button>
                    <button
                        onClick={() => { handleCreateClosingInvoice(); closeMenu(); }}
                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 bg-green-50/50"
                    >
                        <Check className="w-4 h-4 mr-3 text-green-600" />
                        Générer Facture de Clôture
                    </button>
                </>
            )}

            {canCreateCreditNote && (
                <>
                    <div className="border-t border-gray-100 dark:border-gray-800 my-1 first:hidden"></div>
                    <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Rectification</p>
                    <button
                        onClick={() => { openCreditNoteModal(); closeMenu(); }}
                        className="flex items-center w-full px-4 py-2 text-sm text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                        <FileText className="w-4 h-4 mr-3 text-red-500" />
                        Créer un avoir
                    </button>
                </>
            )}
        </>
    );

    const renderDocumentActionModals = () => (
        <>
            {/* Fenêtre explicative du bouton « Facturer » — affichée au premier
                clic seulement, puis mémorisée (dismissedHelps) par navigateur. */}
            {creditNoteModal && (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    onClick={() => !creditNoteModal.saving && setCreditNoteModal(null)}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="credit-note-title"
                >
                    <div
                        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 id="credit-note-title" className="font-bold text-gray-900 dark:text-white text-base mb-1">
                            Créer un avoir sur la facture {formData.invoice_number}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
                            Une facture émise ne peut être ni modifiée ni supprimée : l'avoir est le
                            document légal qui l'annule ou la corrige. Il sera émis immédiatement,
                            avec un numéro AV-… définitif.
                        </p>

                        {creditNoteModal.existing.length > 0 && (
                            <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
                                Déjà émis sur cette facture :{' '}
                                {creditNoteModal.existing.map(cn => `${cn.invoice_number || `#${cn.id}`} (${(Number(cn.total_ttc) || 0).toFixed(2)} €)`).join(', ')}
                            </div>
                        )}

                        <div className="space-y-3 mb-5">
                            <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${creditNoteModal.mode === 'total' ? 'border-red-300 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                                <input
                                    type="radio"
                                    name="credit-note-mode"
                                    className="mt-0.5"
                                    checked={creditNoteModal.mode === 'total'}
                                    onChange={() => setCreditNoteModal(p => ({ ...p, mode: 'total' }))}
                                />
                                <span className="text-sm">
                                    <span className="font-semibold text-gray-900 dark:text-white block">Avoir total (annulation)</span>
                                    <span className="text-gray-500 dark:text-gray-400 text-xs">Toutes les lignes de la facture reprises en négatif ({total.toFixed(2)} €).</span>
                                </span>
                            </label>
                            <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${creditNoteModal.mode === 'partial' ? 'border-red-300 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                                <input
                                    type="radio"
                                    name="credit-note-mode"
                                    className="mt-0.5"
                                    checked={creditNoteModal.mode === 'partial'}
                                    onChange={() => setCreditNoteModal(p => ({ ...p, mode: 'partial' }))}
                                />
                                <span className="text-sm flex-1">
                                    <span className="font-semibold text-gray-900 dark:text-white block">Avoir partiel</span>
                                    <span className="text-gray-500 dark:text-gray-400 text-xs block mb-2">Une remise ou correction d'un montant donné.</span>
                                    {creditNoteModal.mode === 'partial' && (
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            placeholder={`Montant TTC (max ${total.toFixed(2)} €)`}
                                            value={creditNoteModal.amountTTC}
                                            onChange={e => setCreditNoteModal(p => ({ ...p, amountTTC: e.target.value }))}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900"
                                        />
                                    )}
                                </span>
                            </label>
                            <input
                                type="text"
                                placeholder="Motif (recommandé) : erreur de facturation, geste commercial…"
                                value={creditNoteModal.reason}
                                onChange={e => setCreditNoteModal(p => ({ ...p, reason: e.target.value }))}
                                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900"
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setCreditNoteModal(null)}
                                disabled={creditNoteModal.saving}
                                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200"
                            >
                                Annuler
                            </button>
                            <button
                                type="button"
                                onClick={handleCreateCreditNote}
                                disabled={creditNoteModal.saving || (creditNoteModal.mode === 'partial' && !(parseFloat(String(creditNoteModal.amountTTC).replace(',', '.')) > 0))}
                                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
                            >
                                {creditNoteModal.saving ? 'Émission…' : "Émettre l'avoir"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <SituationModal
                isOpen={showSituationModal}
                onClose={() => setShowSituationModal(false)}
                quote={{ ...formData, id: id }}
                onSave={handleSaveSituation}
            />

            {formData.type === 'amendment' && (
                <AmendmentDeductionModal
                    isOpen={showDeductionModal}
                    onClose={() => setShowDeductionModal(false)}
                    parentQuote={formData.parent_quote_data}
                    existingItems={formData.items}
                    onAdd={handleAddDeductionItems}
                />
            )}
        </>
    );

    // Bandeau « signature suspendue » — rendu à l'identique dans l'éditeur et
    // dans l'aperçu : depuis l'aperçu aussi, l'artisan doit voir que son client
    // ne peut plus signer, et pouvoir rouvrir sans passer par l'éditeur.
    const suspendedSignatureBanner = signatureSuspended ? (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 mb-6 flex items-start gap-3">
            <div className="p-1 bg-orange-100 dark:bg-orange-900/40 rounded-full text-orange-600 shrink-0">
                <Lock className="w-4 h-4" />
            </div>
            <div className="flex-1">
                <h4 className="text-sm font-semibold text-orange-800 dark:text-orange-300">Signature suspendue</h4>
                <p className="text-sm text-orange-700 dark:text-orange-400 mt-1">
                    Le lien envoyé au client ne s’ouvre plus et ne peut pas être signé.
                    Le document reste modifiable ; rouvrez la signature quand il est prêt.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={handleToggleSignatureSuspension}
                        disabled={togglingSuspension}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg transition-colors"
                    >
                        <Unlock className="w-4 h-4" />
                        {togglingSuspension ? 'Réouverture…' : 'Rouvrir la signature'}
                    </button>
                    {/* Le client ne voit rien tant qu'il ne rouvre pas le lien —
                        et il a peut-être déjà imprimé le PDF. Le prévenir est la
                        seule action qui vaut hors de l'application. */}
                    <button
                        type="button"
                        onClick={handleNotifyWithdrawal}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-orange-800 dark:text-orange-300 bg-white dark:bg-gray-900 border border-orange-300 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg transition-colors"
                    >
                        <Mail className="w-4 h-4" />
                        Prévenir le client
                    </button>
                </div>
            </div>
        </div>
    ) : null;

    if (isEditing && dataLoaded && pdfOverviewMode) {
        const overviewSrc = formData.is_external ? displayPdfUrl : overviewPdfUrl;
        // Aperçu en images (mobile) : uniquement pour un PDF généré (blob:), pas
        // pour un document externe dont on ne possède pas le blob à rastériser.
        const showImagePreview = overviewUsesImages && !formData.is_external && overviewPdfUrl;
        const refPrefix = formData.type === 'invoice' ? 'FAC' : (formData.type === 'credit_note' ? 'AVR' : (formData.type === 'amendment' ? 'AVT' : 'DEV'));
        const docRef = ['invoice', 'credit_note'].includes(formData.type) && formData.invoice_number
            ? formData.invoice_number
            : `${refPrefix} #${formData.quote_number || id}`;
        const statusMeta = {
            draft: { label: 'Brouillon', cls: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300' },
            sent: { label: 'Envoyé', cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
            accepted: { label: 'Signé', cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' },
            rejected: { label: 'Refusé', cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' },
            refused: { label: 'Refusé', cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' },
            billed: { label: 'Facturé', cls: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' },
            paid: { label: 'Payé', cls: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' },
            postponed: { label: 'Reporté', cls: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' },
            // Sans cette entrée, une facture annulée n'affichait aucun badge :
            // rien ne la distinguait d'une facture encore due.
            cancelled: { label: 'Annulée', cls: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 line-through' },
        }[formData.status] || null;

        const goToEditor = () => setPdfOverviewMode(false);

        return (
            <div className="max-w-5xl mx-auto pb-12 animate-slide-in-right">
                {/* Barre d'outils */}
                <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                        <button
                            onClick={handleBack}
                            className="flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex-shrink-0"
                        >
                            <ArrowLeft className="w-5 h-5 sm:mr-2" />
                            <span className="hidden sm:inline">Retour</span>
                        </button>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white truncate">{docRef}</h1>
                                {statusMeta && (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${statusMeta.cls}`}>
                                        {statusMeta.label}
                                    </span>
                                )}
                                {/* Un document « Envoyé » dont le lien est fermé se lit
                                    autrement : le client ne peut plus rien signer.
                                    Une suspension décidée et un lien simplement périmé
                                    ne se disent pas pareil — les confondre faisait
                                    passer le ménage nocturne pour une décision. */}
                                {signatureSuspended && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                                        <Lock className="w-3 h-3" />
                                        Signature suspendue
                                    </span>
                                )}
                                {linkExpired && (
                                    <span
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                                        title={`Le lien public a expiré : renvoyez le document ou recopiez le lien pour lui rendre ${publicLinkValidityLabel()} de validité.`}
                                    >
                                        <Clock className="w-3 h-3" />
                                        Lien expiré
                                    </span>
                                )}
                            </div>
                            {(formData.title || formData.client_name) && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                    {[formData.client_name, formData.title].filter(Boolean).join(' — ')}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {overviewSrc && (
                            <a
                                href={overviewSrc}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hidden sm:flex items-center px-3 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                title="Ouvrir dans un nouvel onglet"
                            >
                                <ExternalLink className="w-4 h-4" />
                            </a>
                        )}
                        <button
                            type="button"
                            onClick={() => handleDownloadPDF(formData.status === 'accepted')}
                            className="flex items-center px-3 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                            title="Télécharger le PDF"
                        >
                            <Download className="w-4 h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Télécharger</span>
                        </button>
                        {/* Devis présenté en groupé / poste global : l'aperçu ci-dessous
                            est la version du client. Ce second bouton sort le même
                            document ligne à ligne, pour l'artisan — disponible aussi
                            après signature, sans toucher à la version transmise. */}
                        {!formData.is_external && ['grouped', 'poste_global'].includes(formData.client_display_mode || 'detailed') && (
                            <button
                                type="button"
                                onClick={() => handleDownloadPDF(false, { detailed: true })}
                                className="flex items-center px-3 py-2 text-amber-700 dark:text-amber-300 bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
                                title="Télécharger ma copie détaillée (ligne à ligne, pour vous — la version du client reste inchangée)"
                            >
                                <Lock className="w-4 h-4 sm:mr-2" />
                                <span className="hidden sm:inline">Ma copie détaillée</span>
                            </button>
                        )}
                        {/* Documents liés (acompte, situation, facture de clôture, avenant,
                            avoir) : accessibles depuis l'aperçu, sans passer par l'éditeur —
                            c'est en lisant le document qu'on décide de le facturer. */}
                        {hasDocumentActions && (
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setShowOverviewDocsMenu(prev => !prev)}
                                    aria-haspopup="menu"
                                    aria-expanded={showOverviewDocsMenu}
                                    className="flex items-center px-3 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                    title="Créer un document lié : acompte, situation de travaux, facture de clôture, avenant…"
                                >
                                    <FilePlus className="w-4 h-4 sm:mr-2" />
                                    <span className="hidden sm:inline">Documents</span>
                                    <ChevronDown className={`w-3.5 h-3.5 ml-1 opacity-70 transition-transform ${showOverviewDocsMenu ? 'rotate-180' : ''}`} />
                                </button>

                                {showOverviewDocsMenu && (
                                    <>
                                        {/* Voile transparent : un clic à côté referme le menu */}
                                        <div
                                            className="fixed inset-0 z-40"
                                            onClick={() => setShowOverviewDocsMenu(false)}
                                            aria-hidden="true"
                                        />
                                        <div
                                            role="menu"
                                            className="absolute right-0 mt-2 w-60 bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-100 dark:border-gray-800 z-50 py-1 text-left"
                                        >
                                            {renderDocumentActions(() => setShowOverviewDocsMenu(false))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={goToEditor}
                            className="flex items-center px-3 sm:px-4 py-2 text-white bg-ios rounded-lg hover:bg-ios-dark shadow-sm"
                            title="Ouvrir l'éditeur pour modifier ce document"
                        >
                            <Pencil className="w-4 h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Modifier</span>
                        </button>
                    </div>
                </div>

                {suspendedSignatureBanner}

                {/* Visionneuse PDF */}
                <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-200 dark:bg-gray-950 h-[75vh] min-h-[420px]">
                    {showImagePreview ? (
                        overviewPageImages.length > 0 ? (
                            // Aperçu image multi-pages (mobile) : l'<iframe> n'affiche
                            // pas un PDF blob: sur iOS/Android.
                            <div className="w-full h-full overflow-y-auto p-3 space-y-3" style={{ background: '#525659' }}>
                                {overviewPageImages.map((src, i) => (
                                    <img
                                        key={i}
                                        src={src}
                                        alt={`Page ${i + 1}`}
                                        className="w-full rounded-lg shadow bg-white"
                                        loading={i === 0 ? 'eager' : 'lazy'}
                                    />
                                ))}
                            </div>
                        ) : overviewImagesFailed ? (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-center px-6 bg-white dark:bg-gray-900">
                                <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Aperçu indisponible sur cet appareil
                                </p>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleDownloadPDF(formData.status === 'accepted')}
                                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        <Download className="w-4 h-4" />
                                        Télécharger
                                    </button>
                                    <a
                                        href={overviewSrc}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-ios rounded-lg hover:bg-ios-dark transition-colors"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                        Plein écran
                                    </a>
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900">
                                <Loader2 className="w-8 h-8 animate-spin" />
                                <span className="text-sm">Préparation de l'aperçu…</span>
                            </div>
                        )
                    ) : overviewSrc ? (
                        <iframe
                            src={overviewSrc}
                            title="Aperçu du document"
                            className="w-full h-full border-0"
                            style={{ background: '#525659' }}
                        />
                    ) : overviewError ? (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-center px-6 bg-white dark:bg-gray-900">
                            <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                            <div>
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Impossible d'afficher l'aperçu PDF
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs">
                                    {overviewError === 'client'
                                        ? "Le client associé est introuvable. Ouvrez l'éditeur pour vérifier le document."
                                        : "Une erreur est survenue pendant la génération du PDF."}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {overviewError !== 'client' && (
                                    <button
                                        onClick={() => { setOverviewError(null); generateOverviewPdf(); }}
                                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                        Réessayer
                                    </button>
                                )}
                                <button
                                    onClick={goToEditor}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-ios rounded-lg hover:bg-ios-dark transition-colors"
                                >
                                    <Pencil className="w-4 h-4" />
                                    Ouvrir l'éditeur
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900">
                            <Loader2 className="w-8 h-8 animate-spin" />
                            <span className="text-sm">Génération de l'aperçu…</span>
                        </div>
                    )}
                </div>

                {/* Repli mobile : ouvrir le PDF en plein écran */}
                {overviewSrc && (
                    <div className="mt-3 text-center sm:hidden">
                        <a
                            href={overviewSrc}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center px-4 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg"
                        >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Ouvrir en plein écran
                        </a>
                    </div>
                )}

                {renderDocumentActionModals()}
            </div>
        );
    }

    return (
        <div className={`max-w-4xl mx-auto pb-12 sm:pb-12 pb-28 ${isExiting ? 'animate-slide-out-right' : 'animate-slide-in-right'}`}>

            {/* Bandeau contre-proposition — affiché tant que l'artisan n'a pas masqué */}
            {competitorImport && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-800/40 rounded-2xl p-4 mb-4 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                        <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-blue-900 dark:text-blue-200">
                            Contre-proposition à partir de {competitorImport.filename}
                        </p>
                        <p className="text-xs text-blue-700 dark:text-blue-300 dark:text-blue-300/90 mt-1 leading-relaxed">
                            Les lignes du devis concurrent ont été importées. Ajustez les prix unitaires pour proposer
                            une offre compétitive — pensez à utiliser le Copilot (✨ en bas à droite) pour vérifier vos
                            marges ou suggérer un prix.
                        </p>
                        {formData.original_pdf_url && (
                            <a
                                href={formData.original_pdf_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-300 hover:underline mt-2"
                            >
                                <ExternalLink className="w-3 h-3" />
                                Ouvrir le devis original
                            </a>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => setCompetitorImport(null)}
                        className="p-1 text-blue-400 hover:text-blue-700 dark:hover:text-blue-200 rounded flex-shrink-0"
                        title="Masquer ce bandeau"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {suspendedSignatureBanner}

            {isLocked && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
                    <div className="p-1 bg-amber-100 rounded-full text-amber-600">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-lock w-4 h-4"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    </div>
                    {formData.status === 'sent' ? (
                        <div className="flex-1">
                            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-400">Devis envoyé au client</h4>
                            <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                                La version transmise au client fait foi : les champs sont verrouillés pour éviter
                                toute modification involontaire. Pour le réviser, créez une nouvelle version —
                                la version envoyée restera archivée ci-dessous. Pour des travaux supplémentaires,
                                préférez un avenant.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={handleUnlockRevision}
                                    className="px-3 py-1.5 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg"
                                >
                                    Modifier (nouvelle version)
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCreateAvenant}
                                    className="px-3 py-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400 bg-white dark:bg-gray-900 border border-amber-300 hover:bg-amber-100 rounded-lg"
                                >
                                    Créer un avenant
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-400">Document Verrouillé</h4>
                            <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                                Ce document est <strong>{formData.status === 'accepted' ? 'signé' : 'clôturé'}</strong>. Pour garantir l'intégrité légale, les modifications sont désactivées.<br />
                                Pour modifier le périmètre, veuillez créer un avenant ou repasser le statut en "Brouillon" (déconseillé si déjà envoyé).
                            </p>
                        </div>
                    )}
                </div>
            )}

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
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 mb-6">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center mb-3">
                        <Clock className="w-4 h-4 mr-2 text-gray-400" />
                        Versions archivées
                    </h4>
                    <ul className="space-y-2">
                        {quoteVersions.map(v => {
                            const reasonLabels = {
                                sent: { label: 'Envoyée au client', cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
                                pre_modification: { label: 'Avant modification', cls: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300' },
                                restore: { label: 'Restaurée', cls: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' },
                            };
                            const reason = reasonLabels[v.reason] || reasonLabels.pre_modification;
                            const versionTtc = parseFloat(v.snapshot?.total_ttc);
                            return (
                                <li key={v.id} className="flex items-center justify-between gap-3 text-sm">
                                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                        <span className="font-semibold text-gray-700 dark:text-gray-300 flex-shrink-0">V{v.version_number}</span>
                                        <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">
                                            {new Date(v.created_at).toLocaleDateString('fr-FR')}
                                        </span>
                                        {!Number.isNaN(versionTtc) && (
                                            <span className="font-medium text-gray-900 dark:text-gray-100 flex-shrink-0">
                                                {versionTtc.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                            </span>
                                        )}
                                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${reason.cls}`}>
                                            {reason.label}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleViewVersionPdf(v)}
                                        disabled={versionPdfLoading === v.id}
                                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg flex-shrink-0"
                                    >
                                        {versionPdfLoading === v.id
                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            : <FileText className="w-3.5 h-3.5" />}
                                        PDF
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
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
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 rounded-2xl p-4 mb-6 relative">
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
                                <li className="flex items-start gap-2 text-sm text-blue-700 dark:text-blue-300">
                                    <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-800 flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5">1</span>
                                    <span><strong>Choisissez un client</strong> — recherchez son nom ou cliquez "Nouveau client" juste en dessous</span>
                                </li>
                                <li className="flex items-start gap-2 text-sm text-blue-700 dark:text-blue-300">
                                    <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-800 flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5">2</span>
                                    <span><strong>Ajoutez vos prestations</strong> — cliquez "+ Main d'œuvre" pour votre travail, "+ Matériel" pour vos fournitures</span>
                                </li>
                                <li className="flex items-start gap-2 text-sm text-blue-700 dark:text-blue-300">
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
                    className="flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                >
                    <ArrowLeft className="w-5 h-5 sm:mr-2" />
                    <span className="hidden sm:inline">Retour</span>
                </button>

                {/* Type Switch — Devis / Facture. Masqué pour les avenants : un
                    avenant est un type de document à part (avec ses sections
                    constat/solution) qu'on ne doit pas convertir en devis/facture
                    via ce raccourci. Sans ce garde-fou, un clic accidentel sur
                    « Facture » changeait le type, masquait la section Avenant et
                    n'offrait aucun retour possible. On affiche à la place un badge
                    non cliquable indiquant qu'il s'agit d'un avenant. */}
                {formData.type === 'amendment' ? (
                    <div className="flex items-center gap-1.5 mx-2 sm:mx-4 px-3 py-1.5 rounded-lg bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 text-sm font-semibold">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Avenant
                    </div>
                ) : isCreditNote ? (
                    <div className="flex items-center gap-1.5 mx-2 sm:mx-4 px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-sm font-semibold">
                        <FileText className="w-3.5 h-3.5" />
                        Avoir{formData.invoice_number ? ` ${formData.invoice_number}` : ''}
                    </div>
                ) : (
                    <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg mx-2 sm:mx-4">
                        <button
                            type="button"
                            onClick={() => {
                                // Facture émise = numéro légal attribué : le retour en
                                // devis est interdit (la base le refuserait de toute façon).
                                if (formData.invoice_number) {
                                    toast.error(`La facture ${formData.invoice_number} a été émise et ne peut plus redevenir un devis. Créez un avoir pour l'annuler.`);
                                    return;
                                }
                                setFormData(p => ({ ...p, type: 'quote' }));
                            }}
                            disabled={!!formData.invoice_number}
                            className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${formData.invoice_number ? 'opacity-50 cursor-not-allowed ' : ''}${formData.type !== 'invoice'
                                ? 'bg-white dark:bg-gray-900 text-blue-600 shadow-sm'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900'
                                }`}
                        >
                            Devis
                        </button>
                        <button
                            type="button"
                            onClick={() => setFormData(p => ({ ...p, type: 'invoice' }))}
                            className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${formData.type === 'invoice'
                                ? 'bg-white dark:bg-gray-900 text-green-600 shadow-sm'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900'
                                }`}
                        >
                            Fac<span className="hidden sm:inline">ture</span>
                        </button>
                    </div>
                )}

                {/* Presence Indicator */}
                <div className="flex flex-col items-center justify-center mr-auto ml-2">
                    {isClientOnline && (
                        <div className="flex items-center gap-1 text-green-600 bg-green-50 dark:bg-green-900/20 px-3 py-1 rounded-full text-xs font-bold border border-green-200 animate-pulse transition-all">
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
                                <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 font-bold px-1 rounded text-[9px]">
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
                    {!isEditing && (
                        <AutoSaveIndicator lastSaved={lastSaved} saving={saving} />
                    )}
                    {/* Retour à la vue aperçu PDF (documents finalisés) */}
                    {isEditing && formData.status && formData.status !== 'draft' && (
                        <button
                            type="button"
                            onClick={() => setPdfOverviewMode(true)}
                            className="flex items-center px-3 sm:px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                            title="Revenir à l'aperçu PDF"
                        >
                            <Eye className="w-4 h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Aperçu</span>
                        </button>
                    )}

                    {/* Primary Actions */}
                    <button
                        type="button"
                        onClick={() => handleSendQuoteEmail('fr')}
                        disabled={loading}
                        className="flex items-center px-3 sm:px-4 py-2 text-white bg-ios rounded-lg hover:bg-ios-dark disabled:opacity-50 shadow-sm font-medium"
                        title="Envoyer par email (enregistre le devis si besoin)"
                    >
                        <Send className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">Envoyer</span>
                    </button>

                    {canConvertToInvoice && (
                        <button
                            type="button"
                            onClick={handleConvertToInvoice}
                            className="flex items-center px-3 sm:px-4 py-2 text-emerald-700 dark:text-green-400 bg-emerald-50 dark:bg-green-900/20 border border-emerald-200 rounded-lg hover:bg-emerald-100 font-medium transition-colors"
                            title="Convertir ce devis en facture"
                        >
                            <FileCheck className="w-4 h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Facturer</span>
                        </button>
                    )}

                    {formData.type === 'invoice' && id && id !== 'new' && formData.client_id && userProfile?.google_review_url && (
                        <button
                            type="button"
                            onClick={() => { setReviewNavigateOnClose(false); setShowReviewRequestModal(true); }}
                            className="flex items-center px-3 sm:px-4 py-2 text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 rounded-lg hover:bg-yellow-100 font-medium transition-colors"
                            title="Demander un avis Google au client"
                        >
                            <Star className="w-4 h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Demander un avis</span>
                        </button>
                    )}

                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="flex items-center px-3 sm:px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                        title="Enregistrer sans envoyer"
                    >
                        <Save className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">{loading ? '...' : 'Enregistrer'}</span>
                    </button>

                    {/* More Actions Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setShowActionsMenu(!showActionsMenu)}
                            className="flex items-center justify-center w-10 h-10 bg-white dark:bg-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ios dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                            title="Plus d'actions"
                        >
                            <MoreVertical className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        </button>

                        {showActionsMenu && (
                            <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-100 dark:border-gray-800 z-50 py-1">
                                {/* ─── Partage & Signature ─── */}
                                <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Partage & Signature</p>
                                {/* Mobile only Send button */}
                                <button
                                    onClick={() => { handleSendQuoteEmail('fr'); setShowActionsMenu(false); }}
                                    className="sm:hidden flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                                >
                                    <Send className="w-4 h-4 mr-3 text-blue-600" />
                                    {formData.type === 'invoice' ? 'Envoyer la facture' : (isCreditNote ? "Envoyer l'avoir" : 'Envoyer le devis')}
                                </button>

                                {/* Envoi en anglais (devis/facture + mail traduits) */}
                                <button
                                    onClick={() => { handleSendQuoteEmail('en'); setShowActionsMenu(false); }}
                                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                                >
                                    <Send className="w-4 h-4 mr-3 text-blue-600" />
                                    Envoyer en anglais 🇬🇧
                                </button>

                                {id && formData.public_token && (
                                    <button
                                        onClick={async () => {
                                            setShowActionsMenu(false);
                                            // Copier prolonge la validité du lien : sur un document
                                            // suspendu, ce serait rouvrir la signature à l'insu de
                                            // l'artisan qui vient de la fermer.
                                            if (await fetchLinkSuspended()) {
                                                toast.error(suspensionBlockMessage);
                                                return;
                                            }
                                            const url = `${window.location.origin}/q/${formData.public_token}`;
                                            navigator.clipboard.writeText(url);
                                            const newExpiry = publicLinkExpiry();
                                            const { error: refreshError } = await supabase
                                                .from('quotes')
                                                .update({ token_revoked: false, token_expires_at: newExpiry })
                                                .eq('id', id);
                                            if (refreshError) {
                                                toast.error('Lien copié, mais la validité n\'a pas pu être prolongée');
                                            } else {
                                                toast.success('Lien de signature copié !');
                                            }
                                        }}
                                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                                    >
                                        <Link className="w-4 h-4 mr-3 text-gray-400" />
                                        Copier le lien public
                                    </button>
                                )}

                                {/* Suspendre / rouvrir la signature — seuls les documents qui
                                    se signent sont concernés (ni facture, ni avoir), et une
                                    fois signé il n'y a plus rien à fermer. */}
                                {id && id !== 'new' && formData.public_token && !signature
                                    && formData.status !== 'accepted' && formData.type !== 'invoice' && !isCreditNote && (
                                    <button
                                        onClick={() => { handleToggleSignatureSuspension(); setShowActionsMenu(false); }}
                                        disabled={togglingSuspension}
                                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                                    >
                                        {signatureSuspended ? (
                                            <>
                                                <Unlock className="w-4 h-4 mr-3 text-green-600" />
                                                Rouvrir la signature
                                            </>
                                        ) : (
                                            <>
                                                <Lock className="w-4 h-4 mr-3 text-amber-600" />
                                                Suspendre la signature
                                            </>
                                        )}
                                    </button>
                                )}

                                {id && id !== 'new' && isDocumentClosed && formData.type !== 'invoice' && !isCreditNote && (
                                    <button
                                        onClick={() => { handleNotifyWithdrawal(); setShowActionsMenu(false); }}
                                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                                    >
                                        <Mail className="w-4 h-4 mr-3 text-orange-600" />
                                        Prévenir le client du retrait
                                    </button>
                                )}

                                {id && !signature && formData.status !== 'accepted' && formData.type !== 'invoice' && !isCreditNote && (
                                    <button
                                        onClick={() => { setShowSignatureModal(true); setShowActionsMenu(false); }}
                                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                                    >
                                        <PenTool className="w-4 h-4 mr-3 text-purple-600" />
                                        Faire signer sur l'appareil
                                    </button>
                                )}

                                <div className="border-t border-gray-100 dark:border-gray-800 my-1"></div>
                                {/* ─── PDF ─── */}
                                <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">PDF</p>
                                <button
                                    onClick={() => { handlePreview(); setShowActionsMenu(false); }}
                                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                                >
                                    <Eye className="w-4 h-4 mr-3 text-gray-400" />
                                    Aperçu PDF
                                </button>

                                <button
                                    onClick={() => { handleDownloadPDF(formData.status === 'accepted'); setShowActionsMenu(false); }}
                                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                                >
                                    <Download className="w-4 h-4 mr-3 text-gray-400" />
                                    Télécharger {formData.status === 'accepted' ? 'Facture' : 'Devis'}
                                </button>

                                {['grouped', 'poste_global'].includes(formData.client_display_mode || 'detailed') && (
                                    <button
                                        onClick={() => { handleDownloadPDF(false, { detailed: true }); setShowActionsMenu(false); }}
                                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                                        title="Le même document ligne à ligne, pour vous. La présentation du client reste inchangée."
                                    >
                                        <Lock className="w-4 h-4 mr-3 text-amber-600" />
                                        Ma copie détaillée
                                    </button>
                                )}

                                {renderDocumentActions(() => setShowActionsMenu(false))}

                                {id && id !== 'new' && !formData.invoice_number && (
                                    <>
                                        <div className="border-t border-gray-100 dark:border-gray-800 my-1"></div>
                                        <button
                                            onClick={handleDelete}
                                            className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                        >
                                            <Trash2 className="w-4 h-4 mr-3" />
                                            Supprimer
                                        </button>
                                    </>
                                )}

                                <div className="border-t border-gray-100 dark:border-gray-800 my-1"></div>

                                {['accepted', 'paid', 'billed'].includes(formData.status) && (
                                    <button
                                        onClick={() => { setReviewNavigateOnClose(false); setShowReviewRequestModal(true); setShowActionsMenu(false); }}
                                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                                    >
                                        <Star className="w-4 h-4 mr-3 text-yellow-500" />
                                        Demander un avis
                                    </button>
                                )}
                                {/* ReviewMenu removed as component is missing */}

                                <button
                                    onClick={() => { fileInputRef.current?.click(); setShowActionsMenu(false); }}
                                    disabled={importing}
                                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                                >
                                    {importing ? <Loader2 className="w-4 h-4 mr-3 animate-spin" /> : <Upload className="w-4 h-4 mr-3 text-gray-400" />}
                                    Importer (PDF / Word / CSV)
                                </button>

                                {/* Devis signé/facturé : ses lignes ne bougent plus (même règle
                                    que la saisie manuelle) */}
                                {!isLocked && (
                                    <button
                                        onClick={() => { openCsvPasteModal(); setShowActionsMenu(false); }}
                                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                                    >
                                        <ClipboardPaste className="w-4 h-4 mr-3 text-blue-600" />
                                        Coller un tableau (Excel / CSV)
                                    </button>
                                )}

                                <button
                                    onClick={() => { document.getElementById('external-pdf-input')?.click(); setShowActionsMenu(false); }}
                                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
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
                        accept="application/pdf, .docx, application/vnd.openxmlformats-officedocument.wordprocessingml.document, .csv, text/csv"
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
                    className={`relative mb-6 rounded-2xl border-2 border-dashed transition-colors cursor-pointer
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
                            <p className="font-semibold text-gray-700 dark:text-gray-300 dark:text-gray-200">
                                {importing ? 'Traitement en cours…' : 'Importer un devis existant (PDF, Word ou CSV)'}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                Déposez le fichier ici, <span className="text-blue-600 underline">parcourez</span>, ou{' '}
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); openCsvPasteModal(); }}
                                    className="text-blue-600 underline"
                                >
                                    collez un tableau
                                </button>
                            </p>
                            {!dismissedHelps.csv_format && (
                                <>
                                    <span className="mt-1 inline-flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setShowCsvFormatHelp(prev => !prev); }}
                                            aria-expanded={showCsvFormatHelp}
                                            className={`inline-flex items-center gap-1 text-xs transition-colors ${showCsvFormatHelp ? 'text-ios' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}
                                        >
                                            <HelpCircle className="w-3.5 h-3.5" />
                                            Format CSV attendu
                                        </button>
                                        {showCsvFormatHelp && (
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); dismissHelp('csv_format'); }}
                                                aria-label="Ne plus afficher cette aide"
                                                title="J'ai compris — ne plus afficher cette aide"
                                                className="p-0.5 rounded-full text-gray-300 hover:text-red-500 transition-colors"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        )}
                                    </span>
                                    {showCsvFormatHelp && (
                                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                            CSV (export Excel) : colonnes <strong>Description</strong>, Quantité, Unité, Prix — et en option Type, Lot/Section, Prix d'achat, Option, Référence/Note interne (privée), Réserve et Notes/Conditions (repris dans les notes du devis)
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* External PDF Mode / Manual Totals */}
            {formData.is_external ? (
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 mb-8">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
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
                        <div className="mb-8 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-900 dark:bg-gray-800">
                            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 dark:text-gray-300">
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
                                    className="inline-flex items-center px-4 py-2 bg-ios text-white text-sm font-medium rounded-lg hover:bg-ios-dark transition-colors"
                                >
                                    <ExternalLink className="w-4 h-4 mr-2" />
                                    Ouvrir le PDF
                                </a>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-gray-50 dark:bg-gray-800 p-6 rounded-2xl">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Total HT</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="0.01"
                                    className="block w-full pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-ios focus:border-ios dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                                    value={formData.manual_total_ht}
                                    onChange={(e) => setFormData(prev => ({ ...prev, manual_total_ht: parseFloat(e.target.value) || 0 }))}
                                />
                                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                    <span className="text-gray-500 dark:text-gray-400 sm:text-sm">€</span>
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Total TVA</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="0.01"
                                    className="block w-full pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-ios focus:border-ios dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                                    value={formData.manual_total_tva}
                                    onChange={(e) => setFormData(prev => ({ ...prev, manual_total_tva: parseFloat(e.target.value) || 0 }))}
                                />
                                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                    <span className="text-gray-500 dark:text-gray-400 sm:text-sm">€</span>
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Total TTC</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="0.01"
                                    className="block w-full pl-3 pr-8 py-2 border border-blue-300 dark:border-blue-800 rounded-lg focus:ring-ios focus:border-ios bg-blue-50 dark:bg-blue-900/20 font-bold text-blue-900 dark:text-blue-100"
                                    value={formData.manual_total_ttc}
                                    onChange={(e) => setFormData(prev => ({ ...prev, manual_total_ttc: parseFloat(e.target.value) || 0 }))}
                                />
                                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                    <span className="text-gray-500 dark:text-gray-400 sm:text-sm">€</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 italic">
                        * Saisissez les montants manuellement car ils ne sont pas calculés automatiquement depuis le PDF.
                    </p>
                </div>
            ) : null}

            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-8 space-y-8">
                {/* En-tête Devis */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Client</label>
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

                        <Field
                            className="mb-1"
                            label="Titre du devis"
                            hint="Nom court du projet : il sert aussi de nom de dossier et d'intitulé dans les emails au client."
                        >
                            <Input
                                type="text"
                                className="disabled:bg-gray-100 disabled:text-gray-500"
                                placeholder="Ex: Rénovation Salle de Bain"
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                disabled={isLocked}
                            />
                        </Field>

                        {showWorkObject && (
                            <Field
                                className="mb-1 mt-3"
                                label="Objet des travaux (facultatif)"
                                hint={workObjectLength(formData.work_object) <= WORK_OBJECT_MAX_CHARS
                                    ? `Le périmètre en quelques phrases : ce qui est compris, ce qui ne l'est pas, les constats qui fixent le prix. ${workObjectLength(formData.work_object)}/${WORK_OBJECT_MAX_CHARS} caractères.`
                                    : undefined}
                                error={workObjectLength(formData.work_object) > WORK_OBJECT_MAX_CHARS
                                    ? `${workObjectLength(formData.work_object)}/${WORK_OBJECT_MAX_CHARS} caractères : le texte sera tronqué sur le devis pour ne pas repousser le tableau des prestations.`
                                    : undefined}
                            >
                                <Input
                                    as="textarea"
                                    rows={3}
                                    className="disabled:bg-gray-100 disabled:text-gray-500"
                                    placeholder="Ex : Fourniture et pose d'un interphone vidéo au portail piéton, avec report d'appel sur deux moniteurs. Comprend la liaison enterrée et le circuit d'alimentation dédié. Cheminement entre les deux postes constaté inférieur à 30 m."
                                    value={formData.work_object}
                                    onChange={(e) => {
                                        setFormData({ ...formData, work_object: e.target.value });
                                        // Déplie le champ au fil de la saisie pour tout afficher.
                                        autoGrow(e.target);
                                    }}
                                    onFocus={(e) => autoGrow(e.target)}
                                    disabled={isLocked}
                                />
                            </Field>
                        )}

                        {canHaveWorkObject && !showWorkObject && !isLocked && (
                            <button
                                type="button"
                                onClick={() => setWorkObjectOpen(true)}
                                className="mt-2 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                            >
                                + Décrire l'objet des travaux
                            </button>
                        )}


                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Date d'émission">
                            <Input
                                type="date"
                                className="disabled:bg-gray-100 disabled:text-gray-500"
                                value={formData.date}
                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                disabled={isLocked}
                            />
                        </Field>
                        {formData.type !== 'invoice' && !isCreditNote && (
                            <Field label="Validité jusqu'au">
                                <Input
                                    type="date"
                                    className="disabled:bg-gray-100 disabled:text-gray-500"
                                    value={formData.valid_until}
                                    onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                                    disabled={isLocked}
                                />
                            </Field>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Statut</label>
                        {/* Pipeline visuel cliquable */}
                        {(() => {
                            const pipeline = isCreditNote
                                ? [{ key: 'billed', label: 'Émis' }, { key: 'paid', label: 'Remboursé / imputé' }]
                                : formData.type === 'invoice'
                                    ? [{ key: 'accepted', label: 'Émise' }, { key: 'billed', label: 'Facturée' }, { key: 'paid', label: 'Payée' }]
                                    : [{ key: 'draft', label: 'Brouillon' }, { key: 'sent', label: 'Envoyé' }, { key: 'accepted', label: 'Accepté' }, { key: 'billed', label: 'Facturé' }, { key: 'paid', label: 'Payé' }];
                            const currentIdx = pipeline.findIndex(s => s.key === formData.status);
                            return (
                                <div className="flex items-center mb-2">
                                    {pipeline.map((step, idx) => (
                                        <React.Fragment key={step.key}>
                                            <button
                                                type="button"
                                                onClick={() => setFormData(p => ({ ...p, status: step.key }))}
                                                className={`text-[10px] font-semibold px-2 py-1 rounded whitespace-nowrap transition-colors ${
                                                    idx === currentIdx ? 'animate-shimmer-step text-white' :
                                                    currentIdx >= 0 && idx < currentIdx ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200' :
                                                    'bg-gray-100 dark:bg-gray-800 text-gray-400 hover:bg-gray-200'
                                                }`}
                                            >
                                                {step.label}
                                            </button>
                                            {idx < pipeline.length - 1 && (
                                                <div className={`h-px flex-1 mx-0.5 min-w-[4px] ${currentIdx >= 0 && idx < currentIdx ? 'bg-blue-300' : 'bg-gray-200'}`} />
                                            )}
                                        </React.Fragment>
                                    ))}
                                </div>
                            );
                        })()}
                        {/* Statuts d'exception (hors flux normal) — repliés derrière un
                            dropdown ; le bloc reste ouvert si un statut particulier est actif. */}
                        {(() => {
                            const specialStatuses = [
                                { key: 'refused', label: 'Refusé', activeColor: 'bg-red-100 text-red-700 dark:text-red-400 border-red-300' },
                                { key: 'postponed', label: 'Reporté', activeColor: 'bg-amber-100 text-amber-700 dark:text-amber-400 border-amber-300' },
                                { key: 'cancelled', label: 'Annulé', activeColor: 'bg-gray-200 text-gray-700 dark:text-gray-300 border-gray-400' },
                            ];
                            const activeSpecial = specialStatuses.find(opt => opt.key === formData.status);
                            const open = showSpecialStatuses || !!activeSpecial;
                            return (
                                <div className="mt-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowSpecialStatuses(prev => !prev)}
                                        aria-expanded={open}
                                        disabled={!!activeSpecial}
                                        className="flex items-center gap-1 text-[10px] text-gray-400 uppercase tracking-wider hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:hover:text-gray-400"
                                    >
                                        Cas particuliers
                                        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
                                    </button>
                                    {open && (
                                        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                                            {specialStatuses.map(opt => {
                                                const isActive = formData.status === opt.key;
                                                return (
                                                    <button
                                                        key={opt.key}
                                                        type="button"
                                                        onClick={() => setFormData(p => ({ ...p, status: isActive ? 'draft' : opt.key }))}
                                                        className={`text-[10px] font-semibold px-2 py-0.5 rounded border whitespace-nowrap transition-colors ${
                                                            isActive ? opt.activeColor : 'bg-white dark:bg-gray-900 text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                                                        }`}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
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
                        {/* Accusé de réception : visible pour tous les devis envoyés */}
                        {formData.status === 'sent' && id && id !== 'new' && (
                            <button
                                type="button"
                                onClick={() => setShowViewHistory(true)}
                                className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors
                                    border-blue-200 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100"
                            >
                                <Eye className="w-4 h-4" />
                                {viewCount === 0
                                    ? 'Pas encore consulté'
                                    : `Consulté ${viewCount} fois — voir l'historique`}
                            </button>
                        )}
                    </div>
                    {/* Mode de règlement - visible quand statut = Payé */}
                    {formData.status === 'paid' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mode de règlement</label>
                                <select
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-ios focus:border-ios dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
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
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date d'encaissement</label>
                                <input
                                    type="date"
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-ios focus:border-ios dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                                    value={formData.paid_at}
                                    onChange={(e) => setFormData({ ...formData, paid_at: e.target.value })}
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Obligatoire pour le livre de recettes</p>
                            </div>
                        </>
                    )}
                    {/* Options avancées (Factur-X, TVA, OTP) */}
                    <div className="border-t border-gray-100 dark:border-gray-800 pt-3 mt-1">
                        <button
                            type="button"
                            onClick={() => setShowAdvancedQuoteOptions(v => !v)}
                            className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                        >
                            <svg className={`w-3.5 h-3.5 transition-transform ${showAdvancedQuoteOptions ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            Options avancées
                        </button>
                        {showAdvancedQuoteOptions && (
                            <div className="mt-3 space-y-3">
                                <div>
                                    <div className="flex items-center gap-2 mt-2">
                                        <input
                                            type="checkbox"
                                            id="vat_on_debits"
                                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-ios disabled:opacity-50 dark:border-gray-700 bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500"
                                            checked={formData.vat_on_debits}
                                            onChange={(e) => setFormData({ ...formData, vat_on_debits: e.target.checked })}
                                            disabled={isLocked}
                                        />
                                        <label htmlFor="vat_on_debits" className="text-sm text-gray-700 dark:text-gray-300">
                                            Option TVA sur les débits
                                        </label>
                                    </div>
                                    <div className="mt-2">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id="require_otp"
                                                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-ios disabled:opacity-50 dark:border-gray-700 bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500"
                                                checked={formData.require_otp}
                                                onChange={(e) => setFormData({ ...formData, require_otp: e.target.checked })}
                                                disabled={isLocked}
                                            />
                                            <label htmlFor="require_otp" className="text-sm text-gray-700 dark:text-gray-300">
                                                Exiger la vérification par email (OTP) pour signer
                                            </label>
                                        </div>
                                        {total >= 5000 && !formData.require_otp && (
                                            <div className="mt-2 ml-6 flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-lg text-xs text-amber-800 dark:text-amber-400">
                                                <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                                                <div>
                                                    <span className="font-semibold">Recommandé pour ce montant.</span>{' '}
                                                    Au-delà de 5 000 €, activer l'OTP renforce la valeur juridique de la signature
                                                    en cas de contestation (identification du signataire par email).
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Intervention Address Toggle - Full Width */}
                    <div className="md:col-span-2 border-t border-gray-100 dark:border-gray-800 pt-4 mt-2">
                        <div className="flex items-center mb-2">
                            <input
                                type="checkbox"
                                id="diffAddress"
                                checked={diffAddress}
                                onChange={(e) => setDiffAddress(e.target.checked)}
                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-ios disabled:opacity-50 dark:border-gray-700 bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500"
                                disabled={isLocked}
                            />
                            <label htmlFor="diffAddress" className="ml-2 text-sm text-gray-700 dark:text-gray-300 font-medium">
                                Adresse d'intervention différente (ex: locataire, chantier secondaire)
                            </label>
                        </div>

                        {diffAddress && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-800 dark:border-gray-700 mt-2">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Adresse du chantier
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.intervention_address}
                                        onChange={(e) => setFormData({ ...formData, intervention_address: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-ios focus:border-ios disabled:bg-gray-100 disabled:text-gray-500 placeholder-gray-400 dark:placeholder-gray-500"
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
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-ios focus:border-ios disabled:bg-gray-100 disabled:text-gray-500 placeholder-gray-400 dark:placeholder-gray-500"
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
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-ios focus:border-ios disabled:bg-gray-100 disabled:text-gray-500 placeholder-gray-400 dark:placeholder-gray-500"
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
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Détails : {tradeConfig.terms.task}s ({tradeConfig.terms.materials})
                    </h3>
                    {/* Présentation client : le devis reste détaillé ici (commandes,
                        chantiers) ; « Groupée » ne change que le PDF et le lien public. */}
                    {!formData.is_external && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-4 -mt-2">
                            <span
                                className="text-xs font-medium text-gray-500 dark:text-gray-400"
                                title="Choisissez ce que le client voit sur le PDF et le lien public. Votre devis reste détaillé ici, pour vos commandes et vos chantiers."
                            >
                                Présentation pour le client (PDF & lien) :
                            </span>
                            <SegmentedControl
                                options={[
                                    { id: 'detailed', label: 'Détaillée' },
                                    { id: 'grouped', label: 'Groupée (fournitures par poste)' },
                                    { id: 'poste_global', label: 'Poste global (1 ligne / section)' },
                                ]}
                                value={formData.client_display_mode || 'detailed'}
                                onChange={(mode) => { if (!isLocked) setFormData(prev => ({ ...prev, client_display_mode: mode })); }}
                            />
                            {['grouped', 'poste_global'].includes(formData.client_display_mode || 'detailed') && !dismissedHelps.grouped_mode && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => setShowGroupedModeHelp(prev => !prev)}
                                        aria-expanded={showGroupedModeHelp}
                                        aria-label="Aide sur la présentation client"
                                        title="Comment fonctionne cette présentation ?"
                                        className={`p-0.5 rounded-full transition-colors ${showGroupedModeHelp ? 'text-ios' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                                    >
                                        <HelpCircle className="w-4 h-4" />
                                    </button>
                                    {showGroupedModeHelp && (
                                        <button
                                            type="button"
                                            onClick={() => dismissHelp('grouped_mode')}
                                            aria-label="Ne plus afficher cette aide"
                                            title="J'ai compris — ne plus afficher cette aide"
                                            className="p-0.5 rounded-full text-gray-300 hover:text-red-500 transition-colors"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    )}
                                    {showGroupedModeHelp && (formData.client_display_mode === 'poste_global' ? (
                                        <span className="text-xs text-gray-400 w-full">
                                            Chaque section (Lot) est réduite à <strong>un poste fournitures</strong> (libellé + un seul total) et <strong>une ligne main d'œuvre</strong>.
                                            Les éléments vendus à l'unité (prises, spots, points lumineux) restent quantifiés — cochez « à l'unité » sur la ligne pour l'ajuster. Les options restent listées séparément.
                                            La fusion et le total sont calculés <strong>côté serveur</strong> : aucun composant, quantité, prix d'achat ni référence ne part chez le client. Votre détail reste intact ici 🔒.
                                        </span>
                                    ) : (
                                        <span className="text-xs text-gray-400 w-full">
                                            Chaque ligne fourniture s'affiche avec sa désignation et <strong>un seul montant</strong> — sans quantités ni prix unitaires.
                                            Rédigez la désignation pour qu'elle décrive le contenu : « Tableau 4 rangées précâblé comprenant parafoudre, 4 inter diff et 25 disjoncteurs », « 12 spots LED encastrés »…
                                            La main d'œuvre reste détaillée, et le détail exact (réfs, quantités) garde sa place dans le chiffrage interne 🔒.
                                        </span>
                                    ))}
                                </>
                            )}
                            {/* Copie interne : le devis ligne à ligne, pour soi. Reste
                                proposée une fois le devis verrouillé (accepté, facturé,
                                payé) — c'est justement là qu'on en a besoin pour
                                commander et suivre le chantier. */}
                            {['grouped', 'poste_global'].includes(formData.client_display_mode || 'detailed') && (
                                <button
                                    type="button"
                                    onClick={() => handleDownloadPDF(false, { detailed: true })}
                                    title="Télécharge le même document en version ligne à ligne, pour vous (commandes, chantier). La présentation du client n'est pas modifiée."
                                    className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 rounded-full px-2.5 py-1 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    Ma copie détaillée
                                </button>
                            )}
                        </div>
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
                            <React.Fragment key={item.id}>
                            {item.type === 'section' ? (
                                <div key={item.id} className="flex items-center gap-2 pt-2 pb-1 border-b-2 border-blue-200">
                                    <Layers className="w-4 h-4 text-blue-500 shrink-0" />
                                    <input
                                        type="text"
                                        placeholder="Titre de la section (ex: Création prise de terre)"
                                        className="flex-1 px-3 py-1.5 text-sm font-semibold border-0 border-b border-blue-300 focus:outline-none focus:border-ios bg-transparent text-blue-700 dark:text-blue-300 placeholder-blue-300"
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
                            <div key={item.id} className={`flex flex-col lg:flex-row gap-4 items-start border-b pb-4 last:border-0 ${item.is_optional ? 'border-purple-100 border-l-2 border-l-purple-300 pl-2 -ml-2' : 'border-gray-100 dark:border-gray-800'}`}>
                                <div className="flex-1 w-full space-y-2">
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <select
                                            className="w-full sm:w-32 px-2 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 dark:bg-gray-800 disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 placeholder-gray-400 dark:placeholder-gray-500 text-gray-900 dark:text-gray-100"
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
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg pr-8 resize-y text-sm dark:border-gray-700 bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 text-gray-900 dark:text-gray-100"
                                                value={item.description}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    // Auto-agrandit le champ pour afficher toute la
                                                    // description sans scroll interne pendant la saisie.
                                                    autoGrow(e.target);
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
                                                        applyLibraryItem(item.id, libraryItem);
                                                    }
                                                }}
                                                onFocus={(e) => {
                                                    if (window.innerWidth < 1024) {
                                                        e.target.blur();
                                                        setFullScreenEditItem(item.id);
                                                    } else {
                                                        // Au clic, déplie le champ pour montrer toute la
                                                        // ligne d'un coup (plus de scroll interne).
                                                        autoGrow(e.target);
                                                        setFocusedInput(`item-${item.id}`);
                                                    }
                                                }}
                                                onBlur={(e) => {
                                                    // Revient à la hauteur compacte (2 lignes) une fois
                                                    // la ligne désélectionnée pour garder la liste lisible.
                                                    e.target.style.height = '';
                                                    setTimeout(() => setFocusedInput(null), 200);
                                                }}
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
                                                        <div className="absolute z-20 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-lg rounded-b-lg mt-1 overflow-hidden">
                                                            {matches.map(lib => (
                                                                <button
                                                                    key={lib.id}
                                                                    type="button"
                                                                    className="block w-full text-left px-4 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-sm border-b border-gray-50 last:border-0"
                                                                    onClick={() => applyLibraryItem(item.id, lib, { withDescription: true })}
                                                                >
                                                                    <span className="font-medium text-gray-900 dark:text-white">{lib.description}</span>
                                                                    <span className="text-gray-500 dark:text-gray-400 ml-2 text-xs">{lib.price} €</span>
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
                                    {item.is_optional && (
                                        <div className="flex flex-wrap items-center gap-2 mt-1">
                                            <input
                                                type="text"
                                                placeholder="Groupe d'exclusivité (ex: Revêtement)"
                                                className="px-2 py-1 border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/20 rounded text-xs w-56 text-gray-900 dark:text-purple-100 placeholder-purple-400 dark:placeholder-purple-500 focus:ring-purple-400 focus:border-purple-400"
                                                value={item.option_group || ''}
                                                onChange={(e) => updateItem(item.id, 'option_group', e.target.value)}
                                                disabled={isLocked}
                                                title="Les options partageant le même nom de groupe deviennent mutuellement exclusives côté client (un seul choix possible)."
                                            />
                                            {item.option_group && (
                                                <label className="flex items-center gap-1.5 text-xs text-purple-700 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!item.option_group_required}
                                                        onChange={(e) => setOptionGroupRequired(item.option_group, e.target.checked)}
                                                        disabled={isLocked}
                                                        className="w-3.5 h-3.5 accent-purple-600"
                                                    />
                                                    Choix nécessaire
                                                </label>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-2 w-full lg:w-auto">
                                    <div className="w-20 relative">
                                        <input
                                            type="number"
                                            placeholder="Qté"
                                            step="0.01"
                                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-ios focus:border-ios text-right pr-2 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                                            value={item.quantity}
                                            onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                                            disabled={isLocked}
                                        />
                                    </div>
                                    <div className="w-28">
                                        <input
                                            type="number"
                                            placeholder="Prix U."
                                            step="0.01"
                                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-ios focus:border-ios text-right dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                                            value={item.price}
                                            onChange={(e) => updateItem(item.id, 'price', e.target.value)}
                                            disabled={isLocked}
                                        />
                                    </div>
                                    <div className="w-28 py-2 text-right font-medium text-gray-900 dark:text-white">
                                        {((parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0)).toFixed(2)} €
                                    </div>
                                    {/* Indicateurs discrets : option, chiffrage interne renseigné */}
                                    {item.is_optional && (
                                        <span className="self-center text-[10px] px-1.5 py-0.5 rounded border font-semibold bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800" title="Ligne optionnelle (le client choisit)">
                                            OPT
                                        </span>
                                    )}
                                    {(lineComponents(item).length > 0 || (item.internal_note || '').trim()) && (
                                        <button
                                            type="button"
                                            onClick={() => setInternalDetailItemId(prev => prev === item.id ? null : item.id)}
                                            className={`relative self-center flex items-center justify-center px-1.5 py-1 rounded border transition-colors ${
                                                internalDetailItemId === item.id
                                                    ? 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700'
                                                    : 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800'
                                            }`}
                                            title="Chiffrage interne : fournitures et note privées de cette ligne (jamais visibles par le client)"
                                        >
                                            <Lock className="w-3.5 h-3.5" />
                                            {lineComponents(item).length > 0 && (
                                                <span className="absolute -top-1.5 -right-1.5 min-w-[1rem] h-4 px-0.5 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
                                                    {lineComponents(item).length}
                                                </span>
                                            )}
                                        </button>
                                    )}
                                    {/* Menu « ⋯ » : tout ce qui n'est pas quotidien (déplacer,
                                        option, affichage, calculatrice, chiffrage interne). */}
                                    <div className="relative self-center">
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setLineMenuId(prev => prev === item.id ? null : item.id); }}
                                            className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                                            title="Plus d'options pour cette ligne"
                                            aria-haspopup="menu"
                                            aria-expanded={lineMenuId === item.id}
                                        >
                                            <MoreHorizontal className="w-5 h-5" />
                                        </button>
                                        {lineMenuId === item.id && (
                                            <div
                                                className="absolute right-0 top-full mt-1 z-30 w-64 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1"
                                                role="menu"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <LineMenuItem icon={ArrowUp} label="Monter" disabled={index === 0 || isLocked}
                                                    onClick={() => { moveItem(index, 'up'); setLineMenuId(null); }} />
                                                <LineMenuItem icon={ArrowDown} label="Descendre" disabled={index === formData.items.length - 1 || isLocked}
                                                    onClick={() => { moveItem(index, 'down'); setLineMenuId(null); }} />
                                                <LineMenuItem icon={Star} label="Ligne optionnelle (au choix du client)" disabled={isLocked} active={!!item.is_optional}
                                                    onClick={() => { updateItem(item.id, 'is_optional', !item.is_optional); setLineMenuId(null); }} />
                                                {formData.client_display_mode === 'poste_global' && item.type === 'material' && (
                                                    <LineMenuItem icon={Eye} label="Afficher à l'unité (quantité visible)" disabled={isLocked}
                                                        active={isPerUnit(item, sectionTitleByIndex[index])}
                                                        onClick={() => { updateItem(item.id, 'display_per_unit', !isPerUnit(item, sectionTitleByIndex[index])); setLineMenuId(null); }} />
                                                )}
                                                {userProfile?.enable_calculator !== false && (
                                                    <LineMenuItem icon={Calculator} label="Calculatrice matériaux" disabled={isLocked}
                                                        onClick={() => { setActiveCalculatorItem(item.id); setShowCalculator(true); setLineMenuId(null); }} />
                                                )}
                                                <LineMenuItem icon={Lock} label="Chiffrage interne (privé)" active={internalDetailItemId === item.id}
                                                    onClick={() => { setInternalDetailItemId(prev => prev === item.id ? null : item.id); setLineMenuId(null); }} />
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => removeItem(item.id)}
                                        className="self-center p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30"
                                        disabled={isLocked}
                                        title="Supprimer la ligne"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                            )}
                            {item.type !== 'section' && internalDetailItemId === item.id && (
                                <LineInternalDetail
                                    item={item}
                                    onChange={(field, value) => updateItem(item.id, field, value)}
                                    disabled={isLocked}
                                />
                            )}
                            {/* Zone d'insertion entre lignes */}
                            {!isLocked && index < formData.items.length - 1 && (
                                <div className="group relative flex items-center my-1 -mx-1">
                                    <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800 group-hover:bg-blue-200 transition-colors" />
                                    <button
                                        type="button"
                                        onClick={() => insertItemAfter(index)}
                                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity mx-2 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 bg-white dark:bg-gray-900 border border-blue-200 hover:border-blue-400 rounded px-2 py-0.5 shadow-sm"
                                        title="Insérer une ligne ici"
                                    >
                                        <Plus className="w-3 h-3" /> Insérer ici
                                    </button>
                                    <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800 group-hover:bg-blue-200 transition-colors" />
                                </div>
                            )}
                            </React.Fragment>
                        ))}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                        <button
                            onClick={() => addItem('service')}
                            className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-100 transition-colors disabled:opacity-50"
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
                            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors disabled:opacity-50"
                            disabled={isLocked}
                            title="Ajoute un titre de groupe pour organiser vos lignes (ex: Cuisine, Salle de bain, Extérieur). Facultatif."
                        >
                            <Layers className="w-4 h-4" />
                            Section
                        </button>

                        {/* Avenant : reprendre en négatif des prestations du devis initial
                            non réalisées, sans les ressaisir à la main. */}
                        {formData.type === 'amendment' && (
                            <button
                                type="button"
                                onClick={() => setShowDeductionModal(true)}
                                className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1.5 rounded-lg border border-red-100 dark:border-red-900/40 transition-colors disabled:opacity-50"
                                disabled={isLocked || !formData.parent_quote_data?.items?.length}
                                title={formData.parent_quote_data?.items?.length
                                    ? "Sélectionnez les prestations du devis initial qui ne seront pas réalisées : elles sont reprises en négatif sur l'avenant."
                                    : "Le devis initial n'est pas chargé ou ne contient aucune ligne."}
                            >
                                <MinusCircle className="w-4 h-4" />
                                Déduire du devis initial
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={() => openCsvPasteModal()}
                            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors disabled:opacity-50"
                            disabled={isLocked}
                            title="Collez directement vos cellules copiées depuis Excel ou un CSV — aucun fichier à enregistrer sur l'ordinateur."
                        >
                            <ClipboardPaste className="w-4 h-4" />
                            Coller un tableau
                        </button>

                        {supplyEntries(formData.items).length > 0 && (
                            <button
                                type="button"
                                onClick={() => setShowSupplyModal(true)}
                                className="flex items-center gap-1.5 text-sm font-medium text-green-700 hover:text-green-900 hover:bg-green-50 dark:hover:bg-green-900/20 px-3 py-1.5 rounded-lg border border-green-200 transition-colors"
                                title="Envoie les fournitures du devis (lignes Matériel + chiffrage interne) vers votre liste d'achats, pour passer commande sans chercher dans vos notes."
                            >
                                <ShoppingCart className="w-4 h-4" />
                                Commander le matériel
                            </button>
                        )}

                        {supplyEntries(formData.items).length > 0 && (
                            <button
                                type="button"
                                onClick={() => setShowSupplierListModal(true)}
                                className="flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-900 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors"
                                title="Affiche le matériel du devis sans les prix facturés, à copier ou télécharger pour l'envoyer à votre fournisseur."
                            >
                                <Truck className="w-4 h-4" />
                                Liste fournisseur
                            </button>
                        )}

                        <button
                            onClick={() => setShowAIModal(true)}
                            className="flex items-center gap-1.5 text-sm font-medium text-purple-600 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg border border-purple-100 shadow-sm transition-all disabled:opacity-50 ml-auto"
                            disabled={isLocked}
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            Générer avec l'IA
                        </button>

                        {!dismissedHelps.item_types && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setShowItemTypesHelp(prev => !prev)}
                                    aria-expanded={showItemTypesHelp}
                                    aria-label="Aide sur les types de lignes"
                                    title="Main d'œuvre, Matériel, Section, HT… c'est quoi ?"
                                    className={`self-center p-1 rounded-full transition-colors ${showItemTypesHelp ? 'text-ios' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                                >
                                    <HelpCircle className="w-4 h-4" />
                                </button>
                                {showItemTypesHelp && (
                                    <button
                                        type="button"
                                        onClick={() => dismissHelp('item_types')}
                                        aria-label="Ne plus afficher cette aide"
                                        title="J'ai compris — ne plus afficher cette aide"
                                        className="self-center p-0.5 rounded-full text-gray-300 hover:text-red-500 transition-colors"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                )}
                            </>
                        )}
                    </div>

                    {/* Légende pour les débutants — repliée derrière le « ? » ci-dessus */}
                    {showItemTypesHelp && !dismissedHelps.item_types && (
                        <p className="mt-3 text-xs text-gray-400 flex items-start gap-1.5">
                            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                            <span>
                                <strong className="text-gray-500 dark:text-gray-400">Main d'œuvre</strong> = votre temps de travail ·{' '}
                                <strong className="text-gray-500 dark:text-gray-400">Matériel</strong> = fournitures achetées ·{' '}
                                <strong className="text-gray-500 dark:text-gray-400">Section</strong> = titre de regroupement (facultatif) ·{' '}
                                <strong className="text-gray-500 dark:text-gray-400">HT</strong> = hors taxes — la TVA est ajoutée automatiquement en bas ·{' '}
                                <strong className="text-gray-500 dark:text-gray-400">🔒 Chiffrage interne</strong> = le détail privé d'une ligne groupée (fournitures, note) — jamais montré au client
                            </span>
                        </p>
                    )}
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
                <div className="flex justify-end pt-6 border-t border-gray-100 dark:border-gray-800">
                    <div className="w-72 space-y-4">
                        {/* MarginGauge removed here as it was used with incorrect props causing crash */}

                        <div className="space-y-3">
                            <div className="flex items-center justify-end mb-4">
                                <input
                                    type="checkbox"
                                    id="include_tva"
                                    className="h-4 w-4 text-blue-600 focus:ring-ios border-gray-300 rounded dark:border-gray-700 bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500"
                                    checked={formData.include_tva}
                                    onChange={(e) => setFormData({ ...formData, include_tva: e.target.checked })}
                                    disabled={isLocked}
                                />
                                <label htmlFor="include_tva" className="ml-2 block text-sm text-gray-900 dark:text-white">
                                    Appliquer la TVA (20%)
                                </label>
                            </div>
                            <div className="flex items-center justify-end mb-4">
                                <input
                                    type="checkbox"
                                    id="has_material_deposit"
                                    className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded dark:border-gray-700 bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500"
                                    checked={formData.has_material_deposit}
                                    onChange={(e) => setFormData({ ...formData, has_material_deposit: e.target.checked })}
                                    disabled={isLocked}
                                />
                                <label htmlFor="has_material_deposit" className="ml-2 block text-sm text-gray-900 dark:text-white">
                                    Demander un acompte matériel
                                </label>
                                {!dismissedHelps.material_deposit && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setShowMaterialDepositHelp(prev => !prev)}
                                            aria-expanded={showMaterialDepositHelp}
                                            aria-label="Aide sur l'acompte matériel"
                                            title="À quoi sert l'acompte matériel ?"
                                            className={`ml-1.5 p-0.5 rounded-full transition-colors ${showMaterialDepositHelp ? 'text-ios' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                                        >
                                            <HelpCircle className="w-4 h-4" />
                                        </button>
                                        {showMaterialDepositHelp && (
                                            <button
                                                type="button"
                                                onClick={() => dismissHelp('material_deposit')}
                                                aria-label="Ne plus afficher cette aide"
                                                title="J'ai compris — ne plus afficher cette aide"
                                                className="p-0.5 rounded-full text-gray-300 hover:text-red-500 transition-colors"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                            {showMaterialDepositHelp && !dismissedHelps.material_deposit && (
                                <p className="text-xs text-gray-400 -mt-3 mb-4 text-right">
                                    Ajoute au PDF une mention demandant, à la signature, un acompte couvrant la totalité du matériel du devis.
                                    Le client finance les fournitures avant la commande : vous n'avancez pas leur coût.
                                </p>
                            )}
                            <div className="flex items-center justify-end gap-2 mb-4">
                                <label htmlFor="deposit_percentage" className="block text-sm text-gray-900 dark:text-white">
                                    Acompte à la signature
                                </label>
                                <div className="relative w-20">
                                    <input
                                        type="number"
                                        id="deposit_percentage"
                                        min="0"
                                        max="100"
                                        step="1"
                                        className="h-8 w-full text-right pr-6 text-sm rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                                        value={formData.deposit_percentage || ''}
                                        placeholder="0"
                                        onChange={(e) => {
                                            const v = e.target.value === '' ? 0 : Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                                            setFormData({ ...formData, deposit_percentage: v });
                                        }}
                                        disabled={isLocked}
                                    />
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">%</span>
                                </div>
                            </div>
                            <div className="flex justify-between text-gray-600 dark:text-gray-400">
                                <span>Total HT</span>
                                <span>{subtotal.toFixed(2)} €</span>
                            </div>
                            {formData.include_tva && (
                                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                                    <span>TVA (20%)</span>
                                    <span>{tva.toFixed(2)} €</span>
                                </div>
                            )}
                            {!formData.include_tva && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 text-right italic">
                                    TVA non applicable, art. 293 B du CGI
                                </div>
                            )}
                            {/* Marge — nette (main d'œuvre incluse) si le coût horaire
                                est renseigné, sinon marge matière. Invite contextuelle
                                pour renseigner le coût horaire quand il manque. */}
                            {(() => {
                                const laborRate = parseFloat(userProfile?.labor_cost_rate) || 0;
                                const m = quoteMargin(formData.items, subtotal, laborRate);
                                const laborHours = estimatedHoursFromItems(formData.items);
                                const showPrompt = laborHours > 0 && laborRate <= 0;

                                return (
                                    <>
                                        {showPrompt && (
                                            <div className="flex items-start gap-2 pt-2 border-t border-dashed border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400">
                                                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-blue-500" />
                                                <span>
                                                    {laborHours}h de main d'œuvre non déduites.{' '}
                                                    <button
                                                        type="button"
                                                        onClick={() => navigate('/app/accounting?tab=conseils')}
                                                        className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                                                    >
                                                        Calculer mon coût horaire
                                                    </button>{' '}
                                                    pour voir votre marge nette.
                                                </span>
                                            </div>
                                        )}
                                        {m.cost > 0 && subtotal > 0 && (() => {
                                            const pct = Math.round(m.margin * 100);
                                            const color = m.margin >= 0.35 ? 'text-green-600' : m.margin >= 0.20 ? 'text-orange-500' : 'text-red-500';
                                            const tip = m.hasLabor
                                                ? `Matière : ${m.materialCost.toFixed(2)} € · Main d'œuvre : ${m.laborHours}h × ${laborRate.toFixed(2)}€ = ${m.laborCost.toFixed(2)} €`
                                                : `Coût matière : ${m.materialCost.toFixed(2)} €`;
                                            return (
                                                <div className="flex justify-between text-sm pt-2 border-t border-dashed border-gray-100 dark:border-gray-800">
                                                    <span className="text-gray-400">{m.hasLabor ? 'Marge nette' : 'Marge matière'}</span>
                                                    <span className={`font-semibold ${color}`} title={tip}>
                                                        {pct} %
                                                    </span>
                                                </div>
                                            );
                                        })()}
                                        {/* Marge RÉALISÉE : recalculée avec les prix d'achat
                                            réels saisis dans « Matériel à commander » et les
                                            heures réellement pointées sur le chantier.
                                            Purement informatif : le devis n'est jamais modifié. */}
                                        {subtotal > 0 && (() => {
                                            // Avenants et factures de situation ne facturent qu'une
                                            // part du chantier : leur attribuer les coûts complets du
                                            // devis parent donnerait une marge réalisée absurde.
                                            const canUseParent = !!formData.parent_quote_id && !isPartialScopeDoc(formData);
                                            const agg = procurementCosts.get(Number(id))
                                                ?? (canUseParent ? procurementCosts.get(Number(formData.parent_quote_id)) : undefined);
                                            const spent = spentHoursMap.get(Number(id))
                                                ?? (canUseParent ? spentHoursMap.get(Number(formData.parent_quote_id)) : 0)
                                                ?? 0;
                                            const r = realizedQuoteMargin(formData.items, subtotal, laborRate, agg, spent);
                                            if (!r) return null;
                                            const pct = Math.round(r.margin * 100);
                                            const color = r.margin >= 0.35 ? 'text-green-600' : r.margin >= 0.20 ? 'text-orange-500' : 'text-red-500';
                                            const deltaPts = Math.round(r.delta * 100);
                                            const sources = [
                                                r.materialIsReal ? `matière réelle ${r.materialCost.toFixed(2)} € (${r.pricedCount}/${r.totalCount} achat${r.totalCount > 1 ? 's' : ''} au prix renseigné)` : null,
                                                r.laborIsReal ? `main d'œuvre pointée ${formatHours(r.spentHours)} × ${laborRate.toFixed(2)} € = ${r.laborCost.toFixed(2)} €` : null,
                                            ].filter(Boolean).join(' · ');
                                            const tip = `D'après le terrain : ${sources}. Marge prévue au devis : ${Math.round(r.plannedMargin * 100)} %.`;
                                            const hoursOver = r.laborIsReal && r.estimatedHours > 0
                                                ? r.spentHours - r.estimatedHours
                                                : 0;
                                            return (
                                                <>
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-gray-400 inline-flex items-center gap-1">
                                                            <ShoppingCart className="w-3.5 h-3.5" />
                                                            Marge réalisée{r.laborIsReal && r.materialIsReal ? '' : r.laborIsReal ? ' (pointage)' : ' (achats)'}
                                                        </span>
                                                        <span className={`font-semibold ${color}`} title={tip}>
                                                            {pct} %
                                                            {deltaPts !== 0 && (
                                                                <span className={`ml-1.5 font-normal text-xs ${deltaPts > 0 ? 'text-green-500' : 'text-red-400'}`}>
                                                                    ({deltaPts > 0 ? '+' : ''}{deltaPts} pt{Math.abs(deltaPts) > 1 ? 's' : ''})
                                                                </span>
                                                            )}
                                                        </span>
                                                    </div>
                                                    {/* Rentabilité main d'œuvre : temps pointé vs heures facturées */}
                                                    {r.spentHours > 0 && r.estimatedHours > 0 && (
                                                        <div className="flex justify-between text-xs text-gray-400">
                                                            <span className="inline-flex items-center gap-1">
                                                                <Clock className="w-3 h-3" />
                                                                Temps pointé
                                                            </span>
                                                            <span title={hoursOver > 0 ? `Dépassement : ${formatHours(hoursOver)} de plus que la main d'œuvre facturée` : 'Dans le temps facturé au devis'}>
                                                                {formatHours(r.spentHours)} / {formatHours(r.estimatedHours)} facturées
                                                                {hoursOver > 0 && (
                                                                    <span className="ml-1 text-red-400 font-medium">(+{formatHours(hoursOver)})</span>
                                                                )}
                                                            </span>
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </>
                                );
                            })()}
                            <div className="flex justify-between text-lg font-bold text-gray-900 dark:text-white pt-3 border-t border-gray-200 dark:border-gray-700">
                                <span>{formData.type === 'amendment' ? "Montant de l'avenant TTC" : 'Total TTC'}</span>
                                <span>{total.toFixed(2)} €</span>
                            </div>
                            {/* Avenant : le total ci-dessus n'est QUE le delta (+/− travaux).
                                Le nouveau total projet est calculé automatiquement (identique au
                                PDF : devis initial — ou situations déjà facturées — + montant de
                                l'avenant). On invite donc à ne PAS saisir de ligne « nouveau total »
                                ni « moins-value totale », qui feraient double emploi. */}
                            {formData.type === 'amendment' && (() => {
                                const initialTTC = parseFloat(formData.parent_quote_data?.total_ttc) || 0;
                                const progressTotal = parseFloat(formData.parent_quote_data?.progress_total) || 0;
                                const depositTotal = parseFloat(formData.parent_quote_data?.deposit_total) || 0;
                                const baseline = progressTotal > 0 ? progressTotal : initialTTC;
                                const amendmentTTC = total; // delta, peut être négatif (moins-value)
                                const newTotal = baseline + amendmentTTC;
                                // Modèle additif (sans situation) : l'acompte déjà versé est une
                                // avance à déduire du nouveau total pour obtenir le reste à régler.
                                const showDeposit = progressTotal === 0 && depositTotal > 0;
                                const remaining = newTotal - depositTotal;
                                return (
                                    <div className="mt-3 space-y-2">
                                        <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                                            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-orange-500" />
                                            <span>
                                                Ne saisissez que les lignes <strong>ajoutées ou retirées</strong> (le delta).
                                                Inutile d'ajouter une ligne « Nouveau total » ou « Moins-value totale » :
                                                le nouveau total du projet est calculé automatiquement ci-dessous.
                                            </span>
                                        </div>
                                        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3 space-y-1.5 text-sm">
                                            <div className="flex justify-between text-gray-600 dark:text-gray-400">
                                                <span>{progressTotal > 0 ? 'Déjà facturé (situations)' : 'Devis initial TTC'}</span>
                                                <span>{baseline.toFixed(2)} €</span>
                                            </div>
                                            <div className="flex justify-between text-gray-600 dark:text-gray-400">
                                                <span>Montant de l'avenant TTC</span>
                                                <span className={amendmentTTC < 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-blue-600 dark:text-blue-400 font-medium'}>
                                                    {amendmentTTC >= 0 ? '+' : ''}{amendmentTTC.toFixed(2)} €
                                                </span>
                                            </div>
                                            <div className={`flex justify-between font-bold text-gray-900 dark:text-white pt-1.5 border-t border-orange-200 dark:border-orange-800 ${showDeposit ? '' : ''}`}>
                                                <span>Nouveau Total Projet</span>
                                                <span>{newTotal.toFixed(2)} €</span>
                                            </div>
                                            {showDeposit && (
                                                <>
                                                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                                                        <span>Acompte déjà versé</span>
                                                        <span className="text-red-600 dark:text-red-400 font-medium">−{depositTotal.toFixed(2)} €</span>
                                                    </div>
                                                    <div className="flex justify-between font-bold text-gray-900 dark:text-white pt-1.5 border-t border-orange-200 dark:border-orange-800">
                                                        <span>Reste à régler</span>
                                                        <span>{remaining.toFixed(2)} €</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>

                {/* Signature Display */}
                {signature && (
                    <div className="border-t border-gray-100 dark:border-gray-800 pt-6 mt-6">
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Signature du client</h4>
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 inline-block">
                            <img src={signature} alt="Signature Client" className="h-24 object-contain" />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                Signé le {new Date(formData.signed_at || formData.updated_at || new Date()).toLocaleDateString()}
                            </p>
                        </div>
                    </div>
                )}

                {/* Notes */}
                <div>
                    <div className="flex justify-between items-center mb-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Notes / Conditions</label>
                        <button
                            type="button"
                            onClick={() => {
                                setVoiceContext('note');
                                setShowSmartVoice(true);
                            }}
                            className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-indigo-500 hover:text-indigo-700 disabled:opacity-50"
                            title="Dicter une note"
                            disabled={isLocked}
                        >
                            <Sparkles className="w-4 h-4" />
                        </button>
                    </div>
                    <Input
                        as="textarea"
                        rows={3}
                        className="disabled:bg-gray-100 disabled:text-gray-500"
                        placeholder="Conditions de paiement, validité du devis..."
                        value={formData.notes}
                        onChange={(e) => {
                            setFormData({ ...formData, notes: e.target.value });
                            // Déplie le champ au fil de la saisie pour tout afficher.
                            autoGrow(e.target);
                        }}
                        onFocus={(e) => {
                            // Au clic, déplie le champ pour avoir une vue complète
                            // des notes/conditions (plus de scroll interne).
                            autoGrow(e.target);
                        }}
                        onBlur={(e) => {
                            // Revient à la hauteur compacte (3 lignes) une fois désélectionné.
                            e.target.style.height = '';
                        }}
                        disabled={isLocked}
                    />
                    {/* Auto-calculate Material Deposit Hint — ligne compacte, phrase complète en infobulle.
                        Même calcul et mêmes conditions que le PDF (materialDeposit.js) : options
                        exclues, case « acompte matériel » cochée — sinon le montant annoncé ici
                        divergerait de la mention réellement imprimée. */}
                    {formData.type !== 'invoice' && formData.has_material_deposit && (() => {
                        const deposit = materialDepositAmounts({
                            items: formData.items,
                            include_tva: formData.include_tva,
                            total_ht: subtotal,
                            total_tva: tva,
                            total_ttc: total,
                        });
                        if (!deposit) return null;
                        const mTTC = deposit.materialTTC;
                        return (
                            <p
                                className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1.5 cursor-help"
                                title={`Mention ajoutée au PDF : "Un acompte correspondant à la totalité du matériel (${mTTC.toFixed(2)} € TTC) est requis à la signature."`}
                            >
                                <Star className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-blue-400" />
                                <span>Mention « Acompte matériel » ({mTTC.toFixed(2)} € TTC à la signature) ajoutée automatiquement au PDF.</span>
                            </p>
                        );
                    })()}
                    {/* Aperçu acompte en % du total (devis sans acompte matériel actif).
                        Même règle d'exclusivité que le PDF : le bloc % ne s'affiche que si
                        le tableau d'acompte matériel n'est pas rendu (fournitures FERMES +
                        case cochée) — les options seules ne comptent pas. */}
                    {formData.type !== 'invoice' && (Number(formData.deposit_percentage) || 0) > 0 &&
                        !(formData.has_material_deposit && materialDepositAmounts({ items: formData.items }) != null) && (() => {
                        const pct = Number(formData.deposit_percentage) || 0;
                        const dep = total * pct / 100;
                        const solde = Math.max(total - dep, 0);
                        return (
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1.5">
                                <Star className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-blue-400" />
                                <span>Mention ajoutée au PDF : acompte à la signature ({pct} %) {dep.toFixed(2)} € TTC — solde à la fin des travaux {solde.toFixed(2)} € TTC.</span>
                            </p>
                        );
                    })()}
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
                        const itemIndex = formData.items.findIndex(i => i.id === item.id);

                        return (
                            <div className="fixed inset-0 z-[100] bg-white dark:bg-gray-900 flex flex-col animate-in slide-in-from-bottom duration-200">
                                {/* --- Items Table --- */}
                                <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 shadow-sm bg-white dark:bg-gray-900 safe-area-top">
                                    <button
                                        onClick={() => setFullScreenEditItem(null)}
                                        className="text-gray-500 dark:text-gray-400 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
                                    >
                                        <ArrowLeft className="w-6 h-6" />
                                    </button>
                                    <h3 className="font-semibold text-lg">Description</h3>
                                    <button
                                        onClick={() => setFullScreenEditItem(null)}
                                        className="text-blue-600 font-medium px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100"
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
                                                            onClick={() => applyLibraryItem(item.id, lib, { withDescription: true })}
                                                            className="flex-shrink-0 bg-white dark:bg-gray-900 border border-blue-200 rounded-lg px-4 py-2 text-left shadow-sm min-w-[200px]"
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
                                <div className="flex-1 p-4 relative bg-white dark:bg-gray-900">
                                    <textarea
                                        className="w-full h-full text-lg resize-none outline-none bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 font-sans leading-relaxed"
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
                <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 px-4 py-3 flex gap-3 safe-area-bottom">
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="flex-1 flex items-center justify-center gap-2 py-3 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-2xl font-semibold text-sm disabled:opacity-50 active:bg-gray-100"
                    >
                        <Save className="w-4 h-4" />
                        {loading ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                    <button
                        type="button"
                        onClick={() => handleSendQuoteEmail('fr')}
                        disabled={loading}
                        className="flex-1 flex items-center justify-center gap-2 py-3 text-white bg-ios rounded-2xl font-semibold text-sm disabled:opacity-50 active:bg-blue-700"
                    >
                        <Send className="w-4 h-4" />
                        Envoyer
                    </button>
                </div>
            )}

            {/* ── Animation de succès après envoi au client ── */}
            {showSendSuccess && (
                <div className="fixed inset-0 z-[300] pointer-events-none">
                    <div className="animate-send-success flex flex-col items-center gap-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl px-10 py-8 border border-gray-100 dark:border-gray-800">
                        <div className="animate-circle-pop w-20 h-20 rounded-full bg-green-50 dark:bg-green-900/20 dark:bg-green-900/30 flex items-center justify-center">
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

            {/* Copilot Artisan : assistant IA avec contexte du devis courant */}
            <CopilotChat
                context={{
                    page: formData.type === 'invoice' ? 'Édition de facture' : 'Édition de devis',
                    today: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
                    facts: [
                        formData.type === 'invoice' ? 'Type : Facture' : 'Type : Devis',
                        formData.title && `Titre : ${formData.title}`,
                        formData.client_name && `Client : ${formData.client_name}`,
                        `Statut : ${formData.status || 'brouillon'}`,
                        `Nombre de lignes : ${(formData.items || []).length}`,
                        `Total HT : ${(subtotal || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}`,
                        formData.include_tva && `Total TTC : ${(total || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}`,
                        formData.valid_until && `Valable jusqu'au : ${new Date(formData.valid_until).toLocaleDateString('fr-FR')}`,
                    ].filter(Boolean),
                }}
                presets={[
                    { label: 'Rédige un email de relance',  prompt: 'Rédige un email de relance court et courtois pour ce devis. Ton professionnel, 4-5 phrases max, pas de relance trop insistante.' },
                    { label: 'Vérifie la cohérence',        prompt: 'À partir des informations de ce devis, vérifie la cohérence des montants et signale tout point qui mériterait que je le revoie avant envoi.' },
                    { label: 'Suggère une remise commerciale', prompt: 'Quelle remise commerciale serait raisonnable sur ce devis pour augmenter mes chances qu\'il soit signé sans trop entamer ma marge ?' },
                ]}
            />
        </div>
    );

};

export default DevisForm;
