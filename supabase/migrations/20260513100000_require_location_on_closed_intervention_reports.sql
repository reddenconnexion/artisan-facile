-- Require city + postal code on intervention reports as soon as they leave
-- the draft state. Drafts may stay incomplete while the technician is on
-- site, but a closed (`completed`) or signed report must carry the location
-- so the public per-city counter on reddenconnexion.fr is accurate.
--
-- Marked NOT VALID so legacy rows already in completed/signed state with
-- missing data don't block the migration. Run
--   alter table public.intervention_reports
--     validate constraint intervention_reports_location_required_when_closed;
-- once the backfill is done.

alter table public.intervention_reports
  add constraint intervention_reports_location_required_when_closed
  check (
    status = 'draft'
    or (
      intervention_city is not null
      and length(trim(intervention_city)) > 0
      and intervention_postal_code is not null
      and length(trim(intervention_postal_code)) > 0
    )
  ) not valid;

comment on constraint intervention_reports_location_required_when_closed
  on public.intervention_reports is
  'Closed or signed reports must carry a city and postal code so the public counter on reddenconnexion.fr stays accurate.';
