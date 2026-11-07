import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import { PLAN_LIMITS, getCurrentUsage } from '../utils/planLimits';

/**
 * Hook to get the current user's plan and usage limits.
 * Provides convenient booleans for gating features.
 */
export const usePlanLimits = () => {
    const [plan, setPlan] = useState('free');
    const [cancelAt, setCancelAt] = useState(null);
    const [trialEnd, setTrialEnd] = useState(null);
    const [founderSince, setFounderSince] = useState(null);
    const [hadSubscription, setHadSubscription] = useState(false);
    const [usage, setUsage] = useState({ voice_memos_count: 0, ai_generations_count: 0 });
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const [profileResult, usageData] = await Promise.all([
            supabase.from('profiles').select('plan, subscription_cancel_at, subscription_trial_end, founder_since, stripe_subscription_status, stripe_test_subscription_status').eq('id', user.id).maybeSingle(),
            getCurrentUsage(user.id),
        ]);

        const userPlan = profileResult.data?.plan || 'free';
        setPlan(userPlan);
        setCancelAt(profileResult.data?.subscription_cancel_at ?? null);
        setTrialEnd(profileResult.data?.subscription_trial_end ?? null);
        setFounderSince(profileResult.data?.founder_since ?? null);
        // L'essai gratuit n'est offert qu'une fois (cf. create-checkout-session).
        setHadSubscription(Boolean(profileResult.data?.stripe_subscription_status || profileResult.data?.stripe_test_subscription_status));
        setUsage(usageData);
        setLoading(false);
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

    const remainingVoice = limits.voice_memos === Infinity
        ? Infinity
        : Math.max(0, limits.voice_memos - usage.voice_memos_count);

    const remainingAI = limits.ai_generations === Infinity
        ? Infinity
        : Math.max(0, limits.ai_generations - usage.ai_generations_count);

    return {
        plan,
        cancelAt,
        trialEnd,
        isFounder: Boolean(founderSince),
        trialEligible: !hadSubscription,
        usage,
        loading,
        refresh,
        isOwner: plan === 'owner',
        isPro: plan === 'pro' || plan === 'owner',
        canUseVoice: remainingVoice > 0,
        canUseAI: remainingAI > 0,
        canUseAutoPipeline: limits.auto_pipeline,
        remainingVoice,
        remainingAI,
        voiceLimit: limits.voice_memos,
        aiLimit: limits.ai_generations,
    };
};
