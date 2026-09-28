
-- Table des locations de matériel
create table if not exists project_rentals (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_id uuid references auth.users not null,
  
  equipment_name text not null, -- ex: Mini-pelle 2.5T
  supplier text, -- ex: Kiloutou, Loxam
  start_date date not null,
  end_date date, -- Date de fin prévue ou réelle
  
  cost numeric default 0, -- Coût total ou journalier (à préciser dans notes)
  status text default 'active', -- 'active', 'returned', 'late'
  
  notes text
);

alter table project_rentals enable row level security;

create policy "Users can manage their own rentals"
  on project_rentals for all
  using (auth.uid() = user_id);
