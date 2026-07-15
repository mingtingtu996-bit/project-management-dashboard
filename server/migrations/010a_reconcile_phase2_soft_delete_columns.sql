-- Reconcile soft-delete columns referenced by 011 RLS policies.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE wbs_templates
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
