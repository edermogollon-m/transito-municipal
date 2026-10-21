-- ═══════════════════════════════════════════════════════════════════
-- Boleta conforme a los artículos 327, 328 y 331 del Reglamento de la Ley
-- Número 561 de Tránsito y Seguridad Vial para el Estado de Veracruz
--
-- * Art. 327 fr. II (motivación): domicilio y correo del infractor (o la
--   anotación de que no estuvo presente o no los proporcionó), tipo de
--   licencia, y número de placa y adscripción del policía vial.
-- * Art. 327 último párrafo: varias infracciones de un mismo conductor en
--   una sola boleta (columna boleta = identificador del grupo).
-- * Art. 328: leyenda del recurso de revocación (arts. 260 a 262 y 43 del
--   Código de Procedimientos Administrativos para el Estado de Veracruz).
-- * Art. 331: circunstancias agravantes y atenuantes. Con al menos una
--   agravante se aplica la UMA "con agravante" del tabulador (art. 333);
--   sin agravantes, la UMA base. El monto lo calcula el servidor.
--
-- Correr después de veracruz.sql. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════

alter table public.usuarios add column if not exists numero_placa text not null default '';
alter table public.usuarios add column if not exists adscripcion  text not null default '';

alter table public.infracciones add column if not exists infractor_domicilio text not null default '';
alter table public.infracciones add column if not exists infractor_correo    text not null default '';
alter table public.infracciones add column if not exists infractor_ausente   boolean not null default false;
alter table public.infracciones add column if not exists licencia_tipo       text not null default '';
alter table public.infracciones add column if not exists oficial_placa       text not null default '';
alter table public.infracciones add column if not exists oficial_adscripcion text not null default '';
alter table public.infracciones add column if not exists boleta              text not null default '';
alter table public.infracciones add column if not exists circunstancias      jsonb not null default '[]';
create index if not exists infracciones_boleta_idx on public.infracciones (boleta);

alter table public.configuracion add column if not exists leyenda_recurso text default
  'Contra esta boleta procede el recurso de revocación (artículo 383 del Reglamento de la Ley Número 561 de Tránsito y Seguridad Vial para el Estado de Veracruz de Ignacio de la Llave), que deberá presentarse ante el superior jerárquico de la autoridad que la emitió dentro de los quince días hábiles siguientes a aquel en que surta efectos su notificación (artículos 43, 261 y 262 del Código de Procedimientos Administrativos para el Estado de Veracruz de Ignacio de la Llave); o bien, a elección del interesado, el juicio contencioso ante el Tribunal (artículo 260 del mismo Código).';

-- ── Circunstancias del art. 331 ───────────────────────────
create table if not exists public.circunstancias_331 (
  codigo      text primary key,          -- agr_a … agr_i, ate_a … ate_e
  tipo        text not null check (tipo in ('agravante','atenuante')),
  fraccion    text not null,
  inciso      text not null,
  descripcion text not null
);
insert into public.circunstancias_331 (codigo, tipo, fraccion, inciso, descripcion) values
  ('ate_a','atenuante','I','a','El auxilio y ayuda inmediata a las víctimas de un accidente'),
  ('ate_b','atenuante','I','b','Oportuna y espontánea reparación de daños y perjuicios ocasionados'),
  ('ate_c','atenuante','I','c','Avisar a la autoridad más cercana'),
  ('ate_d','atenuante','I','d','Respeto a autoridades y policías viales'),
  ('ate_e','atenuante','I','e','Acatamiento a las órdenes y disposiciones de las autoridades'),
  ('agr_a','agravante','II','a','Cometer la infracción en estado de ebriedad o de intoxicación por sustancias estupefacientes o psicotrópicas'),
  ('agr_b','agravante','II','b','Abandonar a las víctimas del accidente o no procurarles la ayuda requerida, pudiendo hacerlo'),
  ('agr_c','agravante','II','c','Evadir la acción de la justicia por fuga u ocultamiento'),
  ('agr_d','agravante','II','d','Borrar, alterar u ocultar las señales, huellas, indicios o vestigios dejados por la infracción, u obstaculizar las investigaciones'),
  ('agr_e','agravante','II','e','Tener el infractor, al momento de la persecución o detención, infracciones anteriores sin haber sido pagadas'),
  ('agr_f','agravante','II','f','Conducir sin licencia, con licencia vencida o que no corresponda al vehículo, o con la licencia suspendida'),
  ('agr_g','agravante','II','g','La reincidencia'),
  ('agr_h','agravante','II','h','No cumplir con las obligaciones y requisitos señalados en la Ley y el Reglamento'),
  ('agr_i','agravante','II','i','Que la infracción ocasione o pueda ocasionar lesiones o daños, o ponga en peligro a las personas o a su patrimonio')
