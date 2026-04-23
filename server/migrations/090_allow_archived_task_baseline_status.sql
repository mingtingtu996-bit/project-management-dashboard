BEGIN;

DO $$
DECLARE
  status_constraint_name TEXT;
BEGIN
  IF to_regclass('public.task_baselines') IS NULL THEN
    RETURN;
  END IF;

  SELECT con.conname
  INTO status_constraint_name
  FROM pg_constraint con
  INNER JOIN pg_class rel ON rel.oid = con.conrelid
  INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'task_baselines'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%status%'
    AND pg_get_constraintdef(con.oid) ILIKE '%pending_realign%'
  LIMIT 1;

  IF status_constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.task_baselines DROP CONSTRAINT %I',
      status_constraint_name
    );
  END IF;

  ALTER TABLE public.task_baselines
    ADD CONSTRAINT task_baselines_status_check
    CHECK (status IN ('draft', 'confirmed', 'closed', 'revising', 'pending_realign', 'archived'));
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
