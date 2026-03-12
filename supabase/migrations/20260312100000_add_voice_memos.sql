-- Migration: Add voice_memos table for the voice-first pipeline
CREATE TABLE IF NOT EXISTS voice_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  audio_url TEXT,
  transcript TEXT,
  intent_result JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','transcribing','processing','done','error','cancelled')),
  actions_taken JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE voice_memos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their voice memos"
  ON voice_memos FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast user queries
CREATE INDEX IF NOT EXISTS idx_voice_memos_user_id ON voice_memos(user_id, created_at DESC);
