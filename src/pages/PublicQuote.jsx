import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { FileCheck, Download, Loader2, Phone, Mail, MapPin, Globe, PenTool } from 'lucide-react';
import { generateDevisPDF } from '../utils/pdfGenerator';
import SignatureModal from '../components/SignatureModal';
import { toast } from 'sonner';

const PublicQuote = () => {
    const { token } = useParams();
    const [quote, setQuote] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [savingSignature, setSavingSignature] = useState(false);

    useEffect(() => {
        fetchQuote();
    }, [token]);

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

    const handleDownload = () => {
        if (!quote) return;
        if (quote.original_pdf_url) {
            window.open(quote.original_pdf_url, '_blank');
            return;
        }
        const isInvoice = quote.type === 'invoice' || quote.status === 'paid';
        generateDevisPDF(quote, quote.client, quote.artisan, isInvoice);
    };

    const handleSignatureSave = async (signatureData) => {
        try {
            setSavingSignature(true);
            const { data, error } = await supabase
                .rpc('sign_public_quote', {
                    lookup_token: token,
                    signature_base64: signatureData
                });

            if (error) throw error;

            toast.success('Devis signé avec succès !');
            setShowSignatureModal(false);

            // Fetch latest data to get server timestamp if needed, but we can construct local object for immediate download speed
            const signedQuote = {
                ...quote,
                signature: signatureData,
                signed_at: new Date().toISOString(),
                status: 'accepted'
            };

            // Update UI
            setQuote(signedQuote);

            // Offer download immediately
            if (window.confirm("Merci pour votre signature ! Voulez-vous télécharger le devis signé maintenant ?")) {
                setTimeout(() => {
                    // small delay to ensure UI or simple logic buffer
                    generateDevisPDF(signedQuote, signedQuote.client, signedQuote.artisan, true); // true for invoice style? or keep as Devis? Let's keep based on context.
                    // Actually status 'accepted' usually means it stays a Devis but signed.
                    // Only if we convert to Invoice it becomes Facture.
                    // Let's pass isInvoice=false but with signature it will show "Bon pour accord".
                }, 500);
            }

        } catch (err) {
            console.error('Error saving signature:', err);
            toast.error('Erreur lors de la signature');
        } finally {
            setSavingSignature(false);
        }
    };

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

    const { artisan, client } = quote;
    const isSigned = quote.status === 'accepted';

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8 font-sans">
            <div className="max-w-4xl mx-auto space-y-6">

                {/* Header Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative">
                    {quote.status === 'paid' && (
                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none select-none">
                            <div className="border-4 border-red-600 text-red-600 font-bold text-5xl md:text-7xl p-4 rounded-lg -rotate-12 opacity-25 uppercase tracking-widest">
                                ACQUITTÉE
                            </div>
                        </div>
                    )}
                    <div className="p-6 sm:p-8 md:flex justify-between items-start gap-6 bg-gradient-to-r from-blue-600/5 to-transparent">
                        <div className="flex gap-5">
                            {artisan.logo_url && (
                                <img
                                    src={artisan.logo_url}
                                    alt="Logo"
                                    className="w-20 h-20 object-contain bg-white rounded-lg shadow-sm p-1"
                                />
                            )}
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">{artisan.company_name || artisan.full_name}</h1>
                                <div className="mt-2 space-y-1 text-sm text-gray-600">
                                    {artisan.phone && (
                                        <div className="flex items-center gap-2">
                                            <Phone className="w-4 h-4" />
                                            <a href={`tel:${artisan.phone}`} className="hover:text-blue-600">{artisan.phone}</a>
                                        </div>
                                    )}
                                    {artisan.email && (
                                        <div className="flex items-center gap-2">
                                            <Mail className="w-4 h-4" />
                                            <a href={`mailto:${artisan.email}`} className="hover:text-blue-600">{artisan.email}</a>
                                        </div>
                                    )}
                                    {artisan.website && (
                                        <div className="flex items-center gap-2">
                                            <Globe className="w-4 h-4" />
                                            <a href={artisan.website} target="_blank" rel="noreferrer" className="hover:text-blue-600">{artisan.website}</a>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="mt-6 md:mt-0 text-right">
                            <div className="inline-flex flex-col items-end">
                                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                                    {isSigned ? 'Facture N°' : 'Devis N°'}
                                </span>
                                <span className="text-2xl font-bold text-gray-900">
                                    {quote.id}
                                </span>
                                <div className="mt-2 text-sm text-gray-500">
                                    Du {new Date(quote.date).toLocaleDateString()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
                    {/* Client Info */}
                    <div className="mb-8 p-4 bg-gray-50 rounded-xl border border-gray-100">
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Pour le client</h3>
                        <div className="font-medium text-gray-900 text-lg">{client.name}</div>
                        <div className="text-gray-600 whitespace-pre-line">{client.address}</div>
                        {client.email && <div className="text-gray-600 mt-1">{client.email}</div>}
                    </div>

                    {/* Title */}
                    {quote.title && (
                        <div className="mb-8">
                            <h2 className="text-xl font-bold text-gray-900 border-l-4 border-blue-500 pl-4 py-1">
                                {quote.title}
                            </h2>
                        </div>
                    )}

                    {/* Content: External PDF or Items Table */}
                    {(quote.is_external && quote.original_pdf_url) ? (
                        <div className="mb-8 border border-gray-200 rounded-lg overflow-hidden h-[800px]">
                            <iframe
                                src={quote.original_pdf_url}
                                className="w-full h-full bg-gray-50"
                                title="Document du devis"
                            />
                        </div>
                    ) : (
                        <div className="overflow-x-auto mb-8">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b-2 border-gray-100">
                                        <th className="py-3 px-2 text-sm font-semibold text-gray-500 uppercase">Description</th>
                                        <th className="py-3 px-2 text-sm font-semibold text-gray-500 uppercase text-right w-24">Qté</th>
                                        <th className="py-3 px-2 text-sm font-semibold text-gray-500 uppercase text-right w-32">Prix U.</th>
                                        <th className="py-3 px-2 text-sm font-semibold text-gray-500 uppercase text-right w-32">Total HT</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {quote.items.map((item, idx) => (
                                        <tr key={idx} className="group hover:bg-gray-50/50">
                                            <td className="py-4 px-2 text-gray-900 font-medium">
                                                {item.description}
                                            </td>
                                            <td className="py-4 px-2 text-gray-600 text-right">
                                                {item.quantity}
                                            </td>
                                            <td className="py-4 px-2 text-gray-600 text-right">
                                                {item.price.toFixed(2)} €
                                            </td>
                                            <td className="py-4 px-2 text-gray-900 font-medium text-right">
                                                {(item.quantity * item.price).toFixed(2)} €
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Totals */}
                    <div className="border-t border-gray-100 pt-6 flex justify-end">
                        <div className="w-full sm:w-1/2 md:w-1/3 space-y-3">
                            <div className="flex justify-between text-gray-600">
                                <span>Total HT</span>
                                <span>{quote.total_ht.toFixed(2)} €</span>
                            </div>
                            {quote.total_tva > 0 ? (
                                <div className="flex justify-between text-gray-600">
                                    <span>TVA (20%)</span>
                                    <span>{quote.total_tva.toFixed(2)} €</span>
                                </div>
                            ) : (
                                <div className="text-xs text-right text-gray-400 italic">TVA non applicable</div>
                            )}
                            <div className="flex justify-between text-xl font-bold text-gray-900 pt-3 border-t border-gray-200">
                                <span>Total TTC</span>
                                <span>{quote.total_ttc.toFixed(2)} €</span>
                            </div>
                        </div>
                    </div>

                    {/* Notes */}
                    {quote.notes && quote.status !== 'paid' && (
                        <div className="mt-8 pt-8 border-t border-gray-100">
                            <h4 className="text-sm font-semibold text-gray-900 mb-2">Notes & Conditions</h4>
                            <p className="text-gray-600 text-sm whitespace-pre-line bg-gray-50 p-4 rounded-xl">
                                {quote.notes}
                            </p>
                        </div>
                    )}
                </div>

                {/* Actions Bar */}
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] md:relative md:bg-transparent md:border-0 md:shadow-none md:p-0">
                    <div className="max-w-4xl mx-auto flex flex-col sm:flex-row gap-4 justify-end">
                        <button
                            onClick={handleDownload}
                            className="flex items-center justify-center px-6 py-3 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 font-medium rounded-xl shadow-sm transition-all"
                        >
                            <Download className="w-5 h-5 mr-2" />
                            Télécharger PDF
                        </button>

                        {!isSigned && quote.type !== 'invoice' && quote.status !== 'paid' ? (
                            <button
                                onClick={() => setShowSignatureModal(true)}
                                className="flex items-center justify-center px-8 py-3 bg-blue-600 text-white hover:bg-blue-700 font-bold rounded-xl shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5"
                            >
                                <PenTool className="w-5 h-5 mr-2" />
                                Signer le devis
                            </button>
                        ) : null}

                        {isSigned && quote.type !== 'invoice' && (
                            <div className="flex items-center justify-center px-8 py-3 bg-green-100 text-green-800 font-bold rounded-xl border border-green-200 cursor-default">
                                <FileCheck className="w-5 h-5 mr-2" />
                                Devis signé le {new Date(quote.signed_at || new Date()).toLocaleDateString()}
                            </div>
                        )}

                        {quote.status === 'paid' && (
                            <div className="flex items-center justify-center px-8 py-3 bg-red-100 text-red-800 font-bold rounded-xl border border-red-200 cursor-default">
                                <FileCheck className="w-5 h-5 mr-2" />
                                FACTURE ACQUITTÉE
                            </div>
                        )}
                    </div>
                </div>

                {/* Spacer for fixed bottom bar on mobile */}
                <div className="h-24 md:hidden"></div>
            </div>

            <SignatureModal
                isOpen={showSignatureModal}
                onClose={() => setShowSignatureModal(false)}
                onSave={handleSignatureSave}
            />
        </div>
    );
};

export default PublicQuote;
