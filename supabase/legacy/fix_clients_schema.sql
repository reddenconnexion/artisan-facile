
-- Ensure Factur-X fields exist in clients table
do $$
begin
    -- Add type column if missing
    if not exists (select 1 from information_schema.columns where table_name = 'clients' and column_name = 'type') then
        alter table clients add column type text default 'professional';
    end if;

    -- Add siren column if missing
    if not exists (select 1 from information_schema.columns where table_name = 'clients' and column_name = 'siren') then
        alter table clients add column siren text;
    end if;

    -- Add tva_intracom column if missing
    if not exists (select 1 from information_schema.columns where table_name = 'clients' and column_name = 'tva_intracom') then
        alter table clients add column tva_intracom text;
    end if;
     -- Add portal_token column if missing
    if not exists (select 1 from information_schema.columns where table_name = 'clients' and column_name = 'portal_token') then
        alter table clients add column portal_token text;
    end if;
      -- Add contacts column if missing
    if not exists (select 1 from information_schema.columns where table_name = 'clients' and column_name = 'contacts') then
        alter table clients add column contacts jsonb default '[]'::jsonb;
    end if;
end $$;
