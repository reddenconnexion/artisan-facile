import { ArrowLeft, Download, FileText, Loader2, ExternalLink, Clock, Lock, ChevronDown, Pencil, RefreshCw, FilePlus } from 'lucide-react';
import { publicLinkValidityLabel } from '../../constants/publicLink';

/**
 * Vue « aperçu PDF » d'un devis finalisé : barre d'outils et visionneuse.
 * Présente le document tel que le client le voit, avec accès direct à
 * l'éditeur via « Modifier ». Le PDF affiché est soit le document importé
 * (mode externe), soit le PDF généré à la volée.
 *
 * Le conteneur racine reste dans DevisForm : il est partagé avec l'éditeur
 * (pas de nouvelle animation d'entrée au passage aperçu → éditeur).
 */
const PdfOverview = ({
    displayPdfUrl,
    formData,
    generateOverviewPdf,
    handleBack,
    handleDownloadPDF,
    hasDocumentActions,
    id,
    isEditing,
    linkExpired,
    overviewError,
    overviewImagesFailed,
    overviewPageImages,
    overviewPdfUrl,
    overviewUsesImages,
    renderDocumentActionModals,
    renderDocumentActions,
    setOverviewError,
    setPdfOverviewMode,
    setShowOverviewDocsMenu,
    showOverviewDocsMenu,
    signatureSuspended,
    suspendedSignatureBanner,
    affaireLink = null,
}) => {
    const overviewSrc = formData.is_external ? displayPdfUrl : overviewPdfUrl;
    // Aperçu en images (mobile) : uniquement pour un PDF généré (blob:), pas
    // pour un document externe dont on ne possède pas le blob à rastériser.
    const showImagePreview = overviewUsesImages && !formData.is_external && overviewPdfUrl;
    const refPrefix = formData.type === 'invoice' ? 'FAC' : (formData.type === 'credit_note' ? 'AVR' : (formData.type === 'amendment' ? 'AVT' : 'DEV'));
    const docRef = ['invoice', 'credit_note'].includes(formData.type) && formData.invoice_number
        ? formData.invoice_number
        : `${refPrefix} #${formData.quote_number || (isEditing ? id : 'brouillon')}`;
    const statusMeta = {
        draft: { label: 'Brouillon', cls: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300' },
        sent: { label: 'Envoyé', cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
        accepted: { label: 'Signé', cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' },
        rejected: { label: 'Refusé', cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' },
        refused: { label: 'Refusé', cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' },
        billed: { label: 'Facturé', cls: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' },
        paid: { label: 'Payé', cls: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' },
        postponed: { label: 'Reporté', cls: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' },
        // Sans cette entrée, une facture annulée n'affichait aucun badge :
        // rien ne la distinguait d'une facture encore due.
        cancelled: { label: 'Annulée', cls: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 line-through' },
    }[formData.status] || null;

    const goToEditor = () => setPdfOverviewMode(false);

    return (
        <>
            {/* Barre d'outils */}
            <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        onClick={handleBack}
                        className="flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex-shrink-0"
                    >
                        <ArrowLeft className="w-5 h-5 sm:mr-2" />
                        <span className="hidden sm:inline">Retour</span>
                    </button>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white truncate">{docRef}</h1>
                            {statusMeta && (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${statusMeta.cls}`}>
                                    {statusMeta.label}
                                </span>
                            )}
                            {/* Un document « Envoyé » dont le lien est fermé se lit
                                autrement : le client ne peut plus rien signer.
                                Une suspension décidée et un lien simplement périmé
                                ne se disent pas pareil — les confondre faisait
                                passer le ménage nocturne pour une décision. */}
                            {signatureSuspended && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                                    <Lock className="w-3 h-3" />
                                    Signature suspendue
                                </span>
                            )}
                            {linkExpired && (
                                <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                                    title={`Le lien public a expiré : renvoyez le document ou recopiez le lien pour lui rendre ${publicLinkValidityLabel()} de validité.`}
                                >
                                    <Clock className="w-3 h-3" />
                                    Lien expiré
                                </span>
                            )}
                        </div>
                        {(formData.title || formData.client_name) && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {[formData.client_name, formData.title].filter(Boolean).join(' — ')}
                            </p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {overviewSrc && (
                        <a
                            href={overviewSrc}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hidden sm:flex items-center px-3 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                            title="Ouvrir dans un nouvel onglet"
                        >
                            <ExternalLink className="w-4 h-4" />
                        </a>
                    )}
                    <button
                        type="button"
                        onClick={() => handleDownloadPDF()}
                        className="flex items-center px-3 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        title="Télécharger le PDF"
                    >
                        <Download className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">Télécharger</span>
                    </button>
                    {/* Devis présenté en groupé / poste global : l'aperçu ci-dessous
                        est la version du client. Ce second bouton sort le même
                        document ligne à ligne, pour l'artisan — disponible aussi
                        après signature, sans toucher à la version transmise. */}
                    {!formData.is_external && ['grouped', 'poste_global'].includes(formData.client_display_mode || 'detailed') && (
                        <button
                            type="button"
                            onClick={() => handleDownloadPDF(false, { detailed: true })}
                            className="flex items-center px-3 py-2 text-amber-700 dark:text-amber-300 bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
                            title="Télécharger ma copie détaillée (ligne à ligne, pour vous — la version du client reste inchangée)"
                        >
                            <Lock className="w-4 h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Ma copie détaillée</span>
                        </button>
                    )}
                    {/* Documents liés (acompte, situation, facture de clôture, avenant,
                        avoir) : accessibles depuis l'aperçu, sans passer par l'éditeur —
                        c'est en lisant le document qu'on décide de le facturer. */}
                    {hasDocumentActions && (
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setShowOverviewDocsMenu(prev => !prev)}
                                aria-haspopup="menu"
                                aria-expanded={showOverviewDocsMenu}
                                className="flex items-center px-3 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                title="Créer un document lié : acompte, situation de travaux, facture de clôture, avenant…"
                            >
                                <FilePlus className="w-4 h-4 sm:mr-2" />
                                <span className="hidden sm:inline">Documents</span>
                                <ChevronDown className={`w-3.5 h-3.5 ml-1 opacity-70 transition-transform ${showOverviewDocsMenu ? 'rotate-180' : ''}`} />
                            </button>

                            {showOverviewDocsMenu && (
                                <>
                                    {/* Voile transparent : un clic à côté referme le menu */}
                                    <div
                                        className="fixed inset-0 z-40"
                                        onClick={() => setShowOverviewDocsMenu(false)}
                                        aria-hidden="true"
                                    />
                                    <div
                                        role="menu"
                                        className="absolute right-0 mt-2 w-60 bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-100 dark:border-gray-800 z-50 py-1 text-left"
                                    >
                                        {renderDocumentActions(() => setShowOverviewDocsMenu(false))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={goToEditor}
                        className="flex items-center px-3 sm:px-4 py-2 text-white bg-ios rounded-lg hover:bg-ios-dark shadow-sm"
                        title="Ouvrir l'éditeur pour modifier ce document"
                    >
                        <Pencil className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">Modifier</span>
                    </button>
                </div>
            </div>

            {suspendedSignatureBanner}

            {affaireLink}

            {/* Visionneuse PDF */}
            <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-200 dark:bg-gray-950 h-[75vh] min-h-[420px]">
                {showImagePreview ? (
                    overviewPageImages.length > 0 ? (
                        // Aperçu image multi-pages (mobile) : l'<iframe> n'affiche
                        // pas un PDF blob: sur iOS/Android.
                        <div className="w-full h-full overflow-y-auto p-3 space-y-3" style={{ background: '#525659' }}>
                            {overviewPageImages.map((src, i) => (
                                <img
                                    key={i}
                                    src={src}
                                    alt={`Page ${i + 1}`}
                                    className="w-full rounded-lg shadow bg-white"
                                    loading={i === 0 ? 'eager' : 'lazy'}
                                />
                            ))}
                        </div>
                    ) : overviewImagesFailed ? (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-center px-6 bg-white dark:bg-gray-900">
                            <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                Aperçu indisponible sur cet appareil
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleDownloadPDF()}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <Download className="w-4 h-4" />
                                    Télécharger
                                </button>
                                <a
                                    href={overviewSrc}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-ios rounded-lg hover:bg-ios-dark transition-colors"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    Plein écran
                                </a>
                            </div>
                        </div>
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900">
                            <Loader2 className="w-8 h-8 animate-spin" />
                            <span className="text-sm">Préparation de l'aperçu…</span>
                        </div>
                    )
                ) : overviewSrc ? (
                    <iframe
                        src={overviewSrc}
                        title="Aperçu du document"
                        className="w-full h-full border-0"
                        style={{ background: '#525659' }}
                    />
                ) : overviewError ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-center px-6 bg-white dark:bg-gray-900">
                        <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                        <div>
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                Impossible d'afficher l'aperçu PDF
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs">
                                {overviewError === 'client'
                                    ? "Le client associé est introuvable. Ouvrez l'éditeur pour vérifier le document."
                                    : "Une erreur est survenue pendant la génération du PDF."}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {overviewError !== 'client' && (
                                <button
                                    onClick={() => { setOverviewError(null); generateOverviewPdf(); }}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    Réessayer
                                </button>
                            )}
                            <button
                                onClick={goToEditor}
                                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-ios rounded-lg hover:bg-ios-dark transition-colors"
                            >
                                <Pencil className="w-4 h-4" />
                                Ouvrir l'éditeur
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900">
                        <Loader2 className="w-8 h-8 animate-spin" />
                        <span className="text-sm">Génération de l'aperçu…</span>
                    </div>
                )}
            </div>

            {/* Repli mobile : ouvrir le PDF en plein écran */}
            {overviewSrc && (
                <div className="mt-3 text-center sm:hidden">
                    <a
                        href={overviewSrc}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-4 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg"
                    >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Ouvrir en plein écran
                    </a>
                </div>
            )}

            {renderDocumentActionModals()}
        </>
    );
};

export default PdfOverview;
