-- v1.4.23.1 runtime schema gap follow-up.
--
-- Live runtime smoke exposed remaining additive schema gaps between the
-- acceptance/runtime read models and the current database. This migration is
-- forward-only and idempotent: it adds compatibility columns only, backfills
-- from existing canonical fields where a direct legacy equivalent exists, and
-- does not delete or infer business data.

BEGIN;

ALTER TABLE public.project_members
  ADD COLUMN IF NOT EXISTS role VARCHAR(20);

UPDATE public.project_members
SET role = permission_level
WHERE role IS NULL
  AND permission_level IS NOT NULL;

COMMENT ON COLUMN public.project_members.role IS
  'Compatibility project role consumed by legacy runtime read models; backfilled from permission_level.';

ALTER TABLE public.acceptance_plans
  ADD COLUMN IF NOT EXISTS phase_code TEXT,
  ADD COLUMN IF NOT EXISTS predecessor_plan_ids UUID[],
  ADD COLUMN IF NOT EXISTS successor_plan_ids UUID[],
  ADD COLUMN IF NOT EXISTS can_submit BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_overdue BOOLEAN,
  ADD COLUMN IF NOT EXISTS days_to_due INTEGER,
  ADD COLUMN IF NOT EXISTS requirement_ready_percent NUMERIC,
  ADD COLUMN IF NOT EXISTS upstream_unfinished_count INTEGER,
  ADD COLUMN IF NOT EXISTS downstream_block_count INTEGER,
  ADD COLUMN IF NOT EXISTS display_badges TEXT[],
  ADD COLUMN IF NOT EXISTS overlay_tags TEXT[],
  ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN,
  ADD COLUMN IF NOT EXISTS block_reason_summary TEXT,
  ADD COLUMN IF NOT EXISTS warning_level TEXT,
  ADD COLUMN IF NOT EXISTS is_custom BOOLEAN,
  ADD COLUMN IF NOT EXISTS responsible_person TEXT,
  ADD COLUMN IF NOT EXISTS responsible_unit TEXT,
  ADD COLUMN IF NOT EXISTS inspection_authority TEXT;

UPDATE public.acceptance_plans
SET phase_code = phase
WHERE phase_code IS NULL
  AND phase IS NOT NULL;

COMMENT ON COLUMN public.acceptance_plans.phase_code IS
  'Compatibility phase code consumed by acceptance filters; backfilled from phase.';
COMMENT ON COLUMN public.acceptance_plans.predecessor_plan_ids IS
  'Optional cached acceptance predecessor ids. Current flow snapshots recompute this from acceptance_dependencies.';
COMMENT ON COLUMN public.acceptance_plans.successor_plan_ids IS
  'Optional cached acceptance successor ids. Current flow snapshots recompute this from acceptance_dependencies.';
COMMENT ON COLUMN public.acceptance_plans.can_submit IS
  'Optional cached submit-readiness flag. Current flow snapshots recompute this from dependencies and requirements.';
COMMENT ON COLUMN public.acceptance_plans.requirement_ready_percent IS
  'Optional cached requirement readiness percentage. Current flow snapshots recompute this from acceptance_requirements.';
COMMENT ON COLUMN public.acceptance_plans.overlay_tags IS
  'Optional cached acceptance overlay tags for filtering and display.';

CREATE INDEX IF NOT EXISTS idx_acceptance_plans_phase_code
  ON public.acceptance_plans(project_id, phase_code)
  WHERE phase_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_members_role
  ON public.project_members(project_id, role)
  WHERE role IS NOT NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
