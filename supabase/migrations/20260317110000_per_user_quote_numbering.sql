-- Add per-user sequential quote_number column
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quote_number integer;

-- Function to get next quote number for a specific user
CREATE OR REPLACE FUNCTION get_next_quote_number(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(quote_number), 0) + 1
  INTO next_num
  FROM quotes
  WHERE user_id = p_user_id;

  RETURN next_num;
END;
$$;

-- Trigger function: auto-assign quote_number on insert if not provided
CREATE OR REPLACE FUNCTION assign_quote_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.quote_number IS NULL THEN
    NEW.quote_number := get_next_quote_number(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger to quotes table
DROP TRIGGER IF EXISTS set_quote_number ON quotes;
CREATE TRIGGER set_quote_number
  BEFORE INSERT ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION assign_quote_number();

-- Backfill existing quotes: assign sequential numbers per user ordered by created_at
WITH numbered AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at, id) AS rn
  FROM quotes
  WHERE quote_number IS NULL
)
UPDATE quotes
SET quote_number = numbered.rn
FROM numbered
WHERE quotes.id = numbered.id;
