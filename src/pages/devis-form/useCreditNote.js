import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../utils/supabase';
import { buildCreditNotePayload } from '../../utils/creditNote';

/**
 * Avoir (facture rectificative) sur une facture émise : modale et création.
 */
export const useCreditNote = ({
    formData,
    id,
    invalidateQuotes,
    navigate,
    selectedClient,
    setShowActionsMenu,
    total,
    user,
}) => {
    // Modal de création d'avoir depuis une facture émise
    const [creditNoteModal, setCreditNoteModal] = useState(null); // null | { mode, amountTTC, reason, saving, existing }

    // Ouvre la modal d'avoir en chargeant les avoirs déjà émis sur cette
    // facture (plusieurs avoirs partiels sont légitimes ; un second avoir
    // total est presque toujours une erreur — on prévient sans bloquer).
    const openCreditNoteModal = async () => {
        setShowActionsMenu(false);
        let existing = [];
        try {
            const { data } = await supabase
                .from('quotes')
                .select('id, invoice_number, total_ttc, date')
                .eq('parent_id', id)
                .eq('type', 'credit_note');
            existing = data || [];
        } catch (e) {
            console.error('Error loading existing credit notes:', e);
        }
        setCreditNoteModal({ mode: 'total', amountTTC: '', reason: '', saving: false, existing });
    };

    const handleCreateCreditNote = async () => {
        if (!creditNoteModal || creditNoteModal.saving) return;
        try {
            const payload = buildCreditNotePayload(
                { ...formData, id: parseInt(id, 10), total_ttc: total },
                {
                    mode: creditNoteModal.mode,
                    amountTTC: parseFloat(String(creditNoteModal.amountTTC).replace(',', '.')),
                    reason: creditNoteModal.reason,
                },
            );

            setCreditNoteModal(prev => ({ ...prev, saving: true }));

            const { data: created, error } = await supabase
                .from('quotes')
                .insert([{
                    ...payload,
                    user_id: user.id,
                    client_id: formData.client_id,
                    client_name: selectedClient?.name || formData.client_name || 'Client',
                    intervention_address: formData.intervention_address,
                    intervention_postal_code: formData.intervention_postal_code,
                    intervention_city: formData.intervention_city,
                }])
                .select('id, invoice_number')
                .single();

            if (error) throw error;

            // Un avoir TOTAL annule la facture : elle doit cesser d'être comptée.
            // Sans ce marquage, la facture de clôture continuait de déduire un
            // acompte annulé (elle ne retient que les enfants du devis, et un
            // avoir s'accroche à la facture, pas au devis) — le client était
            // crédité d'un montant qu'il n'avait jamais réglé. Le numéro reste
            // figé par le trigger : la séquence légale garde sa trace.
            if (creditNoteModal.mode === 'total') {
                const { error: cancelError } = await supabase
                    .from('quotes')
                    .update({ status: 'cancelled' })
                    .eq('id', parseInt(id, 10));
                if (cancelError) {
                    console.error('Error cancelling credited invoice:', cancelError);
                    toast.warning(`Avoir ${created.invoice_number || ''} émis, mais la facture n'a pas pu être marquée annulée — faites-le à la main pour qu'elle ne soit plus déduite.`);
                }
            }

            toast.success(`Avoir ${created.invoice_number || ''} émis — pensez à l'envoyer au client`.replace('  ', ' '));
            invalidateQuotes();
            setCreditNoteModal(null);
            navigate(`/app/devis/${created.id}`);
        } catch (error) {
            console.error('Error creating credit note:', error);
            toast.error(error.message || "Erreur lors de la création de l'avoir");
            setCreditNoteModal(prev => (prev ? { ...prev, saving: false } : prev));
        }
    };

    return {
        creditNoteModal,
        setCreditNoteModal,
        openCreditNoteModal,
        handleCreateCreditNote,
    };
};
