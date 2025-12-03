-- Add status column to clients table
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'lead';

-- Update existing clients to have a default status if null
UPDATE clients SET status = 'lead' WHERE status IS NULL;

-- Add comment to explain statuses
-- lead: Prospect (Premier contact)
-- contacted: Contacté (Prise de contact faite)
-- proposal: Devis en cours (Devis envoyé)
-- signed: Signé (Client actif)
-- lost: Perdu (N'a pas donné suite)
