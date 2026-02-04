-- Add tax rate columns to profiles for accounting calculations
ALTER TABLE "public"."profiles" 
ADD COLUMN IF NOT EXISTS "tax_rate_service" numeric DEFAULT 21.2,
ADD COLUMN IF NOT EXISTS "tax_rate_material" numeric DEFAULT 12.3;

-- Add accounting enabled flag if not exists (though usually handled in jsonb settings, optional column good for indexing if needed later)
-- For now we stick to storing "enabled" in strict jsonb preferences or relying on user role, 
-- but we will rely on ActivitySettings (localstorage/metadata) for enabling the VIEW.
