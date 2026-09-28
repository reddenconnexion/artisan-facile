-- Plans électriques liés aux fiches clients
CREATE TABLE IF NOT EXISTS client_plans (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id   BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'Plan sans titre',
  plan_data   JSONB NOT NULL,
  thumbnail   TEXT,  -- base64 JPEG miniature du canvas
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE client_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own client_plans"
  ON client_plans FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Mise à jour automatique de updated_at
CREATE OR REPLACE FUNCTION update_client_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER client_plans_updated_at
  BEFORE UPDATE ON client_plans
  FOR EACH ROW EXECUTE FUNCTION update_client_plans_updated_at();
