-- Ficheiros públicos da plataforma (ex.: PDF do guia). Cada organização escreve só na sua pasta: <org_id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('p360-public', 'p360-public', true, 26214400, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists p360_public_insert on storage.objects;
drop policy if exists p360_public_update on storage.objects;
drop policy if exists p360_public_delete on storage.objects;
create policy p360_public_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'p360-public' and p360.can_write(((storage.foldername(name))[1])::uuid, 'crm'));
create policy p360_public_update on storage.objects for update to authenticated
  using (bucket_id = 'p360-public' and p360.can_write(((storage.foldername(name))[1])::uuid, 'crm'));
create policy p360_public_delete on storage.objects for delete to authenticated
  using (bucket_id = 'p360-public' and p360.can_write(((storage.foldername(name))[1])::uuid, 'crm'));
