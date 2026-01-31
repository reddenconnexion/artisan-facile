import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { FileCheck, Download, Loader2, Phone, Mail, MapPin, Globe, PenTool } from 'lucide-react';
import { generateDevisPDF } from '../utils/pdfGenerator';
import SignatureModal from '../components/SignatureModal';
import { toast } from 'sonner';
import { sendNotification } from '../utils/notifications';

const PublicQuote = () => {
    const { token } = useParams();
    const [quote, setQuote] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [savingSignature, setSavingSignature] = useState(false);

    useEffect(() => {
        fetchQuote();

        // 1. Join Presence Channel for Realtime "Client Online" status
        // We use a specific channel per quote
        if (token) {
            // Need to fetch quote first to get ID? No, we can use token or subsequent ID. 
            // Better to use ID, but we might not have it yet.
            // Let's rely on fetchQuote setting 'quote.id' and then joining?
            // Or just join 'quote_presence_token:${token}'
            // The artisan side needs to know the ID.
            // So we must wait for quote data.
        }
    }, [token]);

    // Separate effect for presence once quote is loaded
    useEffect(() => {
        if (!quote?.id) return;

        const channel = supabase.channel(`quote_presence:${quote.id}`, {
            config: {
                presence: {
                    key: 'client', // Identify as 'client'
                },
            },
        });

        channel
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    // Track presence
                    await channel.track({
                        online_at: new Date().toISOString(),
                        view_token: token
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

    const handleDownload = () => {
        if (!quote) return;
        if (quote.original_pdf_url) {
            window.open(quote.original_pdf_url, '_blank');
            return;
        }
        const isInvoice = quote.type === 'invoice' || quote.status === 'paid' || (quote.title && quote.title.toLowerCase().includes('facture'));
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

            // Send notification to artisan
            if (quote.artisan?.id) {
                await sendNotification(
                    quote.artisan.id,
                    `Le devis N°${quote.id} pour ${quote.client.name} a été signé !`,
                    `Nouveau Devis Signé - ${quote.client.name}`
                );
            }

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
    const isInvoiceView = quote.type === 'invoice' || (quote.title && quote.title.toLowerCase().includes('facture'));

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
                                    className="w-20 h-20 object-contain bg-white rounded-3xl shadow-sm p-1"
                                />
                            )}
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">{artisan.company_name || artisan.full_name}</h1>
                                {artisan.address && (
                                    <p className="text-sm text-gray-500 mt-1">
                                        {artisan.address}
                                        {artisan.postal_code || artisan.city ? `, ${artisan.postal_code} ${artisan.city}` : ''}
                                    </p>
                                )}
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
                                    {isSigned || isInvoiceView ? 'Facture N°' : 'Devis N°'}
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
                    {/* Content: External PDF or Items Table */}
                    {(quote.is_external && quote.original_pdf_url) ? (
                        <div className="mb-8 border border-gray-200 rounded-lg overflow-hidden h-[800px]">
                            <object
                                data={quote.original_pdf_url}
                                type="application/pdf"
                                className="w-full h-full bg-gray-50"
                            >
                                <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-gray-50">
                                    <div className="bg-white p-6 rounded-xl shadow-sm max-w-sm">
                                        <p className="text-gray-500 mb-4">L'aperçu du document original n'est pas supporté sur cet appareil.</p>
                                        <a
                                            href={quote.original_pdf_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center font-medium shadow-sm transition-colors"
                                        >
                                            <Download className="w-4 h-4 mr-2" />
                                            Télécharger le document
                                        </a>
                                    </div>
                                </div>
                            </object>
                        </div>
                    ) : (
                        <div className="mb-8 space-y-8">
                            {/* Helper to render Table */}
                            {(() => {
                                const renderTable = (items, title, colorClass) => (
                                    <div className="overflow-x-auto">
                                        {title && <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">{title}</h4>}
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className={`border-b-2 ${colorClass || 'border-gray-100'}`}>
                                                    <th className="py-3 px-2 text-sm font-semibold text-gray-500 uppercase">Description</th>
                                                    <th className="py-3 px-2 text-sm font-semibold text-gray-500 uppercase text-right w-24">Qté</th>
                                                    <th className="py-3 px-2 text-sm font-semibold text-gray-500 uppercase text-right w-32">Prix U.</th>
                                                    <th className="py-3 px-2 text-sm font-semibold text-gray-500 uppercase text-right w-32">Total HT</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {items.map((item, idx) => (
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
                                );

                                const services = quote.items.filter(i => i.type === 'service' || !i.type);
                                const materials = quote.items.filter(i => i.type === 'material');

                                return (
                                    <>
                                        {services.length > 0 && renderTable(services, materials.length > 0 ? "Main d'Oeuvre & Prestations" : null, 'border-blue-100')}
                                        {materials.length > 0 && renderTable(materials, "Matériel & Fournitures", 'border-orange-100')}
                                    </>
                                );
                            })()}
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

                    {/* Notes with Auto Calculation */}
                    {(quote.notes || (!isInvoiceView && quote.items.some(i => i.type === 'material'))) && quote.status !== 'paid' && (
                        <div className="mt-8 pt-8 border-t border-gray-100">
                            <h4 className="text-sm font-semibold text-gray-900 mb-2">Notes & Conditions</h4>
                            <div className="text-gray-600 text-sm whitespace-pre-line bg-gray-50 p-4 rounded-xl">
                                {quote.notes}
                                {!isInvoiceView && quote.items.some(i => i.type === 'material') && (
                                    <div className="mt-4 pt-4 border-t border-gray-200/50">
                                        <strong>--- ACOMPTE MATÉRIEL ---</strong><br />
                                        Montant des fournitures : {(() => {
                                            const mItems = quote.items.filter(i => i.type === 'material');
                                            const mHT = mItems.reduce((sum, i) => sum + ((parseFloat(i.price) || 0) * (parseFloat(i.quantity) || 0)), 0);
                                            // Infer tax applied if total_ttc > total_ht globally (simplified check)
                                            // Or use a strict rule. Assuming standard 1.2 if VAT enabled.
                                            // PublicQuote doesn't have 'include_tva' flag easily accessible if it's not in DB distinct column (it is in formData).
                                            // Wait, quote object has fields. Let's check quote struct.
                                            // Ideally we infer from total_tva > 0.
                                            const hasTva = quote.total_tva > 0;
                                            const mTTC = hasTva ? mHT * 1.2 : mHT;
                                            return mTTC.toFixed(2);
                                        })()} € TTC.<br />
                                        Un acompte correspondant à la totalité du matériel est requis à la signature.<br />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Legal Terms Footer (Common) */}
                <div className="text-[10px] text-gray-400 leading-relaxed text-justify px-8 mb-8">
                    <p className="mb-2">
                        <strong className="text-gray-500">Règlement :</strong> Le paiement est dû {(isInvoiceView && quote.valid_until) ? `le ${new Date(quote.valid_until).toLocaleDateString()}` : 'à réception de la facture'}. Le règlement s'effectue par virement bancaire ou chèque à l'ordre de {artisan.company_name || artisan.full_name}.
                    </p>
                    <p className="mb-2">
                        <strong className="text-gray-500">Pénalités de retard :</strong> Tout retard de paiement donnera lieu à l'application de pénalités calculées au taux de 10 % annuel, exigibles le jour suivant la date d'échéance, sans qu'un rappel soit nécessaire.
                    </p>
                    <p className="mb-2">
                        <strong className="text-gray-500">Frais de recouvrement (Clients Pros) :</strong> Pour les clients professionnels, une indemnité forfaitaire de 40 € pour frais de recouvrement est due de plein droit en cas de retard de paiement (Art. L441-10 du Code de commerce).
                    </p>
                    <p>
                        <strong className="text-gray-500">Réserve de propriété :</strong> Les marchandises et matériels installés restent la propriété du vendeur jusqu’au paiement intégral du prix.
                    </p>
                </div>

                {/* Payment Information (Visible for Invoices/Signed Quotes) */}
                {(isInvoiceView || isSigned) && quote.status !== 'paid' && artisan.iban && (
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
                                    Reference à rappeler : <span className="font-bold ml-1">{quote.id}</span>
                                </p>
                            </div>
                            {artisan.wero_phone && artisan.wero_phone.trim().length > 0 && (
                                <div className="bg-white p-4 rounded-xl border border-slate-200">
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Paylib / Wero</p>
                                    <p className="text-slate-900 font-medium">{artisan.wero_phone}</p>
                                    <p className="text-xs text-slate-500 mt-1">instantané et sécurisé</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

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

                        {!isSigned && !isInvoiceView && quote.status !== 'paid' ? (
                            <button
                                onClick={() => setShowSignatureModal(true)}
                                className="flex items-center justify-center px-8 py-3 bg-blue-600 text-white hover:bg-blue-700 font-bold rounded-xl shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5"
                            >
                                <PenTool className="w-5 h-5 mr-2" />
                                Signer le devis
                            </button>
                        ) : null}

                        {/* Payment Info for Invoices - REMOVED ABSOLUTE BLOCK */}

                        {isSigned && quote.type !== 'invoice' && (
                            <div className="flex items-center justify-center px-8 py-3 bg-green-100 text-green-800 font-bold rounded-xl border border-green-200 cursor-default">
                                <FileCheck className="w-5 h-5 mr-2" />
                                Devis signé le {new Date(quote.signed_at || quote.updated_at).toLocaleDateString()}
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
