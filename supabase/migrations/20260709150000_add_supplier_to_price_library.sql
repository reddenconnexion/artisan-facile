-- Fournisseur sur les articles de la Bibliothèque de Prix (BPU).
-- Alimenté notamment depuis l'utilitaire « À commander » quand on répertorie
-- un matériel : le fournisseur et le prix d'achat réel remontent au catalogue
-- pour préremplir les prochains devis.
-- Défensive : price_library a parfois été modifiée hors migrations en base
-- distante, on ne présume pas de l'état du schéma.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public'
                     AND table_name = 'price_library'
                     AND column_name = 'supplier') THEN
        ALTER TABLE public.price_library ADD COLUMN supplier text;
    END IF;
END $$;

COMMENT ON COLUMN public.price_library.supplier IS
    'Fournisseur habituel de l''article (saisi ou remonté depuis « À commander »).';
