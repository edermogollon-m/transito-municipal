-- Reporte mensual: resumen de un mes (infracciones, recaudación, motivos,
-- oficiales, corralón y accidentes). Lo usan la pantalla Reportes (para el PDF)
-- y la función de Supabase "reporte-mensual", que lo envía por correo el día 1
-- de cada mes. Correr después de security_auth.sql. Idempotente.

alter table public.configuracion add column if not exists correo_reporte text default '';

create or replace function public.reporte_mensual(p_mes date default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  tz     constant text := 'America/Mexico_City';
  v_ini  date := date_trunc('month', coalesce(p_mes, ((now() at time zone tz) - interval '1 month')::date))::date;
  v_fin  date := (v_ini + interval '1 month')::date;
  v_pini date := (v_ini - interval '1 month')::date;
  r jsonb;
begin
  -- Director y supervisores desde la app; el envío automático usa la llave de servicio
  if coalesce(auth.role(), '') <> 'service_role' and coalesce(public.mi_rol(), '') not in ('admin', 'supervisor') then
    raise exception 'Sin permiso para ver el reporte mensual';
  end if;

  with
    inf  as (select * from infracciones where (fecha at time zone tz)::date >= v_ini  and (fecha at time zone tz)::date < v_fin),
    infp as (select * from infracciones where (fecha at time zone tz)::date >= v_pini and (fecha at time zone tz)::date < v_ini),
    pag  as (select * from pagos where (created_at at time zone tz)::date >= v_ini  and (created_at at time zone tz)::date < v_fin),
    pagp as (select * from pagos where (created_at at time zone tz)::date >= v_pini and (created_at at time zone tz)::date < v_ini)
  select jsonb_build_object(
    'mes',                to_char(v_ini, 'YYYY-MM'),
    'municipio',          c.municipio,
    'estado_mun',         c.estado,
    'director',           c.director,
    'infracciones',       (select count(*) from inf),
    'infracciones_monto', (select coalesce(sum(monto), 0) from inf),
    'infracciones_prev',  (select count(*) from infp),
    'por_estado',         (select coalesce(jsonb_object_agg(e, n), '{}') from (select coalesce(estado, 'sin estado') e, count(*) n from inf group by 1) x),
    'recaudacion',        (select coalesce(sum(monto_final), 0) from pag),
    'recaudacion_prev',   (select coalesce(sum(monto_final), 0) from pagp),
    'pagos',              (select count(*) from pag),
    'descuentos',         (select coalesce(sum(monto_original - monto_final), 0) from pag),
    'por_metodo',         (select coalesce(jsonb_agg(jsonb_build_object('metodo', m, 'pagos', n, 'total', t) order by t desc), '[]')
                             from (select coalesce(nullif(metodo, ''), 'otro') m, count(*) n, sum(monto_final) t from pag group by 1) x),
    'por_tipo',           (select coalesce(jsonb_agg(jsonb_build_object('tipo', t, 'n', n, 'monto', s) order by n desc, s desc), '[]')
                             from (select tipo t, count(*) n, sum(monto) s from inf group by 1 order by 2 desc, 3 desc limit 10) x),
    'por_oficial',        (select coalesce(jsonb_agg(jsonb_build_object('oficial', o, 'n', n, 'monto', s) order by n desc), '[]')
                             from (select coalesce(nullif(oficial, ''), 'Sin oficial') o, count(*) n, sum(monto) s from inf group by 1) x),
    'pendientes_total',   (select count(*) from infracciones where estado in ('pendiente', 'vencida')),
    'pendientes_monto',   (select coalesce(sum(monto), 0) from infracciones where estado in ('pendiente', 'vencida')),
    'grua_ingresos',      (select count(*) from grua where (fecha at time zone tz)::date >= v_ini and (fecha at time zone tz)::date < v_fin),
    'grua_liberados',     (select count(*) from grua where (fecha_liberacion at time zone tz)::date >= v_ini and (fecha_liberacion at time zone tz)::date < v_fin),
    'accidentes',         (select count(*) from accidentes where (fecha at time zone tz)::date >= v_ini and (fecha at time zone tz)::date < v_fin),
    'lesionados',         (select coalesce(sum(lesionados), 0) from accidentes where (fecha at time zone tz)::date >= v_ini and (fecha at time zone tz)::date < v_fin),
    'fallecidos',         (select coalesce(sum(fallecidos), 0) from accidentes where (fecha at time zone tz)::date >= v_ini and (fecha at time zone tz)::date < v_fin),
    'generado',           now()
  ) into r
  from (select 1) uno
  left join configuracion c on c.id = 1;

  return r;
end $$;

grant execute on function public.reporte_mensual(date) to authenticated;

-- ── Envío automático el día 1 de cada mes ──────────────────────────────
-- La clave que pg_cron manda a la función vive en Vault (se genera sola);
-- la función la compara con es_secreto_cron(), que solo puede llamar la
-- llave de servicio. Requiere las extensiones pg_cron y pg_net.
create or replace function public.es_secreto_cron(p_secreto text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' or coalesce(p_secreto, '') = '' then return false; end if;
  return exists (select 1 from vault.decrypted_secrets where name = 'reporte_mensual_cron' and decrypted_secret = p_secreto);
end $$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'vault') then
    execute $v$ select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'reporte_mensual_cron')
                where not exists (select 1 from vault.secrets where name = 'reporte_mensual_cron') $v$;
  end if;
  -- Día 1 a las 14:00 UTC (8:00 hora del centro)
  if exists (select 1 from pg_namespace where nspname = 'cron') and exists (select 1 from pg_namespace where nspname = 'net') then
    execute $s$ select cron.schedule('reporte-mensual', '0 14 1 * *', $cron$
      select net.http_post(
        url := 'https://tqqeixymxpuewpjhcjno.supabase.co/functions/v1/reporte-mensual',
        headers := jsonb_build_object('Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reporte_mensual_cron')),
        body := '{}'::jsonb)
    $cron$) $s$;
  end if;
end $$;
