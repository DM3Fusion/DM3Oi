-- DM3Oi-03A.5: restrict direct private avatar reads to the owning user.
-- Trusted server paths may still sign already-authorized organization avatars
-- through service_role, which bypasses Storage object RLS.

drop policy if exists user_avatars_authenticated_read on storage.objects;
drop policy if exists user_avatars_owner_select on storage.objects;

create policy user_avatars_owner_select
on storage.objects for select to authenticated
using (
  bucket_id = 'user-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
