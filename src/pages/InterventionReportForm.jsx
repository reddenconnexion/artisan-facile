import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ClipboardList, Save, ArrowLeft, Plus, Trash2, FileDown,
    PenLine, Clock, MapPin, User, Wrench, Package, StickyNote,
    CheckCircle, Camera, X, Mail, Send, Mic, MicOff, Loader2, Sparkles,
    ExternalLink, FileCheck
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useTestMode } from '../context/TestModeContext';
import { useClients, useQuotes, useInterventionReport, useInvalidateCache, useUserProfile } from '../hooks/useDataCache';
import SignatureModal from '../components/SignatureModal';
import { generateInterventionReportPDF } from '../utils/pdfGenerator';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { generateInterventionSummary } from '../utils/aiService';

const EMPTY_MATERIAL = () => ({ id: Date.now(), description: '', quantity: 1, unit: 'unité', price: 0 });

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

    const [clientSearch, setClientSearch] = useState('');
    const [showClientDropdown, setShowClientDropdown] = useState(false);
    const clientDropdownRef = useRef(null);

    const [saving, setSaving] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [uploadingPhotos, setUploadingPhotos] = useState(false);
    const [sendInvoiceModal, setSendInvoiceModal] = useState(null);
    const [processingAudio, setProcessingAudio] = useState(false);
    const [linkedInvoice, setLinkedInvoice] = useState(null);

    const { isRecording, audioBlob, duration: recordingDuration, startRecording, stopRecording, isSupported: micSupported } = useAudioRecorder();

    const handleDictate = async () => {
        if (isRecording) {
            stopRecording();
        } else {
            await startRecording();
        }
    };

    // When recording stops and we have a blob, transcribe + generate summary
    useEffect(() => {
        if (!audioBlob || isRecording) return;
        const processAudio = async () => {
            setProcessingAudio(true);
            try {
                // Convert blob to base64 using FileReader (reliable for large files)
                const mimeType = audioBlob.type || 'audio/webm';
                const audioBase64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result.split(',')[1]);
                    reader.onerror = reject;
                    reader.readAsDataURL(audioBlob);
                });

                // Transcribe with Whisper via edge function
                const { data: transcribeData, error: transcribeError } = await supabase.functions.invoke('voice-transcribe', {
                    body: { audioBase64, mimeType }
                });
                if (transcribeError) throw new Error(transcribeError.message || 'Erreur de transcription');
                if (transcribeData?.error) throw new Error(transcribeData.error);
                const transcript = transcribeData?.transcript;
                if (!transcript) throw new Error('Transcription vide — parlez plus fort ou réessayez');

                // Generate structured summary with AI
                const summary = await generateInterventionSummary(transcript);
                setFormData(prev => ({
                    ...prev,
                    title: summary.title || prev.title,
                    description: summary.description || prev.description,
                    work_done: summary.work_done || prev.work_done,
                    notes: summary.notes || prev.notes,
                }));
                toast.success('Rapport rempli depuis votre dictée');
            } catch (err) {
                console.error(err);
                toast.error('Erreur lors de l\'analyse vocale : ' + (err.message || 'Réessayez'));
            } finally {
                setProcessingAudio(false);
            }
        };
        processAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [audioBlob]);

    const [formData, setFormData] = useState({
        title: '',
        date: new Date().toISOString().split('T')[0],
        report_number: '',
        client_id: '',
        client_name: '',
        quote_id: '',
        intervention_address: '',
        intervention_postal_code: '',
        intervention_city: '',
        start_time: '',
        end_time: '',
        duration_hours: '',
        description: '',
        work_done: '',
        materials_used: [EMPTY_MATERIAL()],
        photos: [],
        notes: '',
        status: 'draft',
        client_signature: null,
        signed_at: null,
        signer_name: '',
    });

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
            setFormData({
                ...existingReport,
                materials_used: existingReport.materials_used?.length
                    ? existingReport.materials_used
                    : [EMPTY_MATERIAL()],
            });
            setClientSearch(existingReport.client_name || '');
        }
    }, [existingReport]);

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

    // Charger la facture liée quand le rapport est terminé/signé
    useEffect(() => {
        if (!isEditing || !user) return;
        const status = formData.status;
        if (status !== 'completed' && status !== 'signed') return;

        const fetchLinkedInvoice = async () => {
            const base = supabase
                .from('quotes')
                .select('id, title, public_token, report_pdf_url, client_id, client_name')
                .eq('type', 'invoice');

            // 1. Lien direct via invoice_id (le plus fiable)
            if (formData.invoice_id) {
                const { data } = await base.eq('id', formData.invoice_id).maybeSingle();
                if (data) { setLinkedInvoice(data); return; }
            }

            // 2. Par parent_id (devis lié)
            if (formData.quote_id) {
                const { data } = await base.eq('parent_id', formData.quote_id).maybeSingle();
                if (data) { setLinkedInvoice(data); return; }
            }

            // 3. Par report_pdf_url
            if (formData.report_pdf_url) {
                const { data } = await base.eq('report_pdf_url', formData.report_pdf_url).maybeSingle();
                if (data) { setLinkedInvoice(data); return; }
            }
        };

        fetchLinkedInvoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEditing, formData.status, formData.quote_id, formData.invoice_id, formData.report_pdf_url, user]);

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

    const handlePhotoUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        setUploadingPhotos(true);
        try {
            const uploaded = [];
            for (const file of files) {
                const ext = file.name.split('.').pop();
                const path = `interventions/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
                const { error: uploadError } = await supabase.storage
                    .from('project-photos')
                    .upload(path, file);
                if (uploadError) throw uploadError;
                const { data: { publicUrl } } = supabase.storage
                    .from('project-photos')
                    .getPublicUrl(path);
                uploaded.push({ url: publicUrl, path, name: file.name });
            }
            setFormData(prev => ({ ...prev, photos: [...(prev.photos || []), ...uploaded] }));
            toast.success(`${uploaded.length} photo(s) ajoutée(s)`);
        } catch (err) {
            toast.error('Erreur lors de l\'upload des photos');
        } finally {
            setUploadingPhotos(false);
            e.target.value = '';
        }
    };

    const removePhoto = async (photo) => {
        try {
            if (photo.path) {
                await supabase.storage.from('project-photos').remove([photo.path]);
            }
            setFormData(prev => ({ ...prev, photos: prev.photos.filter(p => p.url !== photo.url) }));
        } catch (err) {
            toast.error('Erreur lors de la suppression');
        }
    };

    const handleSave = async (statusOverride = null) => {
        if (!formData.title.trim()) {
            toast.error('Le titre est obligatoire');
            return false;
        }

        setSaving(true);
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
                notes: formData.notes || null,
                status: statusOverride || formData.status,
                client_signature: formData.client_signature || null,
                signed_at: formData.signed_at || null,
                signer_name: formData.signer_name || null,
                updated_at: new Date().toISOString(),
            };

            // Ajouter photos seulement si la colonne existe (migration appliquée)
            const photosPayload = formData.photos?.length ? { photos: formData.photos } : {};

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
                        invalidateInterventionReports();
                        navigate(`/app/interventions/${d2.id}`, { replace: true });
                        invalidateInterventionReports();
                        toast.success('Rapport sauvegardé');
                        return d2.id;
                    }
                    throw error;
                }
                invalidateInterventionReports();
                navigate(`/app/interventions/${data.id}`, { replace: true });
                invalidateInterventionReports();
                toast.success('Rapport sauvegardé');
                return data.id;
            }

            invalidateInterventionReports();
            toast.success('Rapport sauvegardé');
            return isEditing ? Number(id) : true;
        } catch (err) {
            console.error('handleSave error:', err);
            toast.error('Erreur lors de la sauvegarde');
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleResendInvoice = async () => {
        if (!linkedInvoice) return;
        const clientId = formData.client_id || linkedInvoice.client_id;
        let client = clients.find(c => String(c.id) === String(clientId));
        if (!client && clientId) {
            const { data } = await supabase.from('clients').select('*').eq('id', clientId).single();
            client = data;
        }
        if (!client?.email) {
            toast.error(`Le client n'a pas d'email enregistré`);
            return;
        }

        // Générer et uploader le PDF du rapport s'il n'existe pas encore
        let reportUrl = linkedInvoice.report_pdf_url || formData.report_pdf_url;
        if (!reportUrl) {
            const toastId = 'uploading-report-pdf';
            toast.loading('Génération du rapport PDF…', { id: toastId });
            try {
                const reportBlob = await generateInterventionReportPDF(formData, userProfile, true);
                const reportPath = `interventions/${user.id}/rapport-${formData.report_number || 'INT'}-${Date.now()}.pdf`;
                const { error: uploadError } = await supabase.storage
                    .from('quote_files')
                    .upload(reportPath, reportBlob, { contentType: 'application/pdf' });
                if (uploadError) throw uploadError;
                const { data: { publicUrl } } = supabase.storage.from('quote_files').getPublicUrl(reportPath);
                reportUrl = publicUrl;
                // Persister le lien PDF sur le rapport et la facture
                await supabase.from('intervention_reports').update({ report_pdf_url: reportUrl }).eq('id', formData.id);
                await supabase.from('quotes').update({ report_pdf_url: reportUrl }).eq('id', linkedInvoice.id);
                setFormData(prev => ({ ...prev, report_pdf_url: reportUrl }));
                setLinkedInvoice(prev => ({ ...prev, report_pdf_url: reportUrl }));
                toast.dismiss(toastId);
            } catch (err) {
                toast.dismiss(toastId);
                console.error('Upload rapport PDF échoué :', err);
                toast.warning(`PDF non uploadé : ${err?.message || 'erreur inconnue'}`, { duration: 5000 });
            }
        }

        const invoiceUrl = `${window.location.origin}/q/${linkedInvoice.public_token}`;
        const companyName = userProfile?.company_name || userProfile?.full_name || 'Votre Artisan';
        const signatureBlock = [companyName, userProfile?.phone || '', userProfile?.professional_email || userProfile?.email || ''].filter(Boolean).join('\n');
        const subject = `Facture : ${linkedInvoice.title || formData.title} - ${companyName}`;
        const body =
            `Bonjour ${client.name},\n\n` +
            `Le rapport d'intervention "${formData.title}" est termine.\n\n` +
            `Vous trouverez ci-dessous le lien pour consulter et telecharger les documents :\n\n` +
            `Facture :\n${invoiceUrl}\n\n` +
            (reportUrl ? `Le rapport d'intervention est egalement disponible depuis ce lien.\n\n` : '') +
            `Cordialement,\n${signatureBlock}`;
        setSendInvoiceModal({ email: client.email, subject, body });
    };

    const handleMarkCompleted = async () => {
        const savedId = await handleSave('completed');
        if (!savedId) return;

        const toastId = 'completing-invoice';
        toast.loading('Génération de la facture de clôture…', { id: toastId });

        try {
            // --- Résoudre le devis lié ---
            const linkedQuote = formData.quote_id
                ? allQuotes.find(q => q.id.toString() === formData.quote_id.toString())
                    ?? (await supabase.from('quotes').select('*').eq('id', formData.quote_id).single()).data
                : null;

            // --- Résoudre le client (cache → fallback DB) ---
            const clientId = formData.client_id || linkedQuote?.client_id;
            if (!clientId) {
                toast.dismiss(toastId);
                toast.error('Aucun client associé au rapport — facture non générée');
                return;
            }
            let client = clients.find(c => c.id.toString() === clientId.toString());
            if (!client) {
                const { data: dbClient } = await supabase
                    .from('clients').select('*').eq('id', clientId).single();
                client = dbClient;
            }
            const hasEmail = !!client?.email;
            if (!hasEmail) {
                toast.warning(`Facture créée — ${client?.name || 'ce client'} n'a pas d'email, vous devrez l'envoyer manuellement`);
            }

            // --- 1. Base : items du devis signé lié ---
            const baseItems = linkedQuote?.items
                ? linkedQuote.items.map(i => ({
                    description: i.description,
                    quantity: parseFloat(i.quantity) || 1,
                    unit: i.unit || 'unité',
                    price: parseFloat(i.price) || 0,
                    buying_price: parseFloat(i.buying_price) || 0,
                    type: i.type || 'service',
                }))
                : [];

            // --- 2. Matériaux supplémentaires du rapport ---
            const reportMaterials = (formData.materials_used || [])
                .filter(m => m.description?.trim())
                .map(m => ({
                    description: `[Matériel rapport] ${m.description}`,
                    quantity: parseFloat(m.quantity) || 1,
                    unit: m.unit || 'unité',
                    price: parseFloat(m.price) || 0,
                    buying_price: 0,
                    type: 'material',
                }));

            // --- 3. Main d'œuvre supplémentaire (heures rapport) ---
            // Ajoutée uniquement si aucun devis signé n'est lié (pour éviter le doublon avec les items du devis)
            const hours = parseFloat(formData.duration_hours);
            const hourlyRate = parseFloat(userProfile?.ai_hourly_rate);
            const laborItems = (!linkedQuote && hours > 0 && hourlyRate > 0)
                ? [{
                    description: `Main d'œuvre — ${formData.title || 'Intervention'} (${hours}h)`,
                    quantity: hours,
                    unit: 'h',
                    price: hourlyRate,
                    buying_price: 0,
                    type: 'service',
                }]
                : [];

            const items = [...baseItems, ...reportMaterials, ...laborItems];
            if (items.length === 0) {
                items.push({ description: formData.title || 'Intervention', quantity: 1, unit: 'forfait', price: 0, buying_price: 0, type: 'service' });
            }

            // Les micro-entrepreneurs (auto-entrepreneurs) sont en franchise de TVA
            const isAutoEntrepreneur = userProfile?.artisan_status === 'micro_entreprise';
            const includeTva = !isAutoEntrepreneur && (linkedQuote?.include_tva !== false);
            const totalHT = items.reduce((s, i) => s + i.quantity * i.price, 0);
            const totalTVA = includeTva ? totalHT * 0.2 : 0;
            const totalTTC = totalHT + totalTVA;

            // --- 4. Créer la facture dans Supabase ---
            const invoiceToken = crypto.randomUUID();

            // --- 5. Uploader le rapport PDF avant de créer la facture ---
            const reportBlob = await generateInterventionReportPDF(formData, userProfile, true);
            const reportPath = `interventions/${user.id}/rapport-${formData.report_number || 'INT'}-${Date.now()}.pdf`;
            const { error: uploadError } = await supabase.storage
                .from('quote_files')
                .upload(reportPath, reportBlob, { contentType: 'application/pdf' });

            if (uploadError) {
                console.error('Upload rapport PDF échoué :', uploadError);
                toast.warning(`PDF non uploadé : ${uploadError.message}`, { duration: 5000 });
            }

            let reportUrl = null;
            if (!uploadError) {
                const { data: { publicUrl: rUrl } } = supabase.storage
                    .from('quote_files')
                    .getPublicUrl(reportPath);
                reportUrl = rUrl;
            }

            // Stocker le lien PDF sur le rapport lui-même (pour retrouver le lien depuis n'importe quelle facture liée)
            if (reportUrl) {
                await supabase
                    .from('intervention_reports')
                    .update({ report_pdf_url: reportUrl })
                    .eq('id', savedId);
            }

            // Si un devis/facture est lié au rapport, on lui affecte aussi le lien du PDF
            if (reportUrl && formData.quote_id) {
                await supabase
                    .from('quotes')
                    .update({ report_pdf_url: reportUrl })
                    .eq('id', formData.quote_id);
            }

            const invoicePayload = {
                user_id: user.id,
                client_id: clientId ? Number(clientId) : null,
                client_name: client?.name || formData.client_name || null,
                title: linkedQuote?.title || formData.title || 'Facture de clôture',
                date: new Date().toISOString().split('T')[0],
                type: 'invoice',
                status: 'sent',
                items,
                total_ht: totalHT,
                total_tva: totalTVA,
                total_ttc: totalTTC,
                include_tva: includeTva,
                public_token: invoiceToken,
                notes: `Facture de clôture — rapport d'intervention du ${formData.date || new Date().toLocaleDateString('fr-FR')}`,
                report_pdf_url: reportUrl,
                // Lier la facture au devis d'origine pour que le dashboard retire ce devis des "À traiter"
                parent_id: linkedQuote?.id || null,
            };

            const { data: newInvoice, error: invoiceError } = await supabase
                .from('quotes')
                .insert([invoicePayload])
                .select()
                .single();

            if (invoiceError) throw invoiceError;

            // Passer le devis lié en "Facturé" pour refléter l'avancement dans le pipeline
            if (linkedQuote?.id) {
                await supabase
                    .from('quotes')
                    .update({ status: 'billed' })
                    .eq('id', linkedQuote.id);
            }

            toast.dismiss(toastId);
            toast.success('Facture de clôture créée');

            // Stocker invoice_id sur le rapport pour retrouver la facture facilement
            await supabase
                .from('intervention_reports')
                .update({ invoice_id: newInvoice.id })
                .eq('id', savedId);

            // Mettre à jour le state local pour que le bouton "Envoyer la facture" apparaisse
            setLinkedInvoice(newInvoice);
            setFormData(prev => ({ ...prev, status: 'completed', invoice_id: newInvoice.id }));

            // --- 6. Préparer le modal email ---
            const invoiceUrl = `${window.location.origin}/q/${invoiceToken}`;
            const companyName = userProfile?.company_name || userProfile?.full_name || 'Votre Artisan';
            const subject = `Facture N°${newInvoice.id} : ${newInvoice.title} - ${companyName}`;
            const signatureBlock = [
                companyName,
                userProfile?.phone || '',
                userProfile?.professional_email || userProfile?.email || '',
            ].filter(Boolean).join('\n');

            const body =
                `Bonjour ${client.name},\n\n` +
                `Le rapport d'intervention "${formData.title}" est terminé.\n\n` +
                `Vous trouverez ci-dessous le lien pour consulter et telecharger les documents :\n\n` +
                `Facture de cloture :\n${invoiceUrl}\n\n` +
                (reportUrl ? `Le rapport d'intervention est egalement disponible depuis ce lien.\n\n` : '') +
                `Cordialement,\n${signatureBlock}`;

            if (hasEmail) {
                setSendInvoiceModal({ email: client.email, subject, body });
            }

        } catch (err) {
            toast.dismiss(toastId);
            console.error('handleMarkCompleted error:', err);
            toast.error(`Erreur : ${err?.message || err?.code || 'inconnue'}`, { duration: 8000 });
        }
    };

    const handleCreateInvoiceFromReport = () => {
        const now = Date.now();
        const materials = (formData.materials_used || [])
            .filter(m => m.description?.trim())
            .map((m, i) => ({
                id: now + i + 100,
                description: m.description,
                quantity: parseFloat(m.quantity) || 1,
                unit: m.unit || 'unité',
                price: parseFloat(m.price) || 0,
                buying_price: 0,
                type: 'material',
            }));

        const hours = parseFloat(formData.duration_hours);
        const hourlyRate = parseFloat(userProfile?.ai_hourly_rate) || 0;
        const laborItems = (hours > 0 && hourlyRate > 0)
            ? [{
                id: now,
                description: `Main d'œuvre — ${formData.title || 'Intervention'} (${hours}h)`,
                quantity: hours,
                unit: 'h',
                price: hourlyRate,
                buying_price: 0,
                type: 'service',
            }]
            : [{
                id: now,
                description: formData.work_done || formData.description || formData.title || 'Intervention',
                quantity: 1,
                unit: 'forfait',
                price: 0,
                buying_price: 0,
                type: 'service',
            }];

        const items = [...laborItems, ...materials];
        const notes = [
            `Rapport d'intervention ${formData.report_number || ''} du ${formData.date || ''}`,
            formData.work_done || formData.description || '',
        ].filter(Boolean).join('\n\n').trim();

        navigate('/app/devis/new', {
            state: {
                fromReport: {
                    client_id: formData.client_id,
                    title: formData.title,
                    items,
                    notes,
                },
            },
        });
    };

    const handleExportPDF = async () => {
        setExporting(true);
        try {
            await generateInterventionReportPDF(formData, userProfile);
            toast.success('PDF généré');
        } catch (err) {
            toast.error('Erreur lors de la génération du PDF');
        } finally {
            setExporting(false);
        }
    };

    const materialsTotal = formData.materials_used
        .filter(m => m.description.trim())
        .reduce((sum, m) => sum + (parseFloat(m.quantity) || 0) * (parseFloat(m.price) || 0), 0);

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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/app/interventions')}
                        className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <ClipboardList className="w-6 h-6 text-blue-600" />
                            {isEditing ? 'Modifier le rapport' : 'Nouveau rapport d\'intervention'}
                        </h1>
                        {formData.status === 'signed' && (
                            <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 mt-0.5">
                                <CheckCircle className="w-3 h-3" />
                                Signé par le client
                            </p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {formData.status !== 'signed' && (
                        <button
                            onClick={() => setShowSignatureModal(true)}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors font-medium"
                        >
                            <PenLine className="w-4 h-4" />
                            Faire signer
                        </button>
                    )}
                    {formData.status === 'draft' && (
                        <button
                            onClick={handleMarkCompleted}
                            disabled={saving}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors font-medium"
                        >
                            <CheckCircle className="w-4 h-4" />
                            Marquer terminé
                        </button>
                    )}
                    {linkedInvoice && (formData.status === 'completed' || formData.status === 'signed') && (
                        <button
                            onClick={handleResendInvoice}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors font-medium"
                        >
                            <Send className="w-4 h-4" />
                            Envoyer la facture
                        </button>
                    )}
                    {linkedInvoice && (
                        <button
                            onClick={() => navigate(`/app/devis/${linkedInvoice.id}`)}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors font-medium"
                        >
                            <ExternalLink className="w-4 h-4" />
                            Voir la facture
                        </button>
                    )}
                    {isEditing && !linkedInvoice && (formData.status === 'completed' || formData.status === 'signed') && (
                        <button
                            onClick={handleCreateInvoiceFromReport}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors font-medium"
                        >
                            <FileCheck className="w-4 h-4" />
                            Créer une facture
                        </button>
                    )}
                    <button
                        onClick={handleExportPDF}
                        disabled={exporting}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
                    >
                        {exporting
                            ? <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                            : <FileDown className="w-4 h-4" />}
                        PDF
                    </button>
                    <button
                        onClick={() => handleSave()}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm disabled:opacity-60"
                    >
                        {saving
                            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            : <Save className="w-4 h-4" />}
                        Enregistrer
                    </button>
                </div>
            </div>

            {/* General Info */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <ClipboardList className="w-5 h-5 text-blue-500" />
                    Informations générales
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Titre de l'intervention <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={formData.title}
                            onChange={e => updateField('title', e.target.value)}
                            placeholder="Ex : Dépannage fuite sous-évier, salle de bain..."
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            N° de rapport
                        </label>
                        <input
                            type="text"
                            value={formData.report_number}
                            onChange={e => updateField('report_number', e.target.value)}
                            placeholder="INT-2024-001"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Date
                        </label>
                        <input
                            type="date"
                            value={formData.date}
                            onChange={e => updateField('date', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Statut
                        </label>
                        <select
                            value={formData.status}
                            onChange={e => updateField('status', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="draft">Brouillon</option>
                            <option value="completed">Terminé</option>
                            <option value="signed">Signé</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Client */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <User className="w-5 h-5 text-blue-500" />
                    Client
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="relative" ref={clientDropdownRef}>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Rechercher un client
                        </label>
                        <input
                            type="text"
                            value={clientSearch}
                            onChange={e => {
                                setClientSearch(e.target.value);
                                setShowClientDropdown(true);
                                if (!e.target.value) {
                                    setFormData(prev => ({ ...prev, client_id: '', client_name: '', quote_id: '' }));
                                }
                            }}
                            onFocus={() => setShowClientDropdown(true)}
                            placeholder="Tapez pour rechercher..."
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        {showClientDropdown && (
                            <ul className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                                <li
                                    className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                                    onMouseDown={() => handleClientChange('')}
                                >
                                    — Aucun client —
                                </li>
                                {clients
                                    .filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
                                    .map(c => (
                                        <li
                                            key={c.id}
                                            onMouseDown={() => handleClientChange(String(c.id))}
                                            className="px-3 py-2 text-sm text-gray-900 dark:text-white cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30"
                                        >
                                            {c.name}
                                        </li>
                                    ))
                                }
                            </ul>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Nom du client (libre)
                        </label>
                        <input
                            type="text"
                            value={formData.client_name}
                            onChange={e => updateField('client_name', e.target.value)}
                            placeholder="Ou saisir un nom manuellement"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Devis / Facture lié(e)
                    </label>
                    <select
                        value={formData.quote_id}
                        onChange={e => handleQuoteChange(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="">— Aucun devis lié —</option>
                        {clientQuotes.map(q => (
                            <option key={q.id} value={q.id}>
                                {q.title || `Devis #${q.id}`}
                                {q.date ? ` — ${new Date(q.date).toLocaleDateString('fr-FR')}` : ''}
                                {q.total_ttc ? ` — ${parseFloat(q.total_ttc).toFixed(2)} €` : ''}
                            </option>
                        ))}
                    </select>
                    {formData.quote_id && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                            L'adresse du devis a été pré-remplie si le champ était vide.
                        </p>
                    )}
                </div>
            </div>

            {/* Location */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-blue-500" />
                    Lieu d'intervention
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-3">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Adresse</label>
                        <input
                            type="text"
                            value={formData.intervention_address}
                            onChange={e => updateField('intervention_address', e.target.value)}
                            placeholder="N° et nom de rue"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Code postal</label>
                        <input
                            type="text"
                            value={formData.intervention_postal_code}
                            onChange={e => updateField('intervention_postal_code', e.target.value)}
                            placeholder="75001"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ville</label>
                        <input
                            type="text"
                            value={formData.intervention_city}
                            onChange={e => updateField('intervention_city', e.target.value)}
                            placeholder="Paris"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                </div>
            </div>

            {/* Time Tracking */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <Clock className="w-5 h-5 text-blue-500" />
                    Suivi du temps
                </h2>
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Heure début</label>
                        <input
                            type="time"
                            value={formData.start_time}
                            onChange={e => updateField('start_time', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Heure fin</label>
                        <input
                            type="time"
                            value={formData.end_time}
                            onChange={e => updateField('end_time', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Durée (h)</label>
                        <input
                            type="number"
                            min="0"
                            step="0.25"
                            value={formData.duration_hours}
                            onChange={e => updateField('duration_hours', e.target.value)}
                            placeholder="1.5"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>
            </div>

            {/* Work Description */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Wrench className="w-5 h-5 text-blue-500" />
                        Description des travaux
                    </h2>
                    {micSupported && (
                        <button
                            type="button"
                            onClick={handleDictate}
                            disabled={processingAudio}
                            title={isRecording ? 'Arrêter la dictée' : 'Dicter le rapport vocalement'}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                isRecording
                                    ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 animate-pulse'
                                    : processingAudio
                                        ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
                                        : 'bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-400'
                            }`}
                        >
                            {processingAudio
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyse en cours…</>
                                : isRecording
                                    ? <><MicOff className="w-4 h-4" /> Arrêter ({recordingDuration}s)</>
                                    : <><Mic className="w-4 h-4" /><Sparkles className="w-3 h-3" /> Dicter</>
                            }
                        </button>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Problème constaté / Description de la demande
                    </label>
                    <textarea
                        value={formData.description}
                        onChange={e => updateField('description', e.target.value)}
                        rows={3}
                        placeholder="Décrire le problème ou la demande du client..."
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Travaux réalisés
                    </label>
                    <textarea
                        value={formData.work_done}
                        onChange={e => updateField('work_done', e.target.value)}
                        rows={4}
                        placeholder="Décrire en détail les travaux effectués, les pièces remplacées, les réglages effectués..."
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    />
                </div>
            </div>

            {/* Materials */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Package className="w-5 h-5 text-blue-500" />
                        Matériaux utilisés
                    </h2>
                    <button
                        onClick={addMaterial}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Ajouter
                    </button>
                </div>

                {formData.materials_used.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 italic">Aucun matériau renseigné</p>
                ) : (
                    <div className="space-y-2">
                        {/* Header row - desktop only */}
                        <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 px-2">
                            <span className="col-span-5">Désignation</span>
                            <span className="col-span-2">Qté</span>
                            <span className="col-span-2">Unité</span>
                            <span className="col-span-2">P.U. (€)</span>
                            <span className="col-span-1"></span>
                        </div>
                        {formData.materials_used.map(material => (
                            <div key={material.id} className="grid grid-cols-12 gap-2 items-center">
                                <input
                                    type="text"
                                    value={material.description}
                                    onChange={e => updateMaterial(material.id, 'description', e.target.value)}
                                    placeholder="Désignation du matériau"
                                    className="col-span-12 md:col-span-5 px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                <input
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    value={material.quantity}
                                    onChange={e => updateMaterial(material.id, 'quantity', e.target.value)}
                                    className="col-span-4 md:col-span-2 px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                />
                                <input
                                    type="text"
                                    value={material.unit}
                                    onChange={e => updateMaterial(material.id, 'unit', e.target.value)}
                                    placeholder="unité"
                                    className="col-span-4 md:col-span-2 px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={material.price}
                                    onChange={e => updateMaterial(material.id, 'price', e.target.value)}
                                    placeholder="0.00"
                                    className="col-span-3 md:col-span-2 px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                />
                                <button
                                    onClick={() => removeMaterial(material.id)}
                                    className="col-span-1 flex justify-center p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                        {materialsTotal > 0 && (
                            <div className="flex justify-end pt-2 border-t border-gray-100 dark:border-gray-700">
                                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                    Total matériaux : {materialsTotal.toFixed(2)} €
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Photos */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Camera className="w-5 h-5 text-blue-500" />
                        Photos de l'intervention
                    </h2>
                    <label className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg cursor-pointer transition-colors font-medium
                        ${uploadingPhotos
                            ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                            : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40'}`}>
                        {uploadingPhotos
                            ? <><div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /> Upload...</>
                            : <><Camera className="w-4 h-4" /> Ajouter des photos</>}
                        <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            disabled={uploadingPhotos}
                            onChange={handlePhotoUpload}
                        />
                    </label>
                </div>

                {(formData.photos || []).length === 0 ? (
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors">
                        <Camera className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
                        <span className="text-sm text-gray-400 dark:text-gray-500">Cliquez pour ajouter des photos</span>
                        <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
                    </label>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {(formData.photos || []).map((photo, idx) => (
                            <div key={photo.url} className="relative group rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 flex items-center justify-center" style={{ minHeight: '100px', aspectRatio: '4/3' }}>
                                <img
                                    src={photo.url}
                                    alt={photo.name || `Photo ${idx + 1}`}
                                    className="w-full h-full object-contain"
                                />
                                <button
                                    onClick={() => removePhoto(photo)}
                                    className="absolute top-1.5 right-1.5 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                                    title="Supprimer"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                        <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors" style={{ aspectRatio: '4/3' }}>
                            <Plus className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                            <span className="text-xs text-gray-400 dark:text-gray-500 mt-1">Ajouter</span>
                            <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
                        </label>
                    </div>
                )}
            </div>

            {/* Notes */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <StickyNote className="w-5 h-5 text-blue-500" />
                    Notes internes
                </h2>
                <textarea
                    value={formData.notes}
                    onChange={e => updateField('notes', e.target.value)}
                    rows={3}
                    placeholder="Notes, remarques, recommandations pour le client ou usage interne..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
            </div>

            {/* Signature Section */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <PenLine className="w-5 h-5 text-blue-500" />
                    Signature client
                </h2>
                {formData.client_signature ? (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                            <CheckCircle className="w-4 h-4" />
                            Signature enregistrée
                            {formData.signed_at && (
                                <span className="text-gray-500 dark:text-gray-400">
                                    — {new Date(formData.signed_at).toLocaleString('fr-FR')}
                                </span>
                            )}
                        </div>
                        <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-2 bg-gray-50 dark:bg-gray-700 inline-block">
                            <img
                                src={formData.client_signature}
                                alt="Signature client"
                                className="max-h-24 w-auto"
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <div>
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Nom du signataire</label>
                                <input
                                    type="text"
                                    value={formData.signer_name}
                                    onChange={e => updateField('signer_name', e.target.value)}
                                    placeholder="Nom et prénom"
                                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <button
                                onClick={() => {
                                    setFormData(prev => ({ ...prev, client_signature: null, signed_at: null, status: 'completed' }));
                                }}
                                className="mt-5 text-xs text-red-500 hover:text-red-700 underline"
                            >
                                Effacer la signature
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Faites signer le rapport par le client pour valider l'intervention.
                        </p>
                        <div className="mb-3">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom du signataire</label>
                            <input
                                type="text"
                                value={formData.signer_name}
                                onChange={e => updateField('signer_name', e.target.value)}
                                placeholder="Nom et prénom du client"
                                className="w-full md:w-64 px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <button
                            onClick={() => setShowSignatureModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm"
                        >
                            <PenLine className="w-4 h-4" />
                            Ouvrir le pad de signature
                        </button>
                    </div>
                )}
            </div>

            {/* Bottom Save */}
            <div className="flex justify-end gap-3 pb-4">
                <button
                    onClick={() => navigate('/app/interventions')}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
                >
                    Annuler
                </button>
                <button
                    onClick={() => handleSave()}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm disabled:opacity-60"
                >
                    {saving
                        ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <Save className="w-4 h-4" />}
                    Enregistrer
                </button>
            </div>

            {/* Signature Modal */}
            <SignatureModal
                isOpen={showSignatureModal}
                onClose={() => setShowSignatureModal(false)}
                onSave={handleSignatureSave}
            />

            {/* Modal envoi facture automatique */}
            {sendInvoiceModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg">
                        <div className="p-6 space-y-4">
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900 dark:text-white text-lg">Rapport terminé !</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                        Facture de clôture créée. Envoyez-la au client avec le rapport d'intervention.
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div>
                                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Destinataire</label>
                                    <input
                                        type="text"
                                        value={sendInvoiceModal.email}
                                        onChange={e => setSendInvoiceModal(prev => ({ ...prev, email: e.target.value }))}
                                        className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Objet</label>
                                    <input
                                        type="text"
                                        value={sendInvoiceModal.subject}
                                        onChange={e => setSendInvoiceModal(prev => ({ ...prev, subject: e.target.value }))}
                                        className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Message</label>
                                    <textarea
                                        rows={7}
                                        value={sendInvoiceModal.body}
                                        onChange={e => setSendInvoiceModal(prev => ({ ...prev, body: e.target.value }))}
                                        className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 pt-1">
                                <button
                                    onClick={() => setSendInvoiceModal(null)}
                                    className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                >
                                    Ignorer
                                </button>
                                <button
                                    onClick={() => {
                                        if (isTestMode) {
                                            captureEmail({ email: sendInvoiceModal.email, subject: sendInvoiceModal.subject, body: sendInvoiceModal.body });
                                            toast.success('📬 Email capturé dans l\'inbox test', { duration: 4000 });
                                        } else {
                                            const url = `mailto:${sendInvoiceModal.email}?subject=${encodeURIComponent(sendInvoiceModal.subject)}&body=${encodeURIComponent(sendInvoiceModal.body)}`;
                                            window.location.href = url;
                                        }
                                        setSendInvoiceModal(null);
                                    }}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    <Send className="w-4 h-4" />
                                    Ouvrir dans la messagerie
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InterventionReportForm;
