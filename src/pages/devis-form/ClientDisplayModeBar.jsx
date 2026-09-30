import { Download, X, HelpCircle } from 'lucide-react';
import { SegmentedControl } from '../../components/ui';

/**
 * Présentation client : le devis reste détaillé ici (commandes,
 * chantiers) ; « Groupée » / « Poste global » ne changent que le PDF et le
 * lien public.
 */
const ClientDisplayModeBar = ({
    dismissHelp,
    dismissedHelps,
    formData,
    handleDownloadPDF,
    isLocked,
    setFormData,
    setShowGroupedModeHelp,
    showGroupedModeHelp,
}) => {
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-4 -mt-2">
            <span
                className="text-xs font-medium text-gray-500 dark:text-gray-400"
                title="Choisissez ce que le client voit sur le PDF et le lien public. Votre devis reste détaillé ici, pour vos commandes et vos chantiers."
            >
                Présentation pour le client (PDF & lien) :
            </span>
            <SegmentedControl
                options={[
                    { id: 'detailed', label: 'Détaillée' },
                    { id: 'grouped', label: 'Groupée (fournitures par poste)' },
                    { id: 'poste_global', label: 'Poste global (1 ligne / section)' },
                ]}
                value={formData.client_display_mode || 'detailed'}
                onChange={(mode) => { if (!isLocked) setFormData(prev => ({ ...prev, client_display_mode: mode })); }}
            />
            {['grouped', 'poste_global'].includes(formData.client_display_mode || 'detailed') && !dismissedHelps.grouped_mode && (
                <>
                    <button
                        type="button"
                        onClick={() => setShowGroupedModeHelp(prev => !prev)}
                        aria-expanded={showGroupedModeHelp}
                        aria-label="Aide sur la présentation client"
                        title="Comment fonctionne cette présentation ?"
                        className={`p-0.5 rounded-full transition-colors ${showGroupedModeHelp ? 'text-ios' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                    >
                        <HelpCircle className="w-4 h-4" />
                    </button>
                    {showGroupedModeHelp && (
                        <button
                            type="button"
                            onClick={() => dismissHelp('grouped_mode')}
                            aria-label="Ne plus afficher cette aide"
                            title="J'ai compris — ne plus afficher cette aide"
                            className="p-0.5 rounded-full text-gray-300 hover:text-red-500 transition-colors"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    )}
                    {showGroupedModeHelp && (formData.client_display_mode === 'poste_global' ? (
                        <span className="text-xs text-gray-400 w-full">
                            Chaque section (Lot) est réduite à <strong>un poste fournitures</strong> (libellé + un seul total) et <strong>une ligne main d'œuvre</strong>.
                            Les éléments vendus à l'unité (prises, spots, points lumineux) restent quantifiés — cochez « à l'unité » sur la ligne pour l'ajuster. Les options restent listées séparément.
                            La fusion et le total sont calculés <strong>côté serveur</strong> : aucun composant, quantité, prix d'achat ni référence ne part chez le client. Votre détail reste intact ici 🔒.
                        </span>
                    ) : (
                        <span className="text-xs text-gray-400 w-full">
                            Chaque ligne fourniture s'affiche avec sa désignation et <strong>un seul montant</strong> — sans quantités ni prix unitaires.
                            Rédigez la désignation pour qu'elle décrive le contenu : « Tableau 4 rangées précâblé comprenant parafoudre, 4 inter diff et 25 disjoncteurs », « 12 spots LED encastrés »…
                            La main d'œuvre reste détaillée, et le détail exact (réfs, quantités) garde sa place dans le chiffrage interne 🔒.
                        </span>
                    ))}
                </>
            )}
            {/* Copie interne : le devis ligne à ligne, pour soi. Reste
                proposée une fois le devis verrouillé (accepté, facturé,
                payé) — c'est justement là qu'on en a besoin pour
                commander et suivre le chantier. */}
            {['grouped', 'poste_global'].includes(formData.client_display_mode || 'detailed') && (
                <button
                    type="button"
                    onClick={() => handleDownloadPDF(false, { detailed: true })}
                    title="Télécharge le même document en version ligne à ligne, pour vous (commandes, chantier). La présentation du client n'est pas modifiée."
                    className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 rounded-full px-2.5 py-1 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                >
                    <Download className="w-3.5 h-3.5" />
                    Ma copie détaillée
                </button>
            )}
        </div>
    );
};

export default ClientDisplayModeBar;
