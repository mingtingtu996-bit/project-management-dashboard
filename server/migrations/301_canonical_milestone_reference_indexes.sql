-- Migration 301: cover the canonical milestone foreign-key lookups introduced by migration 300.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index index_row
    JOIN pg_class table_row ON table_row.oid = index_row.indrelid
    JOIN pg_namespace schema_row ON schema_row.oid = table_row.relnamespace
    JOIN pg_attribute attribute_row
      ON attribute_row.attrelid = table_row.oid
     AND attribute_row.attname = 'milestone_id'
    WHERE schema_row.nspname = 'public'
      AND table_row.relname = 'tasks'
      AND index_row.indisvalid
      AND index_row.indisready
      AND index_row.indkey[0] = attribute_row.attnum
  ) THEN
    CREATE INDEX idx_tasks_canonical_milestone_id
      ON public.tasks(milestone_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index index_row
    JOIN pg_class table_row ON table_row.oid = index_row.indrelid
    JOIN pg_namespace schema_row ON schema_row.oid = table_row.relnamespace
    JOIN pg_attribute attribute_row
      ON attribute_row.attrelid = table_row.oid
     AND attribute_row.attname = 'source_milestone_id'
    WHERE schema_row.nspname = 'public'
      AND table_row.relname = 'task_baseline_items'
      AND index_row.indisvalid
      AND index_row.indisready
      AND index_row.indkey[0] = attribute_row.attnum
  ) THEN
    CREATE INDEX idx_task_baseline_items_canonical_source_milestone_id
      ON public.task_baseline_items(source_milestone_id);
  END IF;
END
$$;

COMMIT;
