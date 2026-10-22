-- ═══════════════════════════════════════════════════════════════════
-- Folios de infracción no consecutivos: MIS-26-7KX94Q
--
--   prefijo del municipio (configuracion.folio_prefijo) · año de la
--   infracción (2 dígitos) · 6 caracteres al azar sin letras confusas
--   (sin 0/O, 1/I/L). Así nadie puede adivinar folios seguidos para ver
--   infracciones ajenas en la consulta ciudadana.
--
-- Lo asigna siempre el servidor al dar de alta la infracción. Este archivo
-- también renumera las infracciones que ya existen (y el folio que copian
-- la boleta y los pagos); solo cambia las que aún tienen el formato INF-.
-- Correr después de mejoras.sql. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════

alter table public.configuracion add column if not exists folio_prefijo text not null default 'MIS';

create or replace function public.nuevo_folio_inf(p_fecha timestamptz default now())
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  abc constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  pre text;
  b bytea;
  cod text;
  v text;
begin
  select upper(coalesce(nullif(trim(folio_prefijo), ''), 'MIS')) into pre from public.configuracion where id = 1;
  pre := coalesce(pre, 'MIS');
  loop
    b := extensions.gen_random_bytes(6);
    cod := '';
    for i in 0..5 loop
      cod := cod || substr(abc, (get_byte(b, i) % length(abc)) + 1, 1);
    end loop;
    v := pre || '-' || to_char(coalesce(p_fecha, now()) at time zone 'America/Mexico_City', 'YY') || '-' || cod;
    exit when not exists (select 1 from public.infracciones where folio = v);
  end loop;
  return v;
end $$;

-- Dos triggers de alta asignaban el folio (schema.sql y uno anterior):
-- el primero ya no hace nada y el segundo pone el folio nuevo.
create or replace function public.generate_inf_folio() returns trigger
language plpgsql set search_path = public as $$
begin
  return new;
end $$;

create or replace function public.gen_folio_inf() returns trigger
language plpgsql set search_path = public as $$
begin
  new.folio := public.nuevo_folio_inf(new.fecha);
  return new;
end $$;

-- Renumerar las existentes (como dueño: los triggers de inmutabilidad no aplican)
do $$
declare
  r record;
  v text;
begin
  perform set_config('transito.migrando', '1', true);
  for r in select id, folio, fecha from public.infracciones where folio like 'INF-%' order by id loop
    v := public.nuevo_folio_inf(r.fecha);
    update public.infracciones set folio = v where id = r.id;
    update public.infracciones set boleta = v where boleta = r.folio;
    update public.pagos set folio_inf = v where infraccion_id = r.id;
    if to_regclass('public.pagos_anulados') is not null then
      execute 'update public.pagos_anulados set folio_inf = $1 where infraccion_id = $2' using v, r.id;
    end if;
  end loop;
end $$;

create unique index if not exists infracciones_folio_unico on public.infracciones (folio);
