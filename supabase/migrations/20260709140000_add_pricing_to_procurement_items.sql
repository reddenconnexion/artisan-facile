-- Répertorie, sur chaque ligne « à commander », les infos de prix utiles pour
-- le prochain devis : le prix de vente issu du devis (référence), et deux champs
-- libres à renseigner au bureau — le prix d'achat réel et le fournisseur.
ALTER TABLE public.procurement_items
    ADD COLUMN IF NOT EXISTS sale_price NUMERIC,
    ADD COLUMN IF NOT EXISTS buying_price NUMERIC,
    ADD COLUMN IF NOT EXISTS supplier TEXT;

COMMENT ON COLUMN public.procurement_items.sale_price IS
    'Prix de vente unitaire repris du devis d''origine (NULL si inconnu).';
COMMENT ON COLUMN public.procurement_items.buying_price IS
    'Prix d''achat réel, saisi librement au bureau (NULL si non renseigné).';
COMMENT ON COLUMN public.procurement_items.supplier IS
    'Fournisseur, saisi librement au bureau.';
