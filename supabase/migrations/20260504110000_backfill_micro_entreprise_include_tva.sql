-- Backfill : pour les artisans en franchise de TVA (micro-entreprise /
-- auto-entrepreneur), force include_tva = FALSE sur les devis existants
-- où aucune TVA n'a réellement été appliquée (total_tva = 0).
--
-- Motivation : avant ce correctif, le défaut côté UI était include_tva
-- = TRUE même pour des micro-entrepreneurs, ce qui empêchait l'affichage
-- de la mention obligatoire « TVA non applicable, art. 293 B du CGI »
-- sur le PDF public et imprimé.
--
-- On ne touche pas aux devis où total_tva > 0 (TVA déjà calculée et
-- éventuellement encaissée) pour ne pas réécrire des données comptables.

UPDATE quotes q
SET include_tva = FALSE
FROM profiles p
WHERE q.user_id = p.id
  AND COALESCE(p.ai_preferences->>'artisan_status', 'micro_entreprise') = 'micro_entreprise'
  AND q.include_tva = TRUE
  AND COALESCE(q.total_tva, 0) = 0;
