-- Lo mínimo de Supabase para correr schema.sql en un Postgres limpio.
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
create schema if not exists extensions;
grant usage on schema public, extensions to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
do $$ begin create publication supabase_realtime; exception when duplicate_object then null; end $$;
