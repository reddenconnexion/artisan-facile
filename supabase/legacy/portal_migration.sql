-- Add portal_token to clients
alter table clients add column if not exists portal_token uuid default gen_random_uuid() unique;

-- RPC function to get portal data securely
create or replace function get_portal_data(token_input uuid)
returns json
language plpgsql
security definer
as $$
declare
  client_data json;
  artisan_profile json;
  client_quotes json;
  client_photos json;
  target_client_id bigint;
  target_user_id uuid;
begin
  -- 1. Identify Client and User (Artisan) from Token
  select id, user_id into target_client_id, target_user_id
  from clients
  where portal_token = token_input;

  if target_client_id is null then
    return null;
  end if;

  -- 2. Fetch Client Data
  select row_to_json(c) into client_data
  from clients c
  where id = target_client_id;

  -- 3. Fetch Artisan Profile (excluding sensitive data if any, but profile table is mostly public info)
  select row_to_json(p) into artisan_profile
  from profiles p
  where id = target_user_id;

  -- 4. Fetch Quotes
  select json_agg(q order by date desc) into client_quotes
  from quotes q
  where client_id = target_client_id;

  -- 5. Fetch Photos
  select json_agg(pp order by created_at desc) into client_photos
  from project_photos pp
  where client_id = target_client_id;

  -- 6. Construct Response
  return json_build_object(
    'client', client_data,
    'artisan', artisan_profile,
    'quotes', coalesce(client_quotes, '[]'::json),
    'photos', coalesce(client_photos, '[]'::json)
  );
end;
$$;
