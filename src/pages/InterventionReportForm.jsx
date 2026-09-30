import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useTestMode } from '../context/TestModeContext';
import { useClients, useQuotes, useInterventionReport, useInvalidateCache, useUserProfile } from '../hooks/useDataCache';
import SignatureModal from '../components/SignatureModal';
import PhotoLightbox from '../components/PhotoLightbox';
import { useConfirm } from '../context/ConfirmContext';
import ReviewRequestModal from '../components/ReviewRequestModal';
import { generateInterventionReportPDF } from '../utils/pdfGenerator';
import { isOffline, isNetworkError } from '../utils/offlineSave';
import { EMPTY_MATERIAL, contentSnapshot, createInitialFormData } from './intervention-report/reportFormUtils';
import { useReportDictation } from './intervention-report/useReportDictation';
import { useReportDraft } from './intervention-report/useReportDraft';
import { useReportInvoice } from './intervention-report/useReportInvoice';
import { useReportPhotos } from './intervention-report/useReportPhotos';
import { useReportMilestones } from './intervention-report/useReportMilestones';
import { useVisitPhotoSync } from './intervention-report/useVisitPhotoSync';
import { ReportHeader, ReportFooterActions } from './intervention-report/ReportActionBars';
import {
    GeneralInfoSection, LocationSection, SiteVisitMetaSection,
    TimeTrackingSection, WorkDescriptionSection, NotesSection,
} from './intervention-report/ReportDetailsSections';
import { ClientSection } from './intervention-report/ClientSection';
import { MaterialsSection } from './intervention-report/MaterialsSection';
import { PhotosSection } from './intervention-report/PhotosSection';
import { MilestonesSection } from './intervention-report/MilestonesSection';
import { SignatureSection } from './intervention-report/SignatureSection';
import { SendInvoiceModal } from './intervention-report/SendInvoiceModal';

