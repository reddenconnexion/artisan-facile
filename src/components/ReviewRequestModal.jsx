import React, { useState } from 'react';
import { X, Mail, MessageSquare, Copy, Star, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

const ReviewRequestModal = ({ isOpen, onClose, client, userProfile }) => {
    if (!isOpen) return null;

    const reviewUrl = userProfile?.google_review_url;

    // Generated Text
    const clientName = client?.name || 'Client';
    const companyName = userProfile?.company_name || 'votre artisan';

    // Example of an "Optimized" review for the client
    const suggestedReview = `J'ai fait appel à ${companyName} et je suis très satisfait du résultat. Travail soigné, délais respectés et excellente communication. Je recommande vivement !`;

    // Messages for Email/SMS
    const emailSubject = `Votre avis compte pour ${companyName}`;
    const emailBody = `Bonjour ${clientName},\n\nMerci de votre confiance pour ce projet qui est désormais finalisé.\n\nLa satisfaction de mes clients est ma priorité. Si vous avez apprécié mon travail, pourriez-vous prendre 30 secondes pour laisser un avis sur Google ?\n\nCela m'aide énormément à développer mon activité locale.\n\nVoici le lien direct :\n${reviewUrl}\n\nUn exemple de message si vous manquez d'inspiration :\n"${suggestedReview}"\n\nMerci encore !\n\nCordialement,\n${userProfile?.full_name || ''}`;

    const smsBody = `Bonjour ${clientName}, merci pour votre confiance ! Si vous êtes satisfait, un petit avis Google m'aiderait beaucoup : ${reviewUrl} . Merci ! ${userProfile?.full_name || ''}`;

    const handleCopyReview = () => {
        navigator.clipboard.writeText(suggestedReview);
        toast.success("Exemple d'avis copié !");
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
        window.location.href = `mailto:${client?.email || ''}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
        onClose();
        toast.success("Application de messagerie ouverte");
    };

    const handleSendSMS = () => {
        if (!reviewUrl) {
            toast.error("Lien Google Avis non configuré");
            return;
        }
        // Basic SMS link (works on mobile)
        window.location.href = `sms:${client?.phone || ''}?body=${encodeURIComponent(smsBody)}`;
        onClose();
        toast.success("Application SMS ouverte");
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white text-center relative">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 text-white/80 hover:text-white hover:bg-white/10 rounded-full p-1 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    <div className="mx-auto w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-3 text-yellow-300">
                        <Star className="w-7 h-7 fill-current" />
                    </div>
                    <h2 className="text-xl font-bold">Félicitations pour ce paiement !</h2>
                    <p className="text-blue-100 text-sm mt-1">C'est le moment idéal pour demander un avis.</p>
                </div>

                <div className="p-6 space-y-6">

                    {!reviewUrl ? (
                        <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-lg text-sm text-center">
                            <p className="font-medium">Vous n'avez pas configuré votre lien Google Avis.</p>
                            <p className="mt-1">Allez dans Paramètres &gt; Profil pour l'ajouter.</p>
                        </div>
                    ) : (
                        <>
                            {/* Suggested Review Block */}
                            <div className="bg-gray-50 border border-gray-100 rounded-lg p-4 relative group">
                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                    Exemple d'avis optimisé (à suggérer au client)
                                </h3>
                                <p className="text-gray-700 text-sm italic pr-8">
                                    "{suggestedReview}"
                                </p>
                                <button
                                    onClick={handleCopyReview}
                                    className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                    title="Copier le texte"
                                >
                                    <Copy className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Actions */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <button
                                    onClick={handleSendEmail}
                                    className="flex items-center justify-center px-4 py-3 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors font-medium"
                                >
                                    <Mail className="w-5 h-5 mr-2" />
                                    Email pré-rempli
                                </button>
                                <button
                                    onClick={handleSendSMS}
                                    className="flex items-center justify-center px-4 py-3 bg-green-50 text-green-700 border border-green-100 rounded-lg hover:bg-green-100 transition-colors font-medium"
                                >
                                    <MessageSquare className="w-5 h-5 mr-2" />
                                    SMS pré-rempli
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
