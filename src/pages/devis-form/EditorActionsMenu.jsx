import { Download, Trash2, Send, Upload, FileText, PenTool, Eye, Star, Loader2, Mail, Link, Lock, Unlock, ClipboardPaste } from 'lucide-react';
import { toast } from 'sonner';
import { publicLinkExpiry } from '../../constants/publicLink';
import { supabase } from '../../utils/supabase';

/**
 * Menu « Plus d'actions » (⋮) de l'éditeur : partage & signature, PDF,
 * documents liés, suppression, avis, imports.
 */
const EditorActionsMenu = ({
    fetchLinkSuspended,
    fileInputRef,
    formData,
    handleDelete,
    handleDownloadPDF,
    handleNotifyWithdrawal,
    handlePreview,
    handleSendQuoteEmail,
    handleToggleSignatureSuspension,
    id,
    importing,
    isCreditNote,
    isDocumentClosed,
    isLocked,
    openCsvPasteModal,
    renderDocumentActions,
    setReviewNavigateOnClose,
    setShowActionsMenu,
    setShowReviewRequestModal,
    setShowSignatureModal,
    signature,
    signatureSuspended,
    suspensionBlockMessage,
    togglingSuspension,
}) => {
    return (
        <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-100 dark:border-gray-800 z-50 py-1">
            {/* ─── Partage & Signature ─── */}
            <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Partage & Signature</p>
            {/* Mobile only Send button */}
            <button
                onClick={() => { handleSendQuoteEmail('fr'); setShowActionsMenu(false); }}
                className="sm:hidden flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
                <Send className="w-4 h-4 mr-3 text-blue-600" />
                {formData.type === 'invoice' ? 'Envoyer la facture' : (isCreditNote ? "Envoyer l'avoir" : 'Envoyer le devis')}
            </button>

            {/* Envoi en anglais (devis/facture + mail traduits) */}
            <button
                onClick={() => { handleSendQuoteEmail('en'); setShowActionsMenu(false); }}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
                <Send className="w-4 h-4 mr-3 text-blue-600" />
                Envoyer en anglais 🇬🇧
            </button>

            {id && formData.public_token && (
                <button
                    onClick={async () => {
                        setShowActionsMenu(false);
                        // Copier prolonge la validité du lien : sur un document
                        // suspendu, ce serait rouvrir la signature à l'insu de
                        // l'artisan qui vient de la fermer.
                        if (await fetchLinkSuspended()) {
                            toast.error(suspensionBlockMessage);
                            return;
                        }
                        const url = `${window.location.origin}/q/${formData.public_token}`;
                        navigator.clipboard.writeText(url);
                        const newExpiry = publicLinkExpiry();
                        const { error: refreshError } = await supabase
                            .from('quotes')
                            .update({ token_revoked: false, token_expires_at: newExpiry })
                            .eq('id', id);
                        if (refreshError) {
                            toast.error('Lien copié, mais la validité n\'a pas pu être prolongée');
                        } else {
                            toast.success('Lien de signature copié !');
                        }
                    }}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                    <Link className="w-4 h-4 mr-3 text-gray-400" />
                    Copier le lien public
                </button>
            )}

            {/* Suspendre / rouvrir la signature — seuls les documents qui
                se signent sont concernés (ni facture, ni avoir), et une
                fois signé il n'y a plus rien à fermer. */}
            {id && id !== 'new' && formData.public_token && !signature
                && formData.status !== 'accepted' && formData.type !== 'invoice' && !isCreditNote && (
                <button
                    onClick={() => { handleToggleSignatureSuspension(); setShowActionsMenu(false); }}
                    disabled={togglingSuspension}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                >
                    {signatureSuspended ? (
                        <>
                            <Unlock className="w-4 h-4 mr-3 text-green-600" />
                            Rouvrir la signature
                        </>
                    ) : (
                        <>
                            <Lock className="w-4 h-4 mr-3 text-amber-600" />
                            Suspendre la signature
                        </>
                    )}
                </button>
            )}

            {id && id !== 'new' && isDocumentClosed && formData.type !== 'invoice' && !isCreditNote && (
                <button
                    onClick={() => { handleNotifyWithdrawal(); setShowActionsMenu(false); }}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                    <Mail className="w-4 h-4 mr-3 text-orange-600" />
                    Prévenir le client du retrait
                </button>
            )}

            {id && !signature && formData.status !== 'accepted' && formData.type !== 'invoice' && !isCreditNote && (
                <button
                    onClick={() => { setShowSignatureModal(true); setShowActionsMenu(false); }}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                    <PenTool className="w-4 h-4 mr-3 text-purple-600" />
                    Faire signer sur l'appareil
                </button>
            )}

            <div className="border-t border-gray-100 dark:border-gray-800 my-1"></div>
            {/* ─── PDF ─── */}
            <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">PDF</p>
            <button
                onClick={() => { handlePreview(); setShowActionsMenu(false); }}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
                <Eye className="w-4 h-4 mr-3 text-gray-400" />
                Aperçu PDF
            </button>

            <button
                onClick={() => { handleDownloadPDF(formData.status === 'accepted'); setShowActionsMenu(false); }}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
                <Download className="w-4 h-4 mr-3 text-gray-400" />
                Télécharger {formData.status === 'accepted' ? 'Facture' : 'Devis'}
            </button>

            {['grouped', 'poste_global'].includes(formData.client_display_mode || 'detailed') && (
                <button
                    onClick={() => { handleDownloadPDF(false, { detailed: true }); setShowActionsMenu(false); }}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    title="Le même document ligne à ligne, pour vous. La présentation du client reste inchangée."
                >
                    <Lock className="w-4 h-4 mr-3 text-amber-600" />
                    Ma copie détaillée
                </button>
            )}

            {renderDocumentActions(() => setShowActionsMenu(false))}

            {id && id !== 'new' && !formData.invoice_number && (
                <>
                    <div className="border-t border-gray-100 dark:border-gray-800 my-1"></div>
                    <button
                        onClick={handleDelete}
                        className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                        <Trash2 className="w-4 h-4 mr-3" />
                        Supprimer
                    </button>
                </>
            )}

            <div className="border-t border-gray-100 dark:border-gray-800 my-1"></div>

            {['accepted', 'paid', 'billed'].includes(formData.status) && (
                <button
                    onClick={() => { setReviewNavigateOnClose(false); setShowReviewRequestModal(true); setShowActionsMenu(false); }}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                    <Star className="w-4 h-4 mr-3 text-yellow-500" />
                    Demander un avis
                </button>
            )}
            {/* ReviewMenu removed as component is missing */}

            <button
                onClick={() => { fileInputRef.current?.click(); setShowActionsMenu(false); }}
                disabled={importing}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
                {importing ? <Loader2 className="w-4 h-4 mr-3 animate-spin" /> : <Upload className="w-4 h-4 mr-3 text-gray-400" />}
                Importer (PDF / Word / CSV)
            </button>

            {/* Devis signé/facturé : ses lignes ne bougent plus (même règle
                que la saisie manuelle) */}
            {!isLocked && (
                <button
                    onClick={() => { openCsvPasteModal(); setShowActionsMenu(false); }}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                    <ClipboardPaste className="w-4 h-4 mr-3 text-blue-600" />
                    Coller un tableau (Excel / CSV)
                </button>
            )}

            <button
                onClick={() => { document.getElementById('external-pdf-input')?.click(); setShowActionsMenu(false); }}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
                <FileText className="w-4 h-4 mr-3 text-purple-600" />
                Importer Externe (Brut)
            </button>

        </div>
    );
};

export default EditorActionsMenu;
