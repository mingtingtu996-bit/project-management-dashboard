-- 195_v14224_duration_accuracy_event_lineage.sql
-- v1.4.22.4: precision-loop lineage and overcompensation fields for duration prediction events

BEGIN;

ALTER TABLE public.duration_algorithm_accuracy_events
  ADD COLUMN IF NOT EXISTS runtime_consumption_state TEXT NOT NULL DEFAULT 'runtime_snapshot',
  ADD COLUMN IF NOT EXISTS seed_lineage JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS network_lineage JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS baseline_absolute_error_days INT,
  ADD COLUMN IF NOT EXISTS overcompensated BOOLEAN;

COMMENT ON COLUMN public.duration_algorithm_accuracy_events.runtime_consumption_state IS
  'v1.4.22.4 runtime state: seed_only, company_blend, cold_start_baseline, residual_overlay_canary, residual_overlay_published, or manual_override.';

COMMENT ON COLUMN public.duration_algorithm_accuracy_events.seed_lineage IS
  'Seed lineage used by the prediction, including standard_work_duration seed version and standardWorkCode source.';

COMMENT ON COLUMN public.duration_algorithm_accuracy_events.network_lineage IS
  'Plan-network lineage used by the prediction, including WBS template version, dependency rule version, and critical path input hash.';

COMMENT ON COLUMN public.duration_algorithm_accuracy_events.baseline_absolute_error_days IS
  'Absolute error from the pre-overlay or baseline prediction used to compute overcompensation.';

COMMENT ON COLUMN public.duration_algorithm_accuracy_events.overcompensated IS
  'True when the published/canary correction produced a larger absolute error than the baseline prediction.';

COMMIT;
