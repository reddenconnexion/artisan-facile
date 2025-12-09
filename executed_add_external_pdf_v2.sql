-- Add original_pdf_url to quotes table safely
alter table quotes 
add column if not exists original_pdf_url text,
add column if not exists is_external boolean default false,
add column if not exists manual_total_ht numeric default 0,
add column if not exists manual_total_tva numeric default 0,
add column if not exists manual_total_ttc numeric default 0;

-- Create bucket for quote files if not exists
insert into storage.buckets (id, name, public)
values ('quote_files', 'quote_files', true)
on conflict (id) do nothing;

-- Drop policies if they exist before creating them to avoid conflicts
drop policy if exists "Users can upload quote files" on storage.objects;
drop policy if exists "Users can view quote files" on storage.objects;

-- Re-create policies
create policy "Users can upload quote files"
on storage.objects for insert
with check ( bucket_id = 'quote_files' and auth.role() = 'authenticated' );

create policy "Users can view quote files"
on storage.objects for select
using ( bucket_id = 'quote_files' );
