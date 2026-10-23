-- ═══════════════════════════════════════════════════════════════════
-- Constancia de no adeudo: orden de pago para pagar en Caja
--
--   * Quien no puede (o no quiere) pagar en línea pide una orden de pago:
--     es el mismo cobro pendiente de solicitar_constancia, con un QR que
--     apunta a /verificar?c=<token>. La orden vale 7 días.
--   * Caja escanea el QR (o escribe la placa) y cobrar_constancia_caja paga
--     esa orden en vez de crear un cobro nuevo; así el ciudadano descarga su
--     constancia con el mismo QR o desde su celular.
--   * La constancia vale 30 días. Vencida ya no se entrega para imprimir:
--     constancia_de_cobro solo dice que venció (el registro se conserva).
--
-- Correr después de constancias_cobro.sql. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════

-- Días que vale la orden de pago antes de tener que pedir otra
create or replace function public.dias_orden_constancia() returns int
language sql immutable as $$ select 7 $$;

-- constancias_cobro.sql + reusa la orden vigente de la placa y dice hasta cuándo vale
create or replace function public.solicitar_constancia(p_placa text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_norm text := regexp_replace(upper(coalesce(p_placa, '')), '[^A-Z0-9]', '', 'g');
  v_cobro public.cobros_constancia%rowtype;
begin
  if length(v_norm) < 4 or length(v_norm) > 12 then raise exception 'Escribe la placa completa'; end if;
  if exists (select 1 from public.infracciones
             where regexp_replace(upper(placa), '[^A-Z0-9]', '', 'g') = v_norm
               and estado in ('pendiente', 'vencida', 'impugnada')) then
    raise exception 'La placa tiene infracciones pendientes o en revisión: no se puede expedir la constancia';
  end if;
  if (select count(*) from public.cobros_constancia where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'Demasiadas solicitudes. Intenta de nuevo en unos minutos';
  end if;
  -- Se reusa la orden sin pagar de la misma placa mientras siga vigente
  select * into v_cobro from public.cobros_constancia
   where placa = v_norm and estado = 'pendiente'
     and created_at > now() - make_interval(days => public.dias_orden_constancia())
     and monto = (select constancia_costo from public.configuracion where id = 1)
   order by id desc limit 1;
  if not found then
    insert into public.cobros_constancia (placa, monto)
    values (v_norm, (select constancia_costo from public.configuracion where id = 1))
    returning * into v_cobro;
  end if;
  return jsonb_build_object('token', v_cobro.token, 'monto', v_cobro.monto, 'placa', v_norm,
    'creada', v_cobro.created_at,
    'vence', ((v_cobro.created_at at time zone 'America/Mexico_City')::date + public.dias_orden_constancia()));
end $$;
grant execute on function public.solicitar_constancia(text) to anon, authenticated;

-- constancias_cobro.sql + orden vencida y constancia vencida (ya no se imprime)
create or replace function public.constancia_de_cobro(p_token uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when k.id is not null and k.vigente_hasta < (now() at time zone 'America/Mexico_City')::date then
      jsonb_build_object('pagada', true, 'vencida', true, 'folio', k.folio, 'placa', c.placa, 'vigente_hasta', k.vigente_hasta)
    when k.id is not null then public.datos_constancia(k.id)
        || jsonb_build_object('pagada', true, 'monto', c.monto, 'metodo', c.metodo)
    else jsonb_build_object('pagada', c.estado = 'pagada', 'monto', c.monto, 'placa', c.placa, 'nota', c.notas,
        'creada', c.created_at,
        'vence', ((c.created_at at time zone 'America/Mexico_City')::date + public.dias_orden_constancia()),
        'orden_vencida', c.estado = 'pendiente' and c.created_at <= now() - make_interval(days => public.dias_orden_constancia()))
  end
  from public.cobros_constancia c left join public.constancias k on k.id = c.constancia_id
  where c.token = p_token
$$;
grant execute on function public.constancia_de_cobro(uuid) to anon, authenticated;

-- constancias_cobro.sql + si la placa tiene una orden de pago vigente, se paga esa
create or replace function public.cobrar_constancia_caja(p_placa text, p_metodo text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_norm text := regexp_replace(upper(coalesce(p_placa, '')), '[^A-Z0-9]', '', 'g');
  v_cajero text;
  v_c public.constancias%rowtype;
  v_cobro public.cobros_constancia%rowtype;
  v_orden boolean;
begin
  select nombre into v_cajero from public.usuarios where auth_id = auth.uid() and activo and rol in ('admin', 'cajero');
  if v_cajero is null then raise exception 'Solo Caja (cajero) o el Director cobran constancias'; end if;
  if p_metodo not in ('efectivo', 'tarjeta', 'transferencia') then raise exception 'Método de pago inválido'; end if;
  if length(v_norm) < 4 or length(v_norm) > 12 then raise exception 'Escribe la placa completa'; end if;
  select * into v_cobro from public.cobros_constancia
   where placa = v_norm and estado = 'pendiente'
     and created_at > now() - make_interval(days => public.dias_orden_constancia())
   order by id desc limit 1 for update;
  v_orden := found;
  v_c := public.expedir_constancia(v_norm);
  if v_orden then
    update public.cobros_constancia set estado = 'pagada', metodo = p_metodo, cajero = v_cajero,
      constancia_id = v_c.id, pagada_at = now()
     where id = v_cobro.id returning * into v_cobro;
  else
    insert into public.cobros_constancia (placa, monto, estado, metodo, cajero, constancia_id, pagada_at)
    values (v_norm, (select constancia_costo from public.configuracion where id = 1), 'pagada', p_metodo, v_cajero, v_c.id, now())
    returning * into v_cobro;
  end if;
  return public.datos_constancia(v_c.id) || jsonb_build_object('monto', v_cobro.monto, 'metodo', p_metodo, 'cajero', v_cajero);
end $$;
revoke all on function public.cobrar_constancia_caja(text, text) from public, anon;
grant execute on function public.cobrar_constancia_caja(text, text) to authenticated;

-- Caja: orden de pago vigente de una placa (para mostrar su monto antes de cobrar)
create or replace function public.orden_constancia_de_placa(p_placa text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('monto', c.monto, 'creada', c.created_at,
    'vence', ((c.created_at at time zone 'America/Mexico_City')::date + public.dias_orden_constancia()))
  from public.cobros_constancia c
  where public.tiene_rol('admin', 'cajero')
    and c.placa = regexp_replace(upper(coalesce(p_placa, '')), '[^A-Z0-9]', '', 'g')
    and c.estado = 'pendiente' and c.created_at > now() - make_interval(days => public.dias_orden_constancia())
  order by c.id desc limit 1
$$;
revoke all on function public.orden_constancia_de_placa(text) from public, anon;
grant execute on function public.orden_constancia_de_placa(text) to authenticated;
