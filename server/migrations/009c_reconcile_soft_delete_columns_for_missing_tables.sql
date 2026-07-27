-- Reconcile soft-delete flags referenced by 010 RLS policies.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE acceptance_plans
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
