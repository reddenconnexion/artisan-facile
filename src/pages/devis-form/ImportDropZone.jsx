import { Upload, Loader2, X, HelpCircle } from 'lucide-react';

/**
 * Zone d'import PDF / Word / CSV (nouveau devis uniquement).
 */
const ImportDropZone = ({
    dismissHelp,
    dismissedHelps,
    fileInputRef,
    importing,
    isDragOver,
    openCsvPasteModal,
    processImportedFile,
    setIsDragOver,
    setShowCsvFormatHelp,
    setShowImportZone,
    showCsvFormatHelp,
}) => {
    return (
        <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) processImportedFile(file);
            }}
            className={`relative mb-6 rounded-2xl border-2 border-dashed transition-colors cursor-pointer
                        ${isDragOver
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:border-blue-400 hover:bg-blue-50/40'
                }`}
            onClick={() => fileInputRef.current?.click()}
        >
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowImportZone(false); }}
                className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                title="Masquer"
            >
                <X className="w-4 h-4" />
            </button>
            <div className="flex flex-col items-center justify-center gap-3 py-8 px-4 text-center select-none">
                {importing ? (
                    <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                ) : (
                    <Upload className={`w-10 h-10 ${isDragOver ? 'text-blue-500' : 'text-gray-400'}`} />
                )}
                <div>
                    <p className="font-semibold text-gray-700 dark:text-gray-300 dark:text-gray-200">
                        {importing ? 'Traitement en cours…' : 'Importer un devis existant (PDF, Word ou CSV)'}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Déposez le fichier ici, <span className="text-blue-600 underline">parcourez</span>, ou{' '}
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openCsvPasteModal(); }}
                            className="text-blue-600 underline"
                        >
                            collez un tableau
                        </button>
                    </p>
                    {!dismissedHelps.csv_format && (
                        <>
                            <span className="mt-1 inline-flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setShowCsvFormatHelp(prev => !prev); }}
                                    aria-expanded={showCsvFormatHelp}
                                    className={`inline-flex items-center gap-1 text-xs transition-colors ${showCsvFormatHelp ? 'text-ios' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}
                                >
                                    <HelpCircle className="w-3.5 h-3.5" />
                                    Format CSV attendu
                                </button>
                                {showCsvFormatHelp && (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); dismissHelp('csv_format'); }}
                                        aria-label="Ne plus afficher cette aide"
                                        title="J'ai compris — ne plus afficher cette aide"
                                        className="p-0.5 rounded-full text-gray-300 hover:text-red-500 transition-colors"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                )}
                            </span>
                            {showCsvFormatHelp && (
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                    CSV (export Excel) : colonnes <strong>Description</strong>, Quantité, Unité, Prix — et en option Type, Lot/Section, Prix d'achat, Option, Référence/Note interne (privée), Réserve et Notes/Conditions (repris dans les notes du devis)
                                </p>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImportDropZone;
