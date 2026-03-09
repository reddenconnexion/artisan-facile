-- Add report_pdf_url column to quotes table
-- This allows closing invoices generated from intervention reports to store the PDF link
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS report_pdf_url TEXT;

-- Add report_pdf_url column to intervention_reports table
-- This stores the PDF URL directly on the report for cross-reference from any linked quote
ALTER TABLE intervention_reports ADD COLUMN IF NOT EXISTS report_pdf_url TEXT;
