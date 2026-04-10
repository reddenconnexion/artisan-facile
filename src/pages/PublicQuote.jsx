import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { FileCheck, Download, Loader2, Phone, PenTool } from 'lucide-react';
import { generateDevisPDF } from '../utils/pdfGenerator';
import SignatureModal from '../components/SignatureModal';
import { Toaster, toast } from 'sonner';

const PublicQuote = () => {
    const { token } = useParams();
    const [quote, setQuote] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [savingSignature, setSavingSignature] = useState(false);
    const [justSigned, setJustSigned] = useState(false);
    const [pdfUrl, setPdfUrl] = useState(null);
    const [pdfLoading, setPdfLoading] = useState(false);

    useEffect(() => {
        fetchQuote();
    }, [token]);

    // Separate effect for presence once quote is loaded
    useEffect(() => {
        if (!quote?.id) return;

        const channel = supabase.channel(`quote_presence:${quote.id}`, {
            config: {
                presence: {
                    key: 'client',
                },
            },
        });

        channel
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.track({
                        online_at: new Date().toISOString()
                    });
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [quote?.id]);

    const fetchQuote = async () => {
        try {
            const { data, error } = await supabase
                .rpc('get_public_quote', { lookup_token: token });

            if (error) throw error;
            if (!data) throw new Error('Devis introuvable ou lien expiré');

            setQuote(data);
        } catch (err) {
            console.error('Error fetching quote:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Only allow https:// URLs to prevent javascript: and data: URI attacks
    const isSafeHttpsUrl = (url) => {
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'https:';
        } catch {
            return false;
        }
    };

    const handleDownload = () => {
        if (!quote) return;
        if (quote.original_pdf_url && isSafeHttpsUrl(quote.original_pdf_url)) {
            window.open(quote.original_pdf_url, '_blank', 'noopener,noreferrer');
            return;
        }
        const isInvoice = quote.type === 'invoice' || quote.status === 'paid' || (quote.title && quote.title.toLowerCase().includes('facture'));
        generateDevisPDF(quote, quote.client, quote.artisan, isInvoice);
    };

    const handleRequestOtp = async (email) => {
        try {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
            const response = await fetch(`${supabaseUrl}/functions/v1/request-quote-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseAnonKey}`,
                },
                body: JSON.stringify({ token, email }),
            });
            const data = await response.json();
            if (!response.ok) return { success: false, error: data.error };
            return { success: true };
        } catch (err) {
            console.error('[OTP] fetch failed:', err);
            return { success: false, error: "Erreur réseau. Veuillez réessayer." };
        }
    };

    const handleSignatureSave = async (signatureData, otpCode) => {
        try {
            setSavingSignature(true);
            const { data, error } = await supabase
                .rpc('sign_public_quote', {
                    lookup_token: token,
                    signature_base64: signatureData,
                    otp_code: otpCode || null,
                });

            if (error) throw error;
            if (data?.success === false) throw new Error(data.error || 'Échec de la signature');

            setShowSignatureModal(false);

            // Notification artisan côté serveur (ntfy.sh + email) – fiable même app fermée
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
            fetch(`${supabaseUrl}/functions/v1/notify-artisan-portal-signature`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseAnonKey}`,
                },
                body: JSON.stringify({ lookup_token: token }),
            }).catch(err => console.error('Erreur notification artisan:', err));

            const signedQuote = {
                ...quote,
                signature: signatureData,
                signed_at: new Date().toISOString(),
                status: 'accepted'
            };

            setQuote(signedQuote);
            setJustSigned(true);

        } catch (err) {
            console.error('Error saving signature:', err);
            toast.error('Erreur lors de la signature');
        } finally {
            setSavingSignature(false);
        }
    };

    // Generate PDF client-side whenever quote data changes (or signature is added)
    useEffect(() => {
        if (!quote) return;
        let blobUrl = null;
        setPdfLoading(true);
        const isInv = quote.type === 'invoice' || (quote.title && quote.title.toLowerCase().includes('facture'));
        generateDevisPDF(quote, quote.client, quote.artisan, isInv, 'bloburl')
            .then(url => { blobUrl = url; setPdfUrl(url); })
            .catch(e => console.error('PDF generation error:', e))
            .finally(() => setPdfLoading(false));
        return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
    }, [quote?.id, quote?.signature, quote?.status]);

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
    );

    if (error) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileCheck className="w-8 h-8 text-red-600" />
                </div>
                <h1 className="text-xl font-bold text-gray-900 mb-2">Lien invalide</h1>
                <p className="text-gray-600">{error}</p>
            </div>
        </div>
    );

    if (!quote) return null;

    const { artisan } = quote;
    const isSigned = quote.status === 'accepted';
    const isInvoiceView = quote.type === 'invoice' || (quote.title && quote.title.toLowerCase().includes('facture'));

    const formatDate = (dateString) => {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return '';
            return date.toLocaleDateString();
        } catch (e) {
            return '';
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col font-sans">
            <Toaster position="top-right" richColors />

            {/* Sticky top bar */}
            <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
                    {/* Left: artisan identity */}
                    <div className="flex items-center gap-3 min-w-0">
                        {artisan.logo_url && (
                            <img src={artisan.logo_url} alt="Logo" className="w-8 h-8 object-contain rounded" />
                        )}
                        <div className="min-w-0">
                            <div className="font-semibold text-gray-900 text-sm truncate">
                                {artisan.company_name || artisan.full_name}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                                {isInvoiceView ? 'Facture' : isSigned ? 'Devis accepté' : 'Devis'} N° {quote.quote_number || quote.id}
                            </div>
                        </div>
                    </div>

                    {/* Right: action buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                        {quote.report_pdf_url && isSafeHttpsUrl(quote.report_pdf_url) && (
                            <a
                                href={quote.report_pdf_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-orange-700 border border-orange-200 bg-orange-50 hover:bg-orange-100 text-sm font-medium rounded-lg transition-colors"
                            >
                                <Download className="w-4 h-4" />
                                Rapport
                            </a>
                        )}
                        <button
                            onClick={handleDownload}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-gray-700 border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium rounded-lg transition-colors"
                        >
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline">Télécharger</span>
                        </button>
                        {!isSigned && !isInvoiceView && quote.status !== 'paid' && (
                            <button
                                onClick={() => setShowSignatureModal(true)}
                                className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white hover:bg-blue-700 text-sm font-bold rounded-lg shadow-sm transition-colors"
                            >
                                <PenTool className="w-4 h-4" />
                                Signer
                            </button>
                        )}
                        {isSigned && quote.type !== 'invoice' && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-800 text-sm font-bold rounded-lg border border-green-200">
                                <FileCheck className="w-4 h-4" />
                                <span className="hidden sm:inline">Signé le {formatDate(quote.signed_at || quote.updated_at)}</span>
                                <span className="sm:hidden">Signé</span>
                            </div>
                        )}
                        {quote.status === 'paid' && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-800 text-sm font-bold rounded-lg border border-red-200">
                                <FileCheck className="w-4 h-4" />
                                Acquittée
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* PDF area */}
            <div className="flex-1 flex flex-col" style={{ minHeight: 'calc(100vh - 56px)' }}>
                {pdfLoading ? (
                    <div className="flex-1 flex items-center justify-center bg-gray-100" style={{ minHeight: 'calc(100vh - 56px)' }}>
                        <div className="flex flex-col items-center gap-3">
                            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                            <p className="text-sm text-gray-500">Génération du document...</p>
                        </div>
                    </div>
                ) : pdfUrl ? (
                    <>
                        {/* Desktop: full-height iframe */}
                        <iframe
                            src={pdfUrl}
                            className="hidden sm:block w-full border-0"
                            style={{ height: 'calc(100vh - 56px)' }}
                            title="Document PDF"
                        />
                        {/* Mobile: download prompt (iframes with blob URLs don't work on iOS) */}
                        <div className="sm:hidden flex-1 flex items-center justify-center p-6 bg-gray-100">
                            <div className="bg-white rounded-2xl shadow p-8 text-center max-w-sm w-full space-y-4">
                                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                                    <Download className="w-8 h-8 text-blue-600" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900">
                                        {isInvoiceView ? 'Votre facture' : 'Votre devis'}
                                    </h2>
                                    <p className="text-sm text-gray-500 mt-1">N° {quote.quote_number || quote.id}</p>
                                </div>
                                <button
                                    onClick={handleDownload}
                                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white hover:bg-blue-700 font-bold rounded-xl shadow transition-colors"
                                >
                                    <Download className="w-5 h-5" />
                                    Télécharger le PDF
                                </button>
                                {!isSigned && !isInvoiceView && quote.status !== 'paid' && (
                                    <button
                                        onClick={() => setShowSignatureModal(true)}
                                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-white text-blue-700 border border-blue-300 hover:bg-blue-50 font-bold rounded-xl shadow-sm transition-colors"
                                    >
                                        <PenTool className="w-5 h-5" />
                                        Signer le devis
                                    </button>
                                )}
                            </div>
                        </div>
                    </>
                ) : null}
            </div>

            {/* Below PDF: post-sign success + payment info */}
            <div className="max-w-4xl mx-auto w-full px-4 py-8 space-y-6">
                {/* Post-signature success banner */}
                {justSigned && (
                    <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center space-y-4">
                        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                            <FileCheck className="w-7 h-7 text-green-600" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-green-800">Devis signé — merci !</h3>
                            <p className="text-green-700 text-sm mt-1">
                                {artisan.company_name || artisan.full_name} a été notifié(e) de votre accord.
                            </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <button
                                onClick={handleDownload}
                                className="flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 font-medium rounded-xl shadow-sm transition-all"
                            >
                                <Download className="w-4 h-4" />
                                Télécharger le devis signé
                            </button>
                            {artisan.phone && (
                                <a
                                    href={`tel:${artisan.phone}`}
                                    className="flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white hover:bg-green-700 font-medium rounded-xl shadow-sm transition-all"
                                >
                                    <Phone className="w-4 h-4" />
                                    Contacter {artisan.company_name || artisan.full_name}
                                </a>
                            )}
                        </div>
                    </div>
                )}

                {/* Payment information */}
                {quote.status !== 'paid' && artisan.iban && (
                    <div className="bg-slate-50 rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
                        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                            <span className="bg-slate-200 p-1.5 rounded-lg mr-3">💳</span>
                            Moyens de paiement acceptés
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-white p-4 rounded-xl border border-slate-200">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Virement Bancaire</p>
                                <p className="font-mono text-slate-900 bg-slate-50 p-2 rounded border border-slate-100 select-all">
                                    {artisan.iban}
                                </p>
                                <p className="text-xs text-slate-500 mt-2 flex items-center">
                                    Référence à rappeler : <span className="font-bold ml-1">{quote.quote_number || quote.id}</span>
                                </p>
                            </div>
                            {artisan.wero_phone && artisan.wero_phone.trim().length > 0 && (
                                <div className="bg-white p-4 rounded-xl border border-slate-200">
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Paylib / Wero</p>
                                    <p className="text-slate-900 font-medium">
                                        {artisan.wero_phone}
                                        {(artisan.full_name || artisan.company_name) && (
                                            <span className="text-slate-500 font-normal text-sm ml-1">
                                                ({artisan.full_name || artisan.company_name})
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-xs text-slate-500 mt-1">instantané et sécurisé</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <SignatureModal
                isOpen={showSignatureModal}
                onClose={() => setShowSignatureModal(false)}
                onSave={handleSignatureSave}
                onRequestOtp={handleRequestOtp}
                requiresOtp={quote?.require_otp === true && Boolean(quote?.client?.email)}
            />
        </div>
    );
};

export default PublicQuote;
