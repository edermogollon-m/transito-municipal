-- ═══════════════════════════════════════════════════════════════════
-- Bitácora de auditoría
--
-- Cada alta, cambio o baja en las tablas operativas queda registrada con
-- quién la hizo, cuándo y qué campos cambiaron (valor anterior y nuevo).
-- La escriben triggers en el servidor, así que no depende de que el
-- navegador "se acuerde" de registrarla, y nadie puede editarla ni borrarla
-- desde la app. Solo admin y supervisor pueden consultarla.
-- Requiere security_auth.sql (usa mi_rol() y usuarios.auth_id).
-- Es idempotente: se puede correr más de una vez.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.auditoria (
  id             bigserial primary key,
  ts             timestamptz not null default now(),
  tabla          text not null,
  registro_id    text,
  accion         text not null check (accion in ('alta', 'cambio', 'baja')),
  usuario_id     bigint,
  usuario_nombre text,
  resumen        text,            -- folio / placa / nombre, para leerla sin abrir el detalle
  cambios        jsonb not null default '{}'
);
create index if not exists auditoria_ts_idx on public.auditoria (ts desc);
create index if not exists auditoria_registro_idx on public.auditoria (tabla, registro_id);

create or replace function public.registrar_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  -- Columnas que no aportan a la bitácora (fotos pesan mucho; fechas técnicas).
  excluir text[] := array['fotos', 'created_at', 'token_verificacion'];
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_cambios jsonb := '{}';
  v_uid bigint; v_nombre text; k text;
begin
  select u.id, u.nombre into v_uid, v_nombre from usuarios u where u.auth_id = auth.uid();

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      if not (k = any(excluir)) and v_new -> k is distinct from v_old -> k then
        v_cambios := v_cambios || jsonb_build_object(k, jsonb_build_object('antes', v_old -> k, 'despues', v_new -> k));
      end if;
    end loop;
    if v_cambios = '{}' then return null; end if;   -- nada relevante cambió
  else
    v_cambios := v_row - excluir;
  end if;

  insert into auditoria (tabla, registro_id, accion, usuario_id, usuario_nombre, resumen, cambios)
  values (
    tg_table_name,
    v_row ->> 'id',
    case tg_op when 'INSERT' then 'alta' when 'UPDATE' then 'cambio' else 'baja' end,
    v_uid,
    coalesce(v_nombre, case when auth.uid() is null then 'Sistema' else 'Desconocido' end),
    coalesce(v_row ->> 'folio', v_row ->> 'num', v_row ->> 'folio_inf', v_row ->> 'placa',
             v_row ->> 'usuario', v_row ->> 'titular', v_row ->> 'oficial_nombre', v_row ->> 'municipio'),
    v_cambios
  );
  return null;
end; $$;

do $$
declare t text;
begin
  foreach t in array array['infracciones','pagos','permisos','vehiculos','grua','accidentes','usuarios','configuracion','turnos'] loop
    execute format('create or replace trigger trg_auditoria after insert or update or delete on public.%I
                    for each row execute function public.registrar_auditoria()', t);
  end loop;
end $$;

-- Solo lectura, y solo para mandos. Sin políticas de insert/update/delete:
-- con RLS activo eso basta para que nadie escriba desde la app; únicamente el
-- trigger (security definer) escribe.
alter table public.auditoria enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'auditoria' and policyname = 'mando_select') then
    create policy mando_select on public.auditoria for select to authenticated
      using (public.mi_rol() in ('admin', 'supervisor'));
  end if;
end $$;
