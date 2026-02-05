-- Add intervention address columns to quotes table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'intervention_address') THEN
        ALTER TABLE public.quotes ADD COLUMN intervention_address TEXT;
        ALTER TABLE public.quotes ADD COLUMN intervention_postal_code TEXT;
        ALTER TABLE public.quotes ADD COLUMN intervention_city TEXT;
    END IF;
END $$;
