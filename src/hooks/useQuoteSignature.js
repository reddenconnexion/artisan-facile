import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase';
import { isSignatureBlocked, isSignatureSuspended } from '../utils/quoteSignability';
import { publicLinkExpiry, publicLinkValidityLabel } from '../constants/publicLink';

/**
 * Signature d'un devis dans la fiche devis (DevisForm) :
 *   - signature sur place (modale, enregistrement, passage en « accepté ») ;
 *   - suspension / réouverture du lien de signature envoyé au client ;
 *   - état « document fermé » (signature suspendue ou statut bloquant).
 *
 * @param {object} p
 * @param {string} p.id                 Id du devis (route).
 * @param {object} p.formData
 * @param {Function} p.setFormData
 * @param {Function} [p.onSigned]       Appelé après une signature enregistrée.
 */
export const useQuoteSignature = ({ id, formData, setFormData, onSigned }) => {
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [signature, setSignature] = useState(null);

    // ── Suspension de la signature ───────────────────────────────────────────
    // Un devis ou un avenant déjà envoyé peut devoir être repris : chantier
    // reporté, erreur de chiffrage, client qui négocie encore. Tant que le lien
    // est actif, il reste signable et engage les deux parties. `token_revoked`
    // ferme le lien sans toucher au statut du document : la page publique ne
    // s'ouvre plus (get_public_quote l'exclut) et la signature est refusée côté
    // serveur (sign_public_quote), y compris pour un lien déjà dans la boîte
    // mail du client. Un clic suffit à rouvrir.
    //
    // Mais `token_revoked` seul ne dit pas QUI l'a levé : le ménage nocturne
    // (`cleanup_expired_tokens`) le pose sur tout lien expiré depuis plus de
    // 7 jours. S'y fier annonçait « Signature suspendue » sur la moitié du
    // portefeuille, devis signés compris. C'est `signature_suspended_at`, écrite
    // ici et nulle part ailleurs, qui atteste une décision de l'artisan.
    const [togglingSuspension, setTogglingSuspension] = useState(false);
    const signatureSuspended = isSignatureSuspended(formData);
    // Lien fermé par le ménage, sans décision : l'artisan doit pouvoir le
    // comprendre au lieu de croire à une suspension qu'il n'a pas faite.
    const linkExpired = !signatureSuspended && formData.token_revoked === true;

    // Lit l'état réel du lien en base avant toute action qui le rouvrirait.
    // Se fier au seul formData rouvrirait silencieusement une signature
    // suspendue depuis un autre appareil ou un autre onglet.
    const fetchLinkSuspended = async () => {
        const { data, error } = await supabase
            .from('quotes')
            .select('signature_suspended_at')
            .eq('id', id)
            .single();
        if (error) return signatureSuspended;
        const suspended = !!data?.signature_suspended_at;
        if (suspended !== signatureSuspended) {
            setFormData(prev => ({ ...prev, signature_suspended_at: data?.signature_suspended_at || null }));
        }
        return suspended;
    };

    const suspensionBlockMessage = 'Signature suspendue — rouvrez-la d’abord (menu « … » → Rouvrir la signature).';

    const handleToggleSignatureSuspension = async () => {
        if (!id || id === 'new') return;
        const suspend = !signatureSuspended;
        setTogglingSuspension(true);
        try {
            // Rouvrir prolonge la validité : un lien suspendu plusieurs semaines
            // serait sinon rouvert déjà expiré. Rouvrir efface aussi la date de
            // suspension : elle ne vaut que tant qu'elle est vraie.
            const suspendedAt = new Date().toISOString();
            const payload = suspend
                ? { token_revoked: true, signature_suspended_at: suspendedAt }
                : {
                    token_revoked: false,
                    signature_suspended_at: null,
                    token_expires_at: publicLinkExpiry(),
                };
            const { error } = await supabase.from('quotes').update(payload).eq('id', id);
            if (error) throw error;
            setFormData(prev => ({
                ...prev,
                token_revoked: suspend,
                signature_suspended_at: suspend ? suspendedAt : null,
            }));
            toast.success(suspend
                ? 'Signature suspendue — le lien envoyé au client ne s’ouvre plus.'
                : `Signature rouverte — le lien redevient valable ${publicLinkValidityLabel()}.`);
        } catch (err) {
            console.error('Error toggling signature suspension:', err);
            toast.error(suspend
                ? "La signature n'a pas pu être suspendue — réessayez."
                : "La signature n'a pas pu être rouverte — réessayez.");
        } finally {
            setTogglingSuspension(false);
        }
    };

    // Document qui ne peut plus être signé : signature suspendue ou statut
    // bloquant (annulé, refusé, reporté…).
    const isDocumentClosed = signatureSuspended || isSignatureBlocked(formData.status);

    const handleSignatureSave = async (signatureData, _otpCode, bonPourAccord) => {
        try {
            const now = new Date().toISOString();
            const { error } = await supabase
                .from('quotes')
                .update({
                    signature: signatureData,
                    status: 'accepted',
                    signed_at: now,
                    bon_pour_accord: bonPourAccord || null
                })
                .eq('id', id);

            if (error) throw error;

            setSignature(signatureData);
            setFormData(prev => ({ ...prev, status: 'accepted', signature: signatureData, signed_at: now, bon_pour_accord: bonPourAccord || null }));
            onSigned?.();
            setShowSignatureModal(false);
            toast.success('Devis signé avec succès');
        } catch (error) {
            console.error('Error saving signature:', error);
            toast.error('Erreur lors de la sauvegarde de la signature');
        }
    };

    return {
        signature,
        setSignature,
        showSignatureModal,
        setShowSignatureModal,
        handleSignatureSave,
        signatureSuspended,
        linkExpired,
        togglingSuspension,
        fetchLinkSuspended,
        suspensionBlockMessage,
        handleToggleSignatureSuspension,
        isDocumentClosed,
    };
};
