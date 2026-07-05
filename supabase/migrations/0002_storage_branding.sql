-- HouseKey — Milestone 1: branding storage bucket
--
-- Supabase-only migration (references the storage schema). The RLS test
-- harness (scripts/test-rls.sh) intentionally skips this file because it
-- runs against a plain Postgres cluster without Supabase Storage.

insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

-- Anyone may read branding assets (the bucket is public).
create policy branding_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'branding');

-- Authenticated users may manage files only inside their own folder:
-- branding/<auth.uid()>/...
create policy branding_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'branding'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy branding_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'branding'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'branding'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy branding_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'branding'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
