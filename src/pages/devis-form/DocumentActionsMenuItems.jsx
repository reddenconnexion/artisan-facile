import { FileText, Check, FileCheck, Layers } from 'lucide-react';

/**
 * Entrées « Documents liés » (facturation, acompte, situation, clôture,
 * avenant, avoir) — partagées par le menu « … » de l'éditeur et le menu
 * « Documents » de l'aperçu PDF : une seule source de vérité pour leurs
 * conditions d'affichage.
 */
const DocumentActionsMenuItems = ({
    canConvertToInvoice,
    canCreateCreditNote,
    canCreateLinkedDocs,
    closeMenu,
    handleConvertToInvoice,
    handleCreateAvenant,
    handleCreateClosingInvoice,
    handleCreateDeposit,
    handleCreateMaterialDeposit,
    handleCreateSituation,
    openCreditNoteModal,
}) => {
    return (
        <>
            {canConvertToInvoice && (
                <>
                    <div className="border-t border-gray-100 dark:border-gray-800 my-1 first:hidden"></div>
                    <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Facturation</p>
                    <button
                        onClick={() => { handleConvertToInvoice(); closeMenu(); }}
                        className="flex items-center w-full px-4 py-2 text-sm text-emerald-700 dark:text-green-400 hover:bg-emerald-50"
                    >
                        <FileCheck className="w-4 h-4 mr-3 text-emerald-600" />
                        Convertir en facture
                    </button>
                </>
            )}

            {canCreateLinkedDocs && (
                <>
                    <div className="border-t border-gray-100 dark:border-gray-800 my-1 first:hidden"></div>
                    <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Documents liés</p>
                    <button
                        onClick={() => { handleCreateAvenant(); closeMenu(); }}
                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                        <FileText className="w-4 h-4 mr-3 text-indigo-600" />
                        Créer un avenant
                    </button>
                    <button
                        onClick={() => { handleCreateDeposit(); closeMenu(); }}
                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 bg-blue-50/50"
                    >
                        <FileCheck className="w-4 h-4 mr-3 text-blue-600" />
                        Générer Facture d'Acompte
                    </button>
                    <button
                        onClick={() => { handleCreateMaterialDeposit(); closeMenu(); }}
                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 bg-orange-50/50"
                    >
                        <FileCheck className="w-4 h-4 mr-3 text-orange-600" />
                        Générer Acompte Matériel
                    </button>
                    <button
                        onClick={() => { handleCreateSituation(); closeMenu(); }}
                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 bg-purple-50/50"
                    >
                        <Layers className="w-4 h-4 mr-3 text-purple-600" />
                        Créer Situation de Travaux
                    </button>
                    <button
                        onClick={() => { handleCreateClosingInvoice(); closeMenu(); }}
                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 bg-green-50/50"
                    >
                        <Check className="w-4 h-4 mr-3 text-green-600" />
                        Générer Facture de Clôture
                    </button>
                </>
            )}

            {canCreateCreditNote && (
                <>
                    <div className="border-t border-gray-100 dark:border-gray-800 my-1 first:hidden"></div>
                    <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Rectification</p>
                    <button
                        onClick={() => { openCreditNoteModal(); closeMenu(); }}
                        className="flex items-center w-full px-4 py-2 text-sm text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                        <FileText className="w-4 h-4 mr-3 text-red-500" />
                        Créer un avoir
                    </button>
                </>
            )}
        </>
    );
};

export default DocumentActionsMenuItems;
