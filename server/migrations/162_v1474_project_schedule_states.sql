-- v1.4.7.4 project schedule state time series.
-- Audit/state layer only: it does not replace project_daily_snapshot or projectExecutionSummaryService.

CREATE TABLE IF NOT EXISTS public.project_schedule_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('project', 'building', 'floor_group', 'zone', 'specialty', 'milestone_window')),
  scope_id TEXT NOT NULL DEFAULT 'project',
  state TEXT NOT NULL CHECK (state IN ('normal', 'accelerating', 'recovery', 'blocked', 'overcompressed', 'low_confidence')),
  confidence_score NUMERIC NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  window_days INTEGER NOT NULL DEFAULT 14 CHECK (window_days > 0 AND window_days <= 90),
  window_start_date DATE NULL,
  window_end_date DATE NOT NULL DEFAULT CURRENT_DATE,
  local_acceleration_factor NUMERIC NULL CHECK (local_acceleration_factor IS NULL OR (local_acceleration_factor >= 0.80 AND local_acceleration_factor <= 1.00)),
  throughput_ratio NUMERIC NOT NULL DEFAULT 1,
  parallel_density_ratio NUMERIC NOT NULL DEFAULT 1,
  deviation_recovery_days NUMERIC NOT NULL DEFAULT 0,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  downstream_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'projectScheduleStateService',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, scope_type, scope_id, window_end_date)
);

CREATE INDEX IF NOT EXISTS idx_project_schedule_states_project_window
  ON public.project_schedule_states(project_id, window_end_date DESC, scope_type, state);

CREATE INDEX IF NOT EXISTS idx_project_schedule_states_state
  ON public.project_schedule_states(project_id, state, confidence_score DESC);

NOTIFY pgrst, 'reload schema';
