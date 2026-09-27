import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase';

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

    // Contexte du devis parent d'un avenant.
    const loadParentQuoteData = async (parentQuoteId) => {
        const { data: parentData } = await supabase
            .from('quotes')
            .select('id, total_ttc, total_ht, items, date, title, quote_number, status')
            .eq('id', parentQuoteId)
            .single();

        if (parentData) {
            // Un avenant COMPLÈTE le devis (modèle additif), il ne le remplace pas.
            // On distingue donc, parmi les factures rattachées au devis :
            //  - les vraies situations d'avancement (facturation par tranches qui
            //    remplace le devis comme base de calcul) → progress_total ;
            //  - les simples acomptes déjà versés → deposit_total, à DÉDUIRE du
            //    solde, en gardant le devis initial comme référence.
            // Sans cette distinction, un acompte (ex. acompte matériel) était pris
            // pour une situation et faussait le « Nouveau Total Projet » de l'avenant.
            const { data: childInvoices } = await supabase
                .from('quotes')
                .select('total_ttc, title, amendment_details')
                .eq('parent_id', parentQuoteId)
                .eq('type', 'invoice')
                .neq('status', 'cancelled');

            const isSituationInv = (inv) =>
                inv.amendment_details?.situation || /situation/i.test(inv.title || '');
            const isClosingInv = (inv) => /cl[oô]ture/i.test(inv.title || '');

            let progressTotal = 0;
            let depositTotal = 0;
            (childInvoices || []).forEach((inv) => {
                if (isClosingInv(inv)) return; // ni situation ni acompte
                if (isSituationInv(inv)) progressTotal += inv.total_ttc || 0;
                else depositTotal += inv.total_ttc || 0;
            });

            setFormData(prev => ({
                ...prev,
                parent_quote_data: {
                    ...parentData,
                    progress_total: progressTotal,
                    deposit_total: depositTotal
                }
            }));
        }
    };

    const handleCreateAvenant = async () => {
        const avenantTitle = window.prompt("Titre de l'avenant (ex: Ajout prises électriques) ?", `Avenant au devis - ${formData.title}`);
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
                parent_id: parseInt(id, 10),
                parent_quote_id: parseInt(id, 10),
                items: [],
                notes: `Avenant au devis n°${id} (${formData.title})\n\nCet avenant vient compléter le devis initial.`,
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

            toast.success("Avenant créé avec succès !");
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
