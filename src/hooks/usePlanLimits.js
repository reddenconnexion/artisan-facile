import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import { PLAN_LIMITS, getCurrentUsage } from '../utils/planLimits';

/**
 * Hook to get the current user's plan and usage limits.
 * Provides convenient booleans for gating features.
 */
export const usePlanLimits = () => {
    const [plan, setPlan] = useState('free');
    const [usage, setUsage] = useState({ voice_memos_count: 0, ai_generations_count: 0 });
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const [profileResult, usageData] = await Promise.all([
            supabase.from('profiles').select('plan').eq('id', user.id).maybeSingle(),
            getCurrentUsage(user.id),
        ]);

        const userPlan = profileResult.data?.plan || 'free';
        setPlan(userPlan);
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
        usage,
        loading,
        refresh,
        isPro: plan === 'pro',
        canUseVoice: remainingVoice > 0,
        canUseAI: remainingAI > 0,
        canUseAutoPipeline: limits.auto_pipeline,
        remainingVoice,
        remainingAI,
        voiceLimit: limits.voice_memos,
        aiLimit: limits.ai_generations,
    };
};
