-- Add 'type' column to price_library to distinguish between 'service' (Main d'oeuvre) and 'material' (Matériel)
alter table price_library 
add column if not exists type text default 'service';
