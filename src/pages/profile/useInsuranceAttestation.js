import { useState } from 'react';
import { supabase } from '../../utils/supabase';
import { toast } from 'sonner';
import { validateFileForUpload, UPLOAD_PRESETS } from '../../utils/uploadValidation';
import {
    ATTESTATION_BUCKET,
    attestationStoragePath,
    buildAttestationPath,
} from '../../utils/insuranceAttestation';

// Dépôt / retrait de l'attestation d'assurance décennale (PDF).
//
// Contrairement aux champs texte du formulaire, le lien est enregistré sur le
// profil dès le dépôt : l'artisan n'a pas à penser au bouton « Enregistrer »
// pour que son client voie le document, et un retrait ne laisse jamais un
// profil pointant vers un fichier supprimé.
export const useInsuranceAttestation = ({ user, formData, setFormData, invalidateProfile }) => {
    const [busy, setBusy] = useState(false);

    const saveUrl = async (url) => {
        const { error } = await supabase
            .from('profiles')
            .update({ insurance_attestation_url: url, updated_at: new Date() })
            .eq('id', user.id);
        if (error) throw error;
        setFormData((prev) => ({ ...prev, insurance_attestation_url: url || '' }));
        invalidateProfile();
    };

    // Un fichier orphelin ne gêne personne : son échec de suppression ne doit
    // pas faire croire à l'artisan que le dépôt ou le retrait a échoué.
    const removeFile = async (url) => {
        const path = attestationStoragePath(url);
        if (!path) return;
        const { error } = await supabase.storage.from(ATTESTATION_BUCKET).remove([path]);
        if (error) console.error('Suppression de l\'ancienne attestation échouée :', error);
    };

    const handleAttestationUpload = async (e) => {
        const input = e.target;
        const file = input.files?.[0];
        if (!file) return;

        try {
            setBusy(true);
            const validation = await validateFileForUpload(file, UPLOAD_PRESETS.pdf);
            if (!validation.ok) {
                toast.error(validation.error);
                return;
            }

            const previousUrl = formData.insurance_attestation_url;
            const path = buildAttestationPath(user.id);
            const { error: uploadError } = await supabase.storage
                .from(ATTESTATION_BUCKET)
                .upload(path, file, { contentType: 'application/pdf' });
            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from(ATTESTATION_BUCKET).getPublicUrl(path);
            try {
                await saveUrl(data.publicUrl);
            } catch (error) {
                // Profil non mis à jour : ne pas laisser le fichier en ligne.
                await removeFile(data.publicUrl);
                throw error;
            }
            await removeFile(previousUrl);
            toast.success('Attestation enregistrée : vos clients la voient dans leur espace client');
        } catch (error) {
            console.error('Error uploading insurance attestation:', error);
            toast.error('Erreur lors de l\'envoi de l\'attestation');
        } finally {
            setBusy(false);
            // Permet de redéposer le même fichier après une erreur.
            input.value = '';
        }
    };

    const removeAttestation = async () => {
        const url = formData.insurance_attestation_url;
        if (!url) return;
        try {
            setBusy(true);
            await saveUrl(null);
            await removeFile(url);
            toast.success('Attestation retirée de l\'espace client');
        } catch (error) {
            console.error('Error removing insurance attestation:', error);
            toast.error('Erreur lors du retrait de l\'attestation');
        } finally {
            setBusy(false);
        }
    };

    return { busy, handleAttestationUpload, removeAttestation };
};
