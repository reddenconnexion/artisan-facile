import { supabase } from './supabase';

export const PLAN_LIMITS = {
    free: {
        voice_memos: 10,
        ai_generations: 5,
        auto_pipeline: false,
    },
    pro: {
        voice_memos: Infinity,
        ai_generations: Infinity,
        auto_pipeline: true,
    },
    owner: {
        voice_memos: Infinity,
        ai_generations: Infinity,
        auto_pipeline: true,
    },
};

/**
 * Gets current month usage for a user.
 * @param {string} userId
 * @returns {Promise<{voice_memos_count: number, ai_generations_count: number}>}
 */
export const getCurrentUsage = async (userId) => {
    const currentMonth = new Date().toISOString().slice(0, 7);

    const { data } = await supabase
        .from('usage_tracking')
        .select('voice_memos_count, ai_generations_count')
        .eq('user_id', userId)
        .eq('month', currentMonth)
        .maybeSingle();

    return {
        voice_memos_count: data?.voice_memos_count ?? 0,
        ai_generations_count: data?.ai_generations_count ?? 0,
    };
};

/**
 * Checks if a user can perform an action based on their plan limits.
 * @param {string} userId
 * @param {'voice_memo'|'ai_generation'} type
 * @param {'free'|'pro'} plan
 * @returns {Promise<{allowed: boolean, remaining: number, limit: number}>}
 */
export const checkLimit = async (userId, type, plan = 'free') => {
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
    const limit = type === 'voice_memo' ? limits.voice_memos : limits.ai_generations;

    if (limit === Infinity) {
        return { allowed: true, remaining: Infinity, limit: Infinity };
    }

    const usage = await getCurrentUsage(userId);
    const count = type === 'voice_memo' ? usage.voice_memos_count : usage.ai_generations_count;
    const remaining = Math.max(0, limit - count);

    return { allowed: count < limit, remaining, limit };
};

/**
 * Increments the usage counter for a user (client-side fallback when not using edge fn).
 * The edge function also increments via RPC — this is for client-side AI calls.
 */
export const incrementAiGenerationUsage = async (userId) => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    await supabase.rpc('increment_ai_generation_usage', {
        p_user_id: userId,
        p_month: currentMonth,
    });
};

/**
 * Checks if auto pipeline is available for the given plan.
 */
export const canUseAutoPipeline = (plan) => {
    return PLAN_LIMITS[plan]?.auto_pipeline ?? false;
};
