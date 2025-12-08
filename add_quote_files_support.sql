-- Add column to store the original PDF URL
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS original_pdf_url TEXT;

-- Create a storage bucket for quote files if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('quote_files', 'quote_files', true)
ON CONFLICT (id) DO NOTHING;

-- RLS for quote_files
-- Public access is needed for the PublicQuote page (clients viewing the PDF)
CREATE POLICY "Quote files are publicly accessible."
  ON storage.objects FOR SELECT
  USING ( bucket_id = 'quote_files' );

CREATE POLICY "Users can upload quote files."
  ON storage.objects FOR INSERT
  WITH CHECK ( bucket_id = 'quote_files' AND auth.uid() = owner );

CREATE POLICY "Users can update quote files."
  ON storage.objects FOR UPDATE
  USING ( bucket_id = 'quote_files' AND auth.uid() = owner );

CREATE POLICY "Users can delete quote files."
  ON storage.objects FOR DELETE
  USING ( bucket_id = 'quote_files' AND auth.uid() = owner );
