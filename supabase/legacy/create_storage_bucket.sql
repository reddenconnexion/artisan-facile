-- Create a public storage bucket for logos
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

-- Set up RLS policies for the logos bucket
create policy "Logo images are publicly accessible."
  on storage.objects for select
  using ( bucket_id = 'logos' );

create policy "Users can upload their own logo."
  on storage.objects for insert
  with check ( bucket_id = 'logos' and auth.uid() = owner );

create policy "Users can update their own logo."
  on storage.objects for update
  using ( bucket_id = 'logos' and auth.uid() = owner );

create policy "Users can delete their own logo."
  on storage.objects for delete
  using ( bucket_id = 'logos' and auth.uid() = owner );
