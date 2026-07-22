-- Canonical cause-aware duration benchmark segments with explicit provenance.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 324';
  END IF;
END
$$;

ALTER TABLE public.duration_benchmarks
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_window_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_as_of TIMESTAMPTZ;

UPDATE public.duration_benchmarks
   SET generated_at = COALESCE(generated_at, updated_at, created_at)
 WHERE generated_at IS NULL;

ALTER TABLE public.duration_benchmarks
  ALTER COLUMN generated_at SET DEFAULT NOW(),
  ALTER COLUMN generated_at SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.duration_benchmark_cause_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_id UUID NOT NULL REFERENCES public.duration_benchmarks(id) ON DELETE CASCADE,
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  cause_code TEXT NOT NULL,
  taxonomy_version TEXT NOT NULL,
  sample_count INTEGER NOT NULL CHECK (sample_count > 0),
  p50_days INTEGER NULL CHECK (p50_days IS NULL OR p50_days > 0),
  p75_days INTEGER NULL CHECK (p75_days IS NULL OR p75_days > 0),
  p80_days INTEGER NULL CHECK (p80_days IS NULL OR p80_days > 0),
  mean_days REAL NULL CHECK (mean_days IS NULL OR mean_days > 0),
  variance REAL NULL CHECK (variance IS NULL OR variance >= 0),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_window_start TIMESTAMPTZ NULL,
  source_as_of TIMESTAMPTZ NOT NULL,
  duration_day_basis TEXT NOT NULL CHECK (duration_day_basis = 'construction_production_day'),
  calendar_ref TEXT NOT NULL,
  calendar_version TEXT NOT NULL,
  lineage JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(lineage) = 'array'),
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (source_window_start IS NULL OR source_window_start <= source_as_of),
  CHECK (project_id IS NULL OR company_id IS NOT NULL),
  CHECK (cause_code IN (
    'predecessor_delay','material_shortage','labor_shortage','equipment_unavailable',
    'design_change','drawing_delay','quality_rework','weather_impact','owner_decision',
    'government_inspection','site_capacity_pressure','workflow_sequence','external_readiness','other'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_benchmark_cause_segment_current
  ON public.duration_benchmark_cause_segments (benchmark_id, cause_code, taxonomy_version)
  WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_duration_benchmark_cause_segments_benchmark_id
  ON public.duration_benchmark_cause_segments (benchmark_id);

CREATE OR REPLACE FUNCTION public.ensure_duration_benchmark_cause_segment_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  benchmark_company_id UUID;
  benchmark_project_id UUID;
  project_company_id UUID;
  lock_benchmark_scope BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    lock_benchmark_scope := TRUE;
  ELSE
    lock_benchmark_scope := NEW.benchmark_id IS DISTINCT FROM OLD.benchmark_id;
  END IF;

  IF lock_benchmark_scope THEN
    SELECT benchmark.company_id, benchmark.project_id
      INTO benchmark_company_id, benchmark_project_id
      FROM public.duration_benchmarks benchmark
     WHERE benchmark.id = NEW.benchmark_id
     FOR SHARE;
  ELSE
    SELECT benchmark.company_id, benchmark.project_id
      INTO benchmark_company_id, benchmark_project_id
      FROM public.duration_benchmarks benchmark
     WHERE benchmark.id = NEW.benchmark_id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'duration benchmark cause segment benchmark not found';
  END IF;

  IF NEW.company_id IS DISTINCT FROM benchmark_company_id
     OR NEW.project_id IS DISTINCT FROM benchmark_project_id THEN
    RAISE EXCEPTION 'duration benchmark cause segment scope mismatch';
  END IF;

  IF NEW.project_id IS NOT NULL THEN
    SELECT project.company_id
      INTO project_company_id
      FROM public.projects project
     WHERE project.id = NEW.project_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'duration benchmark cause segment project not found';
    END IF;

    IF project_company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'duration benchmark cause segment project/company mismatch';
    END IF;
  END IF;

  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS ensure_duration_benchmark_cause_segment_scope_trigger
  ON public.duration_benchmark_cause_segments;
CREATE TRIGGER ensure_duration_benchmark_cause_segment_scope_trigger
  BEFORE INSERT OR UPDATE
  ON public.duration_benchmark_cause_segments
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_duration_benchmark_cause_segment_scope();

CREATE OR REPLACE FUNCTION public.prevent_duration_benchmark_scope_change_with_segments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF (
    NEW.company_id IS DISTINCT FROM OLD.company_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
  ) AND EXISTS (
    SELECT 1
    FROM public.duration_benchmark_cause_segments segment
    WHERE segment.benchmark_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'duration benchmark scope cannot change while cause segments exist';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS prevent_duration_benchmark_scope_change_with_segments_trigger
  ON public.duration_benchmarks;
CREATE TRIGGER prevent_duration_benchmark_scope_change_with_segments_trigger
  BEFORE UPDATE OF company_id, project_id
  ON public.duration_benchmarks
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duration_benchmark_scope_change_with_segments();

REVOKE EXECUTE ON FUNCTION public.ensure_duration_benchmark_cause_segment_scope()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_duration_benchmark_scope_change_with_segments()
  FROM PUBLIC, anon, authenticated;

ALTER TABLE public.duration_benchmark_cause_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duration_benchmark_cause_segments FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.duration_benchmark_cause_segments FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.duration_benchmark_cause_segments FROM authenticated;
REVOKE ALL ON TABLE public.duration_benchmark_cause_segments FROM workbuddy_runtime;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.duration_benchmark_cause_segments FROM service_role';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.ensure_duration_benchmark_cause_segment_scope() FROM service_role';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.prevent_duration_benchmark_scope_change_with_segments() FROM service_role';
  END IF;
END
$$;

GRANT SELECT ON TABLE public.duration_benchmark_cause_segments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_benchmark_cause_segments TO workbuddy_runtime;

DROP POLICY IF EXISTS duration_benchmark_cause_segments_member_read
  ON public.duration_benchmark_cause_segments;
CREATE POLICY duration_benchmark_cause_segments_member_read
  ON public.duration_benchmark_cause_segments
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      (
        duration_benchmark_cause_segments.company_id IS NULL
        AND duration_benchmark_cause_segments.project_id IS NULL
      )
      OR (
        duration_benchmark_cause_segments.company_id IS NOT NULL
        AND duration_benchmark_cause_segments.project_id IS NULL
        AND workbuddy_private.is_active_company_member(
          duration_benchmark_cause_segments.company_id,
          NULL::TEXT[]
        )
      )
      OR (
        duration_benchmark_cause_segments.company_id IS NOT NULL
        AND duration_benchmark_cause_segments.project_id IS NOT NULL
        AND workbuddy_private.is_active_company_member(
          duration_benchmark_cause_segments.company_id,
          NULL::TEXT[]
        )
        AND (
          workbuddy_private.is_active_company_member(
            duration_benchmark_cause_segments.company_id,
            ARRAY['company_admin']::TEXT[]
          )
          OR workbuddy_private.is_active_project_member(
            duration_benchmark_cause_segments.project_id,
            NULL::TEXT[]
          )
        )
        AND EXISTS (
          SELECT 1
          FROM public.projects project
          WHERE project.id = duration_benchmark_cause_segments.project_id
            AND project.company_id = duration_benchmark_cause_segments.company_id
        )
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.duration_benchmarks benchmark
      WHERE benchmark.id = duration_benchmark_cause_segments.benchmark_id
        AND benchmark.company_id IS NOT DISTINCT FROM duration_benchmark_cause_segments.company_id
        AND benchmark.project_id IS NOT DISTINCT FROM duration_benchmark_cause_segments.project_id
    )
  );

DROP POLICY IF EXISTS duration_benchmark_cause_segments_backend_runtime
  ON public.duration_benchmark_cause_segments;
CREATE POLICY duration_benchmark_cause_segments_backend_runtime
  ON public.duration_benchmark_cause_segments
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

COMMENT ON TABLE public.duration_benchmark_cause_segments IS
  'Canonical cause-aware benchmark distributions with tenant scope, production-day semantics, and source lineage.';

NOTIFY pgrst, 'reload schema';

COMMIT;
