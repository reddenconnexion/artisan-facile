import { useEffect, useRef, useState } from 'react';
import { supabase } from '../utils/supabase';

/**
 * Subscribe to a Supabase Realtime postgres_changes channel with proper
 * error handling. Returns the current subscription status so the caller
 * can surface "live updates unavailable" state to the user when the
 * channel can't connect.
 *
 * @param {string|null|false} channelName - unique channel id, or a falsy
 *   value to disable the subscription (e.g. while user is loading).
 * @param {Object} config
 * @param {string} config.table - Postgres table to listen to.
 * @param {string} [config.event='*'] - 'INSERT' | 'UPDATE' | 'DELETE' | '*'.
 * @param {string} [config.schema='public']
 * @param {string} [config.filter] - Postgres filter expression, e.g. 'user_id=eq.abc'.
 * @param {(payload: any) => void} onChange - Called for each change.
 * @returns {{ status: 'idle'|'subscribed'|'error'|'closed' }}
 */
export const useRealtimeSubscription = (channelName, config, onChange) => {
    const [status, setStatus] = useState('idle');
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useEffect(() => {
        if (!channelName) {
            setStatus('idle');
            return undefined;
        }

        const { table, event = '*', schema = 'public', filter } = config;
        const filterArg = { event, schema, table, ...(filter ? { filter } : {}) };

        const channel = supabase
            .channel(channelName)
            .on('postgres_changes', filterArg, (payload) => {
                try {
                    onChangeRef.current?.(payload);
                } catch (err) {
                    console.error(`[realtime ${channelName}] handler threw:`, err);
                }
            })
            .subscribe((subscriptionStatus, err) => {
                if (subscriptionStatus === 'SUBSCRIBED') {
                    setStatus('subscribed');
                } else if (subscriptionStatus === 'CHANNEL_ERROR' || subscriptionStatus === 'TIMED_OUT') {
                    setStatus('error');
                    console.warn(`[realtime ${channelName}] subscription failed: ${subscriptionStatus}`, err);
                } else if (subscriptionStatus === 'CLOSED') {
                    setStatus('closed');
                }
            });

        return () => {
            supabase.removeChannel(channel).catch((err) => {
                console.warn(`[realtime ${channelName}] removeChannel failed:`, err);
            });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [channelName, config.table, config.event, config.schema, config.filter]);

    return { status };
};
