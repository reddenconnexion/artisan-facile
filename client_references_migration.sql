
-- Table pour stocker les références matériaux par client (Peinture, Carrelage, etc.)
create table if not exists client_references (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_id uuid references auth.users not null,
  client_id bigint references clients on delete cascade not null,
  
  category text not null, -- 'peinture', 'carrelage', 'sol', 'autre'
  reference text not null, -- ex: 'RAL 7016', 'Carrelage Metro Blanc'
  brand text, -- ex: 'Tollens', 'Leroy Merlin'
  location text, -- ex: 'Salon', 'Cuisine'
  notes text
);

-- RLS
alter table client_references enable row level security;

create policy "Users can manage their own client references"
  on client_references for all
  using (auth.uid() = user_id);
