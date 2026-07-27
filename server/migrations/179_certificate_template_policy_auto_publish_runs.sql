-- v1.4.22.2: durable audit trail for trusted-source certificate template policy auto-publish runs.
-- Business preview consumes published seed/profile output only; this table records the backend publication run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.certificate_template_policy_auto_publish_runs (
  run_id TEXT PRIMARY KEY,
  run_code TEXT NOT NULL DEFAULT 'certificate_template_policy_auto_publish_run',
  seed_version TEXT NOT NULL,
  as_of_date DATE NOT NULL,
  publication_status TEXT NOT NULL DEFAULT 'published'
    CHECK (publication_status IN ('published')),
  published_at TIMESTAMPTZ NOT NULL,
  update_mode TEXT NOT NULL DEFAULT 'trusted_source_auto_publish'
    CHECK (update_mode IN ('trusted_source_auto_publish')),
  runtime_preview_policy TEXT NOT NULL DEFAULT 'business_preview_consumes_auto_published_seed_version',
  publication_gate TEXT NOT NULL DEFAULT 'trusted_official_sources_only',
  rollback_policy TEXT NOT NULL DEFAULT 'previous_seed_version_retained_for_rollback',
  applied_auto_published_seed_count INTEGER NOT NULL DEFAULT 0 CHECK (applied_auto_published_seed_count >= 0),
  retained_previous_published_seed_count INTEGER NOT NULL DEFAULT 0 CHECK (retained_previous_published_seed_count >= 0),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  automation_quality JSONB NOT NULL DEFAULT '{}'::jsonb,
  auto_published_updates JSONB NOT NULL DEFAULT '[]'::jsonb,
  blocked_updates JSONB NOT NULL DEFAULT '[]'::jsonb,
  record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_audit_only',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_certificate_policy_auto_publish_runs_published
  ON public.certificate_template_policy_auto_publish_runs(publication_status, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_certificate_policy_auto_publish_runs_seed
  ON public.certificate_template_policy_auto_publish_runs(seed_version, as_of_date DESC);

ALTER TABLE public.certificate_template_policy_auto_publish_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS certificate_policy_auto_publish_runs_select_admin ON public.certificate_template_policy_auto_publish_runs;
CREATE POLICY certificate_policy_auto_publish_runs_select_admin ON public.certificate_template_policy_auto_publish_runs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.global_role = 'company_admin'
    )
  );

DROP POLICY IF EXISTS certificate_policy_auto_publish_runs_write_service_role ON public.certificate_template_policy_auto_publish_runs;
CREATE POLICY certificate_policy_auto_publish_runs_write_service_role ON public.certificate_template_policy_auto_publish_runs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.certificate_template_policy_auto_publish_runs IS
  'Backend-admin audit trail for trusted-source automatic publication of certificate template policy seed/profile updates.';

COMMENT ON COLUMN public.certificate_template_policy_auto_publish_runs.record_visibility_policy IS
  'Backend admin audit only; ordinary pre-certificate pages consume only published preview output.';

NOTIFY pgrst, 'reload schema';

COMMIT;
