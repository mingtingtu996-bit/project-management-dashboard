-- 201a_v1424_duration_benchmark_project_scope.sql
-- Add project-scoped duration benchmark candidates for E1 reference-duration
-- blending. Company and system benchmarks remain separate scopes.

BEGIN;

ALTER TABLE duration_benchmarks
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS uq_duration_benchmark_current_company;
DROP INDEX IF EXISTS uq_duration_benchmark_current_global;
DROP INDEX IF EXISTS uq_duration_benchmark_current_project;

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_benchmark_current_project
  ON duration_benchmarks(project_id, benchmark_key)
  WHERE project_id IS NOT NULL AND is_current = true AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_benchmark_current_company
  ON duration_benchmarks(company_id, benchmark_key)
  WHERE company_id IS NOT NULL AND project_id IS NULL AND is_current = true AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_benchmark_current_global
  ON duration_benchmarks(benchmark_key)
  WHERE company_id IS NULL AND project_id IS NULL AND is_current = true AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_duration_benchmarks_project_current
  ON duration_benchmarks(project_id, benchmark_key, is_current, is_active)
  WHERE project_id IS NOT NULL;

COMMIT;
