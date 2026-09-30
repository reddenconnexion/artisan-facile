import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { validateFileForUpload, UPLOAD_PRESETS } from '../../utils/uploadValidation';
import { compressImageFile } from '../../utils/mediaConverters';
import { assertWithinQuota } from '../../utils/storageQuota';
import { supabase } from '../../utils/supabase';
import { blockIfOffline, captureGeolocation, MILESTONE_LABELS } from './reportFormUtils';

/* ── Jalons d'avancement (preuves datées + géolocalisées) ─────────────── */

export const useReportMilestones = ({ user, setFormData, setUploadingPhotos, confirm }) => {
    const [capturingMilestone, setCapturingMilestone] = useState(null); // 'start' | 'progress' | 'reception' | 'custom'
    const milestoneFileRef = useRef(null);

    const triggerMilestoneCapture = (type) => {
        setCapturingMilestone(type);
        // Déclencher l'input file (avec capture caméra côté mobile)
        setTimeout(() => milestoneFileRef.current?.click(), 0);
    };

    const handleMilestoneFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !capturingMilestone) {
            setCapturingMilestone(null);
            return;
        }
        if (blockIfOffline("l'envoi de la photo")) {
            setCapturingMilestone(null);
            return;
        }

        // Validation stricte (magic bytes + taille)
        const validation = await validateFileForUpload(file, UPLOAD_PRESETS.image);
        if (!validation.ok) {
            setCapturingMilestone(null);
            toast.error(validation.error);
            return;
        }

        const type = capturingMilestone;
        setCapturingMilestone(null);
        setUploadingPhotos(true);

        try {
            // Upload de la photo (même bucket que les autres photos d'intervention),
            // compressée au préalable (max 1600 px, JPEG q0.8).
            const compressed = await compressImageFile(file, { maxDim: 1600, quality: 0.8 });
            await assertWithinQuota(compressed.size || 0);
            const path = `interventions/${user.id}/milestones/${crypto.randomUUID()}.jpg`;
            const { error: uploadError } = await supabase.storage
                .from('project-photos')
                .upload(path, compressed, { contentType: 'image/jpeg' });
            if (uploadError) throw uploadError;
            const { data: { publicUrl } } = supabase.storage
                .from('project-photos')
                .getPublicUrl(path);

            // Géolocalisation en parallèle (best effort, pas bloquante)
            const geo = await captureGeolocation();

            const milestone = {
                id:         (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
                type,
                label:      MILESTONE_LABELS[type],
                photo_url:  publicUrl,
                photo_path: path,
                timestamp:  new Date().toISOString(),
                ...(geo ? { latitude: geo.latitude, longitude: geo.longitude, accuracy: geo.accuracy } : {}),
                notes: '',
            };

            setFormData(prev => ({
                ...prev,
                milestones: [...(prev.milestones || []), milestone],
            }));

            toast.success(`Jalon "${MILESTONE_LABELS[type]}" enregistré`, {
                description: geo
                    ? `📍 Position enregistrée (±${Math.round(geo.accuracy)}m)`
                    : 'Position non disponible — photo + horodatage seuls',
            });
        } catch (err) {
            console.error('Milestone capture error:', err);
            // Surface le message de quota tel quel, sinon message générique.
            toast.error(/stockage/i.test(err?.message || '') ? err.message : 'Impossible d\'enregistrer le jalon');
        } finally {
            setUploadingPhotos(false);
        }
    };

    const removeMilestone = async (milestone) => {
        const ok = await confirm({
            title: `Supprimer le jalon « ${milestone.label || 'jalon'} » ?`,
            message: 'La photo horodatée et sa position seront effacées du stockage. Cette action est irréversible.',
            confirmLabel: 'Supprimer',
            danger: true,
        });
        if (!ok) return;
        try {
            if (milestone.photo_path) {
                await supabase.storage.from('project-photos').remove([milestone.photo_path]);
            }
            setFormData(prev => ({
                ...prev,
                milestones: (prev.milestones || []).filter(m => m.id !== milestone.id),
            }));
        } catch {
            toast.error('Erreur lors de la suppression');
        }
    };

    const updateMilestoneNotes = (id, notes) => {
        setFormData(prev => ({
            ...prev,
            milestones: (prev.milestones || []).map(m =>
                m.id === id ? { ...m, notes } : m,
            ),
        }));
    };

    return { milestoneFileRef, triggerMilestoneCapture, handleMilestoneFile, removeMilestone, updateMilestoneNotes };
};
