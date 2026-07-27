-- v1.4.22.6: durable audit trail for drawing package template experience iteration runs.
-- Drawing package iteration uses real project package boards only; no policy crawling or silent seed mutation.

BEGIN;

CREATE TABLE IF NOT EXISTS public.drawing_package_experience_iteration_runs (
  run_id TEXT PRIMARY KEY,
  run_code TEXT NOT NULL DEFAULT 'drawing_package_experience_iteration_run',
  seed_version TEXT NOT NULL,
  as_of_date DATE NOT NULL,
  publication_status TEXT NOT NULL DEFAULT 'held_as_report_only'
    CHECK (publication_status IN ('candidate_overlay_published', 'held_as_report_only')),
  published_at TIMESTAMPTZ NOT NULL,
  update_mode TEXT NOT NULL DEFAULT 'real_project_experience_replay'
    CHECK (update_mode IN ('real_project_experience_replay')),
  runtime_preview_policy TEXT NOT NULL DEFAULT 'qualified_overlay_available_for_explicit_preview_only',
  promotion_gate TEXT NOT NULL DEFAULT 'project_replay_hit_rate_and_sample_count',
  mutation_policy TEXT NOT NULL DEFAULT 'no_silent_seed_mutation',
  sample_source_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  quality JSONB NOT NULL DEFAULT '{}'::jsonb,
  promoted_overlay JSONB NOT NULL DEFAULT '{}'::jsonb,
  missing_package_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  over_generated_package_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  report_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_audit_only',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drawing_package_experience_iteration_runs_published
  ON public.drawing_package_experience_iteration_runs(publication_status, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_drawing_package_experience_iteration_runs_seed
  ON public.drawing_package_experience_iteration_runs(seed_version, as_of_date DESC);

ALTER TABLE public.drawing_package_experience_iteration_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drawing_package_experience_iteration_runs_select_admin ON public.drawing_package_experience_iteration_runs;
CREATE POLICY drawing_package_experience_iteration_runs_select_admin ON public.drawing_package_experience_iteration_runs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.global_role = 'company_admin'
    )
  );

DROP POLICY IF EXISTS drawing_package_experience_iteration_runs_write_service_role ON public.drawing_package_experience_iteration_runs;
CREATE POLICY drawing_package_experience_iteration_runs_write_service_role ON public.drawing_package_experience_iteration_runs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.drawing_package_experience_iteration_runs IS
  'Backend-admin audit trail for drawing package template self-iteration from real project drawing package boards.';

COMMENT ON COLUMN public.drawing_package_experience_iteration_runs.record_visibility_policy IS
  'Backend admin audit only; ordinary drawings pages consume only explicit template preview/apply output.';

NOTIFY pgrst, 'reload schema';

COMMIT;
