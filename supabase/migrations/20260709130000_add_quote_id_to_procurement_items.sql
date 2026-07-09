-- Rattache une ligne « à commander » au devis dont elle provient.
-- Permet de regrouper et d'identifier, dans l'utilitaire d'approvisionnement,
-- le matériel envoyé depuis un devis au lieu de le mélanger au reste.
ALTER TABLE public.procurement_items
    ADD COLUMN IF NOT EXISTS quote_id BIGINT REFERENCES quotes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_procurement_items_quote
    ON public.procurement_items(quote_id);

COMMENT ON COLUMN public.procurement_items.quote_id IS
    'Devis d''origine de la ligne (NULL si saisie manuelle ou terrain).';
