import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Save, Globe, MapPin, Navigation, History, Users, FileText, Palette, Mail, Phone, MessageSquare, Calendar, Trash2, Mic, Sparkles, FilePlus, Zap, ExternalLink, Trash, Loader2, RefreshCw, Ban, Copy, CheckCircle, Clock } from 'lucide-react';
import { toastError } from '../utils/supabaseErrorHandler';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { toast } from 'sonner';
// import { useVoice } from '../hooks/useVoice'; // Removed direct hook usage
import SmartVoiceModal from '../components/SmartVoiceModal';
import ClientHistory from '../components/ClientHistory';
import ClientContacts from '../components/ClientContacts';
import ClientReferences from '../components/ClientReferences';

// ProjectPhotos pulls in react-zoom-pan-pinch + react-easy-crop + heavy
// canvas compositing logic (~80 KB). Only edit-mode users with photos
// actually need it, so we ship it as a separate chunk loaded on demand.
const ProjectPhotos = lazy(() => import('../components/ProjectPhotos'));

const ProjectPhotosFallback = () => (
    <div className="flex items-center justify-center py-8 text-gray-400 text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Chargement de la galerie photos…
    </div>
);

// ── Plans électriques d'un client ────────────────────────────────────────────
const ClientPlans = ({ clientId, clientName }) => {
    const navigate = useNavigate();
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchPlans = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('client_plans')
            .select('id, name, thumbnail, created_at, updated_at')
            .eq('client_id', clientId)
            .order('updated_at', { ascending: false });
        setPlans(data || []);
        setLoading(false);
    };

    useEffect(() => { fetchPlans(); }, [clientId]);

    const handleDelete = async (planId) => {
        if (!confirm('Supprimer ce plan ?')) return;
        await supabase.from('client_plans').delete().eq('id', planId);
        setPlans(prev => prev.filter(p => p.id !== planId));
    };

    if (loading) return <div className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">Chargement...</div>;

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">Plans électriques sauvegardés pour ce client.</p>
                <button
                    onClick={() => navigate('/app/outils')}
                    className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500 text-black rounded-lg text-sm font-semibold hover:bg-yellow-400 transition-colors"
                >
                    <Zap className="w-4 h-4" />
                    Nouveau plan
                </button>
            </div>

            {plans.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
                    <Zap className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-400 dark:text-gray-500">Aucun plan sauvegardé pour ce client.</p>
                    <button
                        onClick={() => navigate('/app/outils')}
                        className="mt-3 text-sm text-yellow-600 font-medium hover:underline"
                    >
                        Créer le premier plan →
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {plans.map(plan => (
                        <div key={plan.id} className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden hover:shadow-md transition-shadow group">
                            {/* Miniature */}
                            <div className="h-36 bg-gray-900 relative overflow-hidden">
                                {plan.thumbnail ? (
                                    <img src={plan.thumbnail} alt={plan.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <Zap className="w-10 h-10 text-yellow-500/40" />
                                    </div>
                                )}
                                {/* Overlay actions */}
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                    <button
                                        onClick={() => navigate(`/app/outils?plan_id=${plan.id}`)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500 text-black rounded-lg text-xs font-bold hover:bg-yellow-400"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        Ouvrir
                                    </button>
                                    <button
                                        onClick={() => handleDelete(plan.id)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-500"
                                    >
                                        <Trash className="w-3.5 h-3.5" />
                                        Supprimer
                                    </button>
                                </div>
                            </div>
                            {/* Infos */}
                            <div className="p-3 bg-white dark:bg-gray-900">
                                <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm truncate">{plan.name}</p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                    Modifié le {new Date(plan.updated_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

/* ─── Gestion du lien portail client ───────────────────────────────────────── */
const PortalTokenManager = ({ clientId, token, expiresAt, revoked, onUpdate }) => {
    const confirm = useConfirm();
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);

    if (!token) return null;

    const url = `${window.location.origin}/p/${token}`;
    const isExpired = expiresAt && new Date(expiresAt) < new Date();
    const daysLeft = expiresAt
        ? Math.ceil((new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24))
        : null;

    let statusBadge;
    if (revoked) {
        statusBadge = <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full"><Ban className="w-3 h-3" />Révoqué</span>;
    } else if (isExpired) {
        statusBadge = <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" />Expiré</span>;
    } else if (daysLeft !== null && daysLeft <= 30) {
        statusBadge = <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" />Expire dans {daysLeft}j</span>;
    } else {
        statusBadge = <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" />Actif</span>;
    }

    const expireText = expiresAt
        ? `jusqu'au ${new Date(expiresAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`
        : 'sans expiration';

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Impossible de copier le lien');
        }
    };

    const handleRegenerate = async () => {
        const ok = await confirm({
            title: 'Régénérer le lien portail ?',
            message: 'L\'ancien lien deviendra immédiatement invalide. Vous devrez renvoyer le nouveau lien à votre client.',
            confirmLabel: 'Régénérer',
        });
        if (!ok) return;
        setBusy(true);
        const { data, error } = await supabase.rpc('regenerate_client_portal_token', { p_client_id: clientId });
        setBusy(false);
        if (error || !data?.success) {
            return toastError(error || data, 'Impossible de régénérer le lien.');
        }
        toast.success('Nouveau lien portail généré.', { description: `Valide ${expireText.replace("jusqu'au", "jusqu'au ").includes('sans') ? '1 an' : 'à nouveau 1 an'}.` });
        onUpdate({ portal_token: data.token, portal_token_expires_at: data.expires_at, portal_token_revoked: false });
    };

    const handleRevoke = async () => {
        const ok = await confirm({
            title: 'Révoquer le lien portail ?',
            message: 'Le lien deviendra immédiatement invalide. Le client n\'aura plus accès à son espace tant que vous ne régénérerez pas un nouveau lien.',
            confirmLabel: 'Révoquer',
            danger: true,
        });
        if (!ok) return;
        setBusy(true);
        const { data, error } = await supabase.rpc('revoke_client_portal_token', { p_client_id: clientId });
        setBusy(false);
        if (error || !data?.success) {
            return toastError(error || data, 'Impossible de révoquer le lien.');
        }
        toast.success('Lien portail révoqué.');
        onUpdate({ portal_token_revoked: true });
    };

    return (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 rounded-2xl p-4 mb-6">
            <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-600" />
                    <span className="font-semibold text-sm text-blue-900">Espace client partagé</span>
                    {statusBadge}
                </div>
                <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                >
                    <ExternalLink className="w-3 h-3" />
                    Ouvrir
                </a>
            </div>

            <div className="bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-800/40 rounded-lg px-3 py-2 flex items-center gap-2 mb-3">
                <input
                    readOnly
                    value={url}
                    onClick={(e) => e.target.select()}
                    className="flex-1 min-w-0 text-xs font-mono text-gray-700 dark:text-gray-300 bg-transparent border-0 focus:outline-none truncate"
                />
                <button
                    type="button"
                    onClick={handleCopy}
                    className={`p-1.5 rounded-md transition-colors flex-shrink-0 ${copied ? 'text-green-600 bg-green-50 dark:bg-green-900/20' : 'text-gray-400 dark:text-gray-500 hover:text-blue-600 hover:bg-blue-50'}`}
                    title="Copier le lien"
                >
                    {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
            </div>

            <p className="text-xs text-blue-700 mb-3">
                {revoked
                    ? 'Ce lien a été révoqué — régénérez-en un nouveau pour redonner l\'accès au client.'
                    : isExpired
                        ? 'Ce lien est expiré — régénérez-en un nouveau pour redonner l\'accès au client.'
                        : `Lien valide ${expireText}. Partagez-le par email ou SMS avec votre client.`}
            </p>

            <div className="flex items-center gap-2 flex-wrap">
                <button
                    type="button"
                    onClick={handleRegenerate}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-800/40 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
                    {revoked || isExpired ? 'Générer un nouveau lien' : 'Régénérer'}
                </button>
                {!revoked && !isExpired && (
                    <button
                        type="button"
                        onClick={handleRevoke}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-white dark:bg-gray-900 border border-red-200 dark:border-red-800/40 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <Ban className="w-3.5 h-3.5" />
                        Révoquer
                    </button>
                )}
            </div>
        </div>
    );
};

const ClientForm = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const location = useLocation();
    const { user } = useAuth();
    const isEditing = !!id && id !== 'new';
    const confirm = useConfirm();
    const [loading, setLoading] = useState(false);

    // const { isListening, transcript, startListening, stopListening, resetTranscript } = useVoice(); // Removed
    const [activeTab, setActiveTab] = useState('info'); // 'info', 'contacts', 'history'
    const [showVoiceModal, setShowVoiceModal] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        address: '',
        postal_code: '',
        city: '',
        notes: '',
        status: 'lead',
        type: 'professional',
        siren: '',
        tva_intracom: '',
        portal_token: null,
        portal_token_expires_at: null,
        portal_token_revoked: false,
        contacts: []
    });

    // Handle Voice Data from Navigation
    useEffect(() => {
        if (location.state?.voiceData) {
            const { name, email, phone, address } = location.state.voiceData;
            setFormData(prev => ({
                ...prev,
                name: name || prev.name,
                email: email || prev.email,
                phone: phone || prev.phone,
                address: address || prev.address
            }));
            // Clear state
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    // Handle Voice Result from Smart Modal
    const handleVoiceResult = (data) => {
        setFormData(prev => ({
            ...prev,
            name: data.name || prev.name,
            // Only update if found to avoid erasing existing data accidentally?
            // Actually, if user dictates, they likely want to fill.
            // But let's be safe: override if non-empty.
            email: data.email || prev.email,
            phone: data.phone || prev.phone,
            address: data.address || prev.address,
            notes: data.notes ? (prev.notes ? prev.notes + '\n' + data.notes : data.notes) : prev.notes
        }));
    };

    useEffect(() => {
        if (isEditing && user) {
            fetchClient();
        }
    }, [id, user]);

    const fetchClient = async () => {
        try {
            const { data, error } = await supabase
                .from('clients')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            if (data) {
                setFormData({
                    name: data.name,
                    email: data.email || '',
                    phone: data.phone || '',
                    address: data.address || '',
                    postal_code: data.postal_code || '',
                    city: data.city || '',
                    notes: data.notes || '',
                    status: data.status || 'lead',
                    portal_token: data.portal_token,
                    portal_token_expires_at: data.portal_token_expires_at || null,
                    portal_token_revoked: data.portal_token_revoked || false,
                    type: data.type || 'professional',
                    siren: data.siren || '',
                    tva_intracom: data.tva_intracom || '',
                    contacts: data.contacts || []
                });
            }
        } catch (error) {
            toast.error('Erreur lors du chargement du client');
            console.error('Error fetching client:', error);
            navigate('/app/clients');
        }
    };

    const handleContactAction = async (type, value) => {
        if (!value) {
            toast.error(`Aucun ${type === 'email' ? 'email' : 'numéro'} défini`);
            return;
        }

        if (isEditing) {
            try {
                const { error } = await supabase.from('client_interactions').insert([{
                    user_id: user.id,
                    client_id: id,
                    type: type,
                    date: new Date(),
                    details: 'Action depuis fiche client'
                }]);

                if (!error && (type === 'call' || type === 'sms')) {
                    toast.success('Interaction enregistrée');
                }
            } catch (err) {
                console.error('Log interaction error', err);
            }
        }

        if (type === 'email') {
            window.location.href = `mailto:${value}`;
        } else if (type === 'call') {
            window.location.href = `tel:${value}`;
        } else if (type === 'sms') {
            window.location.href = `sms:${value}`;
        }
    };

    const handleDelete = async () => {
        const ok = await confirm({ title: 'Supprimer ce client', message: 'Toutes les données associées seront supprimées. Cette action est irréversible.', confirmLabel: 'Supprimer', danger: true });
        if (!ok) return;

        try {
            const { error } = await supabase
                .from('clients')
                .delete()
                .eq('id', id);

            if (error) throw error;
            toast.success('Client supprimé avec succès');
            navigate('/app/clients');
        } catch (error) {
            console.error('Error deleting client:', error);
            toast.error('Erreur lors de la suppression du client');
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const clientData = {
                ...formData,
                user_id: user.id
            };

            let error;
            if (isEditing) {
                // For updates, we don't need to resend user_id, and we should add updated_at
                const { user_id, ...updateData } = clientData;
                const { data, error: updateError } = await supabase
                    .from('clients')
                    .update({ ...updateData, updated_at: new Date() })
                    .eq('id', id)
                    .select();

                if (!updateError && (!data || data.length === 0)) {
                    throw new Error("L'enregistrement a échoué (client introuvable ou permissions insuffisantes).");
                }
                error = updateError;
            } else {
                const { error: insertError } = await supabase
                    .from('clients')
                    .insert([clientData])
                    .select();
                error = insertError;
            }

            if (error) throw error;

            toast.success(isEditing ? 'Client modifié avec succès' : 'Client créé avec succès');
            navigate('/app/clients');
        } catch (error) {
            toast.error('Erreur lors de la sauvegarde');
            console.error('Error saving client:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                <div className="flex items-center">
                    <button
                        onClick={() => navigate('/app/clients')}
                        className="mr-4 p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <h1 className="ios-title">
                        {isEditing ? 'Modifier le client' : 'Nouveau client'}
                    </h1>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => setShowVoiceModal(true)}
                        className="flex items-center px-3 py-2 text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg hover:from-indigo-600 hover:to-purple-700 shadow-sm"
                    >
                        <Sparkles className="w-4 h-4 mr-2" />
                        <span className="hidden sm:inline">IA Assistant</span>
                    </button>
                    {isEditing && (
                        <button
                            type="button"
                            onClick={() => navigate('/app/devis/new', {
                                state: {
                                    client_id: id
                                }
                            })}
                            className="flex items-center px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40"
                        >
                            <FilePlus className="w-4 h-4 mr-2" />
                            <span className="hidden sm:inline">Créer devis</span>
                        </button>
                    )}
                    {isEditing && (
                        <button
                            type="button"
                            onClick={() => navigate('/app/agenda', {
                                state: {
                                    prefill: {
                                        client_id: id,
                                        client_name: formData.name,
                                        address: [formData.address, formData.postal_code, formData.city].filter(Boolean).join(', ')
                                    }
                                }
                            })}
                            className="flex items-center px-3 py-2 text-sm font-medium text-purple-700 bg-purple-50 dark:bg-purple-900/20 rounded-lg hover:bg-purple-100"
                        >
                            <Calendar className="w-4 h-4 mr-2" />
                            <span className="hidden sm:inline">RDV</span>
                        </button>
                    )}
                    {isEditing && (
                        <button
                            type="button"
                            onClick={handleDelete}
                            className="flex items-center px-3 py-2 text-sm font-medium text-red-700 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100"
                            title="Supprimer le client"
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Supprimer
                        </button>
                    )}
                </div>
            </div>

            <div className="flex space-x-4 mb-6 border-b border-gray-200 dark:border-gray-700 overflow-x-auto pb-0.5">
                <button
                    onClick={() => setActiveTab('info')}
                    className={`pb-2 px-1 text-sm font-medium transition-colors relative whitespace-nowrap flex-shrink-0 ${activeTab === 'info' ? 'text-blue-600' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                >
                    <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Informations
                    </div>
                    {activeTab === 'info' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-ios rounded-t-full" />}
                </button>
                <button
                    onClick={() => setActiveTab('contacts')}
                    className={`pb-2 px-1 text-sm font-medium transition-colors relative whitespace-nowrap flex-shrink-0 ${activeTab === 'contacts' ? 'text-blue-600' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                >
                    <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Contacts
                    </div>
                    {activeTab === 'contacts' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-ios rounded-t-full" />}
                </button>
                {isEditing && (
                    <button
                        onClick={() => setActiveTab('materials')}
                        className={`pb-2 px-1 text-sm font-medium transition-colors relative whitespace-nowrap flex-shrink-0 ${activeTab === 'materials' ? 'text-blue-600' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                    >
                        <div className="flex items-center gap-2">
                            <Palette className="w-4 h-4" />
                            Matériaux
                        </div>
                        {activeTab === 'materials' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-ios rounded-t-full" />}
                    </button>
                )}
                {isEditing && (
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`pb-2 px-1 text-sm font-medium transition-colors relative whitespace-nowrap flex-shrink-0 ${activeTab === 'history' ? 'text-blue-600' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                    >
                        <div className="flex items-center gap-2">
                            <History className="w-4 h-4" />
                            Historique
                        </div>
                        {activeTab === 'history' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-ios rounded-t-full" />}
                    </button>
                )}
                {isEditing && (
                    <button
                        onClick={() => setActiveTab('plans')}
                        className={`pb-2 px-1 text-sm font-medium transition-colors relative whitespace-nowrap flex-shrink-0 ${activeTab === 'plans' ? 'text-yellow-600' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                    >
                        <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4" />
                            Plans élec.
                        </div>
                        {activeTab === 'plans' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-yellow-500 rounded-t-full" />}
                    </button>
                )}
            </div>

            {activeTab === 'info' && (
                <>
                    {isEditing && formData.portal_token && (
                        <PortalTokenManager
                            clientId={parseInt(id, 10)}
                            token={formData.portal_token}
                            expiresAt={formData.portal_token_expires_at}
                            revoked={formData.portal_token_revoked}
                            onUpdate={(updates) => setFormData(prev => ({ ...prev, ...updates }))}
                        />
                    )}
                <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 space-y-6">
                    <div>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label htmlFor="type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Type de client
                                </label>
                                <select
                                    id="type"
                                    name="type"
                                    className="block w-full px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-ios focus:border-ios"
                                    value={formData.type}
                                    onChange={handleChange}
                                >
                                    <option value="professional">Professionnel / Entreprise</option>
                                    <option value="individual">Particulier</option>
                                </select>
                            </div>
                            <div>
                                <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Statut
                                </label>
                                <select
                                    id="status"
                                    name="status"
                                    className="block w-full px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-ios focus:border-ios"
                                    value={formData.status}
                                    onChange={handleChange}
                                >
                                    <option value="lead">Demande / A Contacter</option>
                                    <option value="contacted">Visite / Devis à faire</option>
                                    <option value="proposal">Devis Envoyé</option>
                                    <option value="signed">Signé / En Cours</option>
                                    <option value="lost">Perdu / Sans suite</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex justify-between items-center mb-1">
                            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Nom complet / Entreprise *
                            </label>
                        </div>
                        <input
                            type="text"
                            id="name"
                            name="name"
                            required
                            className="block w-full px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-ios focus:border-ios"
                            value={formData.name}
                            onChange={handleChange}
                        />
                    </div>

                    {formData.type === 'professional' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label htmlFor="siren" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    SIREN (9 chiffres)
                                </label>
                                <input
                                    type="text"
                                    id="siren"
                                    name="siren"
                                    maxLength={9}
                                    placeholder="Ex: 123456789"
                                    className="block w-full px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-ios focus:border-ios"
                                    value={formData.siren}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, '').slice(0, 9);
                                        setFormData(prev => ({ ...prev, siren: val }));
                                    }}
                                />
                            </div>
                            <div>
                                <label htmlFor="tva_intracom" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Numéro de TVA Intracom.
                                </label>
                                <input
                                    type="text"
                                    id="tva_intracom"
                                    name="tva_intracom"
                                    placeholder="Ex: FR00123456789"
                                    className="block w-full px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-ios focus:border-ios"
                                    value={formData.tva_intracom}
                                    onChange={(e) => setFormData(prev => ({ ...prev, tva_intracom: e.target.value.toUpperCase() }))}
                                />
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <div className="flex items-center gap-2">
                                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Email
                                    </label>
                                    {isEditing && formData.email && (
                                        <button
                                            type="button"
                                            onClick={() => handleContactAction('email', formData.email)}
                                            className="p-1 text-blue-600 hover:bg-blue-50 rounded-full"
                                            title="Envoyer un email"
                                        >
                                            <Mail className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <input
                                type="email"
                                id="email"
                                name="email"
                                className="block w-full px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-ios focus:border-ios"
                                value={formData.email}
                                onChange={handleChange}
                            />
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <div className="flex items-center gap-2">
                                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Téléphone
                                    </label>
                                    {isEditing && formData.phone && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => handleContactAction('call', formData.phone)}
                                                className="p-1 text-green-600 hover:bg-green-50 rounded-full"
                                                title="Appeler"
                                            >
                                                <Phone className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleContactAction('sms', formData.phone)}
                                                className="p-1 text-blue-600 hover:bg-blue-50 rounded-full"
                                                title="Envoyer un SMS"
                                            >
                                                <MessageSquare className="w-4 h-4" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                            <input
                                type="tel"
                                id="phone"
                                name="phone"
                                className="block w-full px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-ios focus:border-ios"
                                value={formData.phone}
                                onChange={handleChange}
                            />
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label htmlFor="address" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Adresse
                            </label>
                            <div className="flex items-center gap-2">
                                {(formData.address || formData.postal_code || formData.city) && (
                                    <>
                                        <a
                                            href={`https://www.waze.com/ul?q=${encodeURIComponent([formData.address, formData.postal_code, formData.city].filter(Boolean).join(' '))}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-1 text-blue-500 hover:bg-blue-50 rounded-full"
                                            title="Ouvrir avec Waze"
                                        >
                                            <Navigation className="w-4 h-4" />
                                        </a>
                                        <a
                                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([formData.address, formData.postal_code, formData.city].filter(Boolean).join(' '))}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-1 text-green-600 hover:bg-green-50 rounded-full"
                                            title="Ouvrir avec Google Maps"
                                        >
                                            <MapPin className="w-4 h-4" />
                                        </a>
                                    </>
                                )}
                            </div>
                        </div>
                        <input
                            id="address"
                            name="address"
                            type="text"
                            placeholder="N° et nom de rue"
                            className="block w-full px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-ios focus:border-ios"
                            value={formData.address}
                            onChange={handleChange}
                        />
                        <div className="grid grid-cols-3 gap-2 mt-2">
                            <div>
                                <input
                                    name="postal_code"
                                    type="text"
                                    placeholder="Code postal"
                                    className="block w-full px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-ios focus:border-ios"
                                    value={formData.postal_code}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className="col-span-2">
                                <input
                                    name="city"
                                    type="text"
                                    placeholder="Ville"
                                    className="block w-full px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-ios focus:border-ios"
                                    value={formData.city}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Notes internes
                            </label>
                            <span className="text-xs text-gray-400 dark:text-gray-500 italic">Visible uniquement par vous</span>
                        </div>
                        <textarea
                            id="notes"
                            name="notes"
                            rows={2}
                            className="block w-full px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-ios focus:border-ios"
                            value={formData.notes}
                            onChange={handleChange}
                        />
                    </div>

                    <div className="flex justify-end pt-4 border-t border-gray-100 dark:border-gray-800">
                        <button
                            type="button"
                            onClick={() => navigate('/app/clients')}
                            className="px-4 py-2 mr-3 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                            Annuler
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex items-center px-4 py-2 text-sm font-medium text-white bg-ios rounded-lg hover:bg-ios-dark disabled:opacity-50"
                        >
                            <Save className="w-4 h-4 mr-2" />
                            {loading ? 'Enregistrement...' : 'Enregistrer'}
                        </button>
                    </div>
                </form>
                </>
            )}

            {activeTab === 'contacts' && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
                    <ClientContacts
                        contacts={formData.contacts}
                        onChange={(newContacts) => setFormData(prev => ({ ...prev, contacts: newContacts }))}
                    />
                    <div className="flex justify-end pt-4 mt-6 border-t border-gray-100 dark:border-gray-800">
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={loading}
                            className="flex items-center px-4 py-2 text-sm font-medium text-white bg-ios rounded-lg hover:bg-ios-dark disabled:opacity-50"
                        >
                            <Save className="w-4 h-4 mr-2" />
                            {loading ? 'Enregistrement...' : 'Enregistrer les contacts'}
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'materials' && isEditing && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
                    <ClientReferences clientId={id} />
                </div>
            )}

            {activeTab === 'history' && isEditing && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
                    <ClientHistory clientId={id} />
                </div>
            )}

            {activeTab === 'plans' && isEditing && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
                    <ClientPlans clientId={id} clientName={formData.name} />
                </div>
            )}

            {isEditing && (
                <Suspense fallback={<ProjectPhotosFallback />}>
                    <ProjectPhotos clientId={id} />
                </Suspense>
            )}

            <SmartVoiceModal
                isOpen={showVoiceModal}
                onClose={() => setShowVoiceModal(false)}
                onResult={handleVoiceResult}
                context="client"
            />
        </div>
    );
};

export default ClientForm;
