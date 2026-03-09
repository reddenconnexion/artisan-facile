-- Add report_pdf_url column to quotes table
-- This allows closing invoices generated from intervention reports to store the PDF link
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS report_pdf_url TEXT;
