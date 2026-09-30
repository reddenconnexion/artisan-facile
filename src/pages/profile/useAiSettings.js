import { useState } from 'react';
import { supabase } from '../../utils/supabase';
import { toast } from 'sonner';

// Paramètres avancés : clé API IA + calculateur du coefficient de marge
export const useAiSettings = () => {
    // Calculateur du coefficient de marge (dérive le coef à appliquer au prix
    // d'achat réel depuis la marge catalogue et la remise fournisseur).
    const [calcCatalog, setCalcCatalog] = useState('1.25');
    const [calcDiscount, setCalcDiscount] = useState('');
    // API key : jamais stockée côté client — on ne retient que le booléen "configurée"
    const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(true);
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [savingApiKey, setSavingApiKey] = useState(false);

    // Le serveur fournit directement les flags `has_openai_api_key` etc.
    const loadFromProfile = (data) => {
        setApiKeyConfigured(!!data.has_openai_api_key);
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

    return {
        calcCatalog,
        setCalcCatalog,
        calcDiscount,
        setCalcDiscount,
        apiKeyConfigured,
        showAdvanced,
        setShowAdvanced,
        apiKeyInput,
        setApiKeyInput,
        savingApiKey,
        handleSaveApiKey,
        handleDeleteApiKey,
        loadFromProfile,
    };
};
