import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { formatDate } from '../../utils/format';
import { useOfflinePendingSave } from '../../hooks/useOfflinePendingSave';
import { offlineSaveMessage } from '../../utils/offlineSave';
import { EMPTY_MATERIAL, contentSnapshot, pickDraftFields } from './reportFormUtils';

/**
 * Brouillon local du rapport (localStorage) et enregistrement hors-ligne.
 *
 * savedSnapshotRef : contenu tel qu'enregistré en base (ou vierge pour un
 * nouveau rapport). draftCheckedRef : la reprise éventuelle d'un brouillon
 * a été proposée — avant ça, on n'écrase pas le brouillon existant.
 */
export const useReportDraft = ({
    user, id, isEditing, existingReport,
    formData, setFormData, setClientSearch,
    confirm, onSave,
}) => {
    const draftKey = user ? `intervention-draft-${user.id}-${isEditing ? id : 'new'}` : null;
    const savedSnapshotRef = useRef(isEditing ? null : contentSnapshot(formData));
    const draftCheckedRef = useRef(false);
    const isDirty = savedSnapshotRef.current !== null
        && JSON.stringify(contentSnapshot(formData)) !== JSON.stringify(savedSnapshotRef.current);

    const clearDraft = (key = draftKey) => {
        if (!key) return;
        try { localStorage.removeItem(key); } catch { /* stockage indisponible */ }
    };

    const writeDraftNow = () => {
        if (!draftKey) return;
        try {
            localStorage.setItem(draftKey, JSON.stringify({
                savedAt: new Date().toISOString(),
                data: pickDraftFields(formData),
            }));
        } catch { /* stockage plein ou indisponible */ }
    };

    // Hors-ligne : le rapport reste en brouillon sur le téléphone et on
    // propose de l'enregistrer dès le retour du réseau.
    const { isOnline, markPending, clearPending } = useOfflinePendingSave({
        label: 'Le rapport',
        onSave,
    });
    const keepOfflineDraft = () => {
        writeDraftNow();
        markPending();
        toast.warning(offlineSaveMessage('le rapport'), { id: 'offline-save', duration: 8000 });
    };

    // Charger le rapport existant. Cet effet passe avant la reprise du
    // brouillon ci-dessous, qui compare avec ce contenu enregistré.
    useEffect(() => {
        if (!existingReport) return;
        const loaded = {
            ...existingReport,
            materials_used: existingReport.materials_used?.length
                ? existingReport.materials_used
                : [EMPTY_MATERIAL()],
        };
        setFormData(loaded);
        setClientSearch(existingReport.client_name || '');
        savedSnapshotRef.current = contentSnapshot(loaded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [existingReport]);

    // Proposer de reprendre un brouillon resté sur le téléphone
    useEffect(() => {
        if (!draftKey || draftCheckedRef.current) return;
        if (isEditing && !existingReport) return;
        draftCheckedRef.current = true;
        let draft = null;
        try { draft = JSON.parse(localStorage.getItem(draftKey)); } catch { /* brouillon illisible */ }
        if (!draft?.data) return;
        if (JSON.stringify(contentSnapshot(draft.data)) === JSON.stringify(savedSnapshotRef.current)) {
            clearDraft();
            return;
        }
        const savedAt = draft.savedAt ? new Date(draft.savedAt) : null;
        const when = savedAt
            ? ` du ${formatDate(savedAt)} à ${savedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
            : '';
        confirm({
            title: 'Reprendre le brouillon ?',
            message: `Une saisie non enregistrée${when} a été retrouvée sur ce téléphone.`,
            confirmLabel: 'Reprendre',
            cancelLabel: 'Ignorer',
            info: true,
        }).then(ok => {
            if (ok) {
                const data = pickDraftFields(draft.data);
                setFormData(prev => ({ ...prev, ...data }));
                if (data.client_name !== undefined) setClientSearch(data.client_name || '');
                toast.success('Brouillon repris');
            } else {
                clearDraft();
            }
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draftKey, existingReport]);

    // Enregistrer le brouillon 1 s après la dernière modification
    useEffect(() => {
        if (!draftKey || !draftCheckedRef.current) return;
        const timer = setTimeout(() => {
            if (isDirty) writeDraftNow();
        }, 1000);
        return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formData, draftKey, isDirty]);

    // Avertir avant de fermer ou recharger l'onglet avec une saisie en cours
    useEffect(() => {
        if (!isDirty) return;
        const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);

    return { draftKey, savedSnapshotRef, isDirty, clearDraft, isOnline, clearPending, keepOfflineDraft };
};
