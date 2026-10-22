-- ═══════════════════════════════════════════════════════════════════
-- Registro de errores, pago por transferencia, recordatorios y respaldos
--
--   * errores_app: la app del personal anota aquí los errores que ocurren
--     en el navegador (el Director los ve en la Bitácora).
--   * Pago por transferencia: banco, CLABE y beneficiario en Configuración;
--     la consulta ciudadana los muestra con el folio como referencia.
--   * recordatorios_enviados: correos de "tu descuento vence pronto" que ya
--     mandó la función tareas-diarias (para no repetirlos).
--   * Bucket privado "respaldos": copia diaria de la base en JSON que deja la
--     función tareas-diarias; solo el Director la descarga.
--   * pg_cron llama a tareas-diarias todos los días a las 12:00 UTC (6:00 en
--     el centro de México) con la misma clave de Vault del reporte mensual.
--
-- Correr después de controles.sql. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════

-- ── Errores de la app ─────────────────────────────────────
create table if not exists public.errores_app (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  usuario    text default public.mi_nombre(),
  pagina     text not null default '' check (length(pagina) <= 300),
  mensaje    text not null check (length(mensaje) <= 1000),
  detalle    text not null default '' check (length(detalle) <= 4000),
  navegador  text not null default '' check (length(navegador) <= 300)
);
alter table public.errores_app enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'errores_app' and policyname = 'personal_insert') then
    create policy personal_insert on public.errores_app for insert to authenticated with check (public.mi_rol() is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'errores_app' and policyname = 'admin_select') then
    create policy admin_select on public.errores_app for select to authenticated using (public.mi_rol() = 'admin');
  end if;
end $$;
grant select, insert on public.errores_app to authenticated;
grant usage on sequence public.errores_app_id_seq to authenticated;

-- ── Pago por transferencia ────────────────────────────────
alter table public.configuracion add column if not exists pago_banco        text not null default '';
alter table public.configuracion add column if not exists pago_clabe        text not null default '';
alter table public.configuracion add column if not exists pago_beneficiario text not null default '';

-- portal.sql + datos para transferir
create or replace function public.portal_info()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('municipio', coalesce(municipio,''), 'estado', coalesce(estado,''),
    'correo', coalesce(correo,''), 'leyenda_recurso', coalesce(leyenda_recurso,''),
    'pago_banco', coalesce(pago_banco,''), 'pago_clabe', coalesce(pago_clabe,''),
    'pago_beneficiario', coalesce(pago_beneficiario,''))
  from public.configuracion where id = 1
$$;
grant execute on function public.portal_info() to anon, authenticated;

-- ── Recordatorios ya enviados ─────────────────────────────
create table if not exists public.recordatorios_enviados (
  infraccion_id bigint not null references public.infracciones(id),
  tramo_dias    integer not null,
  correo        text not null default '',
  enviado_at    timestamptz not null default now(),
  primary key (infraccion_id, tramo_dias)
);
alter table public.recordatorios_enviados enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recordatorios_enviados' and policyname = 'control_select') then
    create policy control_select on public.recordatorios_enviados for select to authenticated
      using (public.tiene_rol('admin','supervisor','cajero','contraloria'));
  end if;
end $$;
grant select on public.recordatorios_enviados to authenticated;

-- ── Respaldos ─────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('respaldos', 'respaldos', false, 52428800, array['application/json', 'application/gzip'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'respaldos_select') then
    create policy respaldos_select on storage.objects for select to authenticated
      using (bucket_id = 'respaldos' and public.mi_rol() = 'admin');
  end if;
end $$;

-- ── Tareas diarias (respaldo + recordatorios) ─────────────
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') and exists (select 1 from pg_namespace where nspname = 'net') then
    execute $s$ select cron.schedule('tareas-diarias', '0 12 * * *', $cron$
      select net.http_post(
        url := 'https://tqqeixymxpuewpjhcjno.supabase.co/functions/v1/tareas-diarias',
        headers := jsonb_build_object('Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reporte_mensual_cron')),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000)
    $cron$) $s$;
  end if;
end $$;
