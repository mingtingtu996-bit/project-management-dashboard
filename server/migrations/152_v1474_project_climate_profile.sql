-- v1.4.7.4 project climate profile foundation.
-- City-level automatic inference only: no precise coordinates are persisted.

CREATE TABLE IF NOT EXISTS public.regional_climate_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  province TEXT NOT NULL,
  city TEXT NULL,
  admin_code TEXT NULL,
  climate_region TEXT NOT NULL CHECK (climate_region IN ('north', 'east', 'south', 'west', 'default')),
  thermal_zone TEXT NOT NULL,
  rainy_season_months INTEGER[] NOT NULL DEFAULT '{}',
  high_temp_months INTEGER[] NOT NULL DEFAULT '{}',
  cold_weather_months INTEGER[] NOT NULL DEFAULT '{}',
  typhoon_risk_level TEXT NOT NULL DEFAULT 'none' CHECK (typhoon_risk_level IN ('none', 'low', 'medium', 'high')),
  flood_season_months INTEGER[] NOT NULL DEFAULT '{}',
  winter_shutdown_risk_level TEXT NOT NULL DEFAULT 'none' CHECK (winter_shutdown_risk_level IN ('none', 'low', 'medium', 'high')),
  climate_tags TEXT[] NOT NULL DEFAULT '{}',
  source_standard TEXT NOT NULL,
  source_version TEXT NOT NULL,
  source_clause_ref TEXT NOT NULL,
  evidence_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS regional_climate_rules_scope_unique
  ON public.regional_climate_rules (
    LOWER(province),
    COALESCE(LOWER(city), ''),
    COALESCE(admin_code, '')
  );

CREATE INDEX IF NOT EXISTS regional_climate_rules_region_idx
  ON public.regional_climate_rules (climate_region, status);

CREATE TABLE IF NOT EXISTS public.project_location_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  observed_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  province TEXT NULL,
  city TEXT NULL,
  admin_code TEXT NULL,
  accuracy_level TEXT NOT NULL DEFAULT 'city' CHECK (accuracy_level IN ('city', 'province', 'region', 'unknown')),
  source TEXT NOT NULL CHECK (source IN ('browser_geolocation', 'ip_location', 'project_location', 'system_inference')),
  confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
  raw_source_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_location_observations_project_time_idx
  ON public.project_location_observations (project_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS project_location_observations_project_city_idx
  ON public.project_location_observations (project_id, province, city);

CREATE TABLE IF NOT EXISTS public.project_climate_profiles (
  project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  province TEXT NULL,
  city TEXT NULL,
  admin_code TEXT NULL,
  climate_region TEXT NOT NULL DEFAULT 'default' CHECK (climate_region IN ('north', 'east', 'south', 'west', 'default')),
  thermal_zone TEXT NULL,
  climate_tags TEXT[] NOT NULL DEFAULT '{}',
  rainy_season_months INTEGER[] NOT NULL DEFAULT '{}',
  high_temp_months INTEGER[] NOT NULL DEFAULT '{}',
  cold_weather_months INTEGER[] NOT NULL DEFAULT '{}',
  typhoon_risk_level TEXT NOT NULL DEFAULT 'none' CHECK (typhoon_risk_level IN ('none', 'low', 'medium', 'high')),
  flood_season_months INTEGER[] NOT NULL DEFAULT '{}',
  winter_shutdown_risk_level TEXT NOT NULL DEFAULT 'none' CHECK (winter_shutdown_risk_level IN ('none', 'low', 'medium', 'high')),
  confidence TEXT NOT NULL DEFAULT 'low' CHECK (confidence IN ('high', 'medium', 'low')),
  location_consensus_status TEXT NOT NULL DEFAULT 'default_fallback'
    CHECK (location_consensus_status IN ('city_consensus', 'province_consensus', 'single_observation', 'project_location_fallback', 'default_fallback', 'conflict')),
  observation_count INTEGER NOT NULL DEFAULT 0,
  distinct_user_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'default' CHECK (source IN ('multi_user_location', 'single_user_location', 'project_location', 'ip_location', 'default')),
  source_rule_id UUID NULL REFERENCES public.regional_climate_rules(id) ON DELETE SET NULL,
  weather_provider TEXT NULL,
  last_weather_synced_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_climate_profiles_region_idx
  ON public.project_climate_profiles (climate_region, confidence);

CREATE TABLE IF NOT EXISTS public.project_weather_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  forecast_city TEXT NULL,
  forecast_admin_code TEXT NULL,
  forecast_date DATE NOT NULL,
  min_temp_c NUMERIC NULL,
  max_temp_c NUMERIC NULL,
  precipitation_mm NUMERIC NULL,
  wind_level TEXT NULL,
  warning_tags TEXT[] NOT NULL DEFAULT '{}',
  provider TEXT NOT NULL,
  provider_record_id TEXT NULL,
  source_url TEXT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, forecast_date, provider)
);

CREATE INDEX IF NOT EXISTS project_weather_forecasts_project_date_idx
  ON public.project_weather_forecasts (project_id, forecast_date);
