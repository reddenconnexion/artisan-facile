import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../utils/supabase';
import {
    FileText, Camera, Download, Phone, Mail, Globe, ClipboardList, Eye,
    X, Loader2, PenLine, CheckCircle, Star, MessageSquare, Send,
    Copy, CreditCard, Smartphone, ChevronDown,
} from 'lucide-react';
import { generateDevisPDF, generateInterventionReportPDF } from '../../utils/pdfGenerator';
import SignatureModal from '../../components/SignatureModal';
import { toast } from 'sonner';

/* ─── Inline PDF Viewer ─── */
const PdfViewerModal = ({ url, title, onClose }) => {
    if (!url) return null;
    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white flex-shrink-0">
                <span className="text-sm font-medium truncate max-w-xs">{title}</span>
                <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex items-center gap-1.5 text-sm">
                    <X className="w-4 h-4" /> Fermer
                </button>
            </div>
            <div className="flex-1 overflow-hidden">
                <iframe src={url} title={title} className="w-full h-full border-0" />
            </div>
        </div>
    );
};

/* ─── Badge statut ─── */
const StatusBadge = ({ quote, isSigned }) => {
    const isInvoice = quote.type === 'invoice';
    const isPaid    = quote.status === 'paid';
    const isAmend   = quote.type === 'amendment';
    if (isPaid)     return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">Facture acquittée</span>;
    if (isInvoice)  return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">Facture</span>;
    if (isAmend)    return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">Avenant</span>;
    if (isSigned)   return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Devis signé ✓</span>;
    if (quote.status === 'rejected') return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">Refusé</span>;
    return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">Devis</span>;
};

