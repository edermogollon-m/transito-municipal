#!/usr/bin/env bash
# Aplica schema.sql + security_auth.sql (dos veces, debe ser idempotente)
# en un Postgres limpio y corre las pruebas. Usa PGHOST/PGPORT/PGUSER/PGPASSWORD.
set -euo pipefail
cd "$(dirname "$0")/../.."
P="psql -v ON_ERROR_STOP=1 -q"
$P -f test/db/supabase_stub.sql
$P -f schema.sql
$P -f test/db/datos_previos.sql
$P -f security_auth.sql
$P -f security_auth.sql
for f in auditoria.sql evidencias_storage.sql verificacion.sql cobros.sql articulos.sql; do $P -f $f; $P -f $f; done
$P -f test/db/pruebas.sql
