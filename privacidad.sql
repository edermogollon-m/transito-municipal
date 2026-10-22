-- ═══════════════════════════════════════════════════════════════════
-- Aviso de privacidad (Ley 316 de Protección de Datos Personales en
-- Posesión de Sujetos Obligados para el Estado de Veracruz)
--
--   * configuracion: domicilio de la Dirección de Tránsito (responsable)
--     y datos de la Unidad de Transparencia, ante la que se ejercen los
--     derechos ARCO. Los captura el Director en Configuración.
--   * portal_info() los publica para la página /privacidad, que arma el
--     aviso integral sin sesión. Nada personal ni de operación.
--
-- Correr después de institucional.sql. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════

alter table public.configuracion add column if not exists domicilio_transito text not null default '';
alter table public.configuracion add column if not exists ut_domicilio text not null default '';
alter table public.configuracion add column if not exists ut_telefono text not null default '';
alter table public.configuracion add column if not exists ut_correo text not null default '';
alter table public.configuracion add column if not exists privacidad_actualizado date not null default current_date;

-- institucional.sql + datos del aviso de privacidad
create or replace function public.portal_info()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('municipio', coalesce(municipio,''), 'estado', coalesce(estado,''),
    'correo', coalesce(correo,''), 'leyenda_recurso', coalesce(leyenda_recurso,''),
    'pago_banco', coalesce(pago_banco,''), 'pago_clabe', coalesce(pago_clabe,''),
    'pago_beneficiario', coalesce(pago_beneficiario,''),
    'institucion', institucion, 'escudo', escudo, 'logo', logo, 'color', color_institucional,
    'domicilio_transito', domicilio_transito, 'ut_domicilio', ut_domicilio,
    'ut_telefono', ut_telefono, 'ut_correo', ut_correo,
    'privacidad_actualizado', privacidad_actualizado)
  from public.configuracion where id = 1
$$;
grant execute on function public.portal_info() to anon, authenticated;
