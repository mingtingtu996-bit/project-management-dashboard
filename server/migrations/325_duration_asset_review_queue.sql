-- Durable review projection for non-automatic duration-learning asset decisions.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 325';
  END IF;
END
$$;

-- BEGIN MIGRATION 325
CREATE TABLE IF NOT EXISTS public.duration_asset_review_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_level TEXT NOT NULL CHECK (scope_level IN ('project','company','industry','global')),
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NULL,
  industry_key TEXT NULL,
  asset_key TEXT NOT NULL CHECK (asset_key IN ('base_duration_benchmark','standard_work_duration_seed','special_work_duration_seed','wbs_reference_days','dependency_rule_candidate','critical_path_rule_candidate')),
  artifact_key TEXT NOT NULL,
  review_kind TEXT NOT NULL CHECK (review_kind IN ('candidate_publication','stable_promotion')),
  decision_fingerprint TEXT NOT NULL CHECK (decision_fingerprint ~ '^[a-f0-9]{64}$'),
  source_key TEXT NOT NULL,
  proposal_key TEXT NULL,
  candidate_event_ref TEXT NULL,
  conflict_ref TEXT NULL,
  publication_key TEXT NULL,
  resolved_publication_key TEXT NULL,
  reason_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  review_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (pg_column_size(review_payload) <= 32768),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','approved','rejected','superseded','resolved_by_publication')),
  assigned_to_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  decision_reason TEXT NULL,
  resolution_source TEXT NULL CHECK (resolution_source IN ('automatic_publication','manual_approval','manual_rejection','manual_supersession')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_key),
  CHECK (NULLIF(BTRIM(source_key), '') IS NOT NULL),
  CHECK (
    (scope_level = 'project' AND company_id IS NOT NULL AND project_id IS NOT NULL AND industry_key IS NULL)
    OR (scope_level = 'company' AND company_id IS NOT NULL AND project_id IS NULL AND industry_key IS NULL)
    OR (scope_level = 'industry' AND company_id IS NULL AND project_id IS NULL AND NULLIF(BTRIM(industry_key), '') IS NOT NULL)
    OR (scope_level = 'global' AND company_id IS NULL AND project_id IS NULL AND industry_key IS NULL)
  ),
  CONSTRAINT duration_asset_review_items_resolution_state_check CHECK (
    (
      status = 'open'
      AND reviewed_by_user_id IS NULL
      AND reviewed_at IS NULL
      AND decision_reason IS NULL
      AND resolution_source IS NULL
      AND resolved_publication_key IS NULL
    )
    OR (
      status = 'approved' AND resolution_source = 'manual_approval'
      AND resolution_source IS NOT NULL
      AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL
      AND NULLIF(BTRIM(decision_reason), '') IS NOT NULL
      AND resolved_publication_key IS NULL
    )
    OR (
      status = 'rejected' AND resolution_source = 'manual_rejection'
      AND resolution_source IS NOT NULL
      AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL
      AND NULLIF(BTRIM(decision_reason), '') IS NOT NULL
      AND resolved_publication_key IS NULL
    )
    OR (
      status = 'superseded' AND resolution_source = 'manual_supersession'
      AND resolution_source IS NOT NULL
      AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL
      AND NULLIF(BTRIM(decision_reason), '') IS NOT NULL
      AND resolved_publication_key IS NULL
    )
    OR (
      status = 'resolved_by_publication'
      AND resolution_source IS NOT NULL
      AND resolution_source IN ('automatic_publication','manual_approval')
      AND reviewed_at IS NOT NULL
      AND NULLIF(BTRIM(decision_reason), '') IS NOT NULL
      AND NULLIF(BTRIM(resolved_publication_key), '') IS NOT NULL
      AND (
        (resolution_source = 'automatic_publication' AND reviewed_by_user_id IS NULL)
        OR (resolution_source = 'manual_approval' AND reviewed_by_user_id IS NOT NULL)
      )
    )
  ),
  FOREIGN KEY (project_id, company_id) REFERENCES public.projects(id, company_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_duration_asset_review_items_queue
  ON public.duration_asset_review_items (status, asset_key, scope_level, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_duration_asset_review_items_company_project
  ON public.duration_asset_review_items (company_id, project_id, status, updated_at DESC);

DROP TRIGGER IF EXISTS set_duration_asset_review_items_updated_at ON public.duration_asset_review_items;
CREATE TRIGGER set_duration_asset_review_items_updated_at
  BEFORE UPDATE ON public.duration_asset_review_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.duration_asset_review_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duration_asset_review_items FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.duration_asset_review_items FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.duration_asset_review_items FROM authenticated;
REVOKE ALL ON TABLE public.duration_asset_review_items FROM workbuddy_runtime;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.duration_asset_review_items FROM service_role';
  END IF;
END
$$;

GRANT SELECT ON TABLE public.duration_asset_review_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_asset_review_items TO workbuddy_runtime;

DROP POLICY IF EXISTS duration_asset_review_items_member_read
  ON public.duration_asset_review_items;
CREATE POLICY duration_asset_review_items_member_read
  ON public.duration_asset_review_items
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND duration_asset_review_items.scope_level IN ('company','project')
    AND duration_asset_review_items.company_id IS NOT NULL
    AND workbuddy_private.is_active_company_member(
      duration_asset_review_items.company_id,
      ARRAY['company_admin']::TEXT[]
    )
    AND (
      (
        duration_asset_review_items.scope_level = 'company'
        AND duration_asset_review_items.project_id IS NULL
      )
      OR (
        duration_asset_review_items.scope_level = 'project'
        AND duration_asset_review_items.project_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.projects project
          WHERE project.id = duration_asset_review_items.project_id
            AND project.company_id = duration_asset_review_items.company_id
        )
      )
    )
  );

DROP POLICY IF EXISTS duration_asset_review_items_backend_runtime
  ON public.duration_asset_review_items;
CREATE POLICY duration_asset_review_items_backend_runtime
  ON public.duration_asset_review_items
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

COMMENT ON TABLE public.duration_asset_review_items IS
  'Durable review projection for six duration-learning runtime asset families; payloads remain bounded and source authorities stay external.';

-- END MIGRATION 325
NOTIFY pgrst, 'reload schema';

COMMIT;
