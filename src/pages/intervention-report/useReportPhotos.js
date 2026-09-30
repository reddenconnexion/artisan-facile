import { useRef } from 'react';
import { toast } from 'sonner';
import { validateFiles, UPLOAD_PRESETS } from '../../utils/uploadValidation';
import { compressImageFile } from '../../utils/mediaConverters';
import { assertWithinQuota } from '../../utils/storageQuota';
import { supabase } from '../../utils/supabase';
import { useBurstCamera } from '../../hooks/useBurstCamera';
import { blockIfOffline } from './reportFormUtils';

/**
 * Photos de l'intervention : envoi (galerie, appareil photo en rafale ou
 * appareil natif) et suppression.
 */
export const useReportPhotos = ({
    user, id, isEditing,
    formData, setFormData,
    setUploadingPhotos,
    confirm, savedSnapshotRef, invalidateInterventionReport,
}) => {
    // Appareil photo en rafale : la série arrive comme une sélection de galerie.
    const nativePhotoRef = useRef(null);
    const { openCamera, camera } = useBurstCamera({
        onFiles: (files) => handlePhotoUpload({ target: { files, value: '' } }),
        onFallback: () => nativePhotoRef.current?.click(),
    });

    const handlePhotoUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        if (blockIfOffline("l'envoi des photos")) {
            e.target.value = '';
            return;
        }

        // Validation stricte : magic bytes, taille max, type MIME réel
        const { valid, errors } = await validateFiles(files, UPLOAD_PRESETS.image);
        if (errors.length > 0) {
            toast.error(`${errors.length} fichier(s) refusé(s)`, {
                description: errors.slice(0, 3).join(' · '),
                duration: 6000,
            });
        }
        if (valid.length === 0) {
            e.target.value = '';
            return;
        }

        setUploadingPhotos(true);
        try {
            // Compresse d'abord (max 1600 px, JPEG q0.8) pour ne pas stocker de
            // photos brutes de plusieurs Mo, puis vérifie le quota de stockage.
            const compressedFiles = await Promise.all(
                valid.map(f => compressImageFile(f, { maxDim: 1600, quality: 0.8 })),
            );
            const addBytes = compressedFiles.reduce((sum, f) => sum + (f.size || 0), 0);
            try {
                await assertWithinQuota(addBytes);
            } catch (quotaErr) {
                toast.error(quotaErr.message, { duration: 7000 });
                return;
            }

            const uploaded = [];
            for (let i = 0; i < compressedFiles.length; i++) {
                const compressed = compressedFiles[i];
                const path = `interventions/${user.id}/${crypto.randomUUID()}.jpg`;
                const { error: uploadError } = await supabase.storage
                    .from('project-photos')
                    .upload(path, compressed, { contentType: 'image/jpeg' });
                if (uploadError) throw uploadError;
                const { data: { publicUrl } } = supabase.storage
                    .from('project-photos')
                    .getPublicUrl(path);
                uploaded.push({ url: publicUrl, path, name: valid[i].name });
            }
            setFormData(prev => ({ ...prev, photos: [...(prev.photos || []), ...uploaded] }));
            toast.success(`${uploaded.length} photo(s) ajoutée(s)`);
        } catch {
            toast.error('Erreur lors de l\'upload des photos');
        } finally {
            setUploadingPhotos(false);
            e.target.value = '';
        }
    };

    // Suppression d'une photo : fichier, formulaire et — pour un rapport déjà
    // enregistré — la ligne en base tout de suite, sans attendre « Enregistrer »,
    // sinon le rapport garderait la référence d'un fichier qui n'existe plus.
    const removePhoto = async (photo) => {
        const ok = await confirm({
            title: 'Supprimer cette photo ?',
            message: 'Elle sera retirée du rapport et du stockage. Cette action est irréversible.',
            confirmLabel: 'Supprimer',
            danger: true,
        });
        if (!ok) return false;
        try {
            if (photo.path) {
                await supabase.storage.from('project-photos').remove([photo.path]);
            }
            // La photo versée au dossier du client pointe sur ce fichier :
            // sans ce nettoyage, sa fiche garderait une vignette cassée.
            if (photo.url && user) {
                await supabase
                    .from('project_photos')
                    .delete()
                    .eq('user_id', user.id)
                    .eq('photo_url', photo.url);
            }
            const remaining = (formData.photos || []).filter(p => p.url !== photo.url);
            setFormData(prev => ({ ...prev, photos: (prev.photos || []).filter(p => p.url !== photo.url) }));
            if (isEditing) {
                const { error } = await supabase
                    .from('intervention_reports')
                    .update({ photos: remaining })
                    .eq('id', id);
                if (error) throw error;
                invalidateInterventionReport(id);
                if (savedSnapshotRef.current) {
                    savedSnapshotRef.current = {
                        ...savedSnapshotRef.current,
                        photos: savedSnapshotRef.current.photos.filter(u => u !== photo.url),
                    };
                }
            }
            toast.success('Photo supprimée');
            return true;
        } catch {
            toast.error('Erreur lors de la suppression');
            return false;
        }
    };

    return { nativePhotoRef, openCamera, camera, handlePhotoUpload, removePhoto };
};
