import { useState } from 'react';
import { supabase } from '../../utils/supabase';
import { toast } from 'sonner';
import { sanitizeSignatureHtml } from '../../utils/sanitizeHtml';
import { validateFileForUpload, UPLOAD_PRESETS } from '../../utils/uploadValidation';

// Signature email personnalisée (HTML) — vide = signature auto depuis profil
export const useEmailSignature = (user) => {
    const [emailSignatureHtml, setEmailSignatureHtml] = useState('');
    const [savingSignature, setSavingSignature] = useState(false);
    const [signaturePreview, setSignaturePreview] = useState(false);
    // Largeur à utiliser au moment d'insérer une image dans la signature (en px ou 'full')
    const [signatureImageWidth, setSignatureImageWidth] = useState('300');

    // Signature email personnalisée
    const loadFromProfile = (data) => {
        setEmailSignatureHtml(data.email_signature_html || '');
    };

    const handleSaveSignature = async () => {
        setSavingSignature(true);
        try {
            const cleanHtml = sanitizeSignatureHtml(emailSignatureHtml).trim();
            setEmailSignatureHtml(cleanHtml);
            const { error } = await supabase
                .from('profiles')
                .update({ email_signature_html: cleanHtml || null })
                .eq('id', user.id);
            if (error) throw error;
            toast.success(cleanHtml ? 'Signature personnalisée enregistrée' : 'Signature remise sur l\'auto');
        } catch (err) {
            toast.error(err.message || 'Erreur lors de la sauvegarde');
        } finally {
            setSavingSignature(false);
        }
    };

    const handleSignatureImageUpload = async (e) => {
        try {
            const file = e.target.files?.[0];
            if (!file) return;

            const validation = await validateFileForUpload(file, UPLOAD_PRESETS.image);
            if (!validation.ok) {
                toast.error(validation.error);
                return;
            }

            const fileExt = file.name.split('.').pop().toLowerCase();
            const randomBytes = new Uint8Array(16);
            crypto.getRandomValues(randomBytes);
            const randomHex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            const fileName = `signature-${user.id}-${randomHex}.${fileExt}`;

            const uploadingToast = toast.loading('Upload de l\'image...');
            const { error: uploadError } = await supabase.storage
                .from('logos')
                .upload(fileName, file, { contentType: file.type });
            toast.dismiss(uploadingToast);
            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('logos').getPublicUrl(fileName);
            const url = data.publicUrl;

            // Construit la balise <img> selon la largeur choisie. 'full' = 100% responsive.
            const w = String(signatureImageWidth || '300').trim();
            const sizeStyle = w === 'full'
                ? 'max-width:100%;height:auto;'
                : `width:${parseInt(w, 10) || 300}px;max-width:100%;height:auto;`;
            const imgTag = `<img src="${url}" alt="" style="${sizeStyle}display:block;margin-top:8px;" />`;
            setEmailSignatureHtml(prev => (prev ? prev.trimEnd() + '\n' + imgTag : imgTag));
            toast.success('Image ajoutée — n\'oubliez pas d\'enregistrer la signature');
        } catch (err) {
            console.error('Signature image upload error:', err);
            toast.error('Erreur lors de l\'upload de l\'image');
        } finally {
            // Reset l'input pour permettre de réuploader la même image
            e.target.value = '';
        }
    };

    return {
        emailSignatureHtml,
        setEmailSignatureHtml,
        savingSignature,
        signaturePreview,
        setSignaturePreview,
        signatureImageWidth,
        setSignatureImageWidth,
        handleSaveSignature,
        handleSignatureImageUpload,
        loadFromProfile,
    };
};
