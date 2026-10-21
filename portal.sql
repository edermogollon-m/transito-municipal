-- Datos públicos del municipio para la página "Consulta tus infracciones":
-- nombre, estado, correo de contacto y el medio de defensa (art. 328) que
-- se imprime en la boleta. Nada personal ni de operación.
-- Correr después de boleta.sql. Idempotente.

create or replace function public.portal_info()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'municipio',       coalesce(municipio, ''),
    'estado',          coalesce(estado, ''),
    'correo',          coalesce(correo, ''),
    'leyenda_recurso', coalesce(leyenda_recurso, ''))
  from public.configuracion where id = 1
$$;
grant execute on function public.portal_info() to anon, authenticated;
