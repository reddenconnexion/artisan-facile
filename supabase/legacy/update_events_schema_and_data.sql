-- Add client_id column to events table if it doesn't exist
do $$
begin
    if not exists (select 1 from information_schema.columns where table_name = 'events' and column_name = 'client_id') then
        alter table events add column client_id bigint references clients(id);
    end if;
end $$;

-- Backfill client_id based on client_name matching
-- This uses a case-insensitive match
update events e
set client_id = c.id
from clients c
where e.client_id is null
and e.client_name is not null
and lower(e.client_name) = lower(c.name);
