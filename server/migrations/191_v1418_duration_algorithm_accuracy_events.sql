-- 191_v1418_duration_algorithm_accuracy_events.sql
-- v1.4.18: unified accuracy event contract for duration algorithm engines

BEGIN;

CREATE TABLE IF NOT EXISTS public.duration_algorithm_accuracy_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  engine_code TEXT NOT NULL,
  output_kind TEXT NOT NULL,
  dedupe_key TEXT,
  prediction_basis TEXT NOT NULL DEFAULT 'runtime_snapshot',
  prediction_source TEXT NOT NULL DEFAULT 'runtime',
  model_version TEXT NOT NULL DEFAULT 'unknown',
  predicted_start_date DATE,
  predicted_finish_date DATE,
  predicted_duration_days INT,
  predicted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actual_start_date DATE,
  actual_finish_date DATE,
  actual_duration_days INT,
  signed_error_days INT,
  absolute_error_days INT,
  backtest_status TEXT NOT NULL DEFAULT 'prediction_pending',
  prediction_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  actual_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  backtested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_algorithm_accuracy_dedupe
  ON public.duration_algorithm_accuracy_events(engine_code, dedupe_key);

CREATE INDEX IF NOT EXISTS idx_duration_algorithm_accuracy_project
  ON public.duration_algorithm_accuracy_events(project_id, engine_code, predicted_at DESC);

CREATE INDEX IF NOT EXISTS idx_duration_algorithm_accuracy_backtest
  ON public.duration_algorithm_accuracy_events(engine_code, backtested_at DESC)
  WHERE signed_error_days IS NOT NULL;

COMMENT ON TABLE public.duration_algorithm_accuracy_events IS
  'Unified prediction/backtest event contract for duration engines: standard reference, task remaining, CPM, project remaining, and acceleration target.';

COMMENT ON COLUMN public.duration_algorithm_accuracy_events.signed_error_days IS
  'Positive means actual duration/finish was later or longer than predicted; negative means earlier or shorter.';

COMMIT;
