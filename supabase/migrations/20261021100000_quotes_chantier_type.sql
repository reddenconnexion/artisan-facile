-- Type de chantier, porté par le devis initial : il permet de comparer heures
-- chiffrées et heures pointées entre chantiers comparables et d'en tirer un
-- coefficient correcteur par type (ex. rénovation complète : ×1,15).
-- Null = non classé. Hors du contenu du devis : n'est pas affiché au client et
-- ne déclenche pas d'archivage de version.

alter table quotes add column if not exists chantier_type text;

alter table quotes drop constraint if exists quotes_chantier_type_check;
alter table quotes
  add constraint quotes_chantier_type_check
  check (chantier_type is null or chantier_type in ('neuf', 'renovation_partielle', 'renovation_complete', 'depannage'));
