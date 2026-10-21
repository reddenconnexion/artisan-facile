-- Découpage des heures pointées par bloc de travaux : un total par chantier dit
-- seulement si le devis était sous- ou sur-estimé ; le bloc dit où, et sert de
-- barème de temps réels pour les prochains chiffrages.
--   work_block    : nature des travaux (null = non précisé, pointages existants)
--   reconstructed : heures découpées après coup, de mémoire, et non relevées
--                   sur le moment — à ne pas confondre avec du réel.

alter table task_tracking
  add column if not exists work_block text,
  add column if not exists reconstructed boolean not null default false;

alter table task_tracking drop constraint if exists task_tracking_work_block_check;
alter table task_tracking
  add constraint task_tracking_work_block_check
  check (work_block is null or work_block in ('cables', 'tableau', 'appareillage', 'imprevus', 'hors_pose'));
