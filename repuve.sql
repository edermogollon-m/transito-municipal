-- ═══════════════════════════════════════════════════════════════════
-- Consulta REPUVE desde la boleta
--
--   * configuracion.repuve_url: página de la consulta ciudadana del REPUVE
--     que abre el botón "Consultar en REPUVE" (se puede cambiar en
--     Configuración si el REPUVE la mueve).
--   * reportar_robo_repuve(): cuando la consulta muestra reporte de robo, el
--     oficial registra la placa como reportada con un toque. Así alerta a
--     todos los oficiales (institucional.sql) aunque él no sea mando.
--
-- No hay conexión automática: REPUVE no ofrece un servicio público y su
-- consulta pide captcha. Si el Secretariado Ejecutivo da un acceso oficial,
-- se conecta en el mismo punto.
--
-- Correr después de institucional.sql. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════

alter table public.configuracion add column if not exists repuve_url text not null
  default 'https://www2.repuve.gob.mx:8443/ciudadania/';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'configuracion_repuve_url_https') then
    alter table public.configuracion add constraint configuracion_repuve_url_https check (repuve_url ~ '^https://[^\s"''<>]+$');
  end if;
end $$;

create or replace function public.reportar_robo_repuve(p_placa text, p_detalle text default '')
returns public.vehiculos_reportados
language plpgsql security definer set search_path = public as $$
declare
  v public.vehiculos_reportados;
  v_placa text := regexp_replace(upper(coalesce(p_placa, '')), '[^A-Z0-9]', '', 'g');
begin
  if not public.tiene_rol('admin', 'supervisor', 'oficial') then
    raise exception 'Tu rol no puede reportar placas';
  end if;
  if length(v_placa) < 3 then raise exception 'Placa no válida'; end if;
  select * into v from public.vehiculos_reportados where placa = v_placa and activo;
  if found then return v; end if;      -- ya estaba reportada: no se duplica
  insert into public.vehiculos_reportados (placa, motivo, detalle)
  values (v_placa, 'robo', left(trim('Reporte de robo en REPUVE. ' || coalesce(p_detalle, '')), 500))
  returning * into v;
  return v;
end $$;
grant execute on function public.reportar_robo_repuve(text, text) to authenticated;
