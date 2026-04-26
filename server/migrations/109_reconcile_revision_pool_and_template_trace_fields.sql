BEGIN;

ALTER TABLE IF EXISTS public.tasks
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.wbs_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_node_id TEXT;

ALTER TABLE IF EXISTS public.task_baseline_items
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.wbs_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_node_id TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_template_id
  ON public.tasks(template_id);

CREATE INDEX IF NOT EXISTS idx_task_baseline_items_template_id
  ON public.task_baseline_items(template_id);

ALTER TABLE IF EXISTS public.revision_pool_candidates
  DROP CONSTRAINT IF EXISTS revision_pool_candidates_status_check;

ALTER TABLE IF EXISTS public.revision_pool_candidates
  ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS observation_window_start DATE,
  ADD COLUMN IF NOT EXISTS observation_window_end DATE,
  ADD COLUMN IF NOT EXISTS affects_critical_milestone BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS consecutive_cross_month_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deferred_reason TEXT,
  ADD COLUMN IF NOT EXISTS review_due_at DATE,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.revision_pool_candidates
  ADD CONSTRAINT revision_pool_candidates_status_check
  CHECK (status IN ('open', 'submitted', 'accepted', 'rejected', 'deferred'));

ALTER TABLE IF EXISTS public.revision_pool_candidates
  ADD CONSTRAINT revision_pool_candidates_priority_check
  CHECK (priority IN ('low', 'medium', 'high', 'critical'));

CREATE INDEX IF NOT EXISTS idx_revision_pool_candidates_priority
  ON public.revision_pool_candidates(priority);

CREATE INDEX IF NOT EXISTS idx_revision_pool_candidates_source_type
  ON public.revision_pool_candidates(source_type);

CREATE INDEX IF NOT EXISTS idx_revision_pool_candidates_review_due_at
  ON public.revision_pool_candidates(review_due_at);

CREATE INDEX IF NOT EXISTS idx_revision_pool_candidates_critical_milestone
  ON public.revision_pool_candidates(affects_critical_milestone);

NOTIFY pgrst, 'reload schema';

COMMIT;
