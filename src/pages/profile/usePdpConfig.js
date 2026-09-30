import { useState } from 'react';
import { supabase } from '../../utils/supabase';
import { toast } from 'sonner';

// Plateforme Agréée (PA) — clé API jamais exposée côté client
export const usePdpConfig = (user) => {
    const [pdpKeyConfigured, setPdpKeyConfigured] = useState(false);
    const [pdpUrlInput, setPdpUrlInput] = useState('');
    const [pdpServiceInput, setPdpServiceInput] = useState('');
    const [pdpKeyInput, setPdpKeyInput] = useState('');
    const [savingPdpConfig, setSavingPdpConfig] = useState(false);

    // Config PDP : URL et service publics, clé jamais reçue
    const loadFromProfile = (data) => {
        const pdpCfg = data.pdp_config || {};
        setPdpKeyConfigured(!!data.has_pdp_api_key);
        setPdpUrlInput(pdpCfg.pdp_url || '');
        setPdpServiceInput(pdpCfg.pdp_service || '');
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

    return {
        pdpKeyConfigured,
        pdpUrlInput,
        setPdpUrlInput,
        pdpServiceInput,
        setPdpServiceInput,
        pdpKeyInput,
        setPdpKeyInput,
        savingPdpConfig,
        handleSavePdpConfig,
        handleDeletePdpConfig,
        loadFromProfile,
    };
};
