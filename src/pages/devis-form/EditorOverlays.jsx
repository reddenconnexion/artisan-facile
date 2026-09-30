import { ArrowLeft, Save, Send } from 'lucide-react';

/**
 * Éditeur plein écran de la description d'une ligne (mobile).
 */
export const FullScreenItemEditor = ({
    applyLibraryItem,
    item,
    priceLibrary,
    setFullScreenEditItem,
    updateItem,
}) => {
    return (
        <div className="fixed inset-0 z-[100] bg-white dark:bg-gray-900 flex flex-col animate-in slide-in-from-bottom duration-200">
            {/* --- Items Table --- */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 shadow-sm bg-white dark:bg-gray-900 safe-area-top">
                <button
                    onClick={() => setFullScreenEditItem(null)}
                    className="text-gray-500 dark:text-gray-400 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
                >
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <h3 className="font-semibold text-lg">Description</h3>
                <button
                    onClick={() => setFullScreenEditItem(null)}
                    className="text-blue-600 font-medium px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100"
                >
                    Valider
                </button>
            </div>

            {/* Suggestions Area (Sticky under header) */}
            {(() => {
                const matches = priceLibrary.filter(lib =>
                    lib.description.toLowerCase().includes((item.description || '').toLowerCase())
                ).slice(0, 10);

                if (matches.length > 0) {
                    return (
                        <div className="bg-blue-50/50 border-b border-blue-100 overflow-x-auto">
                            <div className="flex p-3 gap-3">
                                {matches.map(lib => (
                                    <button
                                        key={lib.id}
                                        onClick={() => applyLibraryItem(item.id, lib, { withDescription: true })}
                                        className="flex-shrink-0 bg-white dark:bg-gray-900 border border-blue-200 rounded-lg px-4 py-2 text-left shadow-sm min-w-[200px]"
                                    >
                                        <div className="font-medium text-blue-900 truncate">{lib.description}</div>
                                        <div className="text-blue-500 text-xs">{lib.price} €</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                }
                return null;
            })()}

            {/* Text Area */}
            <div className="flex-1 p-4 relative bg-white dark:bg-gray-900">
                <textarea
                    className="w-full h-full text-lg resize-none outline-none bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 font-sans leading-relaxed"
                    placeholder="Saisissez la description détaillée..."
                    value={item.description}
                    onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                    autoFocus
                />

            </div>
        </div>
    );
};

/**
 * Barre collante mobile — Envoyer + Enregistrer.
 */
export const MobileActionBar = ({
    handleSendQuoteEmail,
    handleSubmit,
    loading,
}) => {
    return (
        <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 px-4 py-3 flex gap-3 safe-area-bottom">
            <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-2xl font-semibold text-sm disabled:opacity-50 active:bg-gray-100"
            >
                <Save className="w-4 h-4" />
                {loading ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button
                type="button"
                onClick={() => handleSendQuoteEmail('fr')}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-white bg-ios rounded-2xl font-semibold text-sm disabled:opacity-50 active:bg-blue-700"
            >
                <Send className="w-4 h-4" />
                Envoyer
            </button>
        </div>
    );
};

/**
 * Animation de succès après envoi au client.
 */
export const SendSuccessOverlay = () => {
    return (
        <div className="fixed inset-0 z-[300] pointer-events-none">
            <div className="animate-send-success flex flex-col items-center gap-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl px-10 py-8 border border-gray-100 dark:border-gray-800">
                <div className="animate-circle-pop w-20 h-20 rounded-full bg-green-50 dark:bg-green-900/20 dark:bg-green-900/30 flex items-center justify-center">
                    <svg viewBox="0 0 50 50" width="50" height="50" fill="none">
                        <circle cx="25" cy="25" r="20" stroke="#22c55e" strokeWidth="2.5" />
                        <polyline
                            points="14,26 22,34 36,17"
                            stroke="#22c55e"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="animate-check-draw"
                        />
                    </svg>
                </div>
                <p className="text-lg font-bold text-gray-900 dark:text-white">Envoyé au client !</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Application de messagerie ouverte</p>
            </div>
        </div>
    );
};
