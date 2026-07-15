-- 206_v14225_duration_benchmark_variance_columns.sql
-- v1.4.25: make duration benchmark variance queryable for E1/E2 confidence bands.

BEGIN;

ALTER TABLE duration_benchmarks
  ADD COLUMN IF NOT EXISTS variance REAL,
  ADD COLUMN IF NOT EXISTS coefficient_of_variation REAL;

UPDATE duration_benchmarks
SET variance = CASE
  WHEN (metadata->>'variance') ~ '^[0-9]+(\.[0-9]+)?$' THEN (metadata->>'variance')::REAL
  WHEN (metadata->>'cv') ~ '^[0-9]+(\.[0-9]+)?$' THEN (metadata->>'cv')::REAL
  WHEN (metadata->>'coefficientOfVariation') ~ '^[0-9]+(\.[0-9]+)?$' THEN (metadata->>'coefficientOfVariation')::REAL
  WHEN (metadata->>'coefficient_of_variation') ~ '^[0-9]+(\.[0-9]+)?$' THEN (metadata->>'coefficient_of_variation')::REAL
  ELSE variance
END
WHERE variance IS NULL;

UPDATE duration_benchmarks
SET coefficient_of_variation = CASE
  WHEN (metadata->>'coefficientOfVariation') ~ '^[0-9]+(\.[0-9]+)?$' THEN (metadata->>'coefficientOfVariation')::REAL
  WHEN (metadata->>'coefficient_of_variation') ~ '^[0-9]+(\.[0-9]+)?$' THEN (metadata->>'coefficient_of_variation')::REAL
  WHEN (metadata->>'variance') ~ '^[0-9]+(\.[0-9]+)?$' THEN (metadata->>'variance')::REAL
  WHEN (metadata->>'cv') ~ '^[0-9]+(\.[0-9]+)?$' THEN (metadata->>'cv')::REAL
  ELSE coefficient_of_variation
END
WHERE coefficient_of_variation IS NULL;

COMMENT ON COLUMN duration_benchmarks.variance IS
  'Normalized duration benchmark variance/CV for E1/E2 confidence bands; metadata remains legacy fallback only.';

COMMENT ON COLUMN duration_benchmarks.coefficient_of_variation IS
  'Coefficient of variation for duration benchmark samples; mirrors variance when variance is a normalized CV.';

COMMIT;
