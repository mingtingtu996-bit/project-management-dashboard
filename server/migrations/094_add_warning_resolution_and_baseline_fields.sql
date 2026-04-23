ALTER TABLE public.task_obstacles
  ADD COLUMN IF NOT EXISTS severity_escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS severity_manually_overridden BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS resolved_source TEXT;

ALTER TABLE public.task_baseline_items
  ADD COLUMN IF NOT EXISTS is_baseline_critical BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_task_baseline_items_baseline_critical
  ON public.task_baseline_items (baseline_version_id, is_baseline_critical);
