import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useUserProfile, useInvalidateCache } from './useDataCache';
import { planAutopilotRun, readAutopilotSettings, summarizeActions } from '../utils/autopilot';

const DAY_MS = 24 * 3600 * 1000;

/** Devis, factures et journal du pilote, puis aperçu de ce qui partirait. */
const fetchAutopilotData = async (userId, profile) => {
    const since = new Date(Date.now() - 400 * DAY_MS).toISOString().slice(0, 10);
    const [docsRes, logRes, reviewsRes] = await Promise.all([
        supabase.from('quotes')
            .select('id, type, status, date, created_at, valid_until, total_ttc, title, client_id, archived_at, signed_at, paid_at, parent_id, relance_snoozed_until, follow_up_count, last_followup_at, public_token, invoice_number, quote_number, clients (id, name, email, civility, autopilot_paused, siren, tva_intracom)')
            .eq('user_id', userId)
            .not('status', 'in', '(draft,cancelled)')
            .gte('date', since),
        supabase.from('autopilot_actions')
            .select('id, kind, quote_id, client_id, label, recipient, subject, body, amount, status, error, day, created_at')
            .eq('user_id', userId)
            .gte('created_at', new Date(Date.now() - 7 * DAY_MS).toISOString())
            .order('created_at', { ascending: false })
            .limit(100),
        supabase.from('autopilot_actions')
            .select('client_id')
            .eq('user_id', userId)
            .eq('kind', 'review_request')
            .eq('status', 'sent'),
    ]);

    const { actions, needsArtisan } = planAutopilotRun({
        settings: profile.autopilot_settings,
        profile,
        docs: docsRes.data || [],
        steps: profile.follow_up_settings?.steps,
        reviewedClients: new Set((reviewsRes.data || []).map((r) => r.client_id)),
        preview: true,
    });
    return {
        preview: { ...summarizeActions(actions), actions, needsArtisan },
        // Table absente tant que la migration n'est pas passée : journal vide.
        recent: logRes.error ? [] : (logRes.data || []),
    };
};

/**
 * Pilote automatique : réglages, journal des 7 derniers jours et aperçu de
 * ce que l'appli relancerait aujourd'hui (mêmes règles que l'Edge Function).
 */
export const useAutopilot = () => {
    const { user } = useAuth();
    const { data: profile } = useUserProfile();
    const { invalidateProfile } = useInvalidateCache();
    const [data, setData] = useState({ preview: null, recent: [] });
    const [loading, setLoading] = useState(true);
    const [reloadKey, setReloadKey] = useState(0);
    const [localSettings, setLocalSettings] = useState(null);

    const settings = readAutopilotSettings(localSettings ?? profile?.autopilot_settings);

    useEffect(() => {
        if (!user || !profile) return undefined;
        let alive = true;
        fetchAutopilotData(user.id, profile).then((next) => {
            if (!alive) return;
            setData(next);
            setLoading(false);
        }, (err) => {
            console.warn('useAutopilot:', err);
            if (alive) setLoading(false);
        });
        return () => { alive = false; };
    }, [user, profile, reloadKey]);

    const reload = useCallback(() => setReloadKey((k) => k + 1), []);

    const save = useCallback(async (patch) => {
        const next = { ...settings, ...patch };
        if (patch.enabled && !settings.activated_at) next.activated_at = new Date().toISOString();
        setLocalSettings(next);
        const { error } = await supabase.from('profiles').update({ autopilot_settings: next }).eq('id', user.id);
        if (error) {
            setLocalSettings(null);
            throw error;
        }
        invalidateProfile?.();
        return next;
    }, [settings, user, invalidateProfile]);

    const { preview, recent } = data;
    const sent = recent.filter((r) => r.status === 'sent' && r.kind !== 'summary');
    return {
        profile,
        settings,
        save,
        loading,
        reload,
        preview,
        recent: sent,
        week: summarizeActions(sent),
        lastSummary: recent.find((r) => r.kind === 'summary') || null,
        failures: recent.filter((r) => r.status === 'failed'),
        sendsFromOwnAddress: Boolean(profile?.smtp_config?.host && profile?.smtp_config?.from_email),
        replyTo: profile?.professional_email || profile?.email || '',
    };
};
