
-- Table pour les contrats d'entretien (Chauffagistes, Plombiers, etc.)
create table if not exists maintenance_contracts (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_id uuid references auth.users not null,
  client_id uuid references clients on delete cascade not null,
  
  equipment_name text not null, -- ex: Chaudière Saunier Duval
  location text, -- ex: Sous-sol
  serial_number text,
  
  last_maintenance_date date,
  frequency_months int default 12, -- 12 mois par défaut
  next_maintenance_date date, -- Calculé ou défini manuellement
  
  notes text,
  status text default 'active' -- active, cancelled, archived
);

-- Ajouter le support des codes-barres à la bibliothèque de prix
alter table price_library 
add column if not exists barcode text,
add column if not exists stock_quantity int default 0,
add column if not exists min_stock_alert int default 5;

-- Politique de sécurité
alter table maintenance_contracts enable row level security;

create policy "Users can manage their own maintenance contracts"
  on maintenance_contracts for all
  using (auth.uid() = user_id);
