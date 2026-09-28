-- Add original_pdf_url to quotes table
alter table quotes 
add column if not exists original_pdf_url text,
add column if not exists is_external boolean default false;

-- Create bucket for quote files if not exists
insert into storage.buckets (id, name, public)
values ('quote_files', 'quote_files', true)
on conflict (id) do nothing;

-- Policy to allow authenticated users to upload
create policy "Users can upload quote files"
on storage.objects for insert
with check ( bucket_id = 'quote_files' and auth.role() = 'authenticated' );

create policy "Users can view quote files"
on storage.objects for select
using ( bucket_id = 'quote_files' );
