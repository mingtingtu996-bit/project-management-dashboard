-- v1.4.22.3: allow template-entity runtime projections to be explicitly rolled back.
-- Rollback state lives in the projection table only; this migration does not grant seed-table write rights.

BEGIN;

DO $$
DECLARE
  status_constraint_name TEXT;
BEGIN
  SELECT conname
    INTO status_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.policy_template_entity_runtime_publications'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%runtime_publication_status%'
    AND pg_get_constraintdef(oid) LIKE '%runtime_stable_published%'
  LIMIT 1;

  IF status_constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.policy_template_entity_runtime_publications DROP CONSTRAINT %I',
      status_constraint_name
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.policy_template_entity_runtime_publications'::regclass
      AND conname = 'policy_template_entity_runtime_publications_status_check'
  ) THEN
    ALTER TABLE public.policy_template_entity_runtime_publications
      ADD CONSTRAINT policy_template_entity_runtime_publications_status_check
      CHECK (runtime_publication_status IN ('runtime_stable_published', 'runtime_rolled_back'))
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.policy_template_entity_runtime_publications
  VALIDATE CONSTRAINT policy_template_entity_runtime_publications_status_check;

COMMENT ON COLUMN public.policy_template_entity_runtime_publications.runtime_publication_status IS
  'Template runtime projection state. runtime_stable_published is consumable; runtime_rolled_back disables the projection after rollback execution.';

NOTIFY pgrst, 'reload schema';

COMMIT;
