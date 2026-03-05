import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ClipboardList, Save, ArrowLeft, Plus, Trash2, FileDown,
    PenLine, Clock, MapPin, User, Wrench, Package, StickyNote,
    CheckCircle, Camera, X
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useClients, useQuotes, useInterventionReport, useInvalidateCache, useUserProfile } from '../hooks/useDataCache';
import SignatureModal from '../components/SignatureModal';
import { generateInterventionReportPDF } from '../utils/pdfGenerator';

const EMPTY_MATERIAL = () => ({ id: Date.now(), description: '', quantity: 1, unit: 'unité', price: 0 });

const InterventionReportForm = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isEditing = id && id !== 'new';

    const { data: existingReport, isLoading: loadingReport } = useInterventionReport(isEditing ? id : null);
    const { data: clients = [] } = useClients();
    const { data: allQuotes = [] } = useQuotes();
    const { data: userProfile } = useUserProfile();
    const { invalidateInterventionReports, invalidateInterventionReport } = useInvalidateCache();

    const [saving, setSaving] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [uploadingPhotos, setUploadingPhotos] = useState(false);

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

    // Load existing report when editing
    useEffect(() => {
        if (existingReport) {
            setFormData({
                ...existingReport,
                materials_used: existingReport.materials_used?.length
                    ? existingReport.materials_used
                    : [EMPTY_MATERIAL()],
            });
        }
    }, [existingReport]);

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

    // Sync client_name when client_id changes
    const handleClientChange = (clientId) => {
        const client = clients.find(c => String(c.id) === String(clientId));
        setFormData(prev => ({
            ...prev,
            client_id: clientId,
            client_name: client?.name || '',
            quote_id: '',  // reset quote when client changes
        }));
    };

    // Quotes filtered for the selected client
    const clientQuotes = formData.client_id
        ? allQuotes.filter(q => String(q.client_id) === String(formData.client_id))
        : allQuotes;

    const handleQuoteChange = (quoteId) => {
        const quote = allQuotes.find(q => String(q.id) === String(quoteId));
        setFormData(prev => ({
            ...prev,
            quote_id: quoteId,
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
            return;
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
                photos: formData.photos || [],
                notes: formData.notes || null,
                status: statusOverride || formData.status,
                client_signature: formData.client_signature || null,
                signed_at: formData.signed_at || null,
                signer_name: formData.signer_name || null,
                updated_at: new Date().toISOString(),
            };

            if (isEditing) {
                const { error } = await supabase
                    .from('intervention_reports')
                    .update(payload)
                    .eq('id', id);
                if (error) throw error;
                invalidateInterventionReport(id);
            } else {
                const { data, error } = await supabase
                    .from('intervention_reports')
                    .insert([{ ...payload, user_id: user.id }])
                    .select()
                    .single();
                if (error) throw error;
                invalidateInterventionReports();
                navigate(`/app/interventions/${data.id}`, { replace: true });
            }

            invalidateInterventionReports();
            toast.success('Rapport sauvegardé');
        } catch (err) {
            console.error(err);
            toast.error('Erreur lors de la sauvegarde');
        } finally {
            setSaving(false);
        }
    };

    const handleMarkCompleted = () => handleSave('completed');

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
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Sélectionner un client
                        </label>
                        <select
                            value={formData.client_id}
                            onChange={e => handleClientChange(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">— Aucun client —</option>
                            {clients.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
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
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <Wrench className="w-5 h-5 text-blue-500" />
                    Description des travaux
                </h2>
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
                            <div key={photo.url} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700">
                                <img
                                    src={photo.url}
                                    alt={photo.name || `Photo ${idx + 1}`}
                                    className="w-full h-full object-cover"
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
                        <label className="flex flex-col items-center justify-center aspect-square border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors">
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
        </div>
    );
};

export default InterventionReportForm;
