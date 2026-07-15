-- 157_v1474_progress_quality_self_learning.sql
-- v1.4.7.4 / v1.4.16 / v1.4.18: progress-quality closed loop.

BEGIN;

ALTER TABLE public.task_progress_snapshots
  ADD COLUMN IF NOT EXISTS source_confidence TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS confirmation_status TEXT NOT NULL DEFAULT 'unconfirmed',
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_by UUID NULL,
  ADD COLUMN IF NOT EXISTS quality_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_progress_snapshots_source_confidence_check') THEN
    ALTER TABLE public.task_progress_snapshots
      ADD CONSTRAINT task_progress_snapshots_source_confidence_check
      CHECK (source_confidence IN ('high','medium','low','unknown'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_progress_snapshots_confirmation_status_check') THEN
    ALTER TABLE public.task_progress_snapshots
      ADD CONSTRAINT task_progress_snapshots_confirmation_status_check
      CHECK (confirmation_status IN ('unconfirmed','confirmed','acknowledged','verified'));
  END IF;
END $$;

UPDATE public.task_progress_snapshots
SET
  event_source = CASE
    WHEN event_source IN ('db_trigger', 'trigger') THEN 'system_trigger'
    WHEN event_source ILIKE '%excel%' OR event_source ILIKE '%csv%' OR event_source ILIKE '%import%' THEN 'import'
    WHEN event_source ILIKE '%bulk%' OR event_source ILIKE '%batch%' THEN 'batch_update'
    WHEN event_source ILIKE '%legacy%' OR event_source ILIKE '%migration%' THEN 'legacy_migration'
    WHEN event_source ILIKE '%acceptance%' THEN 'acceptance_linkage'
    WHEN event_source ILIKE '%api%' OR event_source ILIKE '%sync%' OR event_source ILIKE '%integration%' THEN 'api_integration'
    WHEN event_source ILIKE '%manual%' OR event_source ILIKE '%user%' THEN 'user_action'
    WHEN event_source IS NULL OR btrim(event_source) = '' THEN 'unknown'
    ELSE event_source
  END,
  source_confidence = CASE
    WHEN event_source IN ('manual','user_action','field_report','daily_report','site_report','task_dialog','progress_dialog') THEN 'high'
    WHEN event_source IN ('system_auto','system_trigger','acceptance_linkage','api_integration') THEN 'medium'
    WHEN event_source IN ('import','batch_update','legacy_migration') THEN 'low'
    ELSE COALESCE(NULLIF(source_confidence, ''), 'unknown')
  END
WHERE event_source IS DISTINCT FROM CASE
    WHEN event_source IN ('db_trigger', 'trigger') THEN 'system_trigger'
    WHEN event_source ILIKE '%excel%' OR event_source ILIKE '%csv%' OR event_source ILIKE '%import%' THEN 'import'
    WHEN event_source ILIKE '%bulk%' OR event_source ILIKE '%batch%' THEN 'batch_update'
    WHEN event_source ILIKE '%legacy%' OR event_source ILIKE '%migration%' THEN 'legacy_migration'
    WHEN event_source ILIKE '%acceptance%' THEN 'acceptance_linkage'
    WHEN event_source ILIKE '%api%' OR event_source ILIKE '%sync%' OR event_source ILIKE '%integration%' THEN 'api_integration'
    WHEN event_source ILIKE '%manual%' OR event_source ILIKE '%user%' THEN 'user_action'
    WHEN event_source IS NULL OR btrim(event_source) = '' THEN 'unknown'
    ELSE event_source
  END
   OR source_confidence IS NULL
   OR source_confidence = 'unknown';

CREATE TABLE IF NOT EXISTS public.duration_forecast_project_overlays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  model_key TEXT NOT NULL DEFAULT 'remaining_duration_forecast',
  model_version TEXT NOT NULL DEFAULT 'remaining_duration_forecast_v1.1',
  overlay_status TEXT NOT NULL DEFAULT 'candidate',
  sample_count INT NOT NULL DEFAULT 0,
  mean_absolute_error_days NUMERIC(8,2),
  bias_error_days NUMERIC(8,2),
  threshold_overlay JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, model_key, model_version)
);

CREATE INDEX IF NOT EXISTS idx_duration_forecast_project_overlays_project
  ON public.duration_forecast_project_overlays(project_id, model_key, overlay_status);

CREATE OR REPLACE FUNCTION public.auto_record_progress_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.progress IS DISTINCT FROM OLD.progress THEN
    INSERT INTO public.task_progress_snapshots (
      task_id,
      progress,
      snapshot_date,
      event_type,
      event_source,
      source_confidence,
      confirmation_status,
      notes
    )
    VALUES (
      NEW.id,
      NEW.progress,
      CURRENT_DATE,
      'task_update',
      'system_trigger',
      'medium',
      'unconfirmed',
      '进度更新: ' || NEW.progress || '%'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
