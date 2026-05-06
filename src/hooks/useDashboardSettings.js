import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { toastError } from '../utils/supabaseErrorHandler';

/**
 * Définition des widgets du tableau de bord.
 * Pour ajouter un nouveau widget : étendre cette constante + l'ajouter dans Dashboard.jsx.
 */
export const DASHBOARD_WIDGETS = [
    { id: 'kpi_strip',        label: 'Indicateurs clés',           description: 'CA du mois, devis en cours, prochain RDV', defaultVisible: true,  alwaysOn: true  },
    { id: 'quick_actions',    label: 'Actions rapides',            description: 'Raccourcis pour créer devis, factures, etc.', defaultVisible: true,  alwaysOn: false },
    { id: 'actionable',       label: 'À traiter',                  description: 'Devis en retard, factures à relancer, alertes', defaultVisible: true,  alwaysOn: false },
    { id: 'financial_health', label: 'Score de santé financière',  description: 'Note 0-100 avec conseils contextuels',     defaultVisible: true,  alwaysOn: false },
    { id: 'recent_documents', label: 'Derniers documents',         description: '5 devis/factures les plus récents',       defaultVisible: true,  alwaysOn: false },
    { id: 'voice_memos',      label: 'Mémos vocaux récents',       description: 'Vos derniers enregistrements vocaux',     defaultVisible: true,  alwaysOn: false },
    { id: 'advanced_stats',   label: 'Statistiques détaillées',    description: 'Graphiques CA, résultat net, conversion', defaultVisible: true,  alwaysOn: false },
    { id: 'recent_activity',  label: 'Activité récente',           description: 'Journal des dernières actions',           defaultVisible: true,  alwaysOn: false },
];

const STORAGE_KEY = 'dashboard_widgets';

function getDefaultVisibility() {
    return Object.fromEntries(DASHBOARD_WIDGETS.map(w => [w.id, w.defaultVisible]));
}

/**
 * Préférences d'affichage du dashboard, stockées dans `user.user_metadata.dashboard_widgets`.
 * Format : { kpi_strip: true, voice_memos: false, ... }
 */
export function useDashboardSettings() {
    const { user } = useAuth();
    const [visibility, setVisibility] = useState(() => {
        const stored = user?.user_metadata?.[STORAGE_KEY];
        return { ...getDefaultVisibility(), ...(stored || {}) };
    });
    const [saving, setSaving] = useState(false);

    // Resync si l'objet user change (login, refresh, etc.)
    useEffect(() => {
        if (user?.user_metadata?.[STORAGE_KEY]) {
            setVisibility({ ...getDefaultVisibility(), ...user.user_metadata[STORAGE_KEY] });
        }
    }, [user?.id]);

    const isVisible = useCallback(
        (widgetId) => visibility[widgetId] !== false,
        [visibility],
    );

    const toggle = useCallback((widgetId) => {
        const widget = DASHBOARD_WIDGETS.find(w => w.id === widgetId);
        if (widget?.alwaysOn) return; // Verrou : certains widgets ne peuvent pas être masqués
        setVisibility(prev => ({ ...prev, [widgetId]: !isVisible(widgetId) }));
    }, [isVisible]);

    const reset = useCallback(() => {
        setVisibility(getDefaultVisibility());
    }, []);

    /** Persiste les préférences dans `user_metadata` */
    const save = useCallback(async () => {
        setSaving(true);
        try {
            const { error } = await supabase.auth.updateUser({
                data: { [STORAGE_KEY]: visibility },
            });
            if (error) throw error;
            return { success: true };
        } catch (err) {
            toastError(err, 'Impossible d\'enregistrer vos préférences');
            return { success: false };
        } finally {
            setSaving(false);
        }
    }, [visibility]);

    return { visibility, isVisible, toggle, reset, save, saving };
}
