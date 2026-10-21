-- ═══════════════════════════════════════════════════════════════════
-- Limpieza opcional (correr a mano en Supabase → SQL Editor)
--
-- Quita lo que quedó sin uso después de las migraciones. Las herramientas
-- automáticas no pueden ejecutar DROP, por eso va aparte. Nada de esto
-- cambia el funcionamiento de la app.
-- ═══════════════════════════════════════════════════════════════════

-- Permisos temporales usados para cargar los catálogos (ya no permiten nada)
drop policy if exists carga_temporal_admin on public.catalogo_infracciones;
drop policy if exists carga_temporal_admin on public.reglamento_articulos;

-- Versiones anteriores del portal ciudadano (reemplazadas por
-- consulta_ciudadana y parametros_descuento)
drop function if exists public.consulta_publica(text, boolean);
drop function if exists public.parametros_pago();