const InterventionReportForm = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { isTestMode, captureEmail } = useTestMode();
    const isEditing = id && id !== 'new';

    const { data: existingReport, isLoading: loadingReport } = useInterventionReport(isEditing ? id : null);
    const { data: clients = [] } = useClients();
    const { data: allQuotes = [] } = useQuotes();
    const { data: userProfile } = useUserProfile();
    const { invalidateInterventionReports, invalidateInterventionReport } = useInvalidateCache();
    const confirm = useConfirm();
    // Photo ouverte en grand (index dans formData.photos) ; null = fermée
    const [photoViewer, setPhotoViewer] = useState(null);

    const [clientSearch, setClientSearch] = useState('');
    const [showClientDropdown, setShowClientDropdown] = useState(false);
    const clientDropdownRef = useRef(null);

    const [saving, setSaving] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [showReviewRequestModal, setShowReviewRequestModal] = useState(false);
    const [uploadingPhotos, setUploadingPhotos] = useState(false);

    const [formData, setFormData] = useState(createInitialFormData());

    // Dictée vocale → transcription + résumé IA versés dans le formulaire
    const { isRecording, recordingDuration, micSupported, processingAudio, handleDictate } = useReportDictation({ setFormData });

    // Close client dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target)) {
                setShowClientDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Load existing report when editing
    useEffect(() => {
        if (existingReport) {
            const loaded = {
                ...existingReport,
                materials_used: existingReport.materials_used?.length
                    ? existingReport.materials_used
                    : [EMPTY_MATERIAL()],
            };
            setFormData(loaded);
            setClientSearch(existingReport.client_name || '');
            savedSnapshotRef.current = contentSnapshot(loaded);
        }
    // savedSnapshotRef : référence stable renvoyée par useReportDraft
    }, [existingReport, savedSnapshotRef]);

    // ── Brouillon local ────────────────────────────────────────────────────
    // Brouillon sur le téléphone, avertissement avant de quitter et
    // enregistrement proposé au retour du réseau (voir useReportDraft).
    const { draftKey, savedSnapshotRef, isDirty, clearDraft, isOnline, clearPending, keepOfflineDraft } = useReportDraft({
        user, id, isEditing, existingReport,
        formData, setFormData, setClientSearch,
        confirm,
        onSave: () => handleSave(),
    });

    const handleLeave = async () => {
        if (isDirty) {
            const ok = await confirm({
                title: 'Quitter sans enregistrer ?',
                message: 'Les modifications non enregistrées de ce rapport seront perdues.',
                confirmLabel: 'Quitter',
                cancelLabel: 'Rester',
                danger: true,
            });
            if (!ok) return;
            clearDraft();
        }
        navigate('/app/interventions');
    };

    // Auto-generate report number for new reports
    useEffect(() => {
        if (isEditing || !user) return;
        const year = new Date().getFullYear();
        supabase
            .from('intervention_reports')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .then(({ count }) => {
                const next = String((count || 0) + 1).padStart(3, '0');
                setFormData(prev => ({ ...prev, report_number: `INT-${year}-${next}` }));
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    // Auto-calculate duration when start/end times change
    useEffect(() => {
        if (formData.start_time && formData.end_time) {
            const [sh, sm] = formData.start_time.split(':').map(Number);
            const [eh, em] = formData.end_time.split(':').map(Number);
            const startMins = sh * 60 + sm;
            const endMins = eh * 60 + em;
            if (endMins > startMins) {
                const durationHours = ((endMins - startMins) / 60).toFixed(2);
                setFormData(prev => ({ ...prev, duration_hours: durationHours }));
            }
        }
    }, [formData.start_time, formData.end_time]);

    // Facture liée, clôture et envoi de la facture
    const {
        linkedInvoice, sendInvoiceModal, setSendInvoiceModal,
        handleResendInvoice, handleMarkCompleted, handleCreateInvoiceFromReport,
    } = useReportInvoice({
        user, isEditing,
        formData, setFormData,
        clients, allQuotes, userProfile,
        navigate,
        handleSave: (statusOverride) => handleSave(statusOverride),
    });

    // Sync client_name + adresse when client_id changes
    const handleClientChange = (clientId) => {
        const client = clients.find(c => String(c.id) === String(clientId));
        setClientSearch(client?.name || '');
        setShowClientDropdown(false);
        setFormData(prev => ({
            ...prev,
            client_id: clientId,
            client_name: client?.name || '',
            quote_id: '',  // reset quote when client changes
            intervention_address: client?.address || prev.intervention_address,
            intervention_postal_code: client?.postal_code || prev.intervention_postal_code,
            intervention_city: client?.city || prev.intervention_city,
        }));
    };

    // Quotes filtered for the selected client
    const clientQuotes = formData.client_id
        ? allQuotes.filter(q => String(q.client_id) === String(formData.client_id))
        : allQuotes;

    const handleQuoteChange = (quoteId) => {
        const quote = allQuotes.find(q => String(q.id) === String(quoteId));
        const linkedClient = quote?.client_id
            ? clients.find(c => String(c.id) === String(quote.client_id))
            : null;
        setFormData(prev => ({
            ...prev,
            quote_id: quoteId,
            // Auto-remplir le client depuis le devis si pas encore sélectionné
            client_id: prev.client_id || (linkedClient ? String(linkedClient.id) : prev.client_id),
            client_name: prev.client_name || linkedClient?.name || quote?.client_name || '',
            // Pre-fill address from quote if current address is empty
            intervention_address: prev.intervention_address || quote?.intervention_address || '',
            intervention_postal_code: prev.intervention_postal_code || quote?.intervention_postal_code || '',
            intervention_city: prev.intervention_city || quote?.intervention_city || '',
        }));
    };

    const updateField = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

    // Materials management
    const addMaterial = () => {
        setFormData(prev => ({
            ...prev,
            materials_used: [...prev.materials_used, EMPTY_MATERIAL()],
        }));
    };

    const updateMaterial = (materialId, field, value) => {
        setFormData(prev => ({
            ...prev,
            materials_used: prev.materials_used.map(m =>
                m.id === materialId ? { ...m, [field]: value } : m
            ),
        }));
    };

    const removeMaterial = (materialId) => {
        setFormData(prev => ({
            ...prev,
            materials_used: prev.materials_used.filter(m => m.id !== materialId),
        }));
    };

    const handleSignatureSave = (signatureDataURL) => {
        setFormData(prev => ({
            ...prev,
            client_signature: signatureDataURL,
            signed_at: new Date().toISOString(),
            status: 'signed',
        }));
        setShowSignatureModal(false);
        toast.success('Signature enregistrée');
    };
    // Photos de l'intervention (galerie, appareil photo en rafale, suppression)
    const { nativePhotoRef, openCamera, camera, handlePhotoUpload, removePhoto } = useReportPhotos({
        user, id, isEditing,
        formData, setFormData,
        setUploadingPhotos,
        confirm, savedSnapshotRef, invalidateInterventionReport,
    });

    // Jalons d'avancement (preuves datées + géolocalisées)
    const { milestoneFileRef, triggerMilestoneCapture, handleMilestoneFile, removeMilestone, updateMilestoneNotes } = useReportMilestones({
        user, setFormData, setUploadingPhotos, confirm,
    });

    const hasInterventionLocation = () => {
        const postalCode = (formData.intervention_postal_code || '').trim();
        const city = (formData.intervention_city || '').trim();
        return Boolean(postalCode && city);
    };

    const isSiteVisit = formData.report_type === 'site_visit' || formData.report_number?.startsWith('VT-');
    // Photos de visite versées au dossier photo du client (voir useVisitPhotoSync)
    const syncVisitPhotosToClient = useVisitPhotoSync({ existingReport, isSiteVisit, user, formData });

    const handleSave = async (statusOverride = null) => {
        if (!formData.title.trim()) {
            toast.error('Le titre est obligatoire');
            return false;
        }

        const targetStatus = statusOverride || formData.status;
        if ((targetStatus === 'completed' || targetStatus === 'signed') && !hasInterventionLocation()) {
            toast.error('Le code postal et la ville sont obligatoires pour clôturer ou faire signer un rapport');
            return false;
        }

        if (isOffline()) {
            keepOfflineDraft();
            return false;
        }

        setSaving(true);
        // Le contenu enregistré devient la référence et le brouillon local
        // n'a plus lieu d'être (clé prise avant la navigation vers /:id).
        const draftKeyAtSave = draftKey;
        const markSaved = () => {
            savedSnapshotRef.current = contentSnapshot(formData);
            clearDraft(draftKeyAtSave);
            clearPending();
        };
        try {
            const payload = {
                title: formData.title,
                date: formData.date,
                report_number: formData.report_number || null,
                client_id: formData.client_id ? Number(formData.client_id) : null,
                client_name: formData.client_name || null,
                quote_id: formData.quote_id ? Number(formData.quote_id) : null,
                intervention_address: formData.intervention_address || null,
                intervention_postal_code: formData.intervention_postal_code || null,
                intervention_city: formData.intervention_city || null,
                start_time: formData.start_time || null,
                end_time: formData.end_time || null,
                duration_hours: formData.duration_hours ? parseFloat(formData.duration_hours) : null,
                description: formData.description || null,
                work_done: formData.work_done || null,
                materials_used: formData.materials_used.filter(m => m.description.trim()),
                milestones: formData.milestones || [],
                notes: formData.notes || null,
                status: statusOverride || formData.status,
                client_signature: formData.client_signature || null,
                signed_at: formData.signed_at || null,
                signer_name: formData.signer_name || null,
                updated_at: new Date().toISOString(),
            };

            // Ajouter photos seulement si la colonne existe (migration appliquée).
            // En édition on envoie toujours la liste, même vide : une photo
            // supprimée doit aussi disparaître du rapport enregistré.
            const photosPayload = isEditing
                ? { photos: formData.photos || [] }
                : (formData.photos?.length ? { photos: formData.photos } : {});

            if (isEditing) {
                const { error } = await supabase
                    .from('intervention_reports')
                    .update({ ...payload, ...photosPayload })
                    .eq('id', id);
                if (error) {
                    // Réessayer sans photos si la colonne n'existe pas encore
                    if (error.code === '42703') {
                        const { error: e2 } = await supabase
                            .from('intervention_reports')
                            .update(payload)
                            .eq('id', id);
                        if (e2) throw e2;
                    } else {
                        throw error;
                    }
                }
                invalidateInterventionReport(id);
                await syncVisitPhotosToClient();
            } else {
                const { data, error } = await supabase
                    .from('intervention_reports')
                    .insert([{ ...payload, ...photosPayload, user_id: user.id }])
                    .select()
                    .single();
                if (error) {
                    if (error.code === '42703') {
                        const { data: d2, error: e2 } = await supabase
                            .from('intervention_reports')
                            .insert([{ ...payload, user_id: user.id }])
                            .select()
                            .single();
                        if (e2) throw e2;
                        markSaved();
                        invalidateInterventionReports();
                        navigate(`/app/interventions/${d2.id}`, { replace: true });
                        invalidateInterventionReports();
                        toast.success('Rapport sauvegardé');
                        return d2.id;
                    }
                    throw error;
                }
                markSaved();
                invalidateInterventionReports();
                navigate(`/app/interventions/${data.id}`, { replace: true });
                invalidateInterventionReports();
                toast.success('Rapport sauvegardé');
                return data.id;
            }

            markSaved();
            invalidateInterventionReports();
            toast.success('Rapport sauvegardé');
            return isEditing ? Number(id) : true;
        } catch (err) {
            console.error('handleSave error:', err);
            if (isNetworkError(err)) {
                keepOfflineDraft();
                return false;
            }
            toast.error('Erreur lors de la sauvegarde');
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleExportPDF = async () => {
        setExporting(true);
        try {
            await generateInterventionReportPDF(formData, userProfile);
            toast.success('PDF généré');
        } catch {
            toast.error('Erreur lors de la génération du PDF');
        } finally {
            setExporting(false);
        }
    };

    let siteVisitMeta = null;
    if (isSiteVisit && formData.notes) {
        try { siteVisitMeta = JSON.parse(formData.notes); } catch { /* notes libres, pas de résultats d'analyse */ }
    }

    const handleCreateDevisFromVisit = () => {
        const items = (formData.materials_used || []).filter(m => m.description?.trim());
        navigate('/app/devis/new', {
            state: {
                siteVisitItems: items,
                siteVisitTitle: formData.title,
                ...(formData.client_id ? { client_id: formData.client_id } : {}),
            }
        });
    };

    const materialsTotal = formData.materials_used
        .filter(m => m.description.trim())
        .reduce((sum, m) => sum + (parseFloat(m.quantity) || 0) * (parseFloat(m.price) || 0), 0);

    // « Faire signer » : l'adresse d'intervention est requise avant signature
    const openSignaturePad = () => {
        if (!hasInterventionLocation()) {
            toast.error('Renseignez le code postal et la ville avant de faire signer');
            return;
        }
        setShowSignatureModal(true);
    };

    if (loadingReport && isEditing) {
        return (
            <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }
    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <ReportHeader
                isSiteVisit={isSiteVisit}
                isEditing={isEditing}
                formData={formData}
                userProfile={userProfile}
                isOnline={isOnline}
                saving={saving}
                exporting={exporting}
                linkedInvoice={linkedInvoice}
                navigate={navigate}
                handleLeave={handleLeave}
                handleSave={handleSave}
                handleExportPDF={handleExportPDF}
                handleMarkCompleted={handleMarkCompleted}
                handleResendInvoice={handleResendInvoice}
                handleCreateInvoiceFromReport={handleCreateInvoiceFromReport}
                handleCreateDevisFromVisit={handleCreateDevisFromVisit}
                openSignaturePad={openSignaturePad}
                setShowReviewRequestModal={setShowReviewRequestModal}
            />

            {/* General Info */}
            <GeneralInfoSection formData={formData} updateField={updateField} />

            {/* Client */}
            <ClientSection
                formData={formData}
                setFormData={setFormData}
                updateField={updateField}
                isSiteVisit={isSiteVisit}
                clients={clients}
                clientSearch={clientSearch}
                setClientSearch={setClientSearch}
                showClientDropdown={showClientDropdown}
                setShowClientDropdown={setShowClientDropdown}
                clientDropdownRef={clientDropdownRef}
                handleClientChange={handleClientChange}
                clientQuotes={clientQuotes}
                handleQuoteChange={handleQuoteChange}
            />

            {/* Location */}
            <LocationSection formData={formData} updateField={updateField} />

            {/* Site Visit Metadata */}
            {isSiteVisit && siteVisitMeta && (
                <SiteVisitMetaSection
                    siteVisitMeta={siteVisitMeta}
                    handleCreateDevisFromVisit={handleCreateDevisFromVisit}
                />
            )}

            {/* Time Tracking */}
            {!isSiteVisit && (
                <TimeTrackingSection formData={formData} updateField={updateField} />
            )}

            {/* Work Description */}
            <WorkDescriptionSection
                formData={formData}
                updateField={updateField}
                isSiteVisit={isSiteVisit}
                micSupported={micSupported}
                isRecording={isRecording}
                processingAudio={processingAudio}
                recordingDuration={recordingDuration}
                handleDictate={handleDictate}
            />

            {/* Materials */}
            <MaterialsSection
                formData={formData}
                isSiteVisit={isSiteVisit}
                materialsTotal={materialsTotal}
                addMaterial={addMaterial}
                updateMaterial={updateMaterial}
                removeMaterial={removeMaterial}
            />

            {/* Photos */}
            <PhotosSection
                formData={formData}
                uploadingPhotos={uploadingPhotos}
                openCamera={openCamera}
                handlePhotoUpload={handlePhotoUpload}
                removePhoto={removePhoto}
                setPhotoViewer={setPhotoViewer}
            />

            {/* Jalons d'avancement — preuves datées et géolocalisées */}
            <MilestonesSection
                formData={formData}
                uploadingPhotos={uploadingPhotos}
                triggerMilestoneCapture={triggerMilestoneCapture}
                handleMilestoneFile={handleMilestoneFile}
                milestoneFileRef={milestoneFileRef}
                removeMilestone={removeMilestone}
                updateMilestoneNotes={updateMilestoneNotes}
                nativePhotoRef={nativePhotoRef}
                handlePhotoUpload={handlePhotoUpload}
                camera={camera}
            />

            {/* Notes */}
            {!isSiteVisit && (
                <NotesSection formData={formData} updateField={updateField} />
            )}

            {/* Signature Section */}
            {!isSiteVisit && (
                <SignatureSection
                    formData={formData}
                    setFormData={setFormData}
                    updateField={updateField}
                    openSignaturePad={openSignaturePad}
                />
            )}

            {/* Bottom Save */}
            <ReportFooterActions handleLeave={handleLeave} handleSave={handleSave} saving={saving} />

            {/* Signature Modal */}
            <PhotoLightbox
                photos={(formData.photos || []).map((p, i) => ({ src: p.url, name: p.name || `photo-${i + 1}.jpg` }))}
                index={photoViewer}
                onIndexChange={setPhotoViewer}
                onDelete={(_, i) => removePhoto((formData.photos || [])[i])}
            />

            <SignatureModal
                isOpen={showSignatureModal}
                onClose={() => setShowSignatureModal(false)}
                onSave={handleSignatureSave}
            />

            {/* Modal envoi facture automatique */}
            {sendInvoiceModal && (
                <SendInvoiceModal
                    sendInvoiceModal={sendInvoiceModal}
                    setSendInvoiceModal={setSendInvoiceModal}
                    userProfile={userProfile}
                    isTestMode={isTestMode}
                    captureEmail={captureEmail}
                />
            )}

            <ReviewRequestModal
                isOpen={showReviewRequestModal}
                onClose={() => setShowReviewRequestModal(false)}
                client={clients.find(c => String(c.id) === String(formData.client_id)) || { name: formData.client_name, city: formData.intervention_city }}
                userProfile={userProfile}
                intervention={{
                    title: formData.title,
                    workDone: formData.work_done,
                    city: formData.intervention_city,
                    address: formData.intervention_address,
                }}
            />
        </div>
    );
};

export default InterventionReportForm;
