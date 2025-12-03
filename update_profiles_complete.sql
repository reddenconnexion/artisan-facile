-- Consolidated migration script for profiles table
alter table profiles
add column if not exists company_name text,
add column if not exists address text,
add column if not exists city text,
add column if not exists postal_code text,
add column if not exists phone text,
add column if not exists siret text,
add column if not exists logo_url text,
add column if not exists professional_email text,
add column if not exists website text;
