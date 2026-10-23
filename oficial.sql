-- ═══════════════════════════════════════════════════════════════════
-- La boleta del policía vial lleva su nombre y la hora real
--
--   * Si quien captura es policía vial, la infracción queda a su nombre
--     (mi_nombre()), aunque el teléfono mande otro: no puede levantarla a
--     nombre de un compañero. El supervisor y el Director sí eligen.
--   * Nadie registra una infracción con fecha futura (15 min de tolerancia
--     por la hora del celular). Las boletas sin señal llegan después, así
--     que una fecha pasada sí se acepta, pero no de más de 7 días: la fecha
--     la pone la app al momento de levantarla y nadie la escribe a mano.
--   * Ya registrada, la fecha no se puede cambiar (inmutable.sql).
--
-- El trigger se llama trg_a_… para correr antes de trg_aplicar_fundamento
-- (orden alfabético), que toma la placa y adscripción del oficial.
-- Correr después de boleta.sql y controles.sql. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.oficial_propio()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.mi_rol() = 'oficial' then
    new.oficial := coalesce(public.mi_nombre(), new.oficial);
    new.capturo_auth := auth.uid();
  end if;
  if new.fecha > now() + interval '15 minutes' then
    raise exception 'La fecha de la infracción (%) es posterior a la hora actual. Revisa la hora del celular.',
      to_char(new.fecha at time zone 'America/Mexico_City', 'DD/MM/YYYY HH24:MI');
  end if;
  if current_user in ('authenticated', 'anon') and new.fecha < now() - interval '7 days' then
    raise exception 'La fecha de la infracción (%) tiene más de 7 días. La fecha y hora se registran solas al levantarla.',
      to_char(new.fecha at time zone 'America/Mexico_City', 'DD/MM/YYYY HH24:MI');
  end if;
  return new;
end $$;

create or replace trigger trg_a_oficial_propio before insert on public.infracciones
  for each row execute function public.oficial_propio();
