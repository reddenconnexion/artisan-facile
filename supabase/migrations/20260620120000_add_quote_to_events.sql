-- Permet de rattacher un devis (ou une facture) à un rendez-vous / chantier de
-- l'agenda. Objectif : retrouver instantanément la liste du matériel à charger
-- la veille et le matin de l'intervention, sans avoir à rechercher le devis ni
-- à ouvrir le PDF.
--
-- Le lien est facultatif : un RDV peut très bien ne pas avoir de devis associé,
-- auquel cas l'application propose un repli automatique sur les devis du client.

alter table events
  add column if not exists quote_id bigint references quotes(id) on delete set null;

create index if not exists idx_events_quote_id on events(quote_id);
