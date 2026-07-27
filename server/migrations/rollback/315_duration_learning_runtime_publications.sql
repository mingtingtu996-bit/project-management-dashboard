-- Roll back migration 315 only after migration 322 has been rolled back.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.duration_learning_legacy_runtime_retirement_state') IS NOT NULL
    AND (
      to_regclass('public.wbs_template_runtime_publications') IS NULL
      OR to_regclass('public.wbs_template_runtime_events') IS NULL
      OR to_regclass('public.construction_dependency_rule_runtime_publications') IS NULL
      OR to_regclass('public.construction_dependency_rule_runtime_events') IS NULL
    )
  THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_rollback_322_required';
  END IF;
END
$$;

DROP VIEW IF EXISTS public.duration_learning_legacy_runtime_retirement_readback;
DROP FUNCTION IF EXISTS public.rollback_duration_learning_runtime_publication(
  TEXT, TEXT, TEXT, TEXT, UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ
);
DROP FUNCTION IF EXISTS public.promote_duration_learning_runtime_canary(TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.persist_duration_learning_runtime_publication(
  TEXT, TEXT, TEXT, TEXT, UUID, UUID, TEXT, TEXT,
  JSONB, JSONB, JSONB, JSONB, TEXT, INTEGER, INTEGER, TIMESTAMPTZ
);
DROP TABLE IF EXISTS public.duration_learning_runtime_consumptions;
DROP TABLE IF EXISTS public.duration_learning_legacy_default_master_plan_mappings;
DROP TABLE IF EXISTS public.duration_learning_legacy_runtime_row_archive;
DROP TABLE IF EXISTS public.duration_learning_legacy_runtime_retirement_state;
DROP TABLE IF EXISTS public.duration_learning_runtime_publications;

NOTIFY pgrst, 'reload schema';

COMMIT;
