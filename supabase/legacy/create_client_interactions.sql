create table if not exists client_interactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  client_id bigint references clients(id) on delete cascade not null,
  type text not null check (type in ('email', 'call', 'sms', 'meeting', 'other')),
  date timestamp with time zone default now() not null,
  details text,
  created_at timestamp with time zone default now() not null
);

alter table client_interactions enable row level security;

create policy "Users can manage their own client interactions"
  on client_interactions for all
  using (auth.uid() = user_id);
