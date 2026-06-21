import React, { useMemo, useState } from 'react';
import { X, Mail, MessageSquare, Copy, Star, RefreshCw, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { useTestMode } from '../context/TestModeContext';
import { useModalA11y } from '../hooks/useModalA11y';
import { buildReviewSuggestions, buildReviewSMS, resolveReviewCity } from '../utils/reviewSuggestions';

const ReviewRequestModal = ({ isOpen, onClose, client, userProfile, intervention = null }) => {
    const { isTestMode, captureEmail } = useTestMode();
    const containerRef = useModalA11y(isOpen, onClose);

    // `seed` permet de régénérer un nouveau lot de suggestions à la demande.
    const [seed, setSeed] = useState(0);
    const suggestions = useMemo(
        () => {
            void seed; // régénère un nouveau lot quand l'utilisateur en demande d'autres
            return buildReviewSuggestions({ userProfile, client, intervention: intervention || {} });
        },
        [userProfile, client, intervention, seed]
    );
    const [variantIndex, setVariantIndex] = useState(0);

    if (!isOpen) return null;

    const reviewUrl = userProfile?.google_review_url;
    const clientName = client?.name || 'Client';
    const companyName = userProfile?.company_name || 'votre artisan';
    const suggestedReview = suggestions[variantIndex] || suggestions[0] || '';

    const contextCity = resolveReviewCity({ intervention: intervention || {}, client: client || {} });
    const isPersonalized = Boolean(intervention && (intervention.city || intervention.workDone || intervention.title));

    const emailSubject = `Votre avis compte pour ${companyName}`;
    const emailBody = [
        `Bonjour ${clientName},`,
        `Merci pour votre confiance ! Je suis ravi que l'intervention soit désormais terminée.`,
        `Un rapide avis Google m'aiderait beaucoup à développer mon activité${contextCity ? ` sur ${contextCity}` : ''}.\nCela ne prend que 30 secondes :\n${reviewUrl}`,
        `Pour vous faire gagner du temps, voici un exemple que vous pouvez copier-coller (ou personnaliser) :\n"${suggestedReview}"`,
        `Encore merci, et n'hésitez pas à me contacter pour tout futur projet.\n\nBien cordialement,\n${userProfile?.full_name || ''}`
    ].join('\n\n');

    const smsBody = buildReviewSMS({ userProfile, client, suggestion: suggestedReview, reviewUrl: reviewUrl || '' });

    const handleCopyReview = () => {
        navigator.clipboard.writeText(suggestedReview);
        toast.success("Exemple d'avis copié !");
    };

    const handleCopySMS = () => {
        navigator.clipboard.writeText(smsBody);
        toast.success("Message SMS copié !");
    };

    const handleCopyLink = () => {
        if (!reviewUrl) {
            toast.error("Lien Google Avis non configuré");
            return;
        }
        navigator.clipboard.writeText(reviewUrl);
        toast.success("Lien Google copié !");
    };

    const handleSendEmail = () => {
        if (!reviewUrl) {
            toast.error("Lien Google Avis non configuré");
            return;
        }
        if (isTestMode) {
            captureEmail({ email: client?.email || '', subject: emailSubject, body: emailBody });
            toast.success('📬 Demande d\'avis capturée dans l\'inbox test', { duration: 4000 });
        } else {
            window.location.href = `mailto:${client?.email || ''}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
            toast.success("Application de messagerie ouverte");
        }
        onClose();
    };

    const handleSendSMS = () => {
        if (!reviewUrl) {
            toast.error("Lien Google Avis non configuré");
            return;
        }
        window.location.href = `sms:${client?.phone || ''}?body=${encodeURIComponent(smsBody)}`;
        onClose();
        toast.success("Application SMS ouverte");
    };

    const handleNextVariant = () => {
        const next = variantIndex + 1;
        if (next >= suggestions.length) {
            // Fin du lot courant : on régénère de nouvelles formulations pour
            // varier davantage au lieu de boucler sur les mêmes.
            setSeed(s => s + 1);
            setVariantIndex(0);
        } else {
            setVariantIndex(next);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Demande d'avis client"
        >
            <div
                ref={containerRef}
                className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[90vh] flex flex-col"
            >
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white text-center relative shrink-0">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 text-white/80 hover:text-white hover:bg-white/10 rounded-full p-1 transition-colors"
                        aria-label="Fermer la modal"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    <div className="mx-auto w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-3 text-yellow-300">
                        <Star className="w-7 h-7 fill-current" />
                    </div>
                    <h2 className="text-xl font-bold">
                        {isPersonalized ? 'Chantier terminé : demandez un avis !' : 'Félicitations pour ce paiement !'}
                    </h2>
                    <p className="text-blue-100 text-sm mt-1">
                        {isPersonalized
                            ? 'Exemple personnalisé selon le chantier, prêt à envoyer en SMS.'
                            : "C'est le moment idéal pour demander un avis."}
                    </p>
                </div>

                <div className="p-6 space-y-5 overflow-y-auto">
                    {!reviewUrl ? (
                        <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-lg text-sm text-center">
                            <p className="font-medium">Vous n'avez pas configuré votre lien Google Avis.</p>
                            <p className="mt-1">Allez dans Paramètres &gt; Profil pour l'ajouter.</p>
                        </div>
                    ) : (
                        <>
                            {contextCity && (
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <MapPin className="w-3.5 h-3.5" />
                                    <span>
                                        Optimisé référencement local
                                        {contextCity ? ` — ${contextCity}` : ''}
                                    </span>
                                </div>
                            )}

                            <div className="bg-gray-50 border border-gray-100 rounded-lg p-4 relative">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                        Exemple d'avis optimisé ({variantIndex + 1}/{suggestions.length})
                                    </h3>
                                    <div className="flex items-center gap-1">
                                        {suggestions.length > 1 && (
                                            <button
                                                onClick={handleNextVariant}
                                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                                title="Autre suggestion"
                                            >
                                                <RefreshCw className="w-4 h-4" />
                                            </button>
                                        )}
                                        <button
                                            onClick={handleCopyReview}
                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                            title="Copier le texte"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                <p className="text-gray-700 text-sm italic">
                                    "{suggestedReview}"
                                </p>
                            </div>

                            <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
                                        Message SMS prêt à envoyer
                                    </h3>
                                    <button
                                        onClick={handleCopySMS}
                                        className="p-1.5 text-blue-400 hover:text-blue-700 hover:bg-blue-100 rounded-md transition-colors"
                                        title="Copier le SMS"
                                    >
                                        <Copy className="w-4 h-4" />
                                    </button>
                                </div>
                                <p className="text-gray-700 text-xs whitespace-pre-line">
                                    {smsBody}
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <button
                                    onClick={handleSendSMS}
                                    className="flex items-center justify-center px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium shadow-sm"
                                >
                                    <MessageSquare className="w-5 h-5 mr-2" />
                                    Envoyer par SMS
                                </button>
                                <button
                                    onClick={handleSendEmail}
                                    className="flex items-center justify-center px-4 py-3 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors font-medium"
                                >
                                    <Mail className="w-5 h-5 mr-2" />
                                    Email pré-rempli
                                </button>
                                <button
                                    onClick={handleCopyLink}
                                    className="col-span-1 sm:col-span-2 flex items-center justify-center px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors border border-transparent hover:border-gray-200"
                                >
                                    <Copy className="w-4 h-4 mr-2" />
                                    Copier uniquement le lien Google
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ReviewRequestModal;
