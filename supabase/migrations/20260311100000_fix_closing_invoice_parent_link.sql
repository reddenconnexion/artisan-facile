-- Migration : rattacher les factures de clôture orphelines à leur devis d'origine
--
-- Contexte : les factures générées depuis un rapport d'intervention ne recevaient
-- pas de parent_id, ce qui empêchait le dashboard de retirer les devis signés
-- de la colonne "À traiter". Cette migration corrige les enregistrements existants.

-- 1. Relier chaque facture de clôture sans parent_id au devis accepté du même client
UPDATE quotes AS inv
SET parent_id = q.id
FROM quotes AS q
WHERE inv.type = 'invoice'
  AND inv.parent_id IS NULL
  AND inv.notes LIKE 'Facture de clôture — rapport d''intervention du%'
  AND q.type = 'quote'
  AND q.status IN ('accepted', 'billed')
  AND q.client_id = inv.client_id;

-- 2. Passer les devis concernés en "facturé" s'ils ont maintenant une facture de clôture liée
UPDATE quotes AS q
SET status = 'billed'
WHERE q.type = 'quote'
  AND q.status = 'accepted'
  AND EXISTS (
    SELECT 1
    FROM quotes inv
    WHERE inv.parent_id = q.id
      AND inv.type = 'invoice'
      AND inv.notes LIKE 'Facture de clôture — rapport d''intervention du%'
  );