/* ─── Section paiement d'une facture ─── */
const PaymentSection = ({ quote, artisan }) => {
    const [open, setOpen]     = useState(false);
    const [copied, setCopied] = useState(false);

    if (quote.type !== 'invoice' || quote.status === 'paid') return null;

    const hasIban  = !!artisan.iban;
    const hasWero  = !!artisan.wero_phone;
    if (!hasIban && !hasWero) return null;

    const copyIban = () => {
        navigator.clipboard.writeText(artisan.iban).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const weroLink = hasWero
        ? `https://www.wero.fr/pay?phone=${encodeURIComponent(artisan.wero_phone)}&amount=${quote.total_ttc?.toFixed(2)}`
        : null;

    return (
        <div className="mt-3 border-t border-gray-100 pt-3">
            <button
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-2 text-xs font-semibold text-blue-600 hover:text-blue-700 w-full"
            >
                <CreditCard className="w-3.5 h-3.5" />
                Payer cette facture
                <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="mt-3 space-y-2">
                    {hasIban && (
                        <div className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-3 py-2">
                            <div className="min-w-0">
                                <p className="text-[10px] text-gray-400 font-semibold uppercase">Virement bancaire (IBAN)</p>
                                <p className="text-xs font-mono text-gray-700 mt-0.5 break-all">{artisan.iban}</p>
                            </div>
                            <button
                                onClick={copyIban}
                                className={`flex-shrink-0 p-2 rounded-lg transition-colors ${copied ? 'text-green-600 bg-green-50' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'}`}
                                title="Copier l'IBAN"
                            >
                                {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            </button>
                        </div>
                    )}
                    {hasWero && (
                        <a
                            href={weroLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2.5 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 hover:bg-blue-100 transition-colors"
                        >
                            <Smartphone className="w-4 h-4 text-blue-600 flex-shrink-0" />
                            <div className="min-w-0">
                                <p className="text-xs font-semibold text-blue-700">Payer avec Wero</p>
                                <p className="text-[10px] text-blue-500">{artisan.wero_phone}</p>
                            </div>
                            <span className="ml-auto text-xs font-bold text-blue-700">{quote.total_ttc?.toFixed(2)} €</span>
                        </a>
                    )}
                    <p className="text-[10px] text-gray-400 text-center">
                        Référence : {quote.title || `Facture #${quote.quote_number || quote.id}`}
                    </p>
                </div>
            )}
        </div>
    );
};

/* ─── Bulle de message ─── */
const MessageBubble = ({ msg, isArtisan }) => (
    <div className={`flex ${isArtisan ? 'justify-start' : 'justify-end'}`}>
        <div className={`max-w-xs sm:max-w-sm rounded-2xl px-4 py-2.5 ${
            isArtisan
                ? 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
                : 'bg-blue-600 text-white rounded-tr-sm'
        }`}>
            {msg.sender_name && (
                <p className={`text-[10px] font-semibold mb-1 ${isArtisan ? 'text-blue-600' : 'text-blue-100'}`}>
                    {msg.sender_name}
                </p>
            )}
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
            <p className={`text-[10px] mt-1 ${isArtisan ? 'text-gray-400' : 'text-blue-200'}`}>
                {new Date(msg.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
        </div>
    </div>
);

/* ══════════════════════════════════════════════════════════════════════════════
   Composant principal
══════════════════════════════════════════════════════════════════════════════ */
const ClientPortal = () => {
    const { token } = useParams();
    const [data, setData]             = useState(null);
    const [loading, setLoading]       = useState(true);
    const [error, setError]           = useState(null);
    const [activeTab, setActiveTab]   = useState('documents');

    const [pdfViewer, setPdfViewer]         = useState({ url: null, title: '' });
    const [generatingPdf, setGeneratingPdf] = useState(null);

    const [signingQuoteId, setSigningQuoteId] = useState(null);
    const [signedQuoteIds, setSignedQuoteIds] = useState(new Set());
    const [signedDates, setSignedDates]       = useState({});

    /* ── Messages ── */
    const [messages, setMessages]       = useState([]);
    const [msgLoading, setMsgLoading]   = useState(false);
    const [newMsg, setNewMsg]           = useState('');
    const [sending, setSending]         = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const messagesEndRef                = useRef(null);
    const supabaseUrl                   = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey               = import.meta.env.VITE_SUPABASE_ANON_KEY;

    useEffect(() => { fetchPortalData(); }, [token]);

    /* Scroll automatique vers le bas quand les messages changent */
    useEffect(() => {
        if (activeTab === 'messages') {
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
    }, [messages, activeTab]);

    /* Polling des messages toutes les 30s quand l'onglet est actif */
    useEffect(() => {
        if (activeTab !== 'messages') return;
        fetchMessages();
        const interval = setInterval(fetchMessages, 30_000);
        return () => clearInterval(interval);
    }, [activeTab, token]);

    const closePdfViewer = useCallback(() => {
        if (pdfViewer.url?.startsWith('blob:')) URL.revokeObjectURL(pdfViewer.url);
        setPdfViewer({ url: null, title: '' });
    }, [pdfViewer.url]);

    const fetchPortalData = async () => {
        try {
            const { data: portalData, error } = await supabase
                .rpc('get_portal_data', { token_input: token });
            if (error) throw error;
            if (!portalData) throw new Error('Lien invalide. Vérifiez l\'URL ou contactez votre artisan.');

            // Erreurs structurées de la RPC (token révoqué ou expiré)
            if (portalData.error === 'revoked') {
                throw new Error('Ce lien a été révoqué par votre artisan. Demandez-lui un nouveau lien d\'accès.');
            }
            if (portalData.error === 'expired') {
                const expiredDate = portalData.expired_at
                    ? new Date(portalData.expired_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                    : null;
                throw new Error(
                    expiredDate
                        ? `Ce lien a expiré le ${expiredDate}. Demandez à votre artisan un nouveau lien d'accès.`
                        : 'Ce lien a expiré. Demandez à votre artisan un nouveau lien d\'accès.'
                );
            }

            setData(portalData);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchMessages = async () => {
        setMsgLoading(true);
        try {
            const { data: result, error } = await supabase
                .rpc('get_portal_messages', { p_token: token });
            if (error) throw error;
            const msgs = result?.messages || [];
            setMessages(msgs);
            // Compter les messages non lus de l'artisan (nouveautés pour le client)
            const unread = msgs.filter(m => m.sender_type === 'artisan' && !m.read_at).length;
            setUnreadCount(unread);
        } catch {
            /* silencieux — messages optionnels */
        } finally {
            setMsgLoading(false);
        }
    };

    const handleSendMessage = async () => {
        if (!newMsg.trim() || sending) return;
        setSending(true);
        const content = newMsg.trim();
        setNewMsg('');

        try {
            const clientName = data?.client?.name || 'Client';
            const { data: result, error } = await supabase.rpc('send_portal_message_client', {
                p_token:       token,
                p_content:     content,
                p_sender_name: clientName,
            });
            if (error || !result?.success) {
                toast.error(result?.error || 'Impossible d\'envoyer le message');
                setNewMsg(content);
                return;
            }

            // Optimistic update
            setMessages(prev => [...prev, {
                id: result.id,
                sender_type: 'client',
                content,
                sender_name: clientName,
                created_at: new Date().toISOString(),
                read_at: null,
            }]);

            // Notifier l'artisan
            fetch(`${supabaseUrl}/functions/v1/send-portal-message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
                body: JSON.stringify({
                    portal_token:    token,
                    sender_name:     clientName,
                    message_preview: content,
                }),
            }).catch(() => {});
        } catch {
            toast.error('Erreur lors de l\'envoi');
            setNewMsg(content);
        } finally {
            setSending(false);
        }
    };

    const handleDownload = (quote) => {
        generateDevisPDF(quote, data.client, data.artisan, quote.type === 'invoice');
    };

    const handleViewQuote = async (quote) => {
        const key = `q-${quote.id}`;
        setGeneratingPdf(key);
        try {
            const blobUrl = await generateDevisPDF(quote, data.client, data.artisan, quote.type === 'invoice', 'bloburl');
            const label = quote.type === 'invoice'
                ? `Facture · ${quote.title || `#${quote.quote_number || quote.id}`}`
                : `Devis · ${quote.title || `#${quote.quote_number || quote.id}`}`;
            if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
                window.open(blobUrl, '_blank');
            } else {
                setPdfViewer({ url: blobUrl, title: label });
            }
        } catch {
            toast.error('Impossible de générer le PDF');
        } finally {
            setGeneratingPdf(null);
        }
    };

    const handleDownloadReport = async (report) => {
        if (report.report_pdf_url) { window.open(report.report_pdf_url, '_blank'); return; }
        const key = `dl-${report.id}`;
        setGeneratingPdf(key);
        try { await generateInterventionReportPDF(report, data.artisan); }
        finally { setGeneratingPdf(null); }
    };

    const handleViewReport = async (report) => {
        const key = `r-${report.id}`;
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (report.report_pdf_url) {
            isMobile ? window.open(report.report_pdf_url, '_blank')
                     : setPdfViewer({ url: report.report_pdf_url, title: report.title || 'Rapport d\'intervention' });
            return;
        }
        setGeneratingPdf(key);
        try {
            const blob = await generateInterventionReportPDF(report, data.artisan, true);
            const blobUrl = URL.createObjectURL(blob);
            isMobile ? window.open(blobUrl, '_blank')
                     : setPdfViewer({ url: blobUrl, title: report.title || 'Rapport d\'intervention' });
        } catch {
            toast.error('Impossible de générer le rapport');
        } finally {
            setGeneratingPdf(null);
        }
    };

    const handleSignQuote = async (signatureDataUrl) => {
        if (!signingQuoteId) return;
        const { data: result, error } = await supabase.rpc('sign_quote_via_portal', {
            portal_token_input: token,
            quote_id_input:     signingQuoteId,
            signature_base64:   signatureDataUrl,
        });
        if (error || !result?.success) {
            toast.error(result?.error || error?.message || 'Erreur lors de la signature');
            return;
        }
        const now = new Date().toISOString();
        setSignedQuoteIds(prev => new Set([...prev, signingQuoteId]));
        setSignedDates(prev => ({ ...prev, [signingQuoteId]: now }));
        setSigningQuoteId(null);
        toast.success('Devis signé avec succès !');

        fetch(`${supabaseUrl}/functions/v1/notify-artisan-portal-signature`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
            body: JSON.stringify({ quote_id: signingQuoteId }),
        }).catch(() => {});
    };

    /* ── Loading / Error ── */
    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
    );
    if (error) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center p-8 bg-white rounded-xl shadow-sm max-w-md">
                <div className="text-4xl mb-4">⚠️</div>
                <h1 className="text-xl font-bold text-gray-900 mb-2">Accès impossible</h1>
                <p className="text-gray-600">{error}</p>
            </div>
        </div>
    );

    const { client, artisan, quotes, photos, reports = [] } = data;

    const sortedQuotes = [...quotes].sort((a, b) => {
        const aUrgent = !['accepted','paid','rejected','cancelled'].includes(a.status) && a.type !== 'invoice';
        const bUrgent = !['accepted','paid','rejected','cancelled'].includes(b.status) && b.type !== 'invoice';
        if (aUrgent && !bUrgent) return -1;
        if (!aUrgent && bUrgent) return 1;
        return new Date(b.date) - new Date(a.date);
    });

    const photoGroups = {
        before: photos.filter(p => p.category === 'before'),
        during: photos.filter(p => p.category === 'during'),
        after:  photos.filter(p => p.category === 'after'),
        other:  photos.filter(p => !['before','during','after'].includes(p.category)),
    };
    const CATEGORY_LABELS = { before: 'Avant travaux', during: 'En cours', after: 'Après travaux', other: 'Photos' };

    const pendingSignature = sortedQuotes.filter(q => {
        const isSigned = q.status === 'accepted' || signedQuoteIds.has(q.id);
        return !isSigned && q.type !== 'invoice' && q.status !== 'rejected' && q.status !== 'cancelled';
    });

    const pendingInvoices = sortedQuotes.filter(q => q.type === 'invoice' && q.status !== 'paid').length;

    const TABS = [
        { id: 'documents', label: 'Documents', icon: FileText,       count: quotes.length + reports.length },
        { id: 'photos',    label: 'Photos',     icon: Camera,         count: photos.length },
        { id: 'messages',  label: 'Messages',   icon: MessageSquare,  count: unreadCount || null, highlight: unreadCount > 0 },
    ];

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            {pdfViewer.url && <PdfViewerModal url={pdfViewer.url} title={pdfViewer.title} onClose={closePdfViewer} />}

            <SignatureModal
                isOpen={!!signingQuoteId}
                onSave={handleSignQuote}
                onClose={() => setSigningQuoteId(null)}
            />

            {/* ── Header ── */}
            <header className="bg-white shadow-sm border-b border-gray-200">
                <div className="max-w-5xl mx-auto px-4 py-5 sm:px-6 lg:px-8">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex items-center gap-4">
                            {artisan.logo_url ? (
                                <img src={artisan.logo_url} alt="Logo" className="w-14 h-14 object-contain rounded-xl bg-gray-50 border border-gray-100" />
                            ) : (
                                <div className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                                    {artisan.company_name?.[0]?.toUpperCase() || 'A'}
                                </div>
                            )}
                            <div>
                                <h1 className="text-xl font-bold text-gray-900">{artisan.company_name || artisan.full_name}</h1>
                                <p className="text-sm text-gray-500 mt-0.5">
                                    Espace client de <span className="font-medium text-gray-700">{client.name}</span>
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                            {artisan.phone && (
                                <a href={`tel:${artisan.phone}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-blue-50 hover:text-blue-600 transition-colors border border-gray-200">
                                    <Phone className="w-3.5 h-3.5" />{artisan.phone}
                                </a>
                            )}
                            {artisan.professional_email && (
                                <a href={`mailto:${artisan.professional_email}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-blue-50 hover:text-blue-600 transition-colors border border-gray-200">
                                    <Mail className="w-3.5 h-3.5" />{artisan.professional_email}
                                </a>
                            )}
                            {artisan.website && (
                                <a href={artisan.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-blue-50 hover:text-blue-600 transition-colors border border-gray-200">
                                    <Globe className="w-3.5 h-3.5" />Site web
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 py-6 sm:px-6 lg:px-8 space-y-6">

                {/* ── Alertes ── */}
                {pendingSignature.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                        <PenLine className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold text-amber-900 text-sm">
                                {pendingSignature.length === 1
                                    ? '1 devis en attente de signature'
                                    : `${pendingSignature.length} devis en attente de signature`}
                            </p>
                            <p className="text-amber-700 text-xs mt-0.5">Cliquez sur "Signer" sur le document concerné.</p>
                        </div>
                    </div>
                )}
                {pendingInvoices > 0 && (
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-start gap-3">
                        <CreditCard className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold text-purple-900 text-sm">
                                {pendingInvoices === 1 ? '1 facture à régler' : `${pendingInvoices} factures à régler`}
                            </p>
                            <p className="text-purple-700 text-xs mt-0.5">
                                Consultez la section Documents pour les modalités de paiement.
                            </p>
                        </div>
                    </div>
                )}
                {unreadCount > 0 && activeTab !== 'messages' && (
                    <button
                        onClick={() => setActiveTab('messages')}
                        className="w-full bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3 text-left hover:bg-blue-100 transition-colors"
                    >
                        <MessageSquare className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold text-blue-900 text-sm">
                                {unreadCount === 1 ? '1 nouveau message' : `${unreadCount} nouveaux messages`} de {artisan.company_name || artisan.full_name}
                            </p>
                            <p className="text-blue-700 text-xs mt-0.5">Cliquez pour lire et répondre →</p>
                        </div>
                    </button>
                )}

                {/* ── Onglets ── */}
                <div className="flex space-x-1 rounded-xl bg-gray-100 p-1">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all flex items-center justify-center gap-1.5
                                ${activeTab === tab.id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <tab.icon className="w-4 h-4" />
                            <span className="hidden sm:inline">{tab.label}</span>
                            {tab.count != null && tab.count > 0 && (
                                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                                    tab.highlight
                                        ? 'bg-blue-600 text-white'
                                        : activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'
                                }`}>
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* ══ TAB : DOCUMENTS ══ */}
                {activeTab === 'documents' && (
                    <div className="space-y-8">
                        <div className="space-y-3">
                            {sortedQuotes.length === 0 ? (
                                <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
                                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-500">Aucun document disponible.</p>
                                </div>
                            ) : (
                                <div className="grid gap-4 md:grid-cols-2">
                                    {sortedQuotes.map((quote) => {
                                        const isSigned  = quote.status === 'accepted' || signedQuoteIds.has(quote.id);
                                        const isInvoice = quote.type === 'invoice';
                                        const isPaid    = quote.status === 'paid';
                                        const canSign   = !isInvoice && !isPaid && !isSigned && quote.status !== 'rejected' && quote.status !== 'cancelled';
                                        const viewKey   = `q-${quote.id}`;
                                        const signedAt  = signedDates[quote.id] || quote.signed_at;
                                        const docLabel  = quote.title || (isInvoice ? 'Facture' : 'Devis');
                                        const docRef    = quote.quote_number ? `N°${quote.quote_number}` : `#${quote.id}`;

                                        return (
                                            <div key={quote.id} className={`bg-white rounded-xl border transition-shadow
                                                ${canSign ? 'border-amber-200 shadow-md hover:shadow-lg' : 'border-gray-100 shadow-sm hover:shadow-md'}`}>

                                                {canSign && (
                                                    <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 rounded-t-xl flex items-center gap-2">
                                                        <PenLine className="w-3.5 h-3.5 text-amber-600" />
                                                        <span className="text-xs font-semibold text-amber-700">En attente de votre signature</span>
                                                    </div>
                                                )}
                                                {isInvoice && !isPaid && (
                                                    <div className="bg-purple-50 border-b border-purple-100 px-4 py-2 rounded-t-xl flex items-center gap-2">
                                                        <CreditCard className="w-3.5 h-3.5 text-purple-600" />
                                                        <span className="text-xs font-semibold text-purple-700">Facture à régler</span>
                                                    </div>
                                                )}

                                                <div className="p-5">
                                                    <div className="flex justify-between items-start gap-2 mb-3">
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                                <StatusBadge quote={quote} isSigned={isSigned} />
                                                                <span className="text-xs text-gray-400 font-mono">{docRef}</span>
                                                            </div>
                                                            <p className="font-semibold text-gray-900 text-sm leading-snug truncate" title={docLabel}>{docLabel}</p>
                                                        </div>
                                                        <p className="text-lg font-bold text-gray-900 flex-shrink-0">{quote.total_ttc?.toFixed(2)} €</p>
                                                    </div>

                                                    <p className="text-xs text-gray-500 mb-4">
                                                        {new Date(quote.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                                        {isSigned && signedAt && (
                                                            <span className="ml-2 text-green-600 font-medium">
                                                                · Signé le {new Date(signedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                                            </span>
                                                        )}
                                                    </p>

                                                    <div className="flex items-center gap-2">
                                                        {canSign && (
                                                            <button
                                                                onClick={() => setSigningQuoteId(quote.id)}
                                                                className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors"
                                                            >
                                                                <PenLine className="w-4 h-4" /> Signer ce devis
                                                            </button>
                                                        )}
                                                        {isSigned && !isInvoice && (
                                                            <span className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-50 text-green-700 text-sm font-medium rounded-lg">
                                                                <CheckCircle className="w-4 h-4" />Signé
                                                            </span>
                                                        )}
                                                        {isPaid && (
                                                            <span className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-50 text-blue-700 text-sm font-medium rounded-lg">
                                                                <CheckCircle className="w-4 h-4" />Acquittée
                                                            </span>
                                                        )}
                                                        <button
                                                            onClick={() => handleViewQuote(quote)}
                                                            disabled={generatingPdf === viewKey}
                                                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-40 border border-gray-200"
                                                            title="Prévisualiser"
                                                        >
                                                            {generatingPdf === viewKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                                                        </button>
                                                        <button
                                                            onClick={() => handleDownload(quote)}
                                                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-gray-200"
                                                            title="Télécharger"
                                                        >
                                                            <Download className="w-4 h-4" />
                                                        </button>
                                                    </div>

                                                    <PaymentSection quote={quote} artisan={artisan} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Rapports d'intervention */}
                        {reports.length > 0 && (
                            <div className="space-y-3">
                                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                    <ClipboardList className="w-4 h-4" /> Rapports d'intervention
                                </h2>
                                <div className="grid gap-4 md:grid-cols-2">
                                    {reports.map((report) => {
                                        const viewKey = `r-${report.id}`;
                                        return (
                                            <div key={report.id} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${report.status === 'signed' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                                                                {report.status === 'signed' ? 'Signé' : 'Terminé'}
                                                            </span>
                                                            {report.report_number && <span className="text-xs text-gray-400 font-mono">N°{report.report_number}</span>}
                                                        </div>
                                                        <p className="font-semibold text-gray-900 text-sm truncate">{report.title}</p>
                                                    </div>
                                                    <div className="flex items-center gap-1 flex-shrink-0">
                                                        <button onClick={() => handleViewReport(report)} disabled={generatingPdf === viewKey}
                                                            className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors disabled:opacity-40 border border-gray-200" title="Voir">
                                                            {generatingPdf === viewKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                                                        </button>
                                                        <button onClick={() => handleDownloadReport(report)} disabled={generatingPdf === `dl-${report.id}`}
                                                            className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors disabled:opacity-40 border border-gray-200" title="Télécharger">
                                                            <Download className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                                <p className="text-xs text-gray-500">
                                                    {new Date(report.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                                    {report.signed_at && report.signer_name && (
                                                        <span className="ml-2 text-green-600">· Signé par {report.signer_name}</span>
                                                    )}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Photos avant/après résumé */}
                        {reports.length > 0 && (photoGroups.before.length > 0 || photoGroups.after.length > 0) && (
                            <div className="space-y-3">
                                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                    <Camera className="w-4 h-4" /> Photos du projet
                                </h2>
                                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                                    <div className="grid grid-cols-2 divide-x divide-gray-100">
                                        {['before', 'after'].map(cat => (
                                            <div key={cat} className="p-4">
                                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                                    {cat === 'before' ? 'Avant' : 'Après'}
                                                </p>
                                                {photoGroups[cat].length > 0 ? (
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {photoGroups[cat].slice(0, 4).map((p) => (
                                                            <a key={p.id} href={p.photo_url} target="_blank" rel="noopener noreferrer"
                                                                className="group relative aspect-square rounded-lg overflow-hidden bg-gray-100 block">
                                                                <img src={p.photo_url} alt={cat}
                                                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                                                    <Eye className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                                                </div>
                                                            </a>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-xs text-gray-400 italic">Pas de photo {cat === 'before' ? 'avant' : 'après'}</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    {(photoGroups.before.length + photoGroups.after.length) > 4 && (
                                        <div className="border-t border-gray-100 px-4 py-3 text-center">
                                            <button onClick={() => setActiveTab('photos')} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                                                Voir toutes les photos ({photoGroups.before.length + photoGroups.after.length})
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* CTA Avis (Google / Facebook / Pages Jaunes) */}
                        {(artisan.google_review_url || artisan.facebook_review_url || artisan.pages_jaunes_review_url) && quotes.some(q => q.status === 'accepted' || q.status === 'paid') && (
                            <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-xl p-5 flex flex-col sm:flex-row items-center gap-4">
                                <div className="flex-shrink-0 w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm">
                                    <Star className="w-6 h-6 text-yellow-400 fill-yellow-400" />
                                </div>
                                <div className="flex-1 text-center sm:text-left">
                                    <p className="font-semibold text-gray-900 text-sm">Satisfait de notre travail ?</p>
                                    <p className="text-xs text-gray-600 mt-0.5">Votre avis compte énormément — laissez-nous un commentaire en 1 minute.</p>
                                </div>
                                <div className="flex-shrink-0 flex flex-wrap items-center justify-center gap-2">
                                    {artisan.google_review_url && (
                                        <a href={artisan.google_review_url} target="_blank" rel="noopener noreferrer"
                                            className="px-4 py-2 bg-white border border-yellow-300 text-yellow-700 hover:bg-yellow-50 font-semibold text-sm rounded-lg transition-colors shadow-sm whitespace-nowrap">
                                            Avis Google ⭐
                                        </a>
                                    )}
                                    {artisan.facebook_review_url && (
                                        <a href={artisan.facebook_review_url} target="_blank" rel="noopener noreferrer"
                                            className="px-4 py-2 bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 font-semibold text-sm rounded-lg transition-colors shadow-sm whitespace-nowrap">
                                            Avis Facebook ⭐
                                        </a>
                                    )}
                                    {artisan.pages_jaunes_review_url && (
                                        <a href={artisan.pages_jaunes_review_url} target="_blank" rel="noopener noreferrer"
                                            className="px-4 py-2 bg-white border border-amber-400 text-amber-700 hover:bg-amber-50 font-semibold text-sm rounded-lg transition-colors shadow-sm whitespace-nowrap">
                                            Avis Pages Jaunes ⭐
                                        </a>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ══ TAB : PHOTOS ══ */}
                {activeTab === 'photos' && (
                    <div className="space-y-8">
                        {photos.length === 0 ? (
                            <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
                                <Camera className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-500">Aucune photo pour le moment.</p>
                            </div>
                        ) : (
                            Object.entries(photoGroups).map(([cat, catPhotos]) => {
                                if (catPhotos.length === 0) return null;
                                return (
                                    <div key={cat} className="space-y-3">
                                        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                                            {CATEGORY_LABELS[cat]} <span className="font-normal text-gray-400 normal-case">({catPhotos.length})</span>
                                        </h2>
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                            {catPhotos.map((photo) => (
                                                <a key={photo.id} href={photo.photo_url} target="_blank" rel="noopener noreferrer"
                                                    className="group relative aspect-square bg-gray-100 rounded-xl overflow-hidden border border-gray-200 block">
                                                    <img src={photo.photo_url} alt={CATEGORY_LABELS[cat]}
                                                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                                        <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                                    </div>
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}

                {/* ══ TAB : MESSAGES ══ */}
                {activeTab === 'messages' && (
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col" style={{ minHeight: '420px' }}>
                        {/* En-tête */}
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                {artisan.logo_url
                                    ? <img src={artisan.logo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                                    : <span className="font-bold text-blue-600">{artisan.company_name?.[0]?.toUpperCase() || 'A'}</span>
                                }
                            </div>
                            <div>
                                <p className="font-semibold text-sm text-gray-900">{artisan.company_name || artisan.full_name}</p>
                                <p className="text-xs text-gray-400">Messagerie directe · réponse sous 24h</p>
                            </div>
                        </div>

                        {/* Fil de messages */}
                        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ maxHeight: '420px' }}>
                            {msgLoading && messages.length === 0 ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="text-center py-10">
                                    <MessageSquare className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                                    <p className="text-gray-500 text-sm font-medium">Démarrez la conversation</p>
                                    <p className="text-gray-400 text-xs mt-1">
                                        Posez une question à {artisan.company_name || artisan.full_name} — ils vous répondront directement ici.
                                    </p>
                                </div>
                            ) : (
                                messages.map(msg => (
                                    <MessageBubble
                                        key={msg.id}
                                        msg={msg}
                                        isArtisan={msg.sender_type === 'artisan'}
                                    />
                                ))
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Zone de saisie */}
                        <div className="border-t border-gray-100 p-3 flex gap-2 bg-gray-50">
                            <textarea
                                value={newMsg}
                                onChange={e => setNewMsg(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendMessage();
                                    }
                                }}
                                placeholder={`Écrire à ${artisan.company_name || artisan.full_name}… (Entrée pour envoyer)`}
                                rows={2}
                                maxLength={2000}
                                className="flex-1 resize-none text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                            />
                            <button
                                onClick={handleSendMessage}
                                disabled={!newMsg.trim() || sending}
                                className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 self-end"
                                title="Envoyer"
                            >
                                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                )}
            </main>

            {/* ── Footer ── */}
            <footer className="mt-12 border-t border-gray-200 bg-white">
                <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 lg:px-8 text-center text-xs text-gray-400">
                    Espace client sécurisé · {artisan.company_name || artisan.full_name}
                    {artisan.siret && <span> · SIRET {artisan.siret}</span>}
                </div>
            </footer>
        </div>
    );
};

export default ClientPortal;
