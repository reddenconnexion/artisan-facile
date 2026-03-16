import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../utils/supabase';
import { FileText, Camera, Download, Phone, Mail, MapPin, Globe, ClipboardList, Eye, X, Loader2, PenLine, CheckCircle } from 'lucide-react';
import { generateDevisPDF, generateInterventionReportPDF } from '../../utils/pdfGenerator';
import SignatureModal from '../../components/SignatureModal';

/* ─── Inline PDF Viewer Modal ─── */
const PdfViewerModal = ({ url, title, onClose }) => {
    if (!url) return null;
    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white flex-shrink-0">
                <span className="text-sm font-medium truncate max-w-xs">{title}</span>
                <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex items-center gap-1.5 text-sm"
                >
                    <X className="w-4 h-4" />
                    Fermer
                </button>
            </div>
            {/* PDF */}
            <div className="flex-1 overflow-hidden">
                <iframe
                    src={url}
                    title={title}
                    className="w-full h-full border-0"
                />
            </div>
        </div>
    );
};

const ClientPortal = () => {
    const { token } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('documents');

    // PDF viewer state
    const [pdfViewer, setPdfViewer] = useState({ url: null, title: '' });
    const [generatingPdf, setGeneratingPdf] = useState(null); // id of doc being generated

    // Signature state
    const [signingQuoteId, setSigningQuoteId] = useState(null);
    const [signedQuoteIds, setSignedQuoteIds] = useState(new Set());

    useEffect(() => {
        fetchPortalData();
    }, [token]);

    // Revoke blob URL when viewer closes
    const closePdfViewer = useCallback(() => {
        if (pdfViewer.url?.startsWith('blob:')) {
            URL.revokeObjectURL(pdfViewer.url);
        }
        setPdfViewer({ url: null, title: '' });
    }, [pdfViewer.url]);

    const fetchPortalData = async () => {
        try {
            const { data: portalData, error } = await supabase
                .rpc('get_portal_data', { token_input: token });

            if (error) throw error;
            if (!portalData) throw new Error('Lien invalide ou expiré');

            setData(portalData);
        } catch (err) {
            console.error('Error fetching portal data:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = (quote) => {
        const isInvoice = quote.type === 'invoice';
        generateDevisPDF(quote, data.client, data.artisan, isInvoice);
    };

    const handleViewQuote = async (quote) => {
        const key = `q-${quote.id}`;
        setGeneratingPdf(key);
        try {
            const isInvoice = quote.type === 'invoice';
            const blobUrl = await generateDevisPDF(quote, data.client, data.artisan, isInvoice, 'bloburl');
            const label = isInvoice ? `Facture #${quote.id}` : `Devis #${quote.id}`;
            setPdfViewer({ url: blobUrl, title: label });
        } catch (e) {
            console.error(e);
        } finally {
            setGeneratingPdf(null);
        }
    };

    const handleDownloadReport = async (report) => {
        if (report.report_pdf_url) {
            window.open(report.report_pdf_url, '_blank');
            return;
        }
        const key = `dl-${report.id}`;
        setGeneratingPdf(key);
        try {
            await generateInterventionReportPDF(report, data.artisan);
        } finally {
            setGeneratingPdf(null);
        }
    };

    const handleViewReport = async (report) => {
        const key = `r-${report.id}`;
        if (report.report_pdf_url) {
            setPdfViewer({ url: report.report_pdf_url, title: report.title || 'Rapport d\'intervention' });
            return;
        }
        setGeneratingPdf(key);
        try {
            const blob = await generateInterventionReportPDF(report, data.artisan, true);
            const blobUrl = URL.createObjectURL(blob);
            setPdfViewer({ url: blobUrl, title: report.title || 'Rapport d\'intervention' });
        } catch (e) {
            console.error(e);
        } finally {
            setGeneratingPdf(null);
        }
    };

    const handleSignQuote = async (signatureDataUrl) => {
        if (!signingQuoteId) return;
        const { data: result, error } = await supabase.rpc('sign_quote_via_portal', {
            portal_token_input: token,
            quote_id_input: signingQuoteId,
            signature_base64: signatureDataUrl,
        });
        if (error || !result?.success) {
            alert(result?.error || error?.message || 'Erreur lors de la signature');
            return;
        }
        setSignedQuoteIds(prev => new Set([...prev, signingQuoteId]));
        setSigningQuoteId(null);

        // Notifier l'artisan par email
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        fetch(`${supabaseUrl}/functions/v1/notify-artisan-portal-signature`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseAnonKey}`,
            },
            body: JSON.stringify({ portal_token: token, quote_id: signingQuoteId }),
        }).catch(err => console.error('[notify-artisan] fetch failed:', err));
    };

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
    );

    if (error) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center p-8 bg-white rounded-xl shadow-sm max-w-md">
                <div className="text-red-500 mb-4">⚠️</div>
                <h1 className="text-xl font-bold text-gray-900 mb-2">Accès impossible</h1>
                <p className="text-gray-600">{error}</p>
            </div>
        </div>
    );

    const { client, artisan, quotes, photos, reports = [] } = data;

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            {/* Inline PDF Viewer */}
            {pdfViewer.url && (
                <PdfViewerModal
                    url={pdfViewer.url}
                    title={pdfViewer.title}
                    onClose={closePdfViewer}
                />
            )}

            {/* Signature Modal */}
            <SignatureModal
                isOpen={!!signingQuoteId}
                onSave={handleSignQuote}
                onClose={() => setSigningQuoteId(null)}
            />

            {/* Header / Artisan Info */}
            <header className="bg-white shadow-sm border-b border-gray-200">
                <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-4">
                            {artisan.logo_url ? (
                                <img src={artisan.logo_url} alt="Logo" className="w-16 h-16 object-contain rounded-lg bg-gray-50" />
                            ) : (
                                <div className="w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold text-xl">
                                    {artisan.company_name?.[0] || 'A'}
                                </div>
                            )}
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">{artisan.company_name || artisan.full_name}</h1>
                                <p className="text-sm text-gray-500">Espace Client : {client.name}</p>
                            </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 text-sm text-gray-600">
                            {artisan.phone && (
                                <a href={`tel:${artisan.phone}`} className="flex items-center hover:text-blue-600">
                                    <Phone className="w-4 h-4 mr-2" />
                                    {artisan.phone}
                                </a>
                            )}
                            {artisan.professional_email && (
                                <a href={`mailto:${artisan.professional_email}`} className="flex items-center hover:text-blue-600">
                                    <Mail className="w-4 h-4 mr-2" />
                                    {artisan.professional_email}
                                </a>
                            )}
                            {artisan.website && (
                                <a href={artisan.website} target="_blank" rel="noopener noreferrer" className="flex items-center hover:text-blue-600">
                                    <Globe className="w-4 h-4 mr-2" />
                                    {artisan.website}
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
                {/* Tabs */}
                <div className="flex space-x-1 rounded-xl bg-blue-900/5 p-1 mb-8 max-w-md mx-auto">
                    <button
                        onClick={() => setActiveTab('documents')}
                        className={`w-full rounded-lg py-2.5 text-sm font-medium leading-5 transition-all
                            ${activeTab === 'documents'
                                ? 'bg-white text-blue-700 shadow'
                                : 'text-blue-900/60 hover:bg-white/[0.12] hover:text-blue-900'
                            }`}
                    >
                        <div className="flex items-center justify-center gap-2">
                            <FileText className="w-4 h-4" />
                            Documents
                        </div>
                    </button>
                    <button
                        onClick={() => setActiveTab('photos')}
                        className={`w-full rounded-lg py-2.5 text-sm font-medium leading-5 transition-all
                            ${activeTab === 'photos'
                                ? 'bg-white text-blue-700 shadow'
                                : 'text-blue-900/60 hover:bg-white/[0.12] hover:text-blue-900'
                            }`}
                    >
                        <div className="flex items-center justify-center gap-2">
                            <Camera className="w-4 h-4" />
                            Photos du chantier
                        </div>
                    </button>
                </div>

                {/* Content */}
                {activeTab === 'documents' && (
                    <div className="space-y-8">
                        {/* Devis & Factures */}
                        <div className="space-y-4">
                            {quotes.length === 0 ? (
                                <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
                                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-500">Aucun document disponible.</p>
                                </div>
                            ) : (
                                <div className="grid gap-4 md:grid-cols-2">
                                    {quotes.map((quote) => {
                                        const isInvoice = quote.type === 'invoice';
                                        const viewKey = `q-${quote.id}`;
                                        const dlKey = `dl-q-${quote.id}`;
                                        return (
                                            <div key={quote.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                                                {/* Determine signature state */}
                                                {(() => {
                                                    const isSigned = quote.status === 'accepted' || signedQuoteIds.has(quote.id);
                                                    const canSign = !isInvoice && !isSigned && quote.status !== 'rejected' && quote.status !== 'cancelled';
                                                    return (
                                                        <div className="flex justify-between items-start mb-4">
                                                            <div>
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className={`px-2 py-1 text-xs font-semibold rounded-full
                                                                        ${isSigned ? 'bg-green-100 text-green-800' :
                                                                            quote.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                                                                'bg-yellow-100 text-yellow-800'}`}>
                                                                        {isInvoice ? 'Facture' : isSigned ? 'Devis signé' : 'Devis'}
                                                                    </span>
                                                                    <span className="text-sm text-gray-500">#{quote.id}</span>
                                                                </div>
                                                                <p className="text-lg font-bold text-gray-900">{quote.total_ttc.toFixed(2)} €</p>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                {/* Sign button for unsigned quotes */}
                                                                {canSign && (
                                                                    <button
                                                                        onClick={() => setSigningQuoteId(quote.id)}
                                                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors"
                                                                        title="Signer ce devis"
                                                                    >
                                                                        <PenLine className="w-3.5 h-3.5" />
                                                                        Signer
                                                                    </button>
                                                                )}
                                                                {isSigned && !isInvoice && (
                                                                    <span className="flex items-center gap-1 text-xs text-green-600 font-medium px-2">
                                                                        <CheckCircle className="w-4 h-4" /> Signé
                                                                    </span>
                                                                )}
                                                                {/* View inline */}
                                                                <button
                                                                    onClick={() => handleViewQuote(quote)}
                                                                    disabled={generatingPdf === viewKey}
                                                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-40"
                                                                    title="Voir le document"
                                                                >
                                                                    {generatingPdf === viewKey
                                                                        ? <Loader2 className="w-5 h-5 animate-spin" />
                                                                        : <Eye className="w-5 h-5" />}
                                                                </button>
                                                                {/* Download */}
                                                                <button
                                                                    onClick={() => handleDownload(quote)}
                                                                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                                    title="Télécharger"
                                                                >
                                                                    <Download className="w-5 h-5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                                <div className="text-sm text-gray-600 space-y-1">
                                                    <p>Date : {new Date(quote.date).toLocaleDateString()}</p>
                                                    <p className="line-clamp-2">{quote.notes}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Rapports d'intervention */}
                        {reports.length > 0 && (
                            <div className="space-y-4">
                                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                    <ClipboardList className="w-4 h-4" />
                                    Rapports d'intervention
                                </h2>
                                <div className="grid gap-4 md:grid-cols-2">
                                    {reports.map((report) => {
                                        const viewKey = `r-${report.id}`;
                                        return (
                                            <div key={report.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${report.status === 'signed' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                                                                {report.status === 'signed' ? 'Signé' : 'Terminé'}
                                                            </span>
                                                            {report.report_number && (
                                                                <span className="text-sm text-gray-500">N°{report.report_number}</span>
                                                            )}
                                                        </div>
                                                        <p className="font-semibold text-gray-900 text-sm">{report.title}</p>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        {/* View inline */}
                                                        <button
                                                            onClick={() => handleViewReport(report)}
                                                            disabled={generatingPdf === viewKey}
                                                            className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors disabled:opacity-40"
                                                            title="Voir le rapport"
                                                        >
                                                            {generatingPdf === viewKey
                                                                ? <Loader2 className="w-5 h-5 animate-spin" />
                                                                : <Eye className="w-5 h-5" />}
                                                        </button>
                                                        {/* Download */}
                                                        <button
                                                            onClick={() => handleDownloadReport(report)}
                                                            disabled={generatingPdf === `dl-${report.id}`}
                                                            className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors disabled:opacity-40"
                                                            title="Télécharger le rapport"
                                                        >
                                                            <Download className="w-5 h-5" />
                                                        </button>
                                                    </div>
                                                </div>
                                                <p className="text-sm text-gray-500">
                                                    {new Date(report.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                                    {report.signed_at && report.signer_name && (
                                                        <span className="ml-2">· Signé par {report.signer_name}</span>
                                                    )}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'photos' && (
                    <div>
                        {photos.length === 0 ? (
                            <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
                                <Camera className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-500">Aucune photo pour le moment.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {photos.map((photo) => (
                                    <div key={photo.id} className="group relative aspect-square bg-gray-100 rounded-xl overflow-hidden border border-gray-200">
                                        <img
                                            src={photo.photo_url}
                                            alt={photo.category}
                                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
                                            <span className="text-white font-medium capitalize">{photo.category === 'before' ? 'Avant' : photo.category === 'during' ? 'Pendant' : 'Après'}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
};

export default ClientPortal;
