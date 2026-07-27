-- v1.4.7.4 calendar/weather real-project gap closure.
-- Additive only: keeps live projects compatible while aligning rule payloads with persisted schema.

ALTER TABLE public.regional_climate_rules
  ADD COLUMN IF NOT EXISTS soft_soil_level INTEGER NOT NULL DEFAULT 0 CHECK (soft_soil_level BETWEEN 0 AND 3),
  ADD COLUMN IF NOT EXISTS mountain_terrain BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS terrain_difficulty_level INTEGER NOT NULL DEFAULT 0 CHECK (terrain_difficulty_level BETWEEN 0 AND 3),
  ADD COLUMN IF NOT EXISTS seismic_intensity INTEGER NULL CHECK (seismic_intensity IS NULL OR seismic_intensity IN (6, 7, 8, 9));

ALTER TABLE public.project_climate_profiles
  ADD COLUMN IF NOT EXISTS soft_soil_level INTEGER NOT NULL DEFAULT 0 CHECK (soft_soil_level BETWEEN 0 AND 3),
  ADD COLUMN IF NOT EXISTS mountain_terrain BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS terrain_difficulty_level INTEGER NOT NULL DEFAULT 0 CHECK (terrain_difficulty_level BETWEEN 0 AND 3),
  ADD COLUMN IF NOT EXISTS seismic_intensity INTEGER NULL CHECK (seismic_intensity IS NULL OR seismic_intensity IN (6, 7, 8, 9));

ALTER TABLE public.project_weather_forecasts
  ADD COLUMN IF NOT EXISTS relative_humidity_percent NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS snow_depth_cm NUMERIC NULL;

ALTER TABLE public.task_baseline_items
  ADD COLUMN IF NOT EXISTS seed_versions JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.monthly_plan_items
  ADD COLUMN IF NOT EXISTS seed_versions JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.site_shutdown_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('red_rainstorm', 'red_typhoon', 'compound_red_weather', 'government_order', 'manual')),
  severity TEXT NOT NULL DEFAULT 'red' CHECK (severity IN ('orange', 'red', 'black')),
  source TEXT NOT NULL DEFAULT 'weather_forecast',
  source_forecast_id UUID NULL REFERENCES public.project_weather_forecasts(id) ON DELETE SET NULL,
  source_provider TEXT NULL,
  source_url TEXT NULL,
  reason TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'confirmed', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, event_date, event_type, source)
);

CREATE INDEX IF NOT EXISTS idx_site_shutdown_events_project_date
  ON public.site_shutdown_events(project_id, event_date, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_site_shutdown_events_project_date_type_source
  ON public.site_shutdown_events(project_id, event_date, event_type, source);

NOTIFY pgrst, 'reload schema';
