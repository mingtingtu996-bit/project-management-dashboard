-- 140_v1418_duration_experience_tables.sql
-- v1.4.18: Duration experience samples + benchmarks + forecasts

BEGIN;

-- ============================================================
-- Duration experience samples (Phase 2)
-- ============================================================
CREATE TABLE IF NOT EXISTS duration_experience_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  template_node_id UUID,
  wbs_node_type TEXT NOT NULL DEFAULT 'process',
  generation_depth INT,
  parent_template_node_id UUID,
  parent_standard_work_code TEXT,
  standard_work_code TEXT,
  standard_work_name TEXT,
  engineering_category_id UUID,
  planned_duration INT NOT NULL,
  actual_duration INT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  source_type TEXT NOT NULL DEFAULT 'task_completion',
  sample_strength TEXT NOT NULL DEFAULT 'strong',
  sample_status TEXT NOT NULL DEFAULT 'active',
  confidence_level TEXT NOT NULL DEFAULT 'medium',
  confidence_score INT DEFAULT 50,
  included_in_benchmark BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  superseded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_sample_active
  ON duration_experience_samples(task_id, source_type)
  WHERE sample_status = 'active';

CREATE INDEX IF NOT EXISTS idx_duration_sample_template
  ON duration_experience_samples(template_node_id, wbs_node_type)
  WHERE sample_status = 'active';

-- ============================================================
-- Duration benchmarks (Phase 4)
-- ============================================================
CREATE TABLE IF NOT EXISTS duration_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  benchmark_key TEXT NOT NULL,
  benchmark_version TEXT NOT NULL DEFAULT 'v1',
  template_node_id UUID,
  engineering_category_id UUID,
  project_context TEXT DEFAULT 'all',
  wbs_node_type TEXT NOT NULL DEFAULT 'process',
  sample_count INT NOT NULL DEFAULT 0,
  p50_days INT,
  p75_days INT,
  p80_days INT,
  mean_days REAL,
  variance REAL,
  coefficient_of_variation REAL,
  confidence_level TEXT NOT NULL DEFAULT 'low',
  confidence_score INT DEFAULT 30,
  is_current BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP INDEX IF EXISTS uq_duration_benchmark_current;

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_benchmark_current_company
  ON duration_benchmarks(company_id, benchmark_key)
  WHERE company_id IS NOT NULL AND is_current = true AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_benchmark_current_global
  ON duration_benchmarks(benchmark_key)
  WHERE company_id IS NULL AND is_current = true AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_duration_benchmark_template
  ON duration_benchmarks(company_id, template_node_id, wbs_node_type, is_current);

-- ============================================================
-- Task duration forecasts (Phase 5)
-- ============================================================
CREATE TABLE IF NOT EXISTS task_duration_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  recommended_duration_days INT,
  conservative_duration_days INT,
  confidence_level TEXT NOT NULL DEFAULT 'medium',
  confidence_score INT DEFAULT 50,
  forecast_source TEXT NOT NULL DEFAULT 'benchmark',
  benchmark_key TEXT,
  business_reason TEXT,
  forecast_model_profile_id UUID,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_current BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_duration_forecast_task
  ON task_duration_forecasts(task_id, is_current)
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_duration_forecast_project
  ON task_duration_forecasts(project_id, generated_at DESC);

-- ============================================================
-- Duration suggestion overrides (Phase 5)
-- ============================================================
CREATE TABLE IF NOT EXISTS duration_suggestion_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  override_key TEXT NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  template_node_id UUID,
  recommended_duration_days INT NOT NULL,
  reason TEXT,
  override_status TEXT NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP INDEX IF EXISTS uq_duration_override_active;

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_override_active_project
  ON duration_suggestion_overrides(project_id, override_key)
  WHERE project_id IS NOT NULL AND override_status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_override_active_company
  ON duration_suggestion_overrides(company_id, override_key)
  WHERE company_id IS NOT NULL AND project_id IS NULL AND override_status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_override_active_global
  ON duration_suggestion_overrides(override_key)
  WHERE company_id IS NULL AND project_id IS NULL AND override_status = 'active';

-- ============================================================
-- Duration forecast model profiles (Phase 2)
-- ============================================================
CREATE TABLE IF NOT EXISTS duration_forecast_model_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  description TEXT,
  wbs_node_type TEXT NOT NULL DEFAULT 'process',
  confidence_weight REAL DEFAULT 1.0,
  model_status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_forecast_model_profiles_key
  ON duration_forecast_model_profiles(model_key);

INSERT INTO duration_forecast_model_profiles (model_key, model_name, description, wbs_node_type) VALUES
  ('benchmark_p50', '经验P50', '中位经验工期', 'process'),
  ('benchmark_p75', '经验P75', '保守经验工期', 'process'),
  ('p75_p50_ratio', 'P75/P50比率', '风险修正系数', 'process'),
  ('calendar_productivity', '日历生产率', '按工作日/自然日修正', 'process')
ON CONFLICT (model_key) DO NOTHING;

COMMIT;