on conflict (codigo) do nothing;
alter table public.circunstancias_331 enable row level security;
drop policy if exists personal_select on public.circunstancias_331;
create policy personal_select on public.circunstancias_331 for select to authenticated using (public.mi_rol() is not null);

-- ── Fundamento, monto (base o con agravante) y datos del policía vial ──
create or replace function public.aplicar_fundamento()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  c public.catalogo_infracciones%rowtype;
  v_uma numeric;
  v_agr boolean;
begin
  -- Datos del policía vial (art. 327 fr. II inciso e)
  if tg_op = 'INSERT' and coalesce(new.oficial, '') <> '' and new.oficial_placa = '' then
    select numero_placa, adscripcion into new.oficial_placa, new.oficial_adscripcion
    from public.usuarios where nombre = new.oficial order by activo desc limit 1;
    new.oficial_placa := coalesce(new.oficial_placa, '');
    new.oficial_adscripcion := coalesce(new.oficial_adscripcion, '');
  end if;
  if exists (select 1 from jsonb_array_elements_text(coalesce(new.circunstancias, '[]')) x
             where x not in (select codigo from public.circunstancias_331)) then
    raise exception 'Circunstancia del artículo 331 no reconocida';
  end if;

  if new.catalogo_numero is null or current_setting('transito.migrando', true) = '1' then return new; end if;
  select * into c from public.catalogo_infracciones where numero = new.catalogo_numero;
  if tg_op = 'INSERT' or new.catalogo_numero is distinct from old.catalogo_numero then
    if not c.activo then raise exception 'La infracción % del catálogo ya no está vigente', c.numero; end if;
    new.fundamento := public.fundamento_de(c.numero);
  end if;
  if c.cuotas_min is null then
    new.monto := 0;   -- amonestación verbal o arresto: sin multa en UMA
    return new;
  end if;
  if tg_op = 'INSERT' or new.catalogo_numero is distinct from old.catalogo_numero
     or new.circunstancias is distinct from old.circunstancias or new.monto is distinct from old.monto then
    select valor_uma into v_uma from public.configuracion where id = 1;
    if v_uma is not null then
      v_agr := exists (select 1 from jsonb_array_elements_text(coalesce(new.circunstancias, '[]')) x where x like 'agr\_%');
      new.monto := floor((case when v_agr then c.cuotas_max else c.cuotas_min end) * v_uma);
    end if;
  end if;
  return new;
end $$;

-- El monto también se recalcula al cambiar las circunstancias
create or replace trigger trg_aplicar_fundamento
  before insert or update of catalogo_numero, monto, circunstancias on public.infracciones
  for each row execute function public.aplicar_fundamento();

-- Grupo de la boleta: si no viene, la infracción es su propia boleta (corre
-- después de los triggers que asignan el folio: orden alfabético)
create or replace function public.asignar_boleta()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.boleta, '') = '' then new.boleta := coalesce(new.folio, ''); end if;
  return new;
end $$;
create or replace trigger zz_asignar_boleta before insert on public.infracciones
  for each row execute function public.asignar_boleta();

select set_config('transito.migrando', '1', false);
update public.infracciones set boleta = folio where boleta = '' and folio is not null;
select set_config('transito.migrando', '', false);
