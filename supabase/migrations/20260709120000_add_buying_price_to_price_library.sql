-- Prix d'achat fournisseur (BPU) sur les articles de la Bibliothèque de Prix.
-- 0 = non renseigné (même convention que buying_price des lignes de devis).
-- Défensive : certaines colonnes de price_library ont été ajoutées hors
-- migrations en base distante, on ne présume pas de l'état du schéma.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public'
                     AND table_name = 'price_library'
                     AND column_name = 'buying_price') THEN
        ALTER TABLE public.price_library ADD COLUMN buying_price numeric DEFAULT 0;
    END IF;
END $$;
