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
    { id: 'monthly_goal',     label: 'Objectif du mois',           description: 'Anneau de progression du CA vers votre objectif mensuel', defaultVisible: true,  alwaysOn: false },
    { id: 'daily_relances',   label: 'Suggestions de relance du jour', description: 'Relances à valider, modifier ou reporter chaque jour', defaultVisible: true,  alwaysOn: false },
    { id: 'worksites',        label: 'Chantiers (kanban)',         description: 'Mini-kanban de vos chantiers, déplaçables par étape', defaultVisible: true,  alwaysOn: false },
    { id: 'expiring_quotes',  label: 'Devis qui expirent',         description: 'Alerte quand des devis arrivent à échéance', defaultVisible: true,  alwaysOn: false },
    { id: 'quick_actions',    label: 'Actions rapides',            description: 'Raccourcis vers vos pages et actions les plus utilisées', defaultVisible: true,  alwaysOn: false },
    { id: 'actionable',       label: 'À traiter',                  description: 'Devis en retard, factures à relancer, alertes', defaultVisible: true,  alwaysOn: false },
    { id: 'financial_health',    label: 'Score de santé financière',  description: 'Note 0-100 avec conseils contextuels',              defaultVisible: true,  alwaysOn: false },
    { id: 'cash_flow_forecast', label: 'Trésorerie prévisionnelle', description: 'Projection à 90 jours des encaissements attendus',  defaultVisible: true,  alwaysOn: false },
    { id: 'recent_documents',  label: 'Derniers documents',         description: '5 devis/factures les plus récents',                defaultVisible: true,  alwaysOn: false },
    { id: 'top_clients',      label: 'Top clients',                description: 'Vos meilleurs clients par chiffre d\'affaires', defaultVisible: true,  alwaysOn: false },
    { id: 'voice_memos',      label: 'Mémos vocaux récents',       description: 'Vos derniers enregistrements vocaux',     defaultVisible: true,  alwaysOn: false },
    { id: 'advanced_stats',   label: 'Statistiques détaillées',    description: 'Graphiques CA, résultat net, conversion', defaultVisible: true,  alwaysOn: false },
    { id: 'recent_activity',  label: 'Activité récente',           description: 'Journal des dernières actions',           defaultVisible: true,  alwaysOn: false },
    { id: 'storage_usage',    label: 'Espace de stockage',         description: 'Usage du stockage et alerte de quota (photos)', defaultVisible: true,  alwaysOn: false },
];

const STORAGE_KEY = 'dashboard_widgets';
const ORDER_KEY = 'dashboard_widget_order';

// Widgets épinglés en tête, non déplaçables (ex. les indicateurs clés).
const PINNED_IDS = new Set(DASHBOARD_WIDGETS.filter(w => w.alwaysOn).map(w => w.id));

function getDefaultVisibility() {
    return Object.fromEntries(DASHBOARD_WIDGETS.map(w => [w.id, w.defaultVisible]));
}

/** Ordre par défaut = ordre de déclaration du catalogue. */
export function getDefaultWidgetOrder() {
    return DASHBOARD_WIDGETS.map(w => w.id);
}

/**
 * Réconcilie un ordre enregistré avec le catalogue courant : conserve les ids
 * connus dans l'ordre choisi, insère les nouveaux widgets à leur place par
 * défaut, et garde les widgets épinglés en tête. Tolère un ordre absent/partiel.
 */
export function reconcileWidgetOrder(stored) {
    const all = getDefaultWidgetOrder();
    const known = Array.isArray(stored) ? stored.filter(id => all.includes(id)) : [];

    // Insère chaque id manquant juste après son voisin de gauche par défaut.
    const result = [...known];
    for (const id of all) {
        if (result.includes(id)) continue;
        const defIdx = all.indexOf(id);
        let insertAt = result.length;
        for (let i = defIdx - 1; i >= 0; i--) {
            const pos = result.indexOf(all[i]);
            if (pos !== -1) { insertAt = pos + 1; break; }
        }
        result.splice(insertAt, 0, id);
    }

    // Les widgets épinglés reviennent toujours en tête, dans l'ordre du catalogue.
    const pinned = all.filter(id => PINNED_IDS.has(id));
    const rest = result.filter(id => !PINNED_IDS.has(id));
    return [...pinned, ...rest];
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
    const [order, setOrder] = useState(() => reconcileWidgetOrder(user?.user_metadata?.[ORDER_KEY]));
    const [saving, setSaving] = useState(false);

    // Resync si l'objet user change (login, refresh, etc.)
    useEffect(() => {
        if (user?.user_metadata?.[STORAGE_KEY]) {
            setVisibility({ ...getDefaultVisibility(), ...user.user_metadata[STORAGE_KEY] });
        }
        setOrder(reconcileWidgetOrder(user?.user_metadata?.[ORDER_KEY]));
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

    // Déplace un widget d'un cran (dir = -1 haut, +1 bas). Les widgets épinglés
    // restent en tête et ne peuvent être ni déplacés ni dépassés.
    const moveWidget = useCallback((widgetId, dir) => {
        if (PINNED_IDS.has(widgetId)) return;
        setOrder(prev => {
            const idx = prev.indexOf(widgetId);
            const target = idx + dir;
            if (idx === -1 || target < 0 || target >= prev.length) return prev;
            if (PINNED_IDS.has(prev[target])) return prev; // ne pas passer devant un épinglé
            const next = [...prev];
            [next[idx], next[target]] = [next[target], next[idx]];
            return next;
        });
    }, []);

    // Réordonne par glisser-déposer : insère `sourceId` à la place de `targetId`.
    const reorderWidget = useCallback((sourceId, targetId) => {
        if (PINNED_IDS.has(sourceId) || PINNED_IDS.has(targetId) || sourceId === targetId) return;
        setOrder(prev => {
            const from = prev.indexOf(sourceId);
            const to = prev.indexOf(targetId);
            if (from === -1 || to === -1) return prev;
            const next = [...prev];
            const [moved] = next.splice(from, 1);
            next.splice(next.indexOf(targetId) + (to > from ? 1 : 0), 0, moved);
            return next;
        });
    }, []);

    const reset = useCallback(() => {
        setVisibility(getDefaultVisibility());
        setOrder(getDefaultWidgetOrder());
    }, []);

    /** Persiste les préférences dans `user_metadata` */
    const save = useCallback(async () => {
        setSaving(true);
        try {
            const { error } = await supabase.auth.updateUser({
                data: { [STORAGE_KEY]: visibility, [ORDER_KEY]: order },
            });
            if (error) throw error;
            return { success: true };
        } catch (err) {
            toastError(err, 'Impossible d\'enregistrer vos préférences');
            return { success: false };
        } finally {
            setSaving(false);
        }
    }, [visibility, order]);

    return { visibility, order, isVisible, toggle, moveWidget, reorderWidget, reset, save, saving };
}
