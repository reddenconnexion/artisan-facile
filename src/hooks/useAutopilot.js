import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useUserProfile, useInvalidateCache } from './useDataCache';
import {
    planAutopilotRun, readAutopilotSettings, summarizeActions, parisClock, nextSendTime, sendTimeLabel, MAX_EMAILS_PER_DAY,
} from '../utils/autopilot';

const DAY_MS = 24 * 3600 * 1000;

/** Devis, factures et journal du pilote, puis aperçu de ce qui partirait. */
const fetchAutopilotData = async (userId, profile) => {
    const since = new Date(Date.now() - 400 * DAY_MS).toISOString().slice(0, 10);
    const [docsRes, logRes, reviewsRes, keysRes, draftsRes] = await Promise.all([
        supabase.from('quotes')
            .select('id, type, status, date, created_at, valid_until, total_ttc, title, client_id, archived_at, signed_at, paid_at, parent_id, relance_snoozed_until, follow_up_count, last_followup_at, public_token, invoice_number, quote_number, work_stage, work_completed_at, clients (id, name, email, civility, autopilot_paused, siren, tva_intracom)')
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
        supabase.from('autopilot_actions')
            .select('action_key, client_id, status, day')
            .eq('user_id', userId)
            .neq('kind', 'summary')
            .gte('day', since),
        supabase.from('autopilot_drafts')
            .select('action_key, subject, body, skipped, updated_at')
            .eq('user_id', userId),
    ]);

    // Mêmes entrées que l'Edge Function : ce qui est déjà parti (ou a échoué
    // aujourd'hui), les clients déjà contactés aujourd'hui, les retouches.
    const today = parisClock(new Date()).dateKey;
    const log = keysRes.error ? [] : (keysRes.data || []);
    const sentTodayRows = log.filter((r) => r.day === today && r.status === 'sent');
    const drafts = draftsRes.error ? [] : (draftsRes.data || []);
    const docs = docsRes.data || [];
    const { actions, needsArtisan } = planAutopilotRun({
        settings: profile.autopilot_settings,
        profile,
        docs,
        steps: profile.follow_up_settings?.steps,
        doneKeys: new Set(log.filter((r) => r.action_key && (r.status === 'sent' || r.day === today)).map((r) => r.action_key)),
        contactedToday: new Set(sentTodayRows.map((r) => r.client_id)),
        reviewedClients: new Set((reviewsRes.data || []).map((r) => r.client_id)),
        drafts,
        preview: true,
    });

    // Quand chaque mail partira : les premiers au prochain passage (h05,
    // jours ouvrés 9 h – 18 h), au-delà du plafond du jour les jours suivants.
    const clientNames = new Map(docs.map((d) => [d.client_id, d.clients?.name || '']));
    const docsById = new Map(docs.map((d) => [d.id, d]));
    const next = nextSendTime(new Date());
    let budget = Math.max(0, MAX_EMAILS_PER_DAY - sentTodayRows.length);
    const queue = actions.map((a) => {
        const doc = docsById.get(a.quote_id);
        const item = { ...a, client_name: clientNames.get(a.client_id) || a.to, doc_title: doc?.title || '', doc_type: doc?.type || 'quote' };
        if (a.skipped) return { ...item, when: null };
        if (budget > 0) {
            budget -= 1;
            return { ...item, when: next.toISOString(), whenLabel: sendTimeLabel(next) };
        }
        return { ...item, when: null, whenLabel: 'un jour suivant (15 mails par jour au plus)' };
    });
    const active = actions.filter((a) => !a.skipped);
    return {
        preview: { ...summarizeActions(active), actions: active, needsArtisan, queue },
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

    // Retouches d'un mail prévu (texte, ou « Ne pas envoyer »).
    const saveDraft = useCallback(async (key, { subject, body }) => {
        const { error } = await supabase.from('autopilot_drafts').upsert({
            user_id: user.id, action_key: key, subject, body, skipped: false, updated_at: new Date().toISOString(),
        });
        if (error) throw error;
        reload();
    }, [user, reload]);

    const holdDraft = useCallback(async (key, held, current = {}) => {
        const { error } = await supabase.from('autopilot_drafts').upsert({
            user_id: user.id, action_key: key, subject: current.subject ?? null, body: current.body ?? null,
            skipped: held, updated_at: new Date().toISOString(),
        });
        if (error) throw error;
        reload();
    }, [user, reload]);

    const resetDraft = useCallback(async (key) => {
        const { error } = await supabase.from('autopilot_drafts').delete().eq('user_id', user.id).eq('action_key', key);
        if (error) throw error;
        reload();
    }, [user, reload]);

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
        saveDraft,
        holdDraft,
        resetDraft,
    };
};
