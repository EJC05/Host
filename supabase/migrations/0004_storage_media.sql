-- HouseKey — Milestone 2: media storage bucket (post images, suite covers)
--
-- Supabase-only migration (references the storage schema); the RLS test
-- harness skips any migration with "storage" in its filename.

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

create policy media_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'media');

-- Authenticated users manage files only inside their own folder:
-- media/<auth.uid()>/...
create policy media_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy media_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy media_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
