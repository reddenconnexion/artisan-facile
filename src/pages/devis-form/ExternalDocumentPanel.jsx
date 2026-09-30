import { FileText, Eye, ExternalLink } from 'lucide-react';

/**
 * Document externe (PDF importé brut) : aperçu et totaux saisis à la main.
 */
const ExternalDocumentPanel = ({
    displayPdfUrl,
    formData,
    setFormData,
}) => {
    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
                    <FileText className="w-5 h-5 mr-2 text-blue-600" />
                    Document Externe (PDF)
                </h3>
                <button
                    onClick={() => setFormData(prev => ({ ...prev, is_external: false, original_pdf_url: null }))}
                    className="text-sm text-red-600 hover:text-red-800"
                >
                    Supprimer / Revenir au mode standard
                </button>
            </div>

            {displayPdfUrl && (
                <div className="mb-8 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-900 dark:bg-gray-800">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 dark:text-gray-300">
                            <Eye className="w-4 h-4 text-blue-500" />
                            Aperçu du document importé
                        </div>
                        <a
                            href={displayPdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Nouvel onglet
                        </a>
                    </div>
                    <div className="h-[550px] bg-gray-200 dark:bg-gray-950">
                        <iframe
                            src={displayPdfUrl}
                            title="Aperçu document importé"
                            className="w-full h-full border-0"
                            style={{ background: '#525659' }}
                        />
                    </div>
                    {/* Mobile fallback */}
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-center sm:hidden">
                        <a
                            href={displayPdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center px-4 py-2 bg-ios text-white text-sm font-medium rounded-lg hover:bg-ios-dark transition-colors"
                        >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Ouvrir le PDF
                        </a>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-gray-50 dark:bg-gray-800 p-6 rounded-2xl">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Total HT</label>
                    <div className="relative">
                        <input
                            type="number"
                            step="0.01"
                            className="block w-full pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-ios focus:border-ios dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                            value={formData.manual_total_ht}
                            onChange={(e) => setFormData(prev => ({ ...prev, manual_total_ht: parseFloat(e.target.value) || 0 }))}
                        />
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                            <span className="text-gray-500 dark:text-gray-400 sm:text-sm">€</span>
                        </div>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Total TVA</label>
                    <div className="relative">
                        <input
                            type="number"
                            step="0.01"
                            className="block w-full pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-ios focus:border-ios dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                            value={formData.manual_total_tva}
                            onChange={(e) => setFormData(prev => ({ ...prev, manual_total_tva: parseFloat(e.target.value) || 0 }))}
                        />
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                            <span className="text-gray-500 dark:text-gray-400 sm:text-sm">€</span>
                        </div>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Total TTC</label>
                    <div className="relative">
                        <input
                            type="number"
                            step="0.01"
                            className="block w-full pl-3 pr-8 py-2 border border-blue-300 dark:border-blue-800 rounded-lg focus:ring-ios focus:border-ios bg-blue-50 dark:bg-blue-900/20 font-bold text-blue-900 dark:text-blue-100"
                            value={formData.manual_total_ttc}
                            onChange={(e) => setFormData(prev => ({ ...prev, manual_total_ttc: parseFloat(e.target.value) || 0 }))}
                        />
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                            <span className="text-gray-500 dark:text-gray-400 sm:text-sm">€</span>
                        </div>
                    </div>
                </div>
            </div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 italic">
                * Saisissez les montants manuellement car ils ne sont pas calculés automatiquement depuis le PDF.
            </p>
        </div>
    );
};

export default ExternalDocumentPanel;
