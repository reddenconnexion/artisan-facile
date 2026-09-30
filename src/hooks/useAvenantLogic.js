import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase';
import { nextAmendmentIndex, amendmentLabel, isAmendmentRow } from '../utils/amendmentIndex';
import { amendmentParentContext } from '../utils/amendmentBilling';

/**
 * Logique propre aux avenants dans la fiche devis (DevisForm) :
 *   - création d'un avenant depuis le devis initial ;
 *   - chargement du contexte du devis parent (total initial, situations et
 *     acomptes déjà facturés) dans `formData.parent_quote_data` ;
 *   - déduction des prestations du devis initial qui ne seront pas réalisées.
 *
 * Le récapitulatif « Nouveau total projet » se calcule avec
 * amendmentProjectTotals (utils/amendmentBilling.js).
 */
export const useAvenantLogic = ({
    id,
    formData,
    setFormData,
    user,
    clients,
    navigate,
    setLoading,
    setShowActionsMenu,
}) => {
    const [showDeductionModal, setShowDeductionModal] = useState(false);

    // Contexte du devis parent d'un avenant : total initial, situations et
    // acomptes facturés, avenants précédents signés (amendmentParentContext).
    const loadParentQuoteData = async (parentQuoteId, currentId = null) => {
        const { data: parentData } = await supabase
            .from('quotes')
            .select('id, total_ttc, total_ht, items, date, title, quote_number, status')
            .eq('id', parentQuoteId)
            .single();

        if (parentData) {
            const { data: children } = await supabase
                .from('quotes')
                .select('id, type, status, total_ttc, title, amendment_details, parent_quote_id')
                .eq('parent_id', parentQuoteId)
                .in('type', ['invoice', 'amendment']);

            const ctx = amendmentParentContext(children, currentId);

            setFormData(prev => ({
                ...prev,
                parent_quote_data: {
                    ...parentData,
                    progress_total: ctx.progressTotal,
                    deposit_total: ctx.depositTotal,
                    previous_amendments_total: ctx.previousAmendmentsTTC,
                    previous_amendments_billed: ctx.previousAmendmentsBilledTTC,
                    previous_amendments_count: ctx.previousAmendmentsCount,
                }
            }));
        }
    };

    const handleCreateAvenant = async () => {
        // Un avenant se rattache toujours au devis initial. Le bandeau « Devis
        // envoyé » propose aussi « Créer un avenant » sur un avenant envoyé :
        // on remonte alors au devis parent, sinon le nouvel avenant serait
        // l'enfant du premier et la numérotation repartirait de 1.
        const rootId = parseInt(formData.parent_id || id, 10);
        const root = formData.parent_id ? (formData.parent_quote_data || {}) : formData;
        const rootTitle = root.title || formData.title;
        const rootRef = root.quote_number || rootId;

        // Un avenant existe déjà sur ce devis → le nouveau est numéroté (n°2, n°3…).
        const { data: existingAmendments, error: existingError } = await supabase
            .from('quotes')
            .select('id, type, amendment_details, parent_quote_id')
            .eq('parent_id', rootId)
            .in('type', ['amendment', 'invoice']);
        if (existingError) {
            console.error('Error loading existing amendments:', existingError);
            toast.error("Impossible de vérifier les avenants existants");
            return;
        }
        // Un avenant déjà converti en facture reste compté (isAmendmentRow).
        const amendmentIndex = nextAmendmentIndex((existingAmendments || []).filter(isAmendmentRow));
        const label = amendmentLabel(amendmentIndex);

        const avenantTitle = window.prompt("Titre de l'avenant (ex: Ajout prises électriques) ?", `${label} au devis - ${rootTitle}`);
        if (!avenantTitle) return;

        try {
            setLoading(true);

            const avenantData = {
                user_id: user.id,
                client_id: formData.client_id,
                client_name: clients.find(c => c.id.toString() === formData.client_id.toString())?.name || 'Client',
                title: avenantTitle,
                date: new Date().toISOString().split('T')[0],
                status: 'draft',
                type: 'amendment', // Correct type
                parent_id: rootId,
                parent_quote_id: rootId,
                items: [],
                amendment_details: { amendment_index: amendmentIndex },
                notes: `${label} au devis n°${rootRef} (${rootTitle})\n\nCet avenant vient compléter le devis initial.`,
                include_tva: formData.include_tva,
                total_ht: 0,
                total_tva: 0,
                total_ttc: 0
            };

            const { data, error } = await supabase
                .from('quotes')
                .insert([avenantData])
                .select()
                .single();

            if (error) throw error;

            toast.success(`${label} créé avec succès !`);
            navigate(`/app/devis/${data.id}`);
            setShowActionsMenu(false);

        } catch (error) {
            console.error('Error creating avenant:', error);
            toast.error("Erreur lors de la création de l'avenant");
        } finally {
            setLoading(false);
        }
    };

    // Avenant : ajoute en négatif les prestations du devis initial qui ne
    // seront pas réalisées (lignes construites par buildDeductionItems).
    const handleAddDeductionItems = ({ items: deductionItems, totalHT, count }) => {
        setFormData(prev => ({ ...prev, items: [...prev.items, ...deductionItems] }));
        toast.success(`${count} prestation${count > 1 ? 's' : ''} déduite${count > 1 ? 's' : ''} du devis initial (${totalHT.toFixed(2)} € HT).`);
    };

    return {
        showDeductionModal,
        setShowDeductionModal,
        loadParentQuoteData,
        handleCreateAvenant,
        handleAddDeductionItems,
    };
};
