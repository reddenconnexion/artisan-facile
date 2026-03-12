-- RPC to safely increment usage counters (upsert pattern)
CREATE OR REPLACE FUNCTION increment_voice_memo_usage(p_user_id UUID, p_month TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO usage_tracking (user_id, month, voice_memos_count, updated_at)
  VALUES (p_user_id, p_month, 1, NOW())
  ON CONFLICT (user_id, month)
  DO UPDATE SET
    voice_memos_count = usage_tracking.voice_memos_count + 1,
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION increment_ai_generation_usage(p_user_id UUID, p_month TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO usage_tracking (user_id, month, ai_generations_count, updated_at)
  VALUES (p_user_id, p_month, 1, NOW())
  ON CONFLICT (user_id, month)
  DO UPDATE SET
    ai_generations_count = usage_tracking.ai_generations_count + 1,
    updated_at = NOW();
END;
$$;
