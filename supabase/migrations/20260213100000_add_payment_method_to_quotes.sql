-- Ajout du mode de règlement aux factures/devis
-- Requis pour le livre de recettes (obligation légale micro-entrepreneur)
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_method text;

-- Valeurs possibles : 'especes', 'cheque', 'virement', 'carte', 'paypal', 'wero', 'autre'
COMMENT ON COLUMN quotes.payment_method IS 'Mode de règlement utilisé pour le paiement';

-- Ajout de la date d'encaissement (peut différer de la date de facture)
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone;

COMMENT ON COLUMN quotes.paid_at IS 'Date effective d encaissement du paiement';
