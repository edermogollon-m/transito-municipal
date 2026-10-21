-- Infracciones inmutables: una vez registrada, la boleta no se puede editar
-- ni borrar desde la app. Solo cambia su estado (pago, impugnación,
-- cancelación, vencimiento) y los motivos de impugnación o cancelación.
-- Si la boleta tiene un error, se cancela con su motivo (queda en la
-- bitácora) y se levanta una nueva.
--
-- Aplica a los usuarios de la app (roles authenticated y anon). Las
-- funciones del servidor (registrar_pago, marcar vencidas) y las migraciones
-- corren con el dueño de la base y no se ven afectadas.
-- Correr después de auditoria.sql. Idempotente.

create or replace function public.bloquear_edicion_infraccion()
returns trigger language plpgsql as $$
declare
  permitidos text[] := array['estado', 'impugnacion_motivo', 'cancelacion_motivo'];
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Las infracciones no se pueden eliminar. Cancélala indicando el motivo.'
      using errcode = 'insufficient_privilege';
  end if;
  if (to_jsonb(new) - permitidos) is distinct from (to_jsonb(old) - permitidos) then
    raise exception 'Las infracciones registradas no se pueden modificar. Si hay un error, cancélala con su motivo y levanta una nueva.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create or replace trigger trg_inmutable
  before update or delete on public.infracciones
  for each row execute function public.bloquear_edicion_infraccion();
