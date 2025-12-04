-- Create a table for Price Library (Bibliothèque d'Ouvrages)
create table price_library (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  description text not null,
  price numeric default 0,
  unit text default 'unité', -- e.g., m2, ml, h, u
  category text, -- e.g., Peinture, Plomberie
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table price_library enable row level security;

-- Policies
create policy "Individuals can view their own library items." on price_library
  for select using (auth.uid() = user_id);

create policy "Individuals can insert their own library items." on price_library
  for insert with check (auth.uid() = user_id);

create policy "Individuals can update their own library items." on price_library
  for update using (auth.uid() = user_id);

create policy "Individuals can delete their own library items." on price_library
  for delete using (auth.uid() = user_id);
