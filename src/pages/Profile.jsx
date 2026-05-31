import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import { Save, Building, MapPin, Phone, FileText, Layers, Bell, Settings, Mail, KeyRound, ChevronDown, RotateCcw, Send, CheckCircle, Radio, XCircle, Loader2, Sun, Moon, Keyboard, HelpCircle, ChevronRight, Shield, Upload } from 'lucide-react';
import { validateFileForUpload, UPLOAD_PRESETS } from '../utils/uploadValidation';
import { Link } from 'react-router-dom';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { TRADE_CONFIG } from '../constants/trades';
import { DEFAULT_QUOTE_PROMPT } from '../utils/aiService';
import { useConfirm } from '../context/ConfirmContext';

const PreferencesSection = () => {
    const [isDarkMode, setIsDarkMode] = useState(() =>
        typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
    );

    useEffect(() => {
        const sync = () => setIsDarkMode(document.documentElement.classList.contains('dark'));
        const observer = new MutationObserver(sync);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    const handleToggleTheme = () => window.dispatchEvent(new Event('artisan:toggle-theme'));
    const handleOpenShortcuts = () => window.dispatchEvent(new Event('artisan:open-shortcuts'));

    return (
        <div className="mt-8 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="p-8">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                    <Settings className="w-5 h-5 mr-2 text-gray-500 dark:text-gray-400" />
                    Préférences de l'application
                </h3>
                <div className="space-y-3">
                    <button
                        type="button"
                        onClick={handleToggleTheme}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                    >
                        <span className="flex items-center gap-3">
                            {isDarkMode
                                ? <Sun className="w-5 h-5 text-yellow-500" />
                                : <Moon className="w-5 h-5 text-gray-500 dark:text-gray-400" />}
                            <span>
                                <span className="block text-sm font-medium text-gray-900 dark:text-white">
                                    {isDarkMode ? 'Mode clair' : 'Mode sombre'}
                                </span>
                                <span className="block text-xs text-gray-500 dark:text-gray-400">
                                    Basculer entre l'apparence claire et sombre
                                </span>
                            </span>
                        </span>
                        <span className="text-xs font-medium text-blue-600">Basculer</span>
                    </button>

                    <button
                        type="button"
                        onClick={handleOpenShortcuts}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                    >
                        <span className="flex items-center gap-3">
                            <Keyboard className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                            <span>
                                <span className="block text-sm font-medium text-gray-900 dark:text-white">Raccourcis clavier</span>
                                <span className="block text-xs text-gray-500 dark:text-gray-400">
                                    Voir la liste des raccourcis disponibles
                                </span>
                            </span>
                        </span>
                        <span className="text-xs font-mono text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5">?</span>
                    </button>

                    <Link
                        to="/app/audit-log"
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                    >
                        <span className="flex items-center gap-3">
                            <Shield className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                            <span>
                                <span className="block text-sm font-medium text-gray-900 dark:text-white">Journal d'audit</span>
                                <span className="block text-xs text-gray-500 dark:text-gray-400">
                                    Historique des signatures, paiements et suppressions
                                </span>
                            </span>
                        </span>
                        <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    </Link>

                    <Link
                        to="/app/guide"
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                    >
                        <span className="flex items-center gap-3">
                            <HelpCircle className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                            <span>
                                <span className="block text-sm font-medium text-gray-900 dark:text-white">Guide d'utilisation</span>
                                <span className="block text-xs text-gray-500 dark:text-gray-400">
                                    Tutoriels, astuces et raccourcis du quotidien
                                </span>
                            </span>
                        </span>
                        <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    </Link>
                </div>
            </div>
        </div>
    );
};

const Profile = () => {
    // Component for managing artisan profile settings
    const { user } = useAuth();
    const confirm = useConfirm();
    const { isSupported: isPushSupported, isSubscribed: isPushSubscribed, isLoading: isPushLoading, permission: pushPermission, subscribe: subscribePush, unsubscribe: unsubscribePush, sendTestNotification: sendTestPush } = usePushNotifications();
    const [isTestingPush, setIsTestingPush] = useState(false);
    const [loading, setLoading] = useState(false);
    // API key : jamais stockée côté client — on ne retient que le booléen "configurée"
    const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [savingApiKey, setSavingApiKey] = useState(false);

    // Statut enregistrement annuaire DGFIP via B2BRouter
    const [b2bReceiverStatus, setB2bReceiverStatus] = useState(null); // null | 'registered' | 'error' | 'loading'
    const [b2bReceiverError, setB2bReceiverError] = useState(null);

    // Plateforme Agréée (PA) — clé API jamais exposée côté client
    const [pdpKeyConfigured, setPdpKeyConfigured] = useState(false);
    const [pdpUrlInput, setPdpUrlInput] = useState('');
    const [pdpServiceInput, setPdpServiceInput] = useState('');
    const [pdpKeyInput, setPdpKeyInput] = useState('');
    const [savingPdpConfig, setSavingPdpConfig] = useState(false);

    // SMTP perso — mot de passe jamais renvoyé par le serveur
    const [smtpPasswordConfigured, setSmtpPasswordConfigured] = useState(false);
    const [smtpForm, setSmtpForm] = useState({
        host: '',
        port: 465,
        secure: true,
        username: '',
        password: '',
        from_email: '',
        from_name: '',
    });
    const [savingSmtp, setSavingSmtp] = useState(false);
    const [testingSmtp, setTestingSmtp] = useState(false);
    const [showSmtpPanel, setShowSmtpPanel] = useState(false);

    // Signature email personnalisée (HTML) — vide = signature auto depuis profil
    const [emailSignatureHtml, setEmailSignatureHtml] = useState('');
    const [savingSignature, setSavingSignature] = useState(false);
    const [signaturePreview, setSignaturePreview] = useState(false);
    // Largeur à utiliser au moment d'insérer une image dans la signature (en px ou 'full')
    const [signatureImageWidth, setSignatureImageWidth] = useState('300');
    const [formData, setFormData] = useState({
        company_name: '',
        full_name: '',
        email: '',
        professional_email: '',
        website: '',
        logo_url: '',
        phone: '',
        address: '',
        city: '',
        postal_code: '',

        siret: '',
        google_review_url: '',
        facebook_review_url: '',
        pages_jaunes_review_url: '',
        trade: 'general',
        iban: '',
        artisan_status: 'micro_entreprise',
        activity_type: 'services'
    });

    useEffect(() => {
        if (user) {
            getProfile();
        }
    }, [user]);

    const getProfile = async () => {
        try {
            setLoading(true);
            // RPC `get_my_profile_safe` : strippe les clés API sensibles côté serveur
            // → la clé OpenAI/PDP n'arrive jamais dans la mémoire du navigateur.
            const { data, error } = await supabase.rpc('get_my_profile_safe');

            if (error) throw error;

            if (data) {
                // Le serveur fournit directement les flags `has_openai_api_key` etc.
                setApiKeyConfigured(!!data.has_openai_api_key);

                // Config PDP : URL et service publics, clé jamais reçue
                const pdpCfg = data.pdp_config || {};
                setPdpKeyConfigured(!!data.has_pdp_api_key);
                setPdpUrlInput(pdpCfg.pdp_url || '');
                setPdpServiceInput(pdpCfg.pdp_service || '');

                // Config SMTP : tous les champs sauf le password
                const smtpCfg = data.smtp_config || {};
                setSmtpPasswordConfigured(!!data.has_smtp_password);
                setSmtpForm({
                    host: smtpCfg.host || '',
                    port: smtpCfg.port || 465,
                    secure: smtpCfg.secure ?? true,
                    username: smtpCfg.username || '',
                    password: '',
                    from_email: smtpCfg.from_email || data.professional_email || '',
                    from_name: smtpCfg.from_name || data.company_name || '',
                });

                // Signature email personnalisée
                setEmailSignatureHtml(data.email_signature_html || '');

                // Préférences IA (clé déjà strippée par get_my_profile_safe)
                const aiPrefs = data.ai_preferences || {};

                setFormData({
                    company_name: data.company_name || '',
                    full_name: data.full_name || '',
                    email: user.email || '',
                    professional_email: data.professional_email || '',
                    website: data.website || '',
                    logo_url: data.logo_url || '',
                    phone: data.phone || '',
                    address: data.address || '',
                    city: data.city || '',
                    postal_code: data.postal_code || '',

                    siret: data.siret || '',
                    google_review_url: data.google_review_url || '',
                    facebook_review_url: data.facebook_review_url || '',
                    pages_jaunes_review_url: data.pages_jaunes_review_url || '',
                    trade: data.trade || 'general',
                    iban: data.iban || '',
                    wero_phone: data.wero_phone || '',
                    artisan_status: aiPrefs.artisan_status || 'micro_entreprise',
                    activity_type: aiPrefs.activity_type || 'services',
                    ai_provider: aiPrefs.ai_provider || 'openai',
                    ai_hourly_rate: aiPrefs.ai_hourly_rate || '',
                    // Zones
                    zone1_radius: aiPrefs.zone1_radius || '',
                    zone1_price: aiPrefs.zone1_price || '',
                    zone2_radius: aiPrefs.zone2_radius || '',
                    zone2_price: aiPrefs.zone2_price || '',
                    zone3_radius: aiPrefs.zone3_radius || '',
                    zone3_price: aiPrefs.zone3_price || '',

                    ai_instructions: aiPrefs.ai_instructions || '',
                    quote_system_prompt: aiPrefs.quote_system_prompt || ''
                });
                setB2bReceiverStatus(data.b2b_receiver_status ?? null);
                setB2bReceiverError(data.b2b_receiver_error ?? null);
            }
        } catch (error) {
            console.error('Error loading profile:', error);
            toast.error('Erreur lors du chargement du profil');
        } finally {
            setLoading(false);
        }
    };

    const handleLogoUpload = async (e) => {
        try {
            setLoading(true);
            const file = e.target.files[0];
            if (!file) return;

            // Validation stricte : magic bytes + taille + type MIME réel
            // (SVG retiré pour des raisons de sécurité — risque XSS via <script> embarqué)
            const validation = await validateFileForUpload(file, UPLOAD_PRESETS.logo);
            if (!validation.ok) {
                toast.error(validation.error);
                return;
            }

            const fileExt = file.name.split('.').pop().toLowerCase();

            // Use cryptographically secure random filename to prevent guessing
            const randomBytes = new Uint8Array(16);
            crypto.getRandomValues(randomBytes);
            const randomHex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            const fileName = `${user.id}-${randomHex}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('logos')
                .upload(filePath, file, { contentType: file.type });

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('logos').getPublicUrl(filePath);
            const publicUrl = data.publicUrl;

            setFormData(prev => ({ ...prev, logo_url: publicUrl }));
            toast.success('Logo uploadé avec succès');
        } catch (error) {
            console.error('Error uploading logo:', error);
            toast.error('Erreur lors de l\'upload du logo');
        } finally {
            setLoading(false);
        }
    };

    const updateProfile = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);
            const { error } = await supabase
                .from('profiles')
                .update({
                    company_name: formData.company_name,
                    full_name: formData.full_name,
                    professional_email: formData.professional_email,
                    website: formData.website,
                    logo_url: formData.logo_url,
                    phone: formData.phone,
                    address: formData.address,
                    city: formData.city,
                    postal_code: formData.postal_code,

                    siret: formData.siret,
                    google_review_url: formData.google_review_url,
                    facebook_review_url: formData.facebook_review_url,
                    pages_jaunes_review_url: formData.pages_jaunes_review_url,
                    trade: formData.trade,
                    iban: formData.iban,
                    wero_phone: formData.wero_phone,

                    ai_preferences: {
                        // La clé API est gérée séparément via l'Edge Function save-openai-key
                        ai_provider: formData.ai_provider,
                        ai_hourly_rate: formData.ai_hourly_rate,
                        zone1_radius: formData.zone1_radius,
                        zone1_price: formData.zone1_price,
                        zone2_radius: formData.zone2_radius,
                        zone2_price: formData.zone2_price,
                        zone3_radius: formData.zone3_radius,
                        zone3_price: formData.zone3_price,
                        ai_instructions: formData.ai_instructions,
                        quote_system_prompt: formData.quote_system_prompt || null,
                        artisan_status: formData.artisan_status,
                        activity_type: formData.activity_type
                    },

                    updated_at: new Date(),
                })
                .eq('id', user.id);

            if (error) throw error;
            toast.success('Profil mis à jour avec succès');

            // Si le SIRET est renseigné, enregistrer le SIREN dans l'annuaire DGFIP via B2BRouter
            const siret = (formData.siret || '').replace(/\s/g, '');
            if (siret.length >= 9 && b2bReceiverStatus !== 'registered') {
                registerB2BReceiver();
            }
        } catch (error) {
            console.error('Error updating profile:', error);
            toast.error('Erreur lors de la mise à jour du profil');
        } finally {
            setLoading(false);
        }
    };

    const registerB2BReceiver = async () => {
        setB2bReceiverStatus('loading');
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const res = await fetch(`${supabaseUrl}/functions/v1/register-b2brouter-receiver`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
            });
            const result = await res.json();
            if (result.success) {
                setB2bReceiverStatus('registered');
                setB2bReceiverError(null);
            } else if (!result.skipped) {
                setB2bReceiverStatus('error');
                setB2bReceiverError(result.error || 'Erreur inconnue');
            } else {
                // B2BRouter non configuré côté serveur — pas bloquant
                setB2bReceiverStatus(null);
            }
        } catch (err) {
            setB2bReceiverStatus('error');
            setB2bReceiverError(String(err));
        }
    };

    const handleSaveApiKey = async () => {
        const key = apiKeyInput.trim();
        if (!key) return;

        setSavingApiKey(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const res = await fetch(`${supabaseUrl}/functions/v1/save-openai-key`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ api_key: key }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Erreur inconnue');

            setApiKeyConfigured(result.configured);
            setApiKeyInput('');
            toast.success('Clé API sauvegardée avec succès');
        } catch (err) {
            toast.error(err.message || 'Erreur lors de la sauvegarde de la clé');
        } finally {
            setSavingApiKey(false);
        }
    };

    const handleDeleteApiKey = async () => {
        setSavingApiKey(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const res = await fetch(`${supabaseUrl}/functions/v1/save-openai-key`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ api_key: null }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Erreur inconnue');

            setApiKeyConfigured(false);
            setApiKeyInput('');
            toast.success('Clé API supprimée');
        } catch (err) {
            toast.error(err.message || 'Erreur lors de la suppression de la clé');
        } finally {
            setSavingApiKey(false);
        }
    };

    const handleSavePdpConfig = async () => {
        const url = pdpUrlInput.trim();
        const service = pdpServiceInput.trim();
        if (!url) { toast.error("L'URL de la Plateforme Agréée est requise"); return; }

        setSavingPdpConfig(true);
        try {
            const pdpConfig = {
                pdp_url: url,
                pdp_service: service || 'pa',
                ...(pdpKeyInput.trim() ? { pdp_key: pdpKeyInput.trim() } : {}),
            };
            // Si aucune nouvelle clé n'est saisie, préserver la clé existante via un merge Supabase
            let updatePayload;
            if (pdpKeyInput.trim()) {
                updatePayload = { pdp_config: pdpConfig };
                setPdpKeyConfigured(true);
            } else {
                // Merge uniquement url et service sans toucher à la clé
                const { data: current } = await supabase.from('profiles').select('pdp_config').eq('id', user.id).single();
                updatePayload = { pdp_config: { ...(current?.pdp_config || {}), pdp_url: url, pdp_service: service || 'pa' } };
            }
            const { error } = await supabase.from('profiles').update(updatePayload).eq('id', user.id);
            if (error) throw error;
            setPdpKeyInput('');
            toast.success('Configuration PDP sauvegardée');
        } catch (err) {
            toast.error(err.message || 'Erreur lors de la sauvegarde');
        } finally {
            setSavingPdpConfig(false);
        }
    };

    const handleDeletePdpConfig = async () => {
        setSavingPdpConfig(true);
        try {
            const { error } = await supabase.from('profiles').update({ pdp_config: null }).eq('id', user.id);
            if (error) throw error;
            setPdpKeyConfigured(false);
            setPdpUrlInput('');
            setPdpServiceInput('');
            setPdpKeyInput('');
            toast.success('Configuration PDP supprimée');
        } catch (err) {
            toast.error(err.message || 'Erreur lors de la suppression');
        } finally {
            setSavingPdpConfig(false);
        }
    };

    const handleSmtpFieldChange = (field, value) => {
        setSmtpForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSmtpPreset = (preset) => {
        const presets = {
            gmail:    { host: 'smtp.gmail.com',     port: 465, secure: true },
            outlook:  { host: 'smtp.office365.com', port: 587, secure: false },
            ovh:      { host: 'ssl0.ovh.net',       port: 465, secure: true },
            ionos:    { host: 'smtp.ionos.fr',      port: 465, secure: true },
            orange:   { host: 'smtp.orange.fr',     port: 465, secure: true },
            free:     { host: 'smtp.free.fr',       port: 465, secure: true },
        };
        const p = presets[preset];
        if (!p) return;
        setSmtpForm(prev => ({ ...prev, ...p }));
    };

    const callSmtpFunction = async (path, body) => {
        const { data: { session } } = await supabase.auth.getSession();
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const res = await fetch(`${supabaseUrl}/functions/v1/${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify(body),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Erreur inconnue');
        return result;
    };

    const handleSaveSmtp = async () => {
        // Validation rapide côté client
        if (!smtpForm.host.trim()) { toast.error('Serveur SMTP requis'); return; }
        if (!smtpForm.username.trim()) { toast.error('Identifiant SMTP requis'); return; }
        if (!smtpForm.from_email.trim()) { toast.error('Adresse email expéditeur requise'); return; }
        if (!smtpPasswordConfigured && !smtpForm.password) {
            toast.error('Mot de passe requis');
            return;
        }

        setSavingSmtp(true);
        try {
            await callSmtpFunction('save-smtp-config', {
                config: {
                    host: smtpForm.host.trim(),
                    port: Number(smtpForm.port),
                    secure: !!smtpForm.secure,
                    username: smtpForm.username.trim(),
                    password: smtpForm.password || undefined,
                    from_email: smtpForm.from_email.trim(),
                    from_name: smtpForm.from_name.trim(),
                },
            });
            setSmtpPasswordConfigured(true);
            setSmtpForm(prev => ({ ...prev, password: '' }));
            toast.success('Configuration SMTP sauvegardée');
        } catch (err) {
            toast.error(err.message || 'Erreur lors de la sauvegarde');
        } finally {
            setSavingSmtp(false);
        }
    };

    const handleTestSmtp = async () => {
        if (!smtpPasswordConfigured) {
            toast.error("Enregistrez d'abord la configuration");
            return;
        }
        setTestingSmtp(true);
        try {
            await callSmtpFunction('send-document-email', {
                test: true,
                subject: 'Test de connexion Artisan Facile',
                text: "Ceci est un email de test envoyé depuis votre configuration SMTP Artisan Facile.\n\nSi vous recevez ce message, votre envoi direct de devis et factures est opérationnel.",
            });
            toast.success("Email de test envoyé à votre adresse pro — vérifiez votre boîte");
        } catch (err) {
            toast.error(err.message || "Échec du test d'envoi");
        } finally {
            setTestingSmtp(false);
        }
    };

    const handleSaveSignature = async () => {
        setSavingSignature(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ email_signature_html: emailSignatureHtml.trim() || null })
                .eq('id', user.id);
            if (error) throw error;
            toast.success(emailSignatureHtml.trim() ? 'Signature personnalisée enregistrée' : 'Signature remise sur l\'auto');
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

    const handleDeleteSmtp = async () => {
        const ok = await confirm({
            title: 'Supprimer la configuration SMTP ?',
            message: 'Les envois directs depuis votre mail pro seront désactivés. Vous reviendrez à l\'ouverture de votre client mail.',
            confirmText: 'Supprimer',
            danger: true,
        });
        if (!ok) return;
        setSavingSmtp(true);
        try {
            await callSmtpFunction('save-smtp-config', { config: null });
            setSmtpPasswordConfigured(false);
            setSmtpForm({
                host: '', port: 465, secure: true, username: '',
                password: '', from_email: '', from_name: '',
            });
            toast.success('Configuration SMTP supprimée');
        } catch (err) {
            toast.error(err.message || 'Erreur lors de la suppression');
        } finally {
            setSavingSmtp(false);
        }
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const [newEmail, setNewEmail] = useState('');
    const [emailChanging, setEmailChanging] = useState(false);
    const [emailChangeSent, setEmailChangeSent] = useState(false);

    const handleEmailChange = async (e) => {
        e.preventDefault();
        if (!newEmail.trim()) return;
        if (newEmail === user.email) {
            toast.error('Cette adresse est déjà votre email de connexion.');
            return;
        }
        setEmailChanging(true);
        try {
            const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
            if (error) throw error;
            setEmailChangeSent(true);
            toast.success('Email de confirmation envoyé ! Vérifiez votre boîte mail.');
        } catch (err) {
            toast.error('Erreur : ' + err.message);
        } finally {
            setEmailChanging(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto pb-12">
            <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Settings className="w-8 h-8 text-blue-600" />
                        Paramètres de l'entreprise
                    </h2>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">Ces informations apparaîtront sur vos devis et factures.</p>
                </div>
                <div className="flex flex-col gap-2 w-full md:w-auto">
                    <a
                        href="/app/settings/activity"
                        className="flex items-center justify-center px-4 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium transition-colors"
                    >
                        <Building className="w-5 h-5 mr-2" />
                        Gérer mon activité (Fonctionnalités)
                    </a>
                    <button
                        onClick={async () => {
                            const { error } = await supabase.auth.signOut();
                            if (!error) window.location.href = '/login';
                        }}
                        className="text-sm text-red-500 hover:text-red-700 hover:underline text-center md:text-right"
                    >
                        Se déconnecter
                    </button>
                </div>
            </div>

            <form onSubmit={updateProfile} className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                {!loading && (!formData.company_name || !formData.siret) && (
                    <div className="px-8 pt-6">
                        <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl p-4 text-sm">
                            <span className="text-amber-500 text-lg flex-shrink-0 leading-none mt-0.5">⚠️</span>
                            <div>
                                <p className="font-semibold text-amber-800 mb-1">Complétez ces 2 champs pour valider vos devis légalement</p>
                                <p className="text-amber-700">
                                    Le <strong>nom de l'entreprise</strong> et le <strong>SIRET</strong> sont obligatoires sur tous vos documents (devis, factures). Sans eux, vos documents ne sont pas conformes.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
                <div className="p-8 space-y-8">
                    {/* Identité */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                            <Building className="w-5 h-5 mr-2 text-blue-600" />
                            Identité de l'entreprise
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Nom de l'entreprise <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    name="company_name"
                                    value={formData.company_name}
                                    onChange={handleChange}
                                    placeholder="Ex: Martin Rénovation"
                                    className={`block w-full px-3 py-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500 ${!formData.company_name ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20' : 'border-gray-300 dark:border-gray-600'}`}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Votre nom complet</label>
                                <input
                                    type="text"
                                    name="full_name"
                                    value={formData.full_name}
                                    onChange={handleChange}
                                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Numéro SIRET <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    name="siret"
                                    value={formData.siret}
                                    onChange={handleChange}
                                    placeholder="14 chiffres"
                                    className={`block w-full px-3 py-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500 ${!formData.siret ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20' : 'border-gray-300 dark:border-gray-600'}`}
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    14 chiffres — trouvez-le sur votre Kbis ou sur{' '}
                                    <a href="https://autoentrepreneur.urssaf.fr" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">autoentrepreneur.urssaf.fr</a>
                                </p>
                                {/* Statut enregistrement annuaire DGFIP */}
                                {b2bReceiverStatus === 'loading' && (
                                    <div className="mt-2 flex items-center gap-1.5 text-xs text-blue-600">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        Enregistrement dans l'annuaire DGFIP…
                                    </div>
                                )}
                                {b2bReceiverStatus === 'registered' && (
                                    <div className="mt-2 flex items-center gap-1.5 text-xs text-green-700 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 rounded-lg px-2.5 py-1.5">
                                        <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                                        <span>Enregistré dans l'annuaire DGFIP — vos fournisseurs peuvent vous envoyer des factures électroniques</span>
                                    </div>
                                )}
                                {b2bReceiverStatus === 'error' && (
                                    <div className="mt-2 text-xs text-red-700 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-lg px-2.5 py-1.5 space-y-1">
                                        <div className="flex items-center gap-1.5">
                                            <XCircle className="w-3.5 h-3.5 shrink-0" />
                                            <span>Échec de l'enregistrement annuaire DGFIP</span>
                                        </div>
                                        {b2bReceiverError && <p className="font-mono text-[10px] opacity-70 break-all">{b2bReceiverError}</p>}
                                        <button type="button" onClick={registerB2BReceiver} className="text-red-600 underline hover:text-red-800">Réessayer</button>
                                    </div>
                                )}
                                {!b2bReceiverStatus && formData.siret?.length >= 9 && (
                                    <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg px-2.5 py-1.5">
                                        <Radio className="w-3.5 h-3.5 shrink-0" />
                                        <span>Sauvegardez le profil pour vous enregistrer dans l'annuaire DGFIP</span>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Métier principal</label>
                                <select
                                    name="trade"
                                    value={formData.trade}
                                    onChange={handleChange}
                                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                >
                                    {Object.entries(TRADE_CONFIG).map(([key, config]) => (
                                        <option key={key} value={key}>
                                            {config.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Statut juridique</label>
                                <select
                                    name="artisan_status"
                                    value={formData.artisan_status}
                                    onChange={handleChange}
                                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                >
                                    <option value="micro_entreprise">Micro-entreprise (Auto-entrepreneur)</option>
                                    <option value="ei">Entreprise Individuelle (EI)</option>
                                    <option value="eirl">EIRL</option>
                                    <option value="eurl">EURL</option>
                                    <option value="sasu">SASU</option>
                                    <option value="sarl">SARL</option>
                                </select>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Utilisé pour le calcul des charges URSSAF</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type d'activité principale</label>
                                <select
                                    name="activity_type"
                                    value={formData.activity_type}
                                    onChange={handleChange}
                                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                >
                                    <option value="services">Prestations de services (peinture, plomberie, électricité…)</option>
                                    <option value="vente">Vente de produits / fournitures</option>
                                    <option value="mixte">Les deux : services ET vente de produits</option>
                                    <option value="liberal">Profession libérale</option>
                                </select>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Détermine votre taux de cotisations URSSAF</p>
                            </div>
                        </div>
                    </div>

                    {/* Coordonnées */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                            <MapPin className="w-5 h-5 mr-2 text-blue-600" />
                            Coordonnées
                        </h3>
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Adresse</label>
                                <input
                                    type="text"
                                    name="address"
                                    value={formData.address}
                                    onChange={handleChange}
                                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Code Postal</label>
                                    <input
                                        type="text"
                                        name="postal_code"
                                        value={formData.postal_code}
                                        onChange={handleChange}
                                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ville</label>
                                    <input
                                        type="text"
                                        name="city"
                                        value={formData.city}
                                        onChange={handleChange}
                                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Contact */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                            <Phone className="w-5 h-5 mr-2 text-blue-600" />
                            Contact & Web
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Professionnel (pour les devis)</label>
                                <input
                                    type="email"
                                    name="professional_email"
                                    value={formData.professional_email}
                                    onChange={handleChange}
                                    placeholder="contact@monentreprise.com"
                                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Si vide, l'email de connexion ({formData.email}) sera utilisé.</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Téléphone</label>
                                <input
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Site Web</label>
                                <input
                                    type="text"
                                    name="website"
                                    value={formData.website}
                                    onChange={handleChange}
                                    onBlur={(e) => {
                                        let val = e.target.value.trim();
                                        if (val && !val.startsWith('http://') && !val.startsWith('https://')) {
                                            setFormData(prev => ({ ...prev, website: 'https://' + val }));
                                        }
                                    }}
                                    placeholder="monentreprise.com"
                                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lien Avis Google</label>
                                <input
                                    type="url"
                                    name="google_review_url"
                                    value={formData.google_review_url}
                                    onChange={handleChange}
                                    placeholder="https://g.page/r/..."
                                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Lien direct pour laisser un avis sur votre fiche Google Business.</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lien Avis Facebook</label>
                                <input
                                    type="url"
                                    name="facebook_review_url"
                                    value={formData.facebook_review_url}
                                    onChange={handleChange}
                                    placeholder="https://www.facebook.com/.../reviews"
                                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Lien direct vers la page d'avis de votre page Facebook.</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lien Avis Pages Jaunes</label>
                                <input
                                    type="url"
                                    name="pages_jaunes_review_url"
                                    value={formData.pages_jaunes_review_url}
                                    onChange={handleChange}
                                    placeholder="https://www.pagesjaunes.fr/..."
                                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Lien direct vers votre fiche Pages Jaunes pour laisser un avis.</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">IBAN (pour factures)</label>
                                <input
                                    type="text"
                                    name="iban"
                                    value={formData.iban}
                                    onChange={handleChange}
                                    placeholder="FR76 ..."
                                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Numéro Wero / Paylib</label>
                                <input
                                    type="tel"
                                    name="wero_phone"
                                    value={formData.wero_phone}
                                    onChange={handleChange}
                                    placeholder="06 00 00 00 00"
                                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Si différent du téléphone de contact. Utile pour les paiements instantanés.</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Logo</label>
                                <div className="flex items-center space-x-4">
                                    {formData.logo_url && (
                                        <img src={formData.logo_url} alt="Logo" className="h-12 w-12 object-contain rounded-xl border border-gray-200 dark:border-gray-700" />
                                    )}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleLogoUpload}
                                        className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                    />
                                </div>
                                <input
                                    type="hidden"
                                    name="logo_url"
                                    value={formData.logo_url}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-8 py-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        {loading ? 'Enregistrement...' : 'Enregistrer les modifications'}
                    </button>
                </div>
            </form >

            {/* Notifications Push */}
            <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 rounded-xl shadow-sm border border-blue-100 dark:border-blue-800/40 overflow-hidden">
                <div className="p-8">
                    <h3 className="text-lg font-semibold text-blue-900 mb-4 flex items-center">
                        <Bell className="w-5 h-5 mr-2" />
                        Notifications Push
                    </h3>
                    <p className="text-sm text-blue-800 mb-3">
                        Recevez une notification immédiate sur cet appareil — même quand l'application est fermée :
                    </p>
                    <ul className="text-xs text-blue-800 space-y-1 mb-6 ml-1">
                        <li>✅ Devis signés par vos clients</li>
                        <li>💬 Nouveaux messages depuis les portails clients</li>
                        <li>📥 Factures fournisseurs reçues</li>
                    </ul>

                    {!isPushSupported ? (
                        <div className="bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-800/40 rounded-lg p-4 space-y-2">
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Les notifications push ne sont pas disponibles sur ce navigateur.
                            </p>
                            {/iphone|ipad|ipod/i.test(navigator.userAgent) ? (
                                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-xs text-blue-800 space-y-1">
                                    <p className="font-semibold">Activer sur iPhone / iPad :</p>
                                    <ol className="list-decimal list-inside space-y-1">
                                        <li>Ouvrez cette page dans <strong>Safari</strong></li>
                                        <li>Appuyez sur l'icône <strong>Partager</strong> (carré avec flèche)</li>
                                        <li>Sélectionnez <strong>"Sur l'écran d'accueil"</strong></li>
                                        <li>Revenez dans l'app installée et réactivez ici</li>
                                    </ol>
                                </div>
                            ) : (
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Utilisez Chrome, Edge ou Firefox sur ordinateur ou Android.
                                </p>
                            )}
                        </div>
                    ) : pushPermission === 'denied' && !isPushSubscribed ? (
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg p-4 space-y-2">
                            <p className="text-sm font-semibold text-amber-900 flex items-center gap-2">
                                <span>⚠️</span> Notifications bloquées dans votre navigateur
                            </p>
                            <p className="text-xs text-amber-800">
                                Pour les réactiver, cliquez sur l'icône <strong>cadenas / paramètres</strong> à gauche de la barre d'adresse, puis autorisez les notifications pour ce site. Rechargez ensuite la page.
                            </p>
                        </div>
                    ) : isPushSubscribed ? (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 rounded-lg p-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                                    <span className="text-sm font-medium text-green-800">Notifications activées sur cet appareil</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        await unsubscribePush();
                                        toast.success('Notifications désactivées');
                                    }}
                                    disabled={isPushLoading}
                                    className="text-xs text-red-600 hover:text-red-700 hover:underline disabled:opacity-50"
                                >
                                    Désactiver
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={async () => {
                                    setIsTestingPush(true);
                                    const result = await sendTestPush();
                                    setIsTestingPush(false);
                                    if (result.success) {
                                        toast.success('Notification envoyée — vérifiez votre écran !', {
                                            description: 'Si vous ne la voyez pas, vérifiez les paramètres système de votre appareil.',
                                            duration: 8000,
                                        });
                                    } else {
                                        toast.error(result.error || 'Échec de l\'envoi', { duration: 6000 });
                                    }
                                }}
                                disabled={isTestingPush}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-blue-700 border border-blue-200 dark:border-blue-800/40 font-medium text-sm rounded-lg transition-colors disabled:opacity-50"
                            >
                                {isTestingPush
                                    ? <><span className="w-3.5 h-3.5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />Envoi en cours…</>
                                    : <><Bell className="w-4 h-4" />Envoyer une notification de test</>
                                }
                            </button>
                            <p className="text-xs text-blue-700 text-center">
                                Si la notification de test n'arrive pas, vos notifications ne fonctionneront pas pour les vraies alertes.
                            </p>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={async () => {
                                const result = await subscribePush();
                                if (result.success) {
                                    toast.success('Notifications activées !', {
                                        description: 'Vous pouvez maintenant envoyer une notification de test.',
                                    });
                                } else {
                                    toast.error(result.error || 'Impossible d\'activer les notifications');
                                }
                            }}
                            disabled={isPushLoading}
                            className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-sm transition-colors disabled:opacity-50"
                        >
                            <Bell className="w-4 h-4" />
                            {isPushLoading ? 'Activation...' : 'Activer les notifications push'}
                        </button>
                    )}
                </div>
            </div>

            {/* Envoi direct par email (SMTP perso) */}
            <div className="mt-8 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                <div className="p-8">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center">
                        <Send className="w-5 h-5 mr-2 text-blue-600" />
                        Envoi direct des documents par email
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Connectez votre adresse email professionnelle pour envoyer devis et factures directement depuis l'application, sans ouvrir votre client mail. L'expéditeur visible par vos clients sera votre vraie adresse pro.
                    </p>

                    {smtpPasswordConfigured && (
                        <div className="mb-4 flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 rounded-lg px-3 py-2">
                            <CheckCircle className="w-4 h-4" />
                            <span>Envoi configuré — expéditeur : <strong>{smtpForm.from_email}</strong></span>
                        </div>
                    )}

                    {!showSmtpPanel && !smtpPasswordConfigured ? (
                        <button
                            type="button"
                            onClick={() => setShowSmtpPanel(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                        >
                            <Mail className="w-4 h-4" />
                            Configurer mon mail pro
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setShowSmtpPanel(v => !v)}
                            className="text-sm text-blue-600 hover:text-blue-700 mb-4"
                        >
                            {showSmtpPanel ? 'Masquer' : 'Modifier la configuration'}
                        </button>
                    )}

                    {showSmtpPanel && (
                        <div className="space-y-4 mt-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Fournisseur (raccourcis)
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        { key: 'gmail',   label: 'Gmail' },
                                        { key: 'outlook', label: 'Outlook / Microsoft 365' },
                                        { key: 'ovh',     label: 'OVH' },
                                        { key: 'ionos',   label: 'IONOS' },
                                        { key: 'orange',  label: 'Orange' },
                                        { key: 'free',    label: 'Free' },
                                    ].map(p => (
                                        <button
                                            key={p.key}
                                            type="button"
                                            onClick={() => handleSmtpPreset(p.key)}
                                            className="px-3 py-1 text-xs rounded-full border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                                <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                                    ⚠️ Pour Gmail et Outlook, utilisez un <strong>mot de passe d'application</strong> (pas votre mot de passe principal). Cherchez "mot de passe d'application Google" / "Microsoft" pour le générer.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Serveur SMTP</label>
                                    <input
                                        type="text"
                                        value={smtpForm.host}
                                        onChange={(e) => handleSmtpFieldChange('host', e.target.value)}
                                        placeholder="smtp.exemple.com"
                                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Port</label>
                                    <input
                                        type="number"
                                        value={smtpForm.port}
                                        onChange={(e) => handleSmtpFieldChange('port', e.target.value)}
                                        placeholder="465"
                                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Identifiant SMTP</label>
                                    <input
                                        type="text"
                                        value={smtpForm.username}
                                        onChange={(e) => handleSmtpFieldChange('username', e.target.value)}
                                        placeholder="contact@monentreprise.com"
                                        autoComplete="off"
                                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Mot de passe {smtpPasswordConfigured && <span className="text-xs font-normal text-gray-500">(laissez vide pour conserver)</span>}
                                    </label>
                                    <input
                                        type="password"
                                        value={smtpForm.password}
                                        onChange={(e) => handleSmtpFieldChange('password', e.target.value)}
                                        placeholder={smtpPasswordConfigured ? '••••••••' : 'Mot de passe d\'application'}
                                        autoComplete="new-password"
                                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email expéditeur (le mail visible par vos clients)</label>
                                    <input
                                        type="email"
                                        value={smtpForm.from_email}
                                        onChange={(e) => handleSmtpFieldChange('from_email', e.target.value)}
                                        placeholder="contact@monentreprise.com"
                                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom expéditeur</label>
                                    <input
                                        type="text"
                                        value={smtpForm.from_name}
                                        onChange={(e) => handleSmtpFieldChange('from_name', e.target.value)}
                                        placeholder="Mon Entreprise"
                                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                            </div>

                            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                <input
                                    type="checkbox"
                                    checked={smtpForm.secure}
                                    onChange={(e) => handleSmtpFieldChange('secure', e.target.checked)}
                                    className="rounded"
                                />
                                Connexion SSL/TLS implicite (port 465). Décochez pour STARTTLS (port 587).
                            </label>

                            <div className="flex flex-wrap gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={handleSaveSmtp}
                                    disabled={savingSmtp}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm font-medium"
                                >
                                    {savingSmtp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Enregistrer
                                </button>
                                {smtpPasswordConfigured && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={handleTestSmtp}
                                            disabled={testingSmtp}
                                            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 text-sm font-medium text-gray-900 dark:text-gray-100"
                                        >
                                            {testingSmtp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                            Envoyer un email de test
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleDeleteSmtp}
                                            disabled={savingSmtp}
                                            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                        >
                                            <XCircle className="w-4 h-4" />
                                            Supprimer
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Signature email */}
            <div className="mt-8 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                <div className="p-8">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center">
                        <FileText className="w-5 h-5 mr-2 text-blue-600" />
                        Signature email
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Signature HTML ajoutée automatiquement à la fin de chaque mail envoyé via SMTP direct. Si vide, une signature est générée automatiquement à partir de votre profil (logo, nom, téléphone, email, site, avis Google).
                    </p>

                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Signature personnalisée (HTML)
                        </label>
                        <textarea
                            value={emailSignatureHtml}
                            onChange={(e) => setEmailSignatureHtml(e.target.value)}
                            rows={8}
                            placeholder={'Exemple :\n<strong>Jean Dupont</strong><br>\nÉlectricien certifié<br>\n<a href="tel:0612345678">06 12 34 56 78</a><br>\n<a href="https://mon-site.fr">mon-site.fr</a>'}
                            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500 font-mono text-xs"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Balises HTML autorisées : &lt;strong&gt;, &lt;em&gt;, &lt;br&gt;, &lt;a href&gt;, &lt;img src&gt;, &lt;span style&gt;, etc.
                        </p>

                        <div>
                            <div className="flex flex-wrap items-center gap-3">
                                <label className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm font-medium cursor-pointer text-gray-900 dark:text-gray-100">
                                    <Upload className="w-4 h-4" />
                                    Importer une image
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp,image/gif"
                                        onChange={handleSignatureImageUpload}
                                        className="hidden"
                                    />
                                </label>

                                <div className="flex items-center gap-2">
                                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                        Largeur :
                                    </label>
                                    <select
                                        value={['150', '200', '300', '400', '500', '600', 'full'].includes(signatureImageWidth) ? signatureImageWidth : 'custom'}
                                        onChange={(e) => {
                                            if (e.target.value !== 'custom') setSignatureImageWidth(e.target.value);
                                        }}
                                        className="text-sm px-2 py-1.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg"
                                    >
                                        <option value="150">Petite (150 px)</option>
                                        <option value="200">Moyenne (200 px)</option>
                                        <option value="300">Standard (300 px)</option>
                                        <option value="400">Grande (400 px)</option>
                                        <option value="500">Très grande (500 px)</option>
                                        <option value="600">XL (600 px)</option>
                                        <option value="full">Pleine largeur (100%)</option>
                                        <option value="custom">Personnalisée…</option>
                                    </select>
                                    {!['150', '200', '300', '400', '500', '600', 'full'].includes(signatureImageWidth) && (
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="number"
                                                min="50"
                                                max="800"
                                                value={signatureImageWidth}
                                                onChange={(e) => setSignatureImageWidth(e.target.value)}
                                                className="w-20 text-sm px-2 py-1.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg"
                                            />
                                            <span className="text-xs text-gray-500 dark:text-gray-400">px</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                JPG / PNG / WebP / GIF, 8 Mo max. Choisissez la largeur avant d'importer. Pour redimensionner une image déjà insérée, modifiez la valeur <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">width:Xpx</code> dans le HTML.
                            </p>
                        </div>

                        {emailSignatureHtml.trim() && (
                            <div>
                                <button
                                    type="button"
                                    onClick={() => setSignaturePreview(v => !v)}
                                    className="text-sm text-blue-600 hover:text-blue-700 mb-2"
                                >
                                    {signaturePreview ? 'Masquer l\'aperçu' : 'Afficher l\'aperçu'}
                                </button>
                                {signaturePreview && (
                                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                        <div className="px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Aperçu (ce que verront vos clients dans leur mail) :</p>
                                        </div>
                                        {/* Fond blanc forcé : simule le rendu réel dans la plupart des
                                            clients mail. La signature HTML utilisateur n'a pas de dark
                                            mode — sur fond sombre, du texte noir devient illisible. */}
                                        <div className="bg-white p-4 text-gray-900">
                                            {/* white-space:pre-wrap pour refléter EXACTEMENT le rendu
                                                du mail : les sauts de ligne et lignes vides saisis sont
                                                préservés (l'edge function applique le même style). */}
                                            <div style={{ whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: emailSignatureHtml }} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex flex-wrap gap-2 pt-2">
                            <button
                                type="button"
                                onClick={handleSaveSignature}
                                disabled={savingSignature}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm font-medium"
                            >
                                {savingSignature ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Enregistrer la signature
                            </button>
                            {emailSignatureHtml.trim() && (
                                <button
                                    type="button"
                                    onClick={() => { setEmailSignatureHtml(''); }}
                                    className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    Revenir à la signature auto
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Préférences de l'application */}
            <PreferencesSection />

            {/* AI Settings — Paramètres avancés */}
            <div className="mt-8">
                <button
                    type="button"
                    onClick={() => setShowAdvanced(v => !v)}
                    className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors mb-3"
                >
                    <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                    Paramètres avancés (IA, zones de déplacement)
                </button>
            </div>
            {showAdvanced && (
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl shadow-sm border border-purple-100 dark:border-purple-800/40 overflow-hidden">
                <div className="p-8">
                    <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-200 mb-4 flex items-center">
                        <span className="mr-2">✨</span>
                        Intelligence Artificielle
                    </h3>
                    <p className="text-sm text-purple-800 dark:text-purple-300 mb-6">
                        Configurez votre clé API pour activer les fonctionnalités d'assistant intelligent (génération de devis automatique, etc.).
                    </p>

                    <div className="max-w-md space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-purple-900 dark:text-purple-200 mb-2">Fournisseur d'IA</label>
                            <div className="flex gap-2 p-1 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFormData({ ...formData, ai_provider: 'openai' });
                                    }}
                                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${(!formData.ai_provider || formData.ai_provider === 'openai')
                                        ? 'bg-white dark:bg-gray-900 text-purple-700 shadow-sm'
                                        : 'text-purple-600 hover:text-purple-800'
                                        }`}
                                >
                                    OpenAI (GPT)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFormData({ ...formData, ai_provider: 'gemini' });
                                    }}
                                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${formData.ai_provider === 'gemini'
                                        ? 'bg-white dark:bg-gray-900 text-blue-700 shadow-sm'
                                        : 'text-purple-600 hover:text-purple-800'
                                        }`}
                                >
                                    Google Gemini
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-purple-900 dark:text-purple-200 mb-2">
                                Clé API ({(!formData.ai_provider || formData.ai_provider === 'openai') ? 'OpenAI' : 'Gemini'})
                            </label>
                            {apiKeyConfigured && !apiKeyInput ? (
                                <div className="flex items-center gap-2">
                                    <span className="flex-1 px-3 py-2 border border-purple-200 dark:border-purple-800/40 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-700 text-sm">
                                        ✓ Clé configurée
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setApiKeyInput(' ')}
                                        className="px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors text-sm"
                                    >
                                        Modifier
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDeleteApiKey}
                                        disabled={savingApiKey}
                                        className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm disabled:opacity-50"
                                    >
                                        Supprimer
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="password"
                                        placeholder={(!formData.ai_provider || formData.ai_provider === 'openai') ? "sk-..." : "AIza..."}
                                        className="flex-1 px-3 py-2 border border-purple-200 dark:border-purple-800/40 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                                        value={apiKeyInput.trim() === '' ? '' : apiKeyInput}
                                        onChange={(e) => setApiKeyInput(e.target.value)}
                                        autoFocus={apiKeyConfigured}
                                    />
                                    <button
                                        type="button"
                                        onClick={handleSaveApiKey}
                                        disabled={savingApiKey || !apiKeyInput.trim()}
                                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm disabled:opacity-50 whitespace-nowrap"
                                    >
                                        {savingApiKey ? 'Sauvegarde…' : 'Sauvegarder'}
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="pt-4 border-t border-purple-100 dark:border-purple-800/40">
                            <h4 className="text-sm font-semibold text-purple-900 dark:text-purple-200 mb-3">Personnalisation du contexte</h4>

                            <div>
                                <label className="block text-xs font-medium text-purple-800 dark:text-purple-300 mb-1">Taux Horaire Moyen (€/h)</label>
                                <input
                                    type="number"
                                    placeholder="ex: 50"
                                    className="w-full px-3 py-2 border border-purple-200 dark:border-purple-800/40 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-sm"
                                    value={formData.ai_hourly_rate || ''}
                                    onChange={(e) => {
                                        setFormData({ ...formData, ai_hourly_rate: e.target.value });
                                    }}
                                />
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="block text-xs font-medium text-purple-800 dark:text-purple-300 mb-2">Zones de Déplacement (Auto-calculé)</label>
                            <div className="space-y-2">
                                {[1, 2, 3].map((zoneIndex) => {
                                    const radiusKey = `zone${zoneIndex}_radius`;
                                    const priceKey = `zone${zoneIndex}_price`;
                                    return (
                                        <div key={zoneIndex} className="flex gap-2 items-center">
                                            <span className="text-xs text-purple-600 dark:text-purple-300 w-12 font-medium">Zone {zoneIndex}</span>
                                            <div className="relative flex-1">
                                                <input
                                                    type="number"
                                                    placeholder="km"
                                                    className="w-full pl-3 pr-8 py-1.5 border border-purple-200 dark:border-purple-800/40 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md text-sm"
                                                    value={formData[radiusKey] || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setFormData(prev => ({ ...prev, [radiusKey]: val }));
                                                    }}
                                                />
                                                <span className="absolute right-2 top-1.5 text-xs text-gray-400 dark:text-gray-500">km</span>
                                            </div>
                                            <span className="text-gray-400 dark:text-gray-500 text-xs">→</span>
                                            <div className="relative flex-1">
                                                <input
                                                    type="number"
                                                    placeholder="€"
                                                    className="w-full pl-3 pr-6 py-1.5 border border-purple-200 dark:border-purple-800/40 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md text-sm"
                                                    value={formData[priceKey] || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setFormData(prev => ({ ...prev, [priceKey]: val }));
                                                    }}
                                                />
                                                <span className="absolute right-2 top-1.5 text-xs text-gray-400 dark:text-gray-500">€</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <p className="text-[10px] text-purple-600 mt-1">
                                Laissez vide pour désactiver une zone. Le calcul se fera automatiquement selon l'adresse du client.
                            </p>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-purple-800 dark:text-purple-300 mb-1">Instructions Spéciales pour l'IA</label>
                            <textarea
                                rows={3}
                                placeholder="Ex: Ne touche jamais à l'électricité. Ajoute toujours 10% de marge sur les matériaux. Je suis plombier spécialisé..."
                                className="w-full px-3 py-2 border border-purple-200 dark:border-purple-800/40 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-sm resize-none"
                                value={formData.ai_instructions || ''}
                                onChange={(e) => {
                                    setFormData({ ...formData, ai_instructions: e.target.value });
                                }}
                            />
                        </div>

                        {/* Prompt de génération de devis */}
                        <div className="border-t border-purple-100 dark:border-purple-800/40 pt-4">
                            <div className="flex items-center justify-between mb-2">
                                <label className="block text-xs font-medium text-purple-800">
                                    Prompt de génération de devis
                                </label>
                                <div className="flex items-center gap-2">
                                    {formData.quote_system_prompt && (
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, quote_system_prompt: '' }))}
                                            className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 transition-colors"
                                            title="Restaurer le prompt par défaut"
                                        >
                                            <RotateCcw className="w-3 h-3" />
                                            Restaurer défaut
                                        </button>
                                    )}
                                </div>
                            </div>
                            <p className="text-[11px] text-purple-600 mb-2">
                                Ce prompt est envoyé à l'IA à chaque génération de devis (vocal, IA, visite chantier).
                                Modifiez-le pour adapter les règles de tarification, les unités, ou le style.
                                {!formData.quote_system_prompt && ' Le prompt par défaut est actuellement utilisé.'}
                            </p>
                            <textarea
                                rows={10}
                                placeholder={DEFAULT_QUOTE_PROMPT}
                                className="w-full px-3 py-2 border border-purple-200 dark:border-purple-800/40 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-xs font-mono resize-y"
                                value={formData.quote_system_prompt || ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, quote_system_prompt: e.target.value }))}
                            />
                            {!formData.quote_system_prompt && (
                                <p className="text-[10px] text-purple-500 mt-1 italic">
                                    Laissez vide pour utiliser le prompt par défaut (visible en transparence ci-dessus).
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            )}

            {/* Plateforme Agréée (e-facture) */}
            <div className="mt-8 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                <div className="p-8">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 flex items-center">
                        <Send className="w-5 h-5 mr-2 text-indigo-600" />
                        Plateforme Agréée — Facturation électronique
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                        Connectez votre Plateforme Agréée (PA) pour transmettre automatiquement vos factures à l'administration fiscale.
                        Obligatoire à partir de septembre 2027 pour les micro-entreprises.{' '}
                        <a href="https://www.impots.gouv.fr/je-consulte-la-liste-des-plateformes-agreees" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                            Consulter la liste des PA immatriculées →
                        </a>
                    </p>

                    {pdpKeyConfigured && !pdpKeyInput && (
                        <div className="flex items-center gap-2 mb-4 text-sm text-green-700 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 rounded-lg px-3 py-2">
                            <CheckCircle className="w-4 h-4 flex-shrink-0" />
                            <span>Plateforme Agréée configurée — {pdpUrlInput || 'URL enregistrée'}</span>
                        </div>
                    )}

                    <div className="space-y-3 max-w-lg">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL de l'API de la PA</label>
                            <input
                                type="url"
                                value={pdpUrlInput}
                                onChange={e => setPdpUrlInput(e.target.value)}
                                placeholder="https://api.ma-plateforme-agreee.fr/v1"
                                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom de la plateforme</label>
                            <input
                                type="text"
                                value={pdpServiceInput}
                                onChange={e => setPdpServiceInput(e.target.value)}
                                placeholder="ex: chorus_pro, yooz, pennylane…"
                                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Clé API / Bearer token {pdpKeyConfigured && <span className="text-green-600 font-normal">(déjà configurée)</span>}
                            </label>
                            <input
                                type="password"
                                value={pdpKeyInput}
                                onChange={e => setPdpKeyInput(e.target.value)}
                                placeholder={pdpKeyConfigured ? "Laissez vide pour conserver la clé existante" : "Entrez votre clé API…"}
                                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                            />
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button
                                type="button"
                                onClick={handleSavePdpConfig}
                                disabled={savingPdpConfig || !pdpUrlInput.trim()}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium text-sm transition-colors flex items-center gap-2"
                            >
                                <Save className="w-4 h-4" />
                                {savingPdpConfig ? 'Sauvegarde…' : 'Sauvegarder la configuration PDP'}
                            </button>
                            {pdpKeyConfigured && (
                                <button
                                    type="button"
                                    onClick={handleDeletePdpConfig}
                                    disabled={savingPdpConfig}
                                    className="px-4 py-2 bg-white dark:bg-gray-900 border border-red-200 dark:border-red-800/40 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 font-medium text-sm transition-colors"
                                >
                                    Supprimer
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Zone de Danger / Maintenance */}
            <div className="mt-8 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                <div className="p-8">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 flex items-center">
                        <Mail className="w-5 h-5 mr-2 text-blue-600" />
                        Email de connexion
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                        Email actuel : <strong>{user?.email}</strong>
                        <br />Vos données ne seront pas perdues — elles sont liées à votre compte, pas à votre adresse email.
                    </p>

                    {emailChangeSent ? (
                        <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-100 rounded-lg text-sm text-green-800">
                            <Mail className="w-5 h-5 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="font-medium">Email de confirmation envoyé à <strong>{newEmail}</strong></p>
                                <p className="mt-1 text-green-700">Cliquez sur le lien dans cet email pour finaliser le changement. Une fois confirmé, utilisez votre nouvelle adresse pour vous connecter.</p>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleEmailChange} className="flex flex-col sm:flex-row gap-3 max-w-lg">
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nouvelle adresse email</label>
                                <input
                                    type="email"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    placeholder="contact@monentreprise.com"
                                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    required
                                />
                            </div>
                            <div className="flex items-end">
                                <button
                                    type="submit"
                                    disabled={emailChanging || !newEmail.trim()}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium text-sm transition-colors flex items-center gap-2"
                                >
                                    <KeyRound className="w-4 h-4" />
                                    {emailChanging ? 'Envoi...' : 'Changer'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>

            < div className="mt-8 bg-red-50 dark:bg-red-900/20 rounded-xl shadow-sm border border-red-100 overflow-hidden" >
                <div className="p-8">
                    <h3 className="text-lg font-semibold text-red-900 mb-4 flex items-center">
                        ⚠️ Zone de Maintenance
                    </h3>
                    <p className="text-sm text-red-700 mb-6">
                        Si vous rencontrez des problèmes de mise à jour ou d'affichage, utilisez ces options.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4">
                        <button
                            type="button"
                            onClick={async () => {
                                if ('serviceWorker' in navigator) {
                                    const registrations = await navigator.serviceWorker.getRegistrations();
                                    for (const registration of registrations) {
                                        await registration.unregister();
                                    }
                                }
                                window.location.reload();
                            }}
                            className="px-4 py-2 bg-white dark:bg-gray-900 border border-red-200 dark:border-red-800/40 text-red-700 rounded-lg hover:bg-red-50 font-medium text-sm transition-colors"
                        >
                            Forcer la mise à jour (Recharger)
                        </button>

                        <button
                            type="button"
                            onClick={async () => {
                                const okCache = await confirm({ title: 'Vider le cache local', message: 'Les données en mémoire locale seront effacées et l\'application rechargée.\nVos données sur le serveur ne seront pas affectées.', confirmLabel: 'Vider et recharger' });
                                if (okCache) {
                                    localStorage.clear();
                                    if ('caches' in window) {
                                        const cacheNames = await caches.keys();
                                        await Promise.all(cacheNames.map(name => caches.delete(name)));
                                    }
                                    if ('serviceWorker' in navigator) {
                                        const registrations = await navigator.serviceWorker.getRegistrations();
                                        for (const registration of registrations) {
                                            await registration.unregister();
                                        }
                                    }
                                    window.location.reload();
                                }
                            }}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-sm transition-colors"
                        >
                            Réinitialiser l'application
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Profile;
