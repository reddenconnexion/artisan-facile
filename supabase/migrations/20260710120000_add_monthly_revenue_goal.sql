-- Objectif de chiffre d'affaires mensuel (anneau d'objectif du Dashboard).
-- NULL = pas d'objectif défini, le widget propose alors d'en fixer un.
alter table profiles add column if not exists monthly_revenue_goal numeric;
