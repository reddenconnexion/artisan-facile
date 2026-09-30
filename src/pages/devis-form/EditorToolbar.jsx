import { ArrowLeft, Save, Send, FileText, FileCheck, Eye, Star, MoreVertical, Clock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import AutoSaveIndicator from '../../components/AutoSaveIndicator';
import { formatDate, formatDateTime } from '../../utils/format';
import EditorActionsMenu from './EditorActionsMenu';

/**
 * Barre du haut de l'éditeur : retour, type de document, présence du
 * client, actions principales, menu « ⋮ » et champs d'import (cachés).
 */
const EditorToolbar = ({
    canConvertToInvoice,
    fetchLinkSuspended,
    fileInputRef,
    formData,
    handleBack,
    handleConvertToInvoice,
    handleDelete,
    handleDownloadPDF,
    handleExternalImport,
    handleImportFile,
    handleNotifyWithdrawal,
    handlePreview,
    handleSendQuoteEmail,
    handleSubmit,
    handleToggleSignatureSuspension,
    id,
    importing,
    isClientOnline,
    isCreditNote,
    isDocumentClosed,
    isEditing,
    isLocked,
    isOnline,
    lastSaved,
    loading,
    openCsvPasteModal,
    renderDocumentActions,
    saving,
    setFormData,
    setPdfOverviewMode,
    setReviewNavigateOnClose,
    setShowActionsMenu,
    setShowReviewRequestModal,
    setShowSignatureModal,
    setShowViewHistory,
    showActionsMenu,
    signature,
    signatureSuspended,
    suspensionBlockMessage,
    togglingSuspension,
    userProfile,
    viewCount,
}) => {
    return (
        <div id="devis-step-top" className="flex items-center justify-between mb-6">
            <button
                onClick={handleBack}
                className="flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
            >
                <ArrowLeft className="w-5 h-5 sm:mr-2" />
                <span className="hidden sm:inline">Retour</span>
            </button>

            {/* Type Switch — Devis / Facture. Masqué pour les avenants : un
                avenant est un type de document à part (avec ses sections
                constat/solution) qu'on ne doit pas convertir en devis/facture
                via ce raccourci. Sans ce garde-fou, un clic accidentel sur
                « Facture » changeait le type, masquait la section Avenant et
                n'offrait aucun retour possible. On affiche à la place un badge
                non cliquable indiquant qu'il s'agit d'un avenant. */}
            {formData.type === 'amendment' ? (
                <div className="flex items-center gap-1.5 mx-2 sm:mx-4 px-3 py-1.5 rounded-lg bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 text-sm font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Avenant
                </div>
            ) : isCreditNote ? (
                <div className="flex items-center gap-1.5 mx-2 sm:mx-4 px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-sm font-semibold">
                    <FileText className="w-3.5 h-3.5" />
                    Avoir{formData.invoice_number ? ` ${formData.invoice_number}` : ''}
                </div>
            ) : (
                <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg mx-2 sm:mx-4">
                    <button
                        type="button"
                        onClick={() => {
                            // Facture émise = numéro légal attribué : le retour en
                            // devis est interdit (la base le refuserait de toute façon).
                            if (formData.invoice_number) {
                                toast.error(`La facture ${formData.invoice_number} a été émise et ne peut plus redevenir un devis. Créez un avoir pour l'annuler.`);
                                return;
                            }
                            setFormData(p => ({ ...p, type: 'quote' }));
                        }}
                        disabled={!!formData.invoice_number}
                        className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${formData.invoice_number ? 'opacity-50 cursor-not-allowed ' : ''}${formData.type !== 'invoice'
                            ? 'bg-white dark:bg-gray-900 text-blue-600 shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-900'
                            }`}
                    >
                        Devis
                    </button>
                    <button
                        type="button"
                        onClick={() => setFormData(p => ({ ...p, type: 'invoice' }))}
                        className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${formData.type === 'invoice'
                            ? 'bg-white dark:bg-gray-900 text-green-600 shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-900'
                            }`}
                    >
                        Fac<span className="hidden sm:inline">ture</span>
                    </button>
                </div>
            )}

            {/* Presence Indicator */}
            <div className="flex flex-col items-center justify-center mr-auto ml-2">
                {isClientOnline && (
                    <div className="flex items-center gap-1 text-green-600 bg-green-50 dark:bg-green-900/20 px-3 py-1 rounded-full text-xs font-bold border border-green-200 animate-pulse transition-all">
                        <span className="relative flex h-2 w-2 mr-1">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                        CLIENT EN LIGNE
                    </div>
                )}
                {!isClientOnline && formData.last_viewed_at && (
                    <button
                        onClick={() => setShowViewHistory(true)}
                        className="flex items-center gap-1 text-gray-400 hover:text-blue-500 text-[10px] transition-colors"
                        title={`Dernière ouverture : ${formatDateTime(formData.last_viewed_at)}`}
                    >
                        <Eye className="w-3 h-3" />
                        Vu {formatDate(formData.last_viewed_at)}
                        {viewCount > 1 && (
                            <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 font-bold px-1 rounded text-[9px]">
                                ×{viewCount}
                            </span>
                        )}
                    </button>
                )}
            </div>

            <div className="flex items-center gap-2">
                {/* Indicateur de chronométrage (nouveau devis uniquement) */}
                {!isEditing && (
                    <span
                        className="hidden sm:flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500"
                        title="Votre temps de création est mesuré pour générer des statistiques"
                    >
                        <Clock className="w-3 h-3" />
                        Chrono actif
                    </span>
                )}
                {/* Auto-save indicator */}
                {(!isEditing || !isOnline) && (
                    <AutoSaveIndicator
                        lastSaved={lastSaved}
                        saving={saving}
                        label={isOnline ? 'Brouillon sauvegardé' : 'Hors-ligne · gardé sur le téléphone'}
                    />
                )}
                {/* Retour à la vue aperçu PDF (documents finalisés) */}
                {isEditing && formData.status && formData.status !== 'draft' && (
                    <button
                        type="button"
                        onClick={() => setPdfOverviewMode(true)}
                        className="flex items-center px-3 sm:px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                        title="Revenir à l'aperçu PDF"
                    >
                        <Eye className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">Aperçu</span>
                    </button>
                )}

                {/* Primary Actions */}
                <button
                    type="button"
                    onClick={() => handleSendQuoteEmail('fr')}
                    disabled={loading}
                    className="flex items-center px-3 sm:px-4 py-2 text-white bg-ios rounded-lg hover:bg-ios-dark disabled:opacity-50 shadow-sm font-medium"
                    title="Envoyer par email (enregistre le devis si besoin)"
                >
                    <Send className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Envoyer</span>
                </button>

                {canConvertToInvoice && (
                    <button
                        type="button"
                        onClick={handleConvertToInvoice}
                        className="flex items-center px-3 sm:px-4 py-2 text-emerald-700 dark:text-green-400 bg-emerald-50 dark:bg-green-900/20 border border-emerald-200 rounded-lg hover:bg-emerald-100 font-medium transition-colors"
                        title="Convertir ce devis en facture"
                    >
                        <FileCheck className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">Facturer</span>
                    </button>
                )}

                {formData.type === 'invoice' && id && id !== 'new' && formData.client_id && userProfile?.google_review_url && (
                    <button
                        type="button"
                        onClick={() => { setReviewNavigateOnClose(false); setShowReviewRequestModal(true); }}
                        className="flex items-center px-3 sm:px-4 py-2 text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 rounded-lg hover:bg-yellow-100 font-medium transition-colors"
                        title="Demander un avis Google au client"
                    >
                        <Star className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">Demander un avis</span>
                    </button>
                )}

                <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="flex items-center px-3 sm:px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                    title="Enregistrer sans envoyer"
                >
                    <Save className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">{loading ? '...' : 'Enregistrer'}</span>
                </button>

                {/* More Actions Dropdown */}
                <div className="relative">
                    <button
                        onClick={() => setShowActionsMenu(!showActionsMenu)}
                        className="flex items-center justify-center w-10 h-10 bg-white dark:bg-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ios dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                        title="Plus d'actions"
                    >
                        <MoreVertical className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </button>

                    {showActionsMenu && (
                        <EditorActionsMenu
                            fetchLinkSuspended={fetchLinkSuspended}
                            fileInputRef={fileInputRef}
                            formData={formData}
                            handleDelete={handleDelete}
                            handleDownloadPDF={handleDownloadPDF}
                            handleNotifyWithdrawal={handleNotifyWithdrawal}
                            handlePreview={handlePreview}
                            handleSendQuoteEmail={handleSendQuoteEmail}
                            handleToggleSignatureSuspension={handleToggleSignatureSuspension}
                            id={id}
                            importing={importing}
                            isCreditNote={isCreditNote}
                            isDocumentClosed={isDocumentClosed}
                            isLocked={isLocked}
                            openCsvPasteModal={openCsvPasteModal}
                            renderDocumentActions={renderDocumentActions}
                            setReviewNavigateOnClose={setReviewNavigateOnClose}
                            setShowActionsMenu={setShowActionsMenu}
                            setShowReviewRequestModal={setShowReviewRequestModal}
                            setShowSignatureModal={setShowSignatureModal}
                            signature={signature}
                            signatureSuspended={signatureSuspended}
                            suspensionBlockMessage={suspensionBlockMessage}
                            togglingSuspension={togglingSuspension}
                        />
                    )}
                </div>
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="application/pdf, .docx, application/vnd.openxmlformats-officedocument.wordprocessingml.document, .csv, text/csv"
                    onChange={handleImportFile}
                />
                <input
                    type="file"
                    id="external-pdf-input"
                    className="hidden"
                    accept="application/pdf, .docx, application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={handleExternalImport}
                />
            </div>
        </div>
    );
};

export default EditorToolbar;
