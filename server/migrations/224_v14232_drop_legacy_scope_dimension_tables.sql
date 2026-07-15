-- 224_v14232_drop_legacy_scope_dimension_tables.sql
-- Restore historical migration immutability while keeping the final v1.4
-- engineering-object boundary: scope_dimensions/project_scope_dimensions are
-- retired compatibility tables, not runtime schema.

BEGIN;

DROP TABLE IF EXISTS public.project_scope_dimensions CASCADE;
DROP TABLE IF EXISTS public.scope_dimensions CASCADE;

COMMIT;
