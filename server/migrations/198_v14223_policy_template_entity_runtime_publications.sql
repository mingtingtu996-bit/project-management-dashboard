-- v1.4.22.3: policy-template entity runtime publication projection.
-- This is the template-entity runtime writer surface. It does not write algorithm seed tables.

BEGIN;

CREATE TABLE IF NOT EXISTS public.policy_template_entity_runtime_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_run_id TEXT NOT NULL,
  target_table TEXT NOT NULL
    CHECK (target_table IN (
      'certificate_template_policy_auto_publish_runs',
      'acceptance_template_policy_auto_publish_runs'
    )),
  runtime_source_table TEXT NOT NULL
    CHECK (runtime_source_table IN (
      'certificate_template_policy_auto_publish_runs',
      'acceptance_template_policy_auto_publish_runs'
    )),
  rollback_target TEXT NOT NULL,
  runtime_publication_status TEXT NOT NULL
    CHECK (runtime_publication_status = 'runtime_stable_published'),
  runtime_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  writes_template_runtime BOOLEAN NOT NULL DEFAULT true,
  writes_seed_runtime_directly BOOLEAN NOT NULL DEFAULT false,
  record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_governance_only',
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rolled_back_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT policy_template_entity_runtime_publications_runtime_boundary CHECK (
    writes_template_runtime = true
    AND writes_seed_runtime_directly = false
  )
);

CREATE INDEX IF NOT EXISTS idx_policy_template_entity_runtime_publications_run
  ON public.policy_template_entity_runtime_publications(source_run_id, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_policy_template_entity_runtime_publications_target
  ON public.policy_template_entity_runtime_publications(target_table, runtime_publication_status, published_at DESC);

ALTER TABLE public.policy_template_entity_runtime_publications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_template_entity_runtime_publications_select_admin
  ON public.policy_template_entity_runtime_publications;
CREATE POLICY policy_template_entity_runtime_publications_select_admin
  ON public.policy_template_entity_runtime_publications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.global_role = 'company_admin'
    )
  );

DROP POLICY IF EXISTS policy_template_entity_runtime_publications_write_service_role
  ON public.policy_template_entity_runtime_publications;
CREATE POLICY policy_template_entity_runtime_publications_write_service_role
  ON public.policy_template_entity_runtime_publications
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.policy_template_entity_runtime_publications IS
  'Backend-admin v1.4.22.3 template-entity runtime publication projection for stable certificate and acceptance policy auto-publish runs. It is separate from policy audit runs and never writes algorithm seed tables.';

COMMENT ON COLUMN public.policy_template_entity_runtime_publications.runtime_record IS
  'Stable certificate or acceptance policy auto-publish run record consumed by template preview/runtime readers after release-exit and PolicyOps stable gates pass.';

NOTIFY pgrst, 'reload schema';

COMMIT;
