import { ClipboardList, Save, ArrowLeft, FileDown, PenLine, CheckCircle, Send, Sparkles, ExternalLink, FileCheck, FilePlus, Star, WifiOff } from 'lucide-react';

// En-tête du rapport : titre, statut et actions (signature, clôture, facture, PDF, enregistrer).
export const ReportHeader = ({
    isSiteVisit, isEditing, formData, userProfile, isOnline,
    saving, exporting, linkedInvoice, navigate,
    handleLeave, handleSave, handleExportPDF, handleMarkCompleted,
    handleResendInvoice, handleCreateInvoiceFromReport, handleCreateDevisFromVisit,
    openSignaturePad, setShowReviewRequestModal,
}) => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
            <button
                onClick={handleLeave}
                aria-label="Retour aux rapports"
                className="p-2.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
                <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    {isSiteVisit
                        ? <Sparkles className="w-6 h-6 text-violet-600" />
                        : <ClipboardList className="w-6 h-6 text-blue-600" />}
                    {isSiteVisit
                        ? (isEditing ? 'Visite technique' : 'Nouvelle visite technique')
                        : (isEditing ? 'Modifier le rapport' : 'Nouveau rapport d\'intervention')}
                </h1>
                {formData.status === 'signed' && (
                    <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 mt-0.5">
                        <CheckCircle className="w-3 h-3" />
                        Signé par le client
                    </p>
                )}
            </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
            {isSiteVisit && (
                <button
                    onClick={handleCreateDevisFromVisit}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors font-medium"
                >
                    <FilePlus className="w-4 h-4" />
                    Créer le devis final
                </button>
            )}
            {!isSiteVisit && formData.status !== 'signed' && (
                <button
                    onClick={openSignaturePad}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors font-medium"
                >
                    <PenLine className="w-4 h-4" />
                    Faire signer
                </button>
            )}
            {formData.status === 'draft' && (
                <button
                    onClick={handleMarkCompleted}
                    disabled={saving}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors font-medium"
                >
                    <CheckCircle className="w-4 h-4" />
                    Marquer terminé
                </button>
            )}
            {linkedInvoice && (formData.status === 'completed' || formData.status === 'signed') && (
                <button
                    onClick={handleResendInvoice}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors font-medium"
                >
                    <Send className="w-4 h-4" />
                    Envoyer la facture
                </button>
            )}
            {linkedInvoice && (
                <button
                    onClick={() => navigate(`/app/devis/${linkedInvoice.id}`)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors font-medium"
                >
                    <ExternalLink className="w-4 h-4" />
                    Voir la facture
                </button>
            )}
            {isEditing && !linkedInvoice && (formData.status === 'completed' || formData.status === 'signed') && (
                <button
                    onClick={handleCreateInvoiceFromReport}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors font-medium"
                >
                    <FileCheck className="w-4 h-4" />
                    Créer une facture
                </button>
            )}
            {!isSiteVisit && (formData.status === 'completed' || formData.status === 'signed') && (
                <button
                    onClick={() => setShowReviewRequestModal(true)}
                    title={userProfile?.google_review_url ? 'Envoyer une demande d\'avis personnalisée' : 'Configurez votre lien Google Avis dans Profil'}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-yellow-800 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/40 transition-colors font-medium"
                >
                    <Star className="w-4 h-4 fill-current" />
                    Demander un avis
                </button>
            )}
            {!isOnline && (
                <span
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-full"
                    title="La saisie est gardée sur ce téléphone jusqu'au retour du réseau"
                >
                    <WifiOff className="w-3.5 h-3.5" />
                    Hors-ligne · gardé sur le téléphone
                </span>
            )}
            <button
                onClick={handleExportPDF}
                disabled={exporting}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
            >
                {exporting
                    ? <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                    : <FileDown className="w-4 h-4" />}
                PDF
            </button>
            <button
                onClick={() => handleSave()}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-ios text-white rounded-lg hover:bg-ios-dark transition-colors font-medium text-sm disabled:opacity-60"
            >
                {saving
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Save className="w-4 h-4" />}
                Enregistrer
            </button>
        </div>
    </div>
);

// Barre du bas : annuler / enregistrer.
export const ReportFooterActions = ({
    handleLeave, handleSave, saving,
}) => (
    <div className="flex justify-end gap-3 pb-4">
        <button
            onClick={handleLeave}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
        >
            Annuler
        </button>
        <button
            onClick={() => handleSave()}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-ios text-white rounded-lg hover:bg-ios-dark transition-colors font-medium text-sm disabled:opacity-60"
        >
            {saving
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Save className="w-4 h-4" />}
            Enregistrer
        </button>
    </div>
);
