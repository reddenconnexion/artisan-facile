import { useState } from 'react';
import { supabase } from '../../utils/supabase';
import { toast } from 'sonner';

// SMTP perso — mot de passe jamais renvoyé par le serveur
export const useSmtpSettings = (confirm) => {
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

    // Config SMTP : tous les champs sauf le password
    const loadFromProfile = (data) => {
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

    return {
        smtpForm,
        smtpPasswordConfigured,
        savingSmtp,
        testingSmtp,
        showSmtpPanel,
        setShowSmtpPanel,
        handleSmtpFieldChange,
        handleSmtpPreset,
        handleSaveSmtp,
        handleTestSmtp,
        handleDeleteSmtp,
        loadFromProfile,
    };
};
