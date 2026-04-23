BEGIN;

ALTER TABLE IF EXISTS public.task_baselines
  ADD COLUMN IF NOT EXISTS source_version_id UUID,
  ADD COLUMN IF NOT EXISTS source_version_label TEXT,
  ADD COLUMN IF NOT EXISTS effective_from DATE,
  ADD COLUMN IF NOT EXISTS effective_to DATE,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.task_baseline_items
  ADD COLUMN IF NOT EXISTS source_milestone_id UUID REFERENCES public.milestones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_baseline_critical BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_task_baseline_items_baseline_critical
  ON public.task_baseline_items (baseline_version_id, is_baseline_critical);

ALTER TABLE IF EXISTS public.monthly_plans
  ADD COLUMN IF NOT EXISTS source_version_id UUID,
  ADD COLUMN IF NOT EXISTS source_version_label TEXT,
  ADD COLUMN IF NOT EXISTS closeout_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS carryover_item_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS data_confidence_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS data_confidence_flag TEXT,
  ADD COLUMN IF NOT EXISTS data_confidence_note TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF to_regclass('public.monthly_plans') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'monthly_plans_data_confidence_flag_check'
  ) THEN
    ALTER TABLE public.monthly_plans
      ADD CONSTRAINT monthly_plans_data_confidence_flag_check
      CHECK (
        data_confidence_flag IS NULL
        OR data_confidence_flag IN ('high', 'medium', 'low')
      );
  END IF;
END $$;

ALTER TABLE IF EXISTS public.monthly_plan_items
  ADD COLUMN IF NOT EXISTS baseline_item_id UUID REFERENCES public.task_baseline_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS carryover_from_item_id UUID REFERENCES public.monthly_plan_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_progress NUMERIC(6,2);

NOTIFY pgrst, 'reload schema';

COMMIT;
