-- Create quote_follow_ups table
CREATE TABLE IF NOT EXISTS public.quote_follow_ups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id BIGINT REFERENCES public.quotes(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    follow_up_number INTEGER NOT NULL,
    content TEXT,
    method TEXT DEFAULT 'email'
);

-- Add follow_up_count to quotes if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'follow_up_count') THEN
        ALTER TABLE public.quotes ADD COLUMN follow_up_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add follow_up_settings to profiles if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'follow_up_settings') THEN
        ALTER TABLE public.profiles ADD COLUMN follow_up_settings JSONB DEFAULT '{"steps": [{"delay": 3, "label": "Relance douce"}, {"delay": 7, "label": "Relance standard"}]}'::jsonb;
    END IF;
END $$;

-- Enable RLS for quote_follow_ups
ALTER TABLE public.quote_follow_ups ENABLE ROW LEVEL SECURITY;

-- Create policies for quote_follow_ups
CREATE POLICY "Users can view their own follow ups"
    ON public.quote_follow_ups FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own follow ups"
    ON public.quote_follow_ups FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own follow ups"
    ON public.quote_follow_ups FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own follow ups"
    ON public.quote_follow_ups FOR DELETE
    USING (auth.uid() = user_id);
