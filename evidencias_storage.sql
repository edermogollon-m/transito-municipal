-- ═══════════════════════════════════════════════════════════════════
-- Fotos de evidencia en Supabase Storage
--
-- Antes las fotos se guardaban dentro de la base como texto (base64), lo
-- que la llenaba rápido (el plan gratis tiene 500 MB de base de datos).
-- Ahora se suben al bucket privado "evidencias" (1 GB en el plan gratis) y la
-- columna fotos solo guarda las rutas, p. ej. ["infracciones/2026/abc.jpg"].
-- El bucket es privado: solo el personal con sesión puede ver las fotos
-- (la app pide enlaces firmados temporales). Requiere security_auth.sql.
-- Es idempotente.
-- ═══════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidencias', 'evidencias', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'evidencias_select') then
    create policy evidencias_select on storage.objects for select to authenticated
      using (bucket_id = 'evidencias' and public.mi_rol() is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'evidencias_insert') then
    create policy evidencias_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'evidencias' and public.mi_rol() is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'evidencias_delete') then
    create policy evidencias_delete on storage.objects for delete to authenticated
      using (bucket_id = 'evidencias' and public.mi_rol() in ('admin', 'supervisor'));
  end if;
end $$;
