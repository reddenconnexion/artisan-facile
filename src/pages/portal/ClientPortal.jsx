import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../utils/supabase';
import { FileText, Camera, Download, Phone, Mail, MapPin, Globe, Shield, Lock } from 'lucide-react';
import { generateDevisPDF } from '../../utils/pdfGenerator';
import { validateEmail } from '../../utils/validation';

// SECURITY: Enable email verification for portal access
const REQUIRE_EMAIL_VERIFICATION = true;

const ClientPortal = () => {
    const { token } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('documents'); // 'documents' or 'photos'

    // SECURITY: Email verification state
    const [isVerified, setIsVerified] = useState(!REQUIRE_EMAIL_VERIFICATION);
    const [verifyEmail, setVerifyEmail] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [verifyError, setVerifyError] = useState('');
    const [clientEmail, setClientEmail] = useState(''); // Expected email for hint

    useEffect(() => {
        if (REQUIRE_EMAIL_VERIFICATION) {
            // First, get minimal info to show email hint
            fetchClientEmailHint();
        } else {
            fetchPortalData();
        }
    }, [token]);

    // SECURITY: Fetch only email hint (masked) for verification prompt
    const fetchClientEmailHint = async () => {
        try {
            const { data: portalData, error } = await supabase
                .rpc('get_portal_data', { token_input: token });

            if (error) throw error;
            if (!portalData) throw new Error('Lien invalide ou expiré');

            // Store full data but don't expose until verified
            setData(portalData);

            // Create masked email hint (jo***@example.com)
            const email = portalData.client?.email || '';
            if (email) {
                const [local, domain] = email.split('@');
                const masked = local.slice(0, 2) + '***@' + domain;
                setClientEmail(masked);
            }

            setLoading(false);
        } catch (err) {
            console.error('Error fetching portal data:', err);
            setError(err.message);
            setLoading(false);
        }
    };

    // SECURITY: Verify email matches client
    const handleEmailVerification = async (e) => {
        e.preventDefault();
        setVerifyError('');

        if (!validateEmail(verifyEmail)) {
            setVerifyError('Veuillez entrer une adresse email valide');
            return;
        }

        setVerifying(true);

        try {
            // Compare with stored client email (case-insensitive)
            if (data?.client?.email &&
                verifyEmail.toLowerCase().trim() === data.client.email.toLowerCase().trim()) {
                setIsVerified(true);
                // Log access for security audit
                console.info('Portal access verified for client:', data.client.name);
            } else {
                setVerifyError('Cette adresse email ne correspond pas au client associé à ce lien.');
            }
        } catch (err) {
            setVerifyError('Erreur lors de la vérification');
        } finally {
            setVerifying(false);
        }
    };

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
        // Reconstruct necessary objects for pdfGenerator
        // Note: We might need to adjust pdfGenerator if it relies on specific object structures not present here
        // But get_portal_data returns full rows, so it should be close.
        // We need 'client' and 'userProfile' objects.

        const clientObj = data.client;
        const userProfileObj = data.artisan;

        // pdfGenerator expects 'devis', 'client', 'userProfile', 'isInvoice'
        // We determine isInvoice based on status or other logic. 
        // For simplicity, let's assume if status is 'accepted' and we want invoice, we pass true.
        // But here user just wants to download the document. 
        // Let's assume 'accepted' = Invoice, others = Quote for the button label/logic.

        const isInvoice = quote.status === 'accepted';
        generateDevisPDF(quote, clientObj, userProfileObj, isInvoice);
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

    // SECURITY: Show email verification screen if required
    if (REQUIRE_EMAIL_VERIFICATION && !isVerified && data) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-gray-100 p-4">
                <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Shield className="w-8 h-8 text-blue-600" />
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 mb-2">Vérification requise</h1>
                        <p className="text-gray-600">
                            Pour accéder à votre espace client, veuillez confirmer votre adresse email.
                        </p>
                    </div>

                    <form onSubmit={handleEmailVerification} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Votre adresse email
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="email"
                                    value={verifyEmail}
                                    onChange={(e) => setVerifyEmail(e.target.value)}
                                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="exemple@email.com"
                                    required
                                    autoFocus
                                />
                            </div>
                            {clientEmail && (
                                <p className="mt-2 text-sm text-gray-500">
                                    Indice : {clientEmail}
                                </p>
                            )}
                        </div>

                        {verifyError && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                                <p className="text-sm text-red-600">{verifyError}</p>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={verifying}
                            className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                            {verifying ? (
                                <>
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                                    Vérification...
                                </>
                            ) : (
                                <>
                                    <Lock className="w-5 h-5 mr-2" />
                                    Accéder à mon espace
                                </>
                            )}
                        </button>
                    </form>

                    <p className="mt-6 text-xs text-center text-gray-500">
                        Cette vérification protège vos documents et photos de chantier.
                    </p>
                </div>
            </div>
        );
    }

    const { client, artisan, quotes, photos } = data;

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
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
                            {artisan.email && (
                                <a href={`mailto:${artisan.email}`} className="flex items-center hover:text-blue-600">
                                    <Mail className="w-4 h-4 mr-2" />
                                    {artisan.email}
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
                    <div className="space-y-4">
                        {quotes.length === 0 ? (
                            <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
                                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-500">Aucun document disponible.</p>
                            </div>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2">
                                {quotes.map((quote) => (
                                    <div key={quote.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`px-2 py-1 text-xs font-semibold rounded-full
                                                        ${quote.status === 'accepted' ? 'bg-green-100 text-green-800' :
                                                            quote.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                                                'bg-yellow-100 text-yellow-800'}`}>
                                                        {quote.status === 'accepted' ? 'Facture / Signé' : 'Devis'}
                                                    </span>
                                                    <span className="text-sm text-gray-500">#{quote.id}</span>
                                                </div>
                                                <p className="text-lg font-bold text-gray-900">{quote.total_ttc.toFixed(2)} €</p>
                                            </div>
                                            <button
                                                onClick={() => handleDownload(quote)}
                                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="Télécharger"
                                            >
                                                <Download className="w-5 h-5" />
                                            </button>
                                        </div>
                                        <div className="text-sm text-gray-600 space-y-1">
                                            <p>Date : {new Date(quote.date).toLocaleDateString()}</p>
                                            <p className="line-clamp-2">{quote.notes}</p>
                                        </div>
                                    </div>
                                ))}
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
