-- 092: Add missing baseline_version_id to live delay_requests tables adopted from legacy schema

BEGIN;

ALTER TABLE IF EXISTS public.delay_requests
  ADD COLUMN IF NOT EXISTS baseline_version_id UUID REFERENCES public.task_baselines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_delay_requests_baseline_version_id
  ON public.delay_requests(baseline_version_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
