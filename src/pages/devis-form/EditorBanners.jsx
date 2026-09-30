import { Layers, Mail, X, ExternalLink, Lock, Unlock } from 'lucide-react';

/**
 * Bandeau « signature suspendue » — rendu à l'identique dans l'éditeur et
 * dans l'aperçu PDF.
 */
export const SuspendedSignatureBanner = ({
    handleNotifyWithdrawal,
    handleToggleSignatureSuspension,
    togglingSuspension,
}) => {
    return (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 mb-6 flex items-start gap-3">
            <div className="p-1 bg-orange-100 dark:bg-orange-900/40 rounded-full text-orange-600 shrink-0">
                <Lock className="w-4 h-4" />
            </div>
            <div className="flex-1">
                <h4 className="text-sm font-semibold text-orange-800 dark:text-orange-300">Signature suspendue</h4>
                <p className="text-sm text-orange-700 dark:text-orange-400 mt-1">
                    Le lien envoyé au client ne s’ouvre plus et ne peut pas être signé.
                    Le document reste modifiable ; rouvrez la signature quand il est prêt.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={handleToggleSignatureSuspension}
                        disabled={togglingSuspension}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg transition-colors"
                    >
                        <Unlock className="w-4 h-4" />
                        {togglingSuspension ? 'Réouverture…' : 'Rouvrir la signature'}
                    </button>
                    {/* Le client ne voit rien tant qu'il ne rouvre pas le lien —
                        et il a peut-être déjà imprimé le PDF. Le prévenir est la
                        seule action qui vaut hors de l'application. */}
                    <button
                        type="button"
                        onClick={handleNotifyWithdrawal}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-orange-800 dark:text-orange-300 bg-white dark:bg-gray-900 border border-orange-300 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg transition-colors"
                    >
                        <Mail className="w-4 h-4" />
                        Prévenir le client
                    </button>
                </div>
            </div>
        </div>
    );
};

/**
 * Bandeau contre-proposition — affiché tant que l'artisan ne l'a pas masqué.
 */
export const CompetitorImportBanner = ({
    competitorImport,
    formData,
    setCompetitorImport,
}) => {
    return (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-800/40 rounded-2xl p-4 mb-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-blue-900 dark:text-blue-200">
                    Contre-proposition à partir de {competitorImport.filename}
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300 dark:text-blue-300/90 mt-1 leading-relaxed">
                    Les lignes du devis concurrent ont été importées. Ajustez les prix unitaires pour proposer
                    une offre compétitive — pensez à utiliser le Copilot (✨ en bas à droite) pour vérifier vos
                    marges ou suggérer un prix.
                </p>
                {formData.original_pdf_url && (
                    <a
                        href={formData.original_pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-300 hover:underline mt-2"
                    >
                        <ExternalLink className="w-3 h-3" />
                        Ouvrir le devis original
                    </a>
                )}
            </div>
            <button
                type="button"
                onClick={() => setCompetitorImport(null)}
                className="p-1 text-blue-400 hover:text-blue-700 dark:hover:text-blue-200 rounded flex-shrink-0"
                title="Masquer ce bandeau"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
};

/**
 * Bandeau de verrouillage (devis envoyé, signé, facturé, payé ou annulé).
 */
export const LockedDocumentBanner = ({
    formData,
    handleCreateAvenant,
    handleUnlockRevision,
}) => {
    return (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
            <div className="p-1 bg-amber-100 rounded-full text-amber-600">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-lock w-4 h-4"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            </div>
            {formData.status === 'sent' ? (
                <div className="flex-1">
                    <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-400">Devis envoyé au client</h4>
                    <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                        La version transmise au client fait foi : les champs sont verrouillés pour éviter
                        toute modification involontaire. Pour le réviser, créez une nouvelle version —
                        la version envoyée restera archivée ci-dessous. Pour des travaux supplémentaires,
                        préférez un avenant.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={handleUnlockRevision}
                            className="px-3 py-1.5 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg"
                        >
                            Modifier (nouvelle version)
                        </button>
                        <button
                            type="button"
                            onClick={handleCreateAvenant}
                            className="px-3 py-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400 bg-white dark:bg-gray-900 border border-amber-300 hover:bg-amber-100 rounded-lg"
                        >
                            Créer un avenant
                        </button>
                    </div>
                </div>
            ) : (
                <div>
                    <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-400">Document Verrouillé</h4>
                    <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                        Ce document est <strong>{formData.status === 'accepted' ? 'signé' : 'clôturé'}</strong>. Pour garantir l'intégrité légale, les modifications sont désactivées.<br />
                        Pour modifier le périmètre, veuillez créer un avenant ou repasser le statut en "Brouillon" (déconseillé si déjà envoyé).
                    </p>
                </div>
            )}
        </div>
    );
};

/**
 * Bandeau d'aide du premier devis — masquable (localStorage).
 */
export const FirstDevisTip = ({
    dismissDevisTip,
}) => {
    return (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 rounded-2xl p-4 mb-6 relative">
            <button
                type="button"
                onClick={dismissDevisTip}
                className="absolute top-3 right-3 p-1 text-blue-300 hover:text-blue-500 rounded transition-colors"
                title="Ne plus afficher"
            >
                <X className="w-4 h-4" />
            </button>
            <div className="flex items-start gap-3 pr-6">
                <span className="text-xl flex-shrink-0">💡</span>
                <div>
                    <p className="text-sm font-semibold text-blue-800 mb-2">Créez votre devis en 3 étapes</p>
                    <ol className="space-y-1.5">
                        <li className="flex items-start gap-2 text-sm text-blue-700 dark:text-blue-300">
                            <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-800 flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5">1</span>
                            <span><strong>Choisissez un client</strong> — recherchez son nom ou cliquez "Nouveau client" juste en dessous</span>
                        </li>
                        <li className="flex items-start gap-2 text-sm text-blue-700 dark:text-blue-300">
                            <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-800 flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5">2</span>
                            <span><strong>Ajoutez vos prestations</strong> — cliquez "+ Main d'œuvre" pour votre travail, "+ Matériel" pour vos fournitures</span>
                        </li>
                        <li className="flex items-start gap-2 text-sm text-blue-700 dark:text-blue-300">
                            <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-800 flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5">3</span>
                            <span><strong>Envoyez et faites signer</strong> — votre client reçoit un lien et signe directement depuis son téléphone</span>
                        </li>
                    </ol>
                </div>
            </div>
        </div>
    );
};
