import { Plus, Mic, Layers, X, Sparkles, Info, ShoppingCart, HelpCircle, Truck, ClipboardPaste, MinusCircle, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { supplyEntries } from '../../utils/quoteInternalDetail';
import { buildPriceCheckList, isPriceToCheck } from '../../utils/quoteMethod';
import { OverflowMenu } from '../../components/ui';

/**
 * Boutons d'ajout sous les lignes et légende des types. En vue : main
 * d'œuvre, matériel, dictée, déduction d'avenant et IA. Section, collage
 * d'un tableau, commandes et prix à relever sont rangés dans « ⋯ ».
 */
const ItemsToolbar = ({
    addItem,
    addSection,
    dismissHelp,
    dismissedHelps,
    formData,
    isLocked,
    openCsvPasteModal,
    setShowAIModal,
    setShowDeductionModal,
    setShowItemTypesHelp,
    setShowSmartVoice,
    setShowSupplierListModal,
    setShowSupplyModal,
    setVoiceContext,
    showItemTypesHelp,
}) => {
    // Fournitures au prix estimé ou ancien (note interne « À relever ») : la
    // liste se copie à tout moment, pour les re-relever avant l'envoi.
    const priceCheckCount = (formData.items || []).filter(isPriceToCheck).length;
    const hasSupplies = supplyEntries(formData.items).length > 0;
    const copyPriceCheck = async () => {
        try {
            await navigator.clipboard.writeText(buildPriceCheckList(formData.items, { title: formData.title }));
            toast.success('Liste des prix à relever copiée');
        } catch {
            toast.error('Copie impossible sur cet appareil.');
        }
    };

    return (
        <>
                <div className="mt-4 flex flex-wrap gap-2">
                    <button
                        onClick={() => addItem('service')}
                        className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-100 transition-colors disabled:opacity-50"
                        disabled={isLocked}
                        title="Votre temps de travail : pose, installation, déplacement, diagnostic..."
                    >
                        <Plus className="w-4 h-4" />
                        Main d'œuvre
                    </button>

                    <button
                        onClick={() => addItem('material')}
                        className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-800 hover:bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-100 transition-colors disabled:opacity-50"
                        disabled={isLocked}
                        title="Fournitures et pièces : câbles, raccords, carrelage, peinture... Les matériaux que vous achetez pour le chantier."
                    >
                        <Plus className="w-4 h-4" />
                        Matériel
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            setVoiceContext('quote_item');
                            setShowSmartVoice(true);
                        }}
                        className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 px-3 py-1.5 rounded-lg border border-indigo-100 transition-colors disabled:opacity-50"
                        disabled={isLocked}
                        title="Dictez la ligne : « Pose de 10 prises à 45 euros », « 50 mètres de câble à 1,20 euro le mètre »…"
                    >
                        <Mic className="w-4 h-4" />
                        Dicter une ligne
                    </button>

                    {/* Avenant : reprendre en négatif des prestations du devis initial
                        non réalisées, sans les ressaisir à la main. */}
                    {formData.type === 'amendment' && (
                        <button
                            type="button"
                            onClick={() => setShowDeductionModal(true)}
                            className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1.5 rounded-lg border border-red-100 dark:border-red-900/40 transition-colors disabled:opacity-50"
                            disabled={isLocked || !formData.parent_quote_data?.items?.length}
                            title={formData.parent_quote_data?.items?.length
                                ? "Sélectionnez les prestations du devis initial qui ne seront pas réalisées : elles sont reprises en négatif sur l'avenant."
                                : "Le devis initial n'est pas chargé ou ne contient aucune ligne."}
                        >
                            <MinusCircle className="w-4 h-4" />
                            Déduire du devis initial
                        </button>
                    )}

                    <OverflowMenu
                        size="sm"
                        width="w-72"
                        iconClassName="w-4 h-4"
                        label="Plus d'options pour les lignes"
                        badge={priceCheckCount > 0 ? priceCheckCount : null}
                        className="self-center"
                        items={[
                            {
                                label: 'Ajouter une section',
                                description: 'Titre de groupe pour organiser les lignes (Cuisine, Salle de bain…)',
                                icon: Layers,
                                disabled: isLocked,
                                onClick: addSection,
                            },
                            {
                                label: 'Coller un tableau',
                                description: 'Cellules copiées depuis Excel ou un CSV',
                                icon: ClipboardPaste,
                                disabled: isLocked,
                                onClick: () => openCsvPasteModal(),
                            },
                            { divider: true },
                            hasSupplies && {
                                label: 'Commander le matériel',
                                description: "Envoie les fournitures du devis vers votre liste d'achats",
                                icon: ShoppingCart,
                                iconClassName: 'text-green-600',
                                onClick: () => setShowSupplyModal(true),
                            },
                            hasSupplies && {
                                label: 'Liste fournisseur',
                                description: 'Le matériel sans vos prix de vente, à envoyer au fournisseur',
                                icon: Truck,
                                iconClassName: 'text-blue-600',
                                onClick: () => setShowSupplierListModal(true),
                            },
                            priceCheckCount > 0 && {
                                label: priceCheckCount > 1 ? `Copier les ${priceCheckCount} prix à relever` : 'Copier le prix à relever',
                                description: 'Fournitures au prix estimé ou ancien, à vérifier avant l\'envoi',
                                icon: ClipboardList,
                                iconClassName: 'text-orange-600',
                                onClick: copyPriceCheck,
                            },
                        ]}
                    />

                    <button
                        onClick={() => setShowAIModal(true)}
                        className="flex items-center gap-1.5 text-sm font-medium text-purple-600 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg border border-purple-100 shadow-sm transition-all disabled:opacity-50 ml-auto"
                        disabled={isLocked}
                    >
                        <Sparkles className="w-3.5 h-3.5" />
                        Générer avec l'IA
                    </button>

                    {!dismissedHelps.item_types && (
                        <>
                            <button
                                type="button"
                                onClick={() => setShowItemTypesHelp(prev => !prev)}
                                aria-expanded={showItemTypesHelp}
                                aria-label="Aide sur les types de lignes"
                                title="Main d'œuvre, Matériel, Section, HT… c'est quoi ?"
                                className={`self-center p-1 rounded-full transition-colors ${showItemTypesHelp ? 'text-ios' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                            >
                                <HelpCircle className="w-4 h-4" />
                            </button>
                            {showItemTypesHelp && (
                                <button
                                    type="button"
                                    onClick={() => dismissHelp('item_types')}
                                    aria-label="Ne plus afficher cette aide"
                                    title="J'ai compris — ne plus afficher cette aide"
                                    className="self-center p-0.5 rounded-full text-gray-300 hover:text-red-500 transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </>
                    )}
                </div>

                {/* Légende pour les débutants — repliée derrière le « ? » ci-dessus */}
                {showItemTypesHelp && !dismissedHelps.item_types && (
                    <p className="mt-3 text-xs text-gray-400 flex items-start gap-1.5">
                        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span>
                            <strong className="text-gray-500 dark:text-gray-400">Main d'œuvre</strong> = votre temps de travail ·{' '}
                            <strong className="text-gray-500 dark:text-gray-400">Matériel</strong> = fournitures achetées ·{' '}
                            <strong className="text-gray-500 dark:text-gray-400">Section</strong> = titre de regroupement (facultatif) ·{' '}
                            <strong className="text-gray-500 dark:text-gray-400">HT</strong> = hors taxes — la TVA est ajoutée automatiquement en bas ·{' '}
                            <strong className="text-gray-500 dark:text-gray-400">🔒 Chiffrage interne</strong> = le détail privé d'une ligne groupée (fournitures, note) — jamais montré au client
                        </span>
                    </p>
                )}
        </>
    );
};

export default ItemsToolbar;
