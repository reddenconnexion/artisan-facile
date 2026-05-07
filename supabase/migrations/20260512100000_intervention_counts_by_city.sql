-- Public aggregate of intervention counts per city for the marketing site
-- (reddenconnexion.github.io). Returns no PII: only city, postal code and a
-- count of completed/signed reports. Bypasses RLS via SECURITY DEFINER, but
-- the SQL itself only ever exposes aggregates.

create or replace function public.get_intervention_counts_by_city()
returns table (
  city text,
  postal_code text,
  count bigint
)
language sql
security definer
stable
set search_path = public
as $$
  select
    intervention_city as city,
    intervention_postal_code as postal_code,
    count(*)::bigint as count
  from public.intervention_reports
  where status in ('completed', 'signed')
    and intervention_city is not null
    and length(trim(intervention_city)) > 0
  group by intervention_city, intervention_postal_code
  order by count desc;
$$;

revoke all on function public.get_intervention_counts_by_city() from public;
grant execute on function public.get_intervention_counts_by_city() to anon, authenticated;

comment on function public.get_intervention_counts_by_city() is
  'Aggregated counts of completed/signed intervention reports per city. Anon-readable, no PII.';
