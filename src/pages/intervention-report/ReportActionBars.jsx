import { ClipboardList, Save, ArrowLeft, FileDown, PenLine, CheckCircle, Send, Sparkles, ExternalLink, FileCheck, FilePlus, Star, WifiOff } from 'lucide-react';
import { OverflowMenu } from '../../components/ui';

// En-tête du rapport : titre, statut et actions. Seule la prochaine étape
// (signature, facture, devis final…) et « Enregistrer » restent en vue ; les
// autres actions sont rangées dans le menu « ⋯ ».
export const ReportHeader = ({
    isSiteVisit, isEditing, formData, userProfile, isOnline,
    saving, exporting, linkedInvoice, navigate,
    handleLeave, handleSave, handleExportPDF, handleMarkCompleted,
    handleResendInvoice, handleCreateInvoiceFromReport, handleCreateDevisFromVisit,
    openSignaturePad, setShowReviewRequestModal,
}) => {
    const isDone = formData.status === 'completed' || formData.status === 'signed';

    // Actions possibles, de la plus urgente à la moins urgente : la première
    // est affichée en bouton, les suivantes passent dans le menu.
    const actions = [
        isSiteVisit && {
            key: 'devis',
            label: 'Créer le devis final',
            icon: FilePlus,
            onClick: handleCreateDevisFromVisit,
            buttonClass: 'text-white bg-violet-600 hover:bg-violet-700 border border-violet-600',
            iconClassName: 'text-violet-500',
        },
        linkedInvoice && isDone && {
            key: 'send-invoice',
            label: 'Envoyer la facture',
            icon: Send,
            onClick: handleResendInvoice,
            buttonClass: 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 hover:bg-green-100 dark:hover:bg-green-900/40',
            iconClassName: 'text-green-600',
        },
        isEditing && !linkedInvoice && isDone && {
            key: 'create-invoice',
            label: 'Créer une facture',
            icon: FileCheck,
            onClick: handleCreateInvoiceFromReport,
            buttonClass: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/40',
            iconClassName: 'text-emerald-600',
        },
        !isSiteVisit && formData.status !== 'signed' && {
            key: 'sign',
            label: 'Faire signer',
            icon: PenLine,
            onClick: openSignaturePad,
            buttonClass: 'text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 hover:bg-purple-100 dark:hover:bg-purple-900/40',
            iconClassName: 'text-purple-600',
        },
        formData.status === 'draft' && {
            key: 'complete',
            label: 'Marquer terminé',
            icon: CheckCircle,
            onClick: handleMarkCompleted,
            disabled: saving,
            buttonClass: 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/40',
            iconClassName: 'text-blue-600',
        },
        linkedInvoice && {
            key: 'view-invoice',
            label: 'Voir la facture',
            icon: ExternalLink,
            onClick: () => navigate(`/app/devis/${linkedInvoice.id}`),
            buttonClass: 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/40',
            iconClassName: 'text-indigo-600',
        },
        !isSiteVisit && isDone && {
            key: 'review',
            label: 'Demander un avis',
            icon: Star,
            onClick: () => setShowReviewRequestModal(true),
            title: userProfile?.google_review_url ? 'Envoyer une demande d\'avis personnalisée' : 'Configurez votre lien Google Avis dans Profil',
            buttonClass: 'text-yellow-800 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 hover:bg-yellow-100 dark:hover:bg-yellow-900/40',
            iconClassName: 'text-yellow-500',
        },
    ].filter(Boolean);

    const [primary, ...secondary] = actions;
    const PrimaryIcon = primary?.icon;

    return (
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
                {!isOnline && (
                    <span
                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-full"
                        title="La saisie est gardée sur ce téléphone jusqu'au retour du réseau"
                    >
                        <WifiOff className="w-3.5 h-3.5" />
                        Hors-ligne · gardé sur le téléphone
                    </span>
                )}
                {primary && (
                    <button
                        onClick={primary.onClick}
                        disabled={primary.disabled}
                        title={primary.title}
                        className={`tap-target flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors font-medium disabled:opacity-60 ${primary.buttonClass}`}
                    >
                        <PrimaryIcon className="w-4 h-4" />
                        {primary.label}
                    </button>
                )}
                {/* Sur téléphone, icône seule : la prochaine étape, l'enregistrement
                    et « ⋯ » tiennent sur une ligne (le libellé reste en bas de page). */}
                <button
                    onClick={() => handleSave()}
                    disabled={saving}
                    aria-label="Enregistrer"
                    title="Enregistrer"
                    className="tap-target flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-ios text-white rounded-lg hover:bg-ios-dark transition-colors font-medium text-sm disabled:opacity-60"
                >
                    {saving
                        ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <Save className="w-4 h-4" />}
                    <span className="hidden sm:inline">Enregistrer</span>
                </button>
                <OverflowMenu
                    label="Plus d'actions"
                    items={[
                        ...secondary.map(({ key, label, icon, onClick, disabled, title, iconClassName }) => ({
                            key, label, icon, onClick, disabled, title, iconClassName,
                        })),
                        { divider: true },
                        {
                            key: 'pdf',
                            label: exporting ? 'Export du PDF…' : 'Télécharger le PDF',
                            icon: FileDown,
                            onClick: handleExportPDF,
                            disabled: exporting,
                        },
                    ]}
                />
            </div>
        </div>
    );
};

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
