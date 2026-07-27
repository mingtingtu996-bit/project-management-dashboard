-- Durable, tenant-authoritative evidence handoff for committed duration-learning consumers.

BEGIN;

CREATE TABLE IF NOT EXISTS public.duration_learning_runtime_evidence_outbox (
  event_key TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL,
  subject_id UUID NOT NULL,
  asset_key TEXT,
  publication_key TEXT,
  artifact_key TEXT,
  scope_level TEXT,
  industry_key TEXT,
  input_subject_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  input_task_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  last_error TEXT,
  completed_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  cancellation_scope_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT duration_learning_runtime_evidence_outbox_event_type_check
    CHECK (event_type IN ('duration_prediction', 'wbs_candidate')),
  CONSTRAINT duration_learning_runtime_evidence_outbox_subject_type_check
    CHECK (subject_type IN ('task', 'baseline_item')),
  CONSTRAINT duration_learning_runtime_evidence_outbox_scope_level_check
    CHECK (scope_level IS NULL OR scope_level IN ('project', 'company', 'industry', 'global')),
  CONSTRAINT duration_learning_runtime_evidence_outbox_payload_check
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT duration_learning_runtime_evidence_outbox_input_subjects_check
    CHECK (jsonb_typeof(input_subject_ids) = 'array'),
  CONSTRAINT duration_learning_runtime_evidence_outbox_input_tasks_check
    CHECK (jsonb_typeof(input_task_ids) = 'array'),
  CONSTRAINT duration_learning_runtime_evidence_outbox_status_check
    CHECK (processing_status IN ('pending', 'processing', 'failed', 'completed', 'cancelled')),
  CONSTRAINT duration_learning_runtime_evidence_outbox_attempt_check
    CHECK (attempt_count >= 0),
  CONSTRAINT duration_learning_runtime_evidence_outbox_lease_check
    CHECK (
      (processing_status = 'processing' AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
      OR (processing_status <> 'processing' AND lease_owner IS NULL AND lease_expires_at IS NULL)
    ),
  CONSTRAINT duration_learning_runtime_evidence_outbox_completion_check
    CHECK (
      (processing_status = 'completed' AND completed_at IS NOT NULL)
      OR (processing_status <> 'completed' AND completed_at IS NULL)
    ),
  CONSTRAINT duration_learning_runtime_evidence_outbox_cancellation_check
    CHECK (
      (processing_status = 'cancelled' AND cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL)
      OR (processing_status <> 'cancelled' AND cancelled_at IS NULL AND cancellation_reason IS NULL)
    ),
  CONSTRAINT duration_learning_runtime_evidence_outbox_cancellation_snapshot_check
    CHECK (jsonb_typeof(cancellation_scope_snapshot) = 'object'),
  CONSTRAINT duration_learning_runtime_evidence_outbox_event_contract_check
    CHECK (
      input_subject_ids ? subject_id::text
      AND (
        (
          event_type = 'duration_prediction'
          AND subject_type = 'task'
          AND asset_key IS NOT NULL
          AND publication_key IS NOT NULL
          AND artifact_key IS NOT NULL
          AND scope_level IS NOT NULL
          AND (scope_level <> 'industry' OR NULLIF(industry_key, '') IS NOT NULL)
          AND input_task_ids ? subject_id::text
          AND NULLIF(COALESCE(
            payload ->> 'generationBatchId',
            payload ->> 'generation_batch_id'
          ), '') IS NOT NULL
        )
        OR (
          event_type = 'wbs_candidate'
          AND (
            (
              asset_key IS NULL
              AND publication_key IS NULL
              AND artifact_key IS NULL
              AND scope_level IS NULL
              AND industry_key IS NULL
              AND input_task_ids = '[]'::jsonb
              AND COALESCE(payload ->> 'lineageResolution', '') IN (
                'no_runtime_publication_lineage',
                'no_trusted_consumption',
                'missing_generation_batch_id'
              )
              AND (
                payload -> 'authoritativeRuntimeLineage' IS NULL
                OR payload -> 'authoritativeRuntimeLineage' = 'null'::jsonb
              )
              AND COALESCE(jsonb_array_length(
                CASE WHEN jsonb_typeof(payload -> 'authoritativeRuntimeLineages') = 'array'
                  THEN payload -> 'authoritativeRuntimeLineages' ELSE '[]'::jsonb END
              ), 0) = 0
            )
            OR (
              asset_key = 'special_work_duration_seed'
              AND publication_key IS NOT NULL
              AND artifact_key IS NOT NULL
              AND scope_level IS NOT NULL
              AND (scope_level <> 'industry' OR NULLIF(industry_key, '') IS NOT NULL)
              AND NULLIF(COALESCE(
                payload ->> 'generationBatchId',
                payload ->> 'generation_batch_id'
              ), '') IS NOT NULL
              AND payload ->> 'lineageResolution' = 'physical_runtime_consumption'
              AND jsonb_typeof(payload -> 'authoritativeRuntimeLineage') = 'object'
              AND jsonb_typeof(payload -> 'authoritativeRuntimeLineages') = 'array'
              AND jsonb_array_length(payload -> 'authoritativeRuntimeLineages') = 1
              AND jsonb_typeof(payload -> 'runtimeConsumptionKeys') = 'array'
              AND jsonb_array_length(payload -> 'runtimeConsumptionKeys') > 0
              AND jsonb_typeof(payload -> 'runtimeSourceEvidenceRefs') = 'array'
              AND (
                (subject_type = 'task' AND input_task_ids <> '[]'::jsonb)
                OR (subject_type = 'baseline_item' AND input_task_ids = '[]'::jsonb)
              )
            )
          )
        )
      )
    )
);

-- CREATE TABLE IF NOT EXISTS does not replace an older constraint when a
-- partially applied migration is retried, so install the exact two-state WBS
-- contract explicitly as well.
ALTER TABLE public.duration_learning_runtime_evidence_outbox
  DROP CONSTRAINT IF EXISTS duration_learning_runtime_evidence_outbox_event_contract_check;
ALTER TABLE public.duration_learning_runtime_evidence_outbox
  ADD CONSTRAINT duration_learning_runtime_evidence_outbox_event_contract_check
  CHECK (
    input_subject_ids ? subject_id::text
    AND (
      (
        event_type = 'duration_prediction'
        AND subject_type = 'task'
        AND asset_key IS NOT NULL
        AND publication_key IS NOT NULL
        AND artifact_key IS NOT NULL
        AND scope_level IS NOT NULL
        AND (scope_level <> 'industry' OR NULLIF(industry_key, '') IS NOT NULL)
        AND input_task_ids ? subject_id::text
        AND NULLIF(COALESCE(
          payload ->> 'generationBatchId',
          payload ->> 'generation_batch_id'
        ), '') IS NOT NULL
      )
      OR (
        event_type = 'wbs_candidate'
        AND (
          (
            asset_key IS NULL
            AND publication_key IS NULL
            AND artifact_key IS NULL
            AND scope_level IS NULL
            AND industry_key IS NULL
            AND input_task_ids = '[]'::jsonb
            AND COALESCE(payload ->> 'lineageResolution', '') IN (
              'no_runtime_publication_lineage',
              'no_trusted_consumption',
              'missing_generation_batch_id'
            )
            AND (
              payload -> 'authoritativeRuntimeLineage' IS NULL
              OR payload -> 'authoritativeRuntimeLineage' = 'null'::jsonb
            )
            AND COALESCE(jsonb_array_length(
              CASE WHEN jsonb_typeof(payload -> 'authoritativeRuntimeLineages') = 'array'
                THEN payload -> 'authoritativeRuntimeLineages' ELSE '[]'::jsonb END
            ), 0) = 0
          )
          OR (
            asset_key = 'special_work_duration_seed'
            AND publication_key IS NOT NULL
            AND artifact_key IS NOT NULL
            AND scope_level IS NOT NULL
            AND (scope_level <> 'industry' OR NULLIF(industry_key, '') IS NOT NULL)
            AND NULLIF(COALESCE(
              payload ->> 'generationBatchId',
              payload ->> 'generation_batch_id'
            ), '') IS NOT NULL
            AND payload ->> 'lineageResolution' = 'physical_runtime_consumption'
            AND jsonb_typeof(payload -> 'authoritativeRuntimeLineage') = 'object'
            AND jsonb_typeof(payload -> 'authoritativeRuntimeLineages') = 'array'
            AND jsonb_array_length(payload -> 'authoritativeRuntimeLineages') = 1
            AND jsonb_typeof(payload -> 'runtimeConsumptionKeys') = 'array'
            AND jsonb_array_length(payload -> 'runtimeConsumptionKeys') > 0
            AND jsonb_typeof(payload -> 'runtimeSourceEvidenceRefs') = 'array'
            AND (
              (subject_type = 'task' AND input_task_ids <> '[]'::jsonb)
              OR (subject_type = 'baseline_item' AND input_task_ids = '[]'::jsonb)
            )
          )
        )
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_duration_learning_runtime_evidence_outbox_claim
  ON public.duration_learning_runtime_evidence_outbox (
    processing_status,
    next_attempt_at,
    attempt_count,
    created_at,
    event_key
  );

CREATE INDEX IF NOT EXISTS idx_duration_learning_runtime_evidence_outbox_expired_lease
  ON public.duration_learning_runtime_evidence_outbox (lease_expires_at, event_key)
  WHERE processing_status = 'processing';

CREATE INDEX IF NOT EXISTS idx_duration_learning_runtime_evidence_outbox_project
  ON public.duration_learning_runtime_evidence_outbox (company_id, project_id, created_at, event_key);

CREATE INDEX IF NOT EXISTS idx_duration_learning_runtime_evidence_outbox_publication
  ON public.duration_learning_runtime_evidence_outbox (publication_key, artifact_key, created_at)
  WHERE publication_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.duration_learning_runtime_evidence_outbox_tombstones (
  event_key TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  company_id UUID NOT NULL,
  project_id UUID NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id UUID NOT NULL,
  asset_key TEXT,
  publication_key TEXT,
  artifact_key TEXT,
  scope_level TEXT,
  industry_key TEXT,
  input_subject_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  input_task_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL,
  scope_snapshot JSONB NOT NULL,
  cancellation_reason TEXT NOT NULL,
  cancelled_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT duration_learning_runtime_evidence_outbox_tombstone_payload_check
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT duration_learning_runtime_evidence_outbox_tombstone_scope_check
    CHECK (jsonb_typeof(scope_snapshot) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_duration_learning_runtime_evidence_outbox_tombstones_scope
  ON public.duration_learning_runtime_evidence_outbox_tombstones (company_id, project_id, cancelled_at, event_key);

CREATE OR REPLACE FUNCTION public.archive_duration_learning_runtime_evidence_outbox_tombstone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF OLD.processing_status IN ('pending', 'processing', 'failed', 'cancelled') THEN
    INSERT INTO public.duration_learning_runtime_evidence_outbox_tombstones (
      event_key, event_type, company_id, project_id, subject_type, subject_id,
      asset_key, publication_key, artifact_key, scope_level, industry_key,
      input_subject_ids, input_task_ids, payload, scope_snapshot,
      cancellation_reason, cancelled_at
    )
    VALUES (
      OLD.event_key, OLD.event_type, OLD.company_id, OLD.project_id, OLD.subject_type, OLD.subject_id,
      OLD.asset_key, OLD.publication_key, OLD.artifact_key, OLD.scope_level, OLD.industry_key,
       OLD.input_subject_ids, OLD.input_task_ids, OLD.payload,
       COALESCE(NULLIF(OLD.cancellation_scope_snapshot, '{}'::jsonb), jsonb_build_object(
         'eventKey', OLD.event_key,
         'companyId', OLD.company_id::text,
         'projectId', OLD.project_id::text,
        'subjectType', OLD.subject_type,
        'subjectId', OLD.subject_id::text,
        'assetKey', OLD.asset_key,
        'publicationKey', OLD.publication_key,
        'artifactKey', OLD.artifact_key,
        'scopeLevel', OLD.scope_level,
        'industryKey', OLD.industry_key,
        'inputSubjectIds', OLD.input_subject_ids,
         'inputTaskIds', OLD.input_task_ids,
         'generationBatchId', COALESCE(OLD.payload ->> 'generationBatchId', OLD.payload ->> 'generation_batch_id'),
         'payload', OLD.payload,
         'reason', COALESCE(NULLIF(OLD.cancellation_reason, ''), 'source_deleted'),
         'cancelledAt', COALESCE(OLD.cancelled_at, now())::text
       )),
      COALESCE(NULLIF(OLD.cancellation_reason, ''), 'source_deleted'),
      COALESCE(OLD.cancelled_at, now())
    )
    ON CONFLICT (event_key) DO NOTHING;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS duration_learning_runtime_evidence_outbox_tombstone_on_delete
  ON public.duration_learning_runtime_evidence_outbox;
CREATE TRIGGER duration_learning_runtime_evidence_outbox_tombstone_on_delete
  BEFORE DELETE ON public.duration_learning_runtime_evidence_outbox
  FOR EACH ROW
  EXECUTE FUNCTION public.archive_duration_learning_runtime_evidence_outbox_tombstone();

CREATE OR REPLACE FUNCTION public.cancel_duration_learning_runtime_evidence_before_subject_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_subject_type TEXT := CASE
    WHEN TG_TABLE_NAME = 'tasks' THEN 'task'
    WHEN TG_TABLE_NAME = 'task_baseline_items' THEN 'baseline_item'
    ELSE NULL
  END;
  v_reason TEXT := CASE
    WHEN TG_TABLE_NAME = 'tasks' THEN 'task_deleted'
    WHEN TG_TABLE_NAME = 'task_baseline_items' THEN 'baseline_item_replaced'
    ELSE 'source_subject_deleted'
  END;
BEGIN
  IF TG_TABLE_NAME NOT IN ('tasks', 'task_baseline_items') OR v_subject_type IS NULL OR OLD.project_id IS NULL THEN
    RETURN OLD;
  END IF;

  UPDATE public.duration_learning_runtime_evidence_outbox outbox
     SET processing_status = 'cancelled',
         cancellation_reason = v_reason,
         cancelled_at = now(),
         lease_owner = NULL,
         lease_expires_at = NULL,
         cancellation_scope_snapshot = jsonb_build_object(
           'companyId', project.company_id::text,
           'projectId', OLD.project_id::text,
        'subjectType', outbox.subject_type,
        'subjectId', outbox.subject_id::text,
        'deletedSubjectType', v_subject_type,
           'deletedSubjectId', OLD.id::text,
           'eventKey', outbox.event_key,
           'assetKey', outbox.asset_key,
           'publicationKey', outbox.publication_key,
           'artifactKey', outbox.artifact_key,
           'scopeLevel', outbox.scope_level,
           'industryKey', outbox.industry_key,
            'inputSubjectIds', outbox.input_subject_ids,
            'inputTaskIds', outbox.input_task_ids,
            'generationBatchId', COALESCE(outbox.payload ->> 'generationBatchId', outbox.payload ->> 'generation_batch_id'),
            'payload', outbox.payload,
            'reason', v_reason,
            'cancelledAt', now()::text
          ),
         updated_at = now()
    FROM public.projects project
   WHERE project.id = OLD.project_id
     AND outbox.project_id = OLD.project_id
      AND outbox.processing_status IN ('pending', 'processing', 'failed', 'cancelled')
      AND outbox.subject_type = v_subject_type
      AND (
        outbox.subject_id = OLD.id
        OR outbox.input_subject_ids ? OLD.id::text
      );

  DELETE FROM public.duration_learning_runtime_evidence_outbox outbox
    WHERE outbox.project_id = OLD.project_id
      AND outbox.processing_status = 'cancelled'
      AND outbox.cancellation_reason = v_reason
      AND outbox.subject_type = v_subject_type
      AND (
        outbox.subject_id = OLD.id
        OR outbox.input_subject_ids ? OLD.id::text
      );

  RETURN OLD;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    ALTER FUNCTION public.archive_duration_learning_runtime_evidence_outbox_tombstone()
      OWNER TO service_role;
    ALTER FUNCTION public.cancel_duration_learning_runtime_evidence_before_subject_delete()
      OWNER TO service_role;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.archive_duration_learning_runtime_evidence_outbox_tombstone() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_duration_learning_runtime_evidence_outbox_tombstone()
  TO workbuddy_runtime, service_role;
REVOKE ALL ON FUNCTION public.cancel_duration_learning_runtime_evidence_before_subject_delete() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_duration_learning_runtime_evidence_before_subject_delete()
  TO workbuddy_runtime, service_role;

DROP TRIGGER IF EXISTS duration_learning_runtime_evidence_outbox_cancel_task_on_delete
  ON public.tasks;
CREATE TRIGGER duration_learning_runtime_evidence_outbox_cancel_task_on_delete
  BEFORE DELETE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.cancel_duration_learning_runtime_evidence_before_subject_delete();

DROP TRIGGER IF EXISTS duration_learning_runtime_evidence_outbox_cancel_baseline_item_on_delete
  ON public.task_baseline_items;
CREATE TRIGGER duration_learning_runtime_evidence_outbox_cancel_baseline_item_on_delete
  BEFORE DELETE ON public.task_baseline_items
  FOR EACH ROW
  EXECUTE FUNCTION public.cancel_duration_learning_runtime_evidence_before_subject_delete();

ALTER TABLE public.duration_learning_runtime_evidence_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duration_learning_runtime_evidence_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE public.duration_learning_runtime_evidence_outbox_tombstones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duration_learning_runtime_evidence_outbox_tombstones FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.duration_learning_runtime_evidence_outbox FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.duration_learning_runtime_evidence_outbox
  TO workbuddy_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_learning_runtime_evidence_outbox
  TO service_role;
REVOKE ALL ON TABLE public.duration_learning_runtime_evidence_outbox_tombstones FROM PUBLIC;
-- Tombstones are an archive/readback boundary. The application has no established
-- tenant GUC contract, so keep archive reads service_role-only rather than
-- pretending that an unset session setting provides tenant isolation.
GRANT SELECT ON TABLE public.duration_learning_runtime_evidence_outbox_tombstones
  TO service_role;
REVOKE INSERT ON TABLE public.duration_learning_runtime_evidence_outbox_tombstones
  FROM workbuddy_runtime;
GRANT INSERT ON TABLE public.duration_learning_runtime_evidence_outbox_tombstones
  TO service_role;

-- Migration 315 granted workbuddy_runtime direct append authority. Tighten that
-- existing policy so a physical row is trusted only when it carries the exact
-- canonical publication marker and resolver authority contract.
DROP POLICY IF EXISTS duration_learning_runtime_consumptions_backend_runtime_insert
  ON public.duration_learning_runtime_consumptions;
CREATE POLICY duration_learning_runtime_consumptions_backend_runtime_insert
  ON public.duration_learning_runtime_consumptions
  FOR INSERT
  TO workbuddy_runtime
  WITH CHECK (
    (
      current_user = 'workbuddy_runtime'
      OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
    )
    AND jsonb_typeof(duration_learning_runtime_consumptions.source_evidence_refs) = 'array'
    AND duration_learning_runtime_consumptions.source_evidence_refs ? (
      'duration_learning_runtime_publications:'
      || duration_learning_runtime_consumptions.publication_key
    )
    AND jsonb_typeof(duration_learning_runtime_consumptions.consumption_context) = 'object'
    AND duration_learning_runtime_consumptions.consumption_context ->> 'authoritySource'
          = 'runtime_resolver_publication_set'
    AND EXISTS (
      SELECT 1
      FROM public.projects project
      WHERE project.id = duration_learning_runtime_consumptions.project_id
        AND project.company_id = duration_learning_runtime_consumptions.company_id
    )
    AND (
      (
        duration_learning_runtime_consumptions.task_id IS NOT NULL
        AND duration_learning_runtime_consumptions.baseline_item_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.tasks task
          WHERE task.id = duration_learning_runtime_consumptions.task_id
            AND task.project_id = duration_learning_runtime_consumptions.project_id
        )
      )
      OR (
        duration_learning_runtime_consumptions.task_id IS NULL
        AND duration_learning_runtime_consumptions.baseline_item_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.task_baseline_items baseline_item
          WHERE baseline_item.id = duration_learning_runtime_consumptions.baseline_item_id
            AND baseline_item.project_id = duration_learning_runtime_consumptions.project_id
        )
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.duration_learning_runtime_publications publication
      WHERE publication.publication_key = duration_learning_runtime_consumptions.publication_key
        AND publication.asset_key = duration_learning_runtime_consumptions.asset_key
        AND publication.artifact_key = duration_learning_runtime_consumptions.artifact_key
        AND (
          (
            publication.publication_stage = 'canary'
            AND publication.monitoring_status IN ('pending', 'collecting', 'passed')
          )
          OR (
            publication.publication_stage = 'stable'
            AND publication.monitoring_status = 'passed'
          )
        )
        AND (
          (
            publication.scope_level = 'project'
            AND publication.company_id = duration_learning_runtime_consumptions.company_id
            AND publication.project_id = duration_learning_runtime_consumptions.project_id
            AND publication.industry_key IS NULL
          )
          OR (
            publication.scope_level = 'company'
            AND publication.company_id = duration_learning_runtime_consumptions.company_id
            AND publication.project_id IS NULL
            AND publication.industry_key IS NULL
          )
          OR (
            publication.scope_level = 'industry'
            AND publication.company_id IS NULL
            AND publication.project_id IS NULL
            AND publication.industry_key = NULLIF(
              duration_learning_runtime_consumptions.consumption_context ->> 'industryKey',
              ''
            )
          )
          OR (
            publication.scope_level = 'global'
            AND publication.company_id IS NULL
            AND publication.project_id IS NULL
            AND publication.industry_key IS NULL
          )
        )
    )
  );

COMMENT ON POLICY duration_learning_runtime_consumptions_backend_runtime_insert
  ON public.duration_learning_runtime_consumptions IS
  'Backend runtime append authority requires exact canonical publication source refs and resolver-owned consumption context.';

-- Shared database authority predicate for outbox INSERT, worker claim and
-- completion.  It deliberately reads the physical consumption rows instead of
-- trusting payload markers supplied by a caller.
CREATE OR REPLACE FUNCTION public.duration_learning_runtime_evidence_outbox_row_is_authorized(
  p_event_type TEXT,
  p_company_id UUID,
  p_project_id UUID,
  p_subject_type TEXT,
  p_subject_id UUID,
  p_asset_key TEXT,
  p_publication_key TEXT,
  p_artifact_key TEXT,
  p_scope_level TEXT,
  p_industry_key TEXT,
  p_input_subject_ids JSONB,
  p_input_task_ids JSONB,
  p_payload JSONB
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
WITH normalized AS (
  SELECT
    p_event_type AS event_type,
    p_company_id AS company_id,
    p_project_id AS project_id,
    p_subject_type AS subject_type,
    p_subject_id AS subject_id,
    p_asset_key AS asset_key,
    p_publication_key AS publication_key,
    p_artifact_key AS artifact_key,
    p_scope_level AS scope_level,
    p_industry_key AS industry_key,
    CASE WHEN jsonb_typeof(COALESCE(p_input_subject_ids, '[]'::jsonb)) = 'array'
      THEN COALESCE(p_input_subject_ids, '[]'::jsonb) ELSE '[]'::jsonb END AS input_subject_ids,
    CASE WHEN jsonb_typeof(COALESCE(p_input_task_ids, '[]'::jsonb)) = 'array'
      THEN COALESCE(p_input_task_ids, '[]'::jsonb) ELSE '[]'::jsonb END AS input_task_ids,
    CASE WHEN jsonb_typeof(COALESCE(p_payload, '{}'::jsonb)) = 'object'
      THEN COALESCE(p_payload, '{}'::jsonb) ELSE '{}'::jsonb END AS payload,
    NULLIF(COALESCE(
      p_payload ->> 'generationBatchId',
      p_payload ->> 'generation_batch_id'
    ), '') AS generation_batch_id
), top_publication AS (
  SELECT publication.*
    FROM public.duration_learning_runtime_publications publication
    CROSS JOIN normalized
   WHERE normalized.event_type = 'wbs_candidate'
     AND publication.publication_key = normalized.publication_key
     AND publication.asset_key = normalized.asset_key
     AND publication.artifact_key = normalized.artifact_key
     AND publication.scope_level = normalized.scope_level
     AND (
       (publication.publication_stage = 'canary' AND publication.monitoring_status IN ('pending', 'collecting', 'passed'))
       OR (publication.publication_stage = 'stable' AND publication.monitoring_status = 'passed')
     )
     AND (
       (publication.scope_level = 'project'
        AND publication.company_id = normalized.company_id
        AND publication.project_id = normalized.project_id
        AND publication.industry_key IS NULL
        AND normalized.industry_key IS NULL)
       OR (publication.scope_level = 'company'
        AND publication.company_id = normalized.company_id
        AND publication.project_id IS NULL
        AND publication.industry_key IS NULL
        AND normalized.industry_key IS NULL)
       OR (publication.scope_level = 'industry'
        AND publication.company_id IS NULL
        AND publication.project_id IS NULL
        AND publication.industry_key = normalized.industry_key
        AND NULLIF(normalized.industry_key, '') IS NOT NULL)
       OR (publication.scope_level = 'global'
        AND publication.company_id IS NULL
        AND publication.project_id IS NULL
        AND publication.industry_key IS NULL
        AND normalized.industry_key IS NULL)
     )
), wbs_keys AS (
  SELECT normalized.*,
         CASE WHEN jsonb_typeof(normalized.payload -> 'runtimeConsumptionKeys') = 'array'
           THEN normalized.payload -> 'runtimeConsumptionKeys' ELSE '[]'::jsonb END AS consumption_keys
    FROM normalized
), wbs_physical AS (
  SELECT consumption.*
    FROM public.duration_learning_runtime_consumptions consumption
    JOIN public.duration_learning_runtime_publications publication
      ON publication.publication_key = consumption.publication_key
     AND publication.asset_key = consumption.asset_key
     AND publication.artifact_key = consumption.artifact_key
    CROSS JOIN wbs_keys
   WHERE wbs_keys.event_type = 'wbs_candidate'
     AND wbs_keys.asset_key = 'special_work_duration_seed'
     AND consumption.consumption_key IN (
       SELECT jsonb_array_elements_text(wbs_keys.consumption_keys)
     )
     AND consumption.company_id = wbs_keys.company_id
     AND consumption.project_id = wbs_keys.project_id
     AND consumption.publication_key = wbs_keys.publication_key
     AND consumption.asset_key = wbs_keys.asset_key
     AND consumption.artifact_key = wbs_keys.artifact_key
     AND consumption.generation_batch_id = wbs_keys.generation_batch_id
     AND consumption.source_evidence_refs ? (
       'duration_learning_runtime_publications:' || consumption.publication_key
     )
     AND consumption.consumption_context ->> 'authoritySource'
       = 'runtime_resolver_publication_set'
     AND (
       (wbs_keys.subject_type = 'task'
        AND consumption.task_id IS NOT NULL
        AND consumption.baseline_item_id IS NULL)
       OR (wbs_keys.subject_type = 'baseline_item'
        AND consumption.task_id IS NULL
        AND consumption.baseline_item_id IS NOT NULL)
     )
     AND (
       (publication.publication_stage = 'canary' AND publication.monitoring_status IN ('pending', 'collecting', 'passed'))
       OR (publication.publication_stage = 'stable' AND publication.monitoring_status = 'passed')
     )
     AND (
       (publication.scope_level = 'project'
        AND publication.company_id = consumption.company_id
        AND publication.project_id = consumption.project_id
        AND publication.industry_key IS NULL
        AND wbs_keys.industry_key IS NULL)
       OR (publication.scope_level = 'company'
        AND publication.company_id = consumption.company_id
        AND publication.project_id IS NULL
        AND publication.industry_key IS NULL
        AND wbs_keys.industry_key IS NULL)
       OR (publication.scope_level = 'industry'
        AND publication.company_id IS NULL
        AND publication.project_id IS NULL
        AND publication.industry_key = wbs_keys.industry_key
        AND consumption.consumption_context ->> 'industryKey' = wbs_keys.industry_key)
       OR (publication.scope_level = 'global'
        AND publication.company_id IS NULL
        AND publication.project_id IS NULL
        AND publication.industry_key IS NULL
        AND wbs_keys.industry_key IS NULL)
     )
), wbs_authority AS (
  SELECT normalized.*,
         top_publication.publication_key AS safe_publication_key,
         COUNT(wbs_physical.consumption_key)::INTEGER AS physical_count,
         COUNT(DISTINCT COALESCE(wbs_physical.task_id, wbs_physical.baseline_item_id))::INTEGER AS physical_subject_count,
         COUNT(DISTINCT wbs_physical.consumption_key)::INTEGER AS physical_key_count
    FROM normalized
    LEFT JOIN top_publication ON TRUE
    LEFT JOIN wbs_physical ON TRUE
   GROUP BY normalized.event_type, normalized.company_id, normalized.project_id,
            normalized.subject_type, normalized.subject_id, normalized.asset_key,
            normalized.publication_key, normalized.artifact_key, normalized.scope_level,
            normalized.industry_key, normalized.input_subject_ids, normalized.input_task_ids,
            normalized.payload, normalized.generation_batch_id, top_publication.publication_key
), prediction_applications AS (
  SELECT normalized.*,
         application.value AS application
    FROM normalized
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(normalized.payload -> 'runtimeApplications') = 'array'
        THEN normalized.payload -> 'runtimeApplications' ELSE '[]'::jsonb END
    ) application
), prediction_application_failures AS (
  SELECT applications.*
    FROM prediction_applications applications
   WHERE jsonb_typeof(applications.application) <> 'object'
      OR NULLIF(applications.application ->> 'assetKey', '') IS NULL
      OR NULLIF(applications.application ->> 'publicationKey', '') IS NULL
      OR NULLIF(applications.application ->> 'artifactKey', '') IS NULL
      OR NULLIF(applications.application ->> 'scopeLevel', '') IS NULL
      OR jsonb_typeof(applications.application -> 'inputTaskIds') <> 'array'
      OR NOT (applications.application -> 'inputTaskIds') ? applications.subject_id::text
      OR NOT EXISTS (
        SELECT 1
          FROM public.duration_learning_runtime_consumptions consumption
          JOIN public.duration_learning_runtime_publications publication
            ON publication.publication_key = consumption.publication_key
           AND publication.asset_key = consumption.asset_key
           AND publication.artifact_key = consumption.artifact_key
         WHERE consumption.company_id = applications.company_id
           AND consumption.project_id = applications.project_id
           AND consumption.task_id::text IN (
             SELECT jsonb_array_elements_text(applications.application -> 'inputTaskIds')
           )
           AND consumption.generation_batch_id = applications.generation_batch_id
           AND consumption.publication_key = applications.application ->> 'publicationKey'
           AND consumption.asset_key = applications.application ->> 'assetKey'
           AND consumption.artifact_key = applications.application ->> 'artifactKey'
           AND consumption.source_evidence_refs ? (
             'duration_learning_runtime_publications:' || consumption.publication_key
           )
           AND consumption.consumption_context ->> 'authoritySource'
             = 'runtime_resolver_publication_set'
           AND (
             (publication.publication_stage = 'canary' AND publication.monitoring_status IN ('pending', 'collecting', 'passed'))
             OR (publication.publication_stage = 'stable' AND publication.monitoring_status = 'passed')
           )
           AND publication.scope_level = applications.application ->> 'scopeLevel'
           AND (
             (publication.scope_level = 'project'
              AND publication.company_id = applications.company_id
              AND publication.project_id = applications.project_id
              AND publication.industry_key IS NULL
              AND NULLIF(applications.application ->> 'industryKey', '') IS NULL)
             OR (publication.scope_level = 'company'
              AND publication.company_id = applications.company_id
              AND publication.project_id IS NULL
              AND publication.industry_key IS NULL
              AND NULLIF(applications.application ->> 'industryKey', '') IS NULL)
             OR (publication.scope_level = 'industry'
              AND publication.company_id IS NULL
              AND publication.project_id IS NULL
              AND publication.industry_key = NULLIF(applications.application ->> 'industryKey', '')
              AND consumption.consumption_context ->> 'industryKey' = publication.industry_key)
             OR (publication.scope_level = 'global'
              AND publication.company_id IS NULL
              AND publication.project_id IS NULL
              AND publication.industry_key IS NULL
              AND NULLIF(applications.application ->> 'industryKey', '') IS NULL)
           )
      )
      OR (
        SELECT COUNT(*)
          FROM public.duration_learning_runtime_consumptions consumption
          JOIN public.duration_learning_runtime_publications publication
            ON publication.publication_key = consumption.publication_key
           AND publication.asset_key = consumption.asset_key
           AND publication.artifact_key = consumption.artifact_key
         WHERE consumption.company_id = applications.company_id
           AND consumption.project_id = applications.project_id
           AND consumption.task_id::text IN (
             SELECT jsonb_array_elements_text(applications.application -> 'inputTaskIds')
           )
           AND consumption.generation_batch_id = applications.generation_batch_id
           AND consumption.publication_key = applications.application ->> 'publicationKey'
           AND consumption.asset_key = applications.application ->> 'assetKey'
           AND consumption.artifact_key = applications.application ->> 'artifactKey'
           AND consumption.source_evidence_refs ? ('duration_learning_runtime_publications:' || consumption.publication_key)
           AND consumption.consumption_context ->> 'authoritySource' = 'runtime_resolver_publication_set'
       ) <> jsonb_array_length(applications.application -> 'inputTaskIds')
  )
)
SELECT EXISTS (
  SELECT 1
    FROM public.projects project
   CROSS JOIN normalized
   WHERE project.id = normalized.project_id
     AND project.company_id = normalized.company_id
)
AND (
  (
    normalized.subject_type = 'task'
    AND EXISTS (
      SELECT 1 FROM public.tasks task
       WHERE task.id = normalized.subject_id
         AND task.project_id = normalized.project_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(normalized.input_subject_ids) input_subject(subject_id)
       WHERE NOT EXISTS (
         SELECT 1 FROM public.tasks task
          WHERE task.id::text = input_subject.subject_id
            AND task.project_id = normalized.project_id
       )
    )
  )
  OR (
    normalized.subject_type = 'baseline_item'
    AND EXISTS (
      SELECT 1 FROM public.task_baseline_items baseline_item
       WHERE baseline_item.id = normalized.subject_id
         AND baseline_item.project_id = normalized.project_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(normalized.input_subject_ids) input_subject(subject_id)
       WHERE NOT EXISTS (
         SELECT 1 FROM public.task_baseline_items baseline_item
          WHERE baseline_item.id::text = input_subject.subject_id
            AND baseline_item.project_id = normalized.project_id
       )
    )
  )
)
AND CASE
  WHEN normalized.event_type = 'wbs_candidate' THEN
    (
      normalized.asset_key IS NULL
      AND normalized.publication_key IS NULL
      AND normalized.artifact_key IS NULL
      AND normalized.scope_level IS NULL
      AND normalized.industry_key IS NULL
      AND normalized.input_task_ids = '[]'::jsonb
      AND COALESCE(normalized.payload ->> 'lineageResolution', '') IN (
        'no_runtime_publication_lineage', 'no_trusted_consumption', 'missing_generation_batch_id'
      )
      AND (normalized.payload -> 'authoritativeRuntimeLineage' IS NULL
        OR normalized.payload -> 'authoritativeRuntimeLineage' = 'null'::jsonb)
      AND COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(normalized.payload -> 'authoritativeRuntimeLineages') = 'array'
        THEN normalized.payload -> 'authoritativeRuntimeLineages' ELSE '[]'::jsonb END), 0) = 0
      AND COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(normalized.payload -> 'runtimeConsumptionKeys') = 'array'
        THEN normalized.payload -> 'runtimeConsumptionKeys' ELSE '[]'::jsonb END), 0) = 0
      AND COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(normalized.payload -> 'runtimeSourceEvidenceRefs') = 'array'
        THEN normalized.payload -> 'runtimeSourceEvidenceRefs' ELSE '[]'::jsonb END), 0) = 0
    )
    OR (
      normalized.asset_key = 'special_work_duration_seed'
      AND normalized.publication_key IS NOT NULL
      AND normalized.artifact_key IS NOT NULL
      AND normalized.scope_level IS NOT NULL
      AND (normalized.scope_level <> 'industry' OR NULLIF(normalized.industry_key, '') IS NOT NULL)
      AND normalized.generation_batch_id IS NOT NULL
      AND normalized.input_subject_ids <> '[]'::jsonb
      AND normalized.payload ->> 'lineageResolution' = 'physical_runtime_consumption'
      AND jsonb_typeof(normalized.payload -> 'authoritativeRuntimeLineage') = 'object'
      AND normalized.payload -> 'authoritativeRuntimeLineage' ->> 'assetKey' = normalized.asset_key
      AND normalized.payload -> 'authoritativeRuntimeLineage' ->> 'publicationKey' = normalized.publication_key
      AND normalized.payload -> 'authoritativeRuntimeLineage' ->> 'artifactKey' = normalized.artifact_key
      AND normalized.payload -> 'authoritativeRuntimeLineage' ->> 'scopeLevel' = normalized.scope_level
      AND jsonb_typeof(normalized.payload -> 'authoritativeRuntimeLineages') = 'array'
      AND jsonb_array_length(normalized.payload -> 'authoritativeRuntimeLineages') = 1
      AND jsonb_typeof(normalized.payload -> 'runtimeConsumptionKeys') = 'array'
      AND jsonb_array_length(normalized.payload -> 'runtimeConsumptionKeys') > 0
      AND jsonb_typeof(normalized.payload -> 'runtimeSourceEvidenceRefs') = 'array'
      AND normalized.payload -> 'runtimeSourceEvidenceRefs' ? (
        'duration_learning_runtime_publications:' || normalized.publication_key
      )
      AND EXISTS (SELECT 1 FROM top_publication)
      AND (
        (normalized.subject_type = 'task'
         AND normalized.input_task_ids <> '[]'::jsonb
         AND jsonb_array_length(normalized.input_task_ids) = jsonb_array_length(normalized.input_subject_ids)
         AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(normalized.input_subject_ids) subject_id
            WHERE NOT normalized.input_task_ids ? subject_id.value
         )
         AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(normalized.input_task_ids) task_id
            WHERE NOT normalized.input_subject_ids ? task_id.value
         ))
        OR (normalized.subject_type = 'baseline_item' AND normalized.input_task_ids = '[]'::jsonb)
      )
      AND (
        SELECT physical_count = jsonb_array_length(normalized.payload -> 'runtimeConsumptionKeys')
           AND physical_key_count = jsonb_array_length(normalized.payload -> 'runtimeConsumptionKeys')
           AND physical_subject_count = jsonb_array_length(normalized.input_subject_ids)
          FROM wbs_authority
      )
      AND NOT EXISTS (
        SELECT 1
          FROM jsonb_array_elements_text(normalized.input_subject_ids) subject_id
         WHERE NOT EXISTS (
           SELECT 1 FROM wbs_physical physical
            WHERE (
              normalized.subject_type = 'task'
              AND physical.task_id::text = subject_id.value
            ) OR (
              normalized.subject_type = 'baseline_item'
              AND physical.baseline_item_id::text = subject_id.value
            )
         )
      )
      AND NOT EXISTS (
        SELECT 1 FROM wbs_physical physical
         WHERE NOT normalized.input_subject_ids ? COALESCE(physical.task_id, physical.baseline_item_id)::text
      )
    )
  WHEN normalized.event_type = 'duration_prediction' THEN
    normalized.subject_type = 'task'
    AND normalized.asset_key IS NOT NULL
    AND normalized.publication_key IS NOT NULL
    AND normalized.artifact_key IS NOT NULL
    AND normalized.scope_level IS NOT NULL
    AND normalized.generation_batch_id IS NOT NULL
    AND jsonb_array_length(normalized.input_subject_ids) = 1
    AND normalized.input_subject_ids ? normalized.subject_id::text
    AND jsonb_array_length(normalized.input_task_ids) = 1
    AND normalized.input_task_ids ? normalized.subject_id::text
    AND jsonb_typeof(normalized.payload -> 'runtimeApplications') = 'array'
    AND jsonb_array_length(normalized.payload -> 'runtimeApplications') > 0
    AND EXISTS (
      SELECT 1 FROM prediction_applications applications
       WHERE applications.application ->> 'publicationKey' = normalized.publication_key
         AND applications.application ->> 'assetKey' = normalized.asset_key
         AND applications.application ->> 'artifactKey' = normalized.artifact_key
         AND applications.application ->> 'scopeLevel' = normalized.scope_level
         AND COALESCE(NULLIF(applications.application ->> 'industryKey', ''), '')
               = COALESCE(normalized.industry_key, '')
         AND NOT EXISTS (
           SELECT 1 FROM prediction_application_failures failures
            WHERE failures.application = applications.application
         )
    )
    AND NOT EXISTS (SELECT 1 FROM prediction_application_failures)
  ELSE FALSE
END
FROM normalized;
$$;

REVOKE ALL ON FUNCTION public.duration_learning_runtime_evidence_outbox_row_is_authorized(
  TEXT, UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.duration_learning_runtime_evidence_outbox_row_is_authorized(
  TEXT, UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB
) TO workbuddy_runtime, service_role;

-- Do not let the runtime role self-assert provenance JSON.  The only append
-- path after migration 323 is this typed, fixed SQL writer.  It derives the
-- canonical marker, authority source, scope context, consumption identity and
-- consumed_at from database-owned publication/tenant rows.
CREATE OR REPLACE FUNCTION public.persist_duration_learning_runtime_consumptions(
  p_rows JSONB
)
RETURNS SETOF TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  requested_count INTEGER;
  validated_count INTEGER;
  resolved_count INTEGER;
  resolved_keys TEXT[];
BEGIN
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RETURN;
  END IF;

  WITH requested AS MATERIALIZED (
    SELECT *
      FROM jsonb_to_recordset(p_rows) AS row(
        company_id UUID,
        project_id UUID,
        publication_key TEXT,
        asset_key TEXT,
        artifact_key TEXT,
        consumer_key TEXT,
        consumer_surface TEXT,
        task_id UUID,
        baseline_item_id UUID,
        generation_batch_id TEXT,
        duration_day_basis TEXT,
        applied_duration_days NUMERIC,
        consumption_context JSONB
      )
  ), prepared AS MATERIALIZED (
    SELECT requested.*,
           publication.scope_level AS authority_scope_level,
           publication.industry_key AS authority_industry_key,
           publication.source_evidence_refs AS authority_source_evidence_refs,
           COALESCE(
             publication.runtime_payload ->> 'templateId',
             publication.runtime_payload ->> 'template_id',
             publication.artifact_key
           ) AS derived_template_id,
           CASE
             WHEN requested.task_id IS NULL THEN '[]'::jsonb
             WHEN requested.asset_key = 'dependency_rule_candidate' THEN (
               SELECT COALESCE(jsonb_agg(lineage.task_id ORDER BY lineage.task_id), '[]'::jsonb)
                 FROM (
                   SELECT DISTINCT dependency.dependency_task_id::text AS task_id
                     FROM public.task_dependencies dependency
                    WHERE dependency.project_id = requested.project_id
                      AND dependency.task_id = requested.task_id
                      AND dependency.status = 'active'
                      AND dependency.source_type = 'duration_learning_runtime_publication'
                      AND dependency.metadata ->> 'publicationKey' = requested.publication_key
                      AND dependency.metadata ->> 'artifactKey' = requested.artifact_key
                   UNION
                   SELECT DISTINCT dependency.task_id::text AS task_id
                     FROM public.task_dependencies dependency
                    WHERE dependency.project_id = requested.project_id
                      AND dependency.task_id = requested.task_id
                      AND dependency.status = 'active'
                      AND dependency.source_type = 'duration_learning_runtime_publication'
                      AND dependency.metadata ->> 'publicationKey' = requested.publication_key
                      AND dependency.metadata ->> 'artifactKey' = requested.artifact_key
                 ) lineage
             )
             ELSE jsonb_build_array(requested.task_id::text)
           END AS normalized_input_task_ids
      FROM requested
      JOIN public.duration_learning_runtime_publications publication
        ON publication.publication_key = requested.publication_key
       AND publication.asset_key = requested.asset_key
       AND publication.artifact_key = requested.artifact_key
     WHERE NULLIF(BTRIM(requested.consumer_key), '') IS NOT NULL
       AND NULLIF(BTRIM(requested.consumer_surface), '') IS NOT NULL
       AND NULLIF(BTRIM(requested.generation_batch_id), '') IS NOT NULL
       AND requested.duration_day_basis = 'construction_production_day'
       AND jsonb_typeof(COALESCE(requested.consumption_context, '{}'::jsonb)) = 'object'
       AND ((requested.task_id IS NOT NULL)::INTEGER + (requested.baseline_item_id IS NOT NULL)::INTEGER) = 1
       AND EXISTS (
         SELECT 1 FROM public.projects project
          WHERE project.id = requested.project_id
            AND project.company_id = requested.company_id
       )
       AND (
         (requested.task_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.tasks task
            WHERE task.id = requested.task_id
              AND task.project_id = requested.project_id
         ))
         OR (requested.baseline_item_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.task_baseline_items baseline_item
            WHERE baseline_item.id = requested.baseline_item_id
              AND baseline_item.project_id = requested.project_id
         ))
       )
       AND (
         (publication.publication_stage = 'canary' AND publication.monitoring_status IN ('pending', 'collecting', 'passed'))
         OR (publication.publication_stage = 'stable' AND publication.monitoring_status = 'passed')
       )
       AND (
         (publication.scope_level = 'project'
          AND publication.company_id = requested.company_id
          AND publication.project_id = requested.project_id
          AND publication.industry_key IS NULL)
         OR (publication.scope_level = 'company'
          AND publication.company_id = requested.company_id
          AND publication.project_id IS NULL
          AND publication.industry_key IS NULL)
         OR (publication.scope_level = 'industry'
          AND publication.company_id IS NULL
          AND publication.project_id IS NULL
          AND publication.industry_key = NULLIF(requested.consumption_context ->> 'industryKey', ''))
         OR (publication.scope_level = 'global'
          AND publication.company_id IS NULL
          AND publication.project_id IS NULL
          AND publication.industry_key IS NULL)
       )
  ), validated AS MATERIALIZED (
    SELECT prepared.*,
           (
             'duration-learning-consumption:'
             || encode(
                  pg_catalog.sha256(
                    convert_to(
                      jsonb_build_object(
                        'companyId', prepared.company_id,
                        'projectId', prepared.project_id,
                        'publicationKey', prepared.publication_key,
                        'assetKey', prepared.asset_key,
                        'artifactKey', prepared.artifact_key,
                        'consumerKey', prepared.consumer_key,
                        'consumerSurface', prepared.consumer_surface,
                        'taskId', prepared.task_id,
                        'baselineItemId', prepared.baseline_item_id,
                        'generationBatchId', prepared.generation_batch_id,
                        'templateId', prepared.derived_template_id,
                        'durationDayBasis', prepared.duration_day_basis,
                        'appliedDurationDays', prepared.applied_duration_days,
                        'inputTaskIds', prepared.normalized_input_task_ids
                      )::TEXT,
                      'UTF8'
                    )
                  ),
                  'hex'
                )
           ) AS derived_consumption_key,
           prepared.authority_source_evidence_refs
             || jsonb_build_array('duration_learning_runtime_publications:' || prepared.publication_key)
             AS derived_source_evidence_refs,
           (
             prepared.consumption_context
             - 'authoritySource' - 'scopeLevel' - 'industryKey'
             - 'generationBatchId' - 'inputTaskIds'
           ) || jsonb_strip_nulls(jsonb_build_object(
             'authoritySource', 'runtime_resolver_publication_set',
             'scopeLevel', prepared.authority_scope_level,
             'industryKey', prepared.authority_industry_key,
             'generationBatchId', prepared.generation_batch_id,
             'inputTaskIds', prepared.normalized_input_task_ids
           )) AS derived_consumption_context
      FROM prepared
     WHERE (
       (prepared.task_id IS NOT NULL
        AND jsonb_array_length(prepared.normalized_input_task_ids) > 0
        AND prepared.normalized_input_task_ids ? prepared.task_id::text
        AND (
          (prepared.asset_key = 'dependency_rule_candidate'
           AND jsonb_array_length(prepared.normalized_input_task_ids) >= 2)
          OR (prepared.asset_key <> 'dependency_rule_candidate'
           AND prepared.normalized_input_task_ids = jsonb_build_array(prepared.task_id::text))
        ))
       OR (prepared.baseline_item_id IS NOT NULL
        AND prepared.normalized_input_task_ids = '[]'::jsonb)
     )
  ), validation AS MATERIALIZED (
    SELECT jsonb_array_length(p_rows)::INTEGER AS requested_count,
           COUNT(*)::INTEGER AS validated_count,
           jsonb_array_length(p_rows) = COUNT(*) AS valid
      FROM validated
  ), inserted AS (
    INSERT INTO public.duration_learning_runtime_consumptions (
      consumption_key, company_id, project_id, publication_key, asset_key, artifact_key,
      consumer_key, consumer_surface, task_id, baseline_item_id, generation_batch_id,
      template_id, duration_day_basis, applied_duration_days, source_evidence_refs,
      consumption_context, consumed_at
    )
    SELECT validated.derived_consumption_key,
           validated.company_id,
           validated.project_id,
           validated.publication_key,
           validated.asset_key,
           validated.artifact_key,
           validated.consumer_key,
           validated.consumer_surface,
           validated.task_id,
           validated.baseline_item_id,
           validated.generation_batch_id,
           validated.derived_template_id,
           validated.duration_day_basis,
           validated.applied_duration_days,
           validated.derived_source_evidence_refs,
           validated.derived_consumption_context,
           now()
      FROM validated
      CROSS JOIN validation
     WHERE validation.valid
    ON CONFLICT (consumption_key) DO NOTHING
    RETURNING consumption_key
  ), exact_existing AS (
    SELECT validated.derived_consumption_key AS consumption_key
      FROM validated
      JOIN public.duration_learning_runtime_consumptions existing
        ON existing.consumption_key = validated.derived_consumption_key
       AND existing.company_id = validated.company_id
       AND existing.project_id = validated.project_id
       AND existing.publication_key = validated.publication_key
       AND existing.asset_key = validated.asset_key
       AND existing.artifact_key = validated.artifact_key
       AND existing.consumer_key = validated.consumer_key
       AND existing.consumer_surface = validated.consumer_surface
       AND existing.task_id IS NOT DISTINCT FROM validated.task_id
       AND existing.baseline_item_id IS NOT DISTINCT FROM validated.baseline_item_id
       AND existing.generation_batch_id = validated.generation_batch_id
       AND existing.template_id = validated.derived_template_id
       AND existing.duration_day_basis = validated.duration_day_basis
       AND existing.applied_duration_days IS NOT DISTINCT FROM validated.applied_duration_days
       AND existing.source_evidence_refs ? (
         'duration_learning_runtime_publications:' || validated.publication_key
       )
       AND existing.consumption_context ->> 'authoritySource' = 'runtime_resolver_publication_set'
       AND existing.consumption_context ->> 'scopeLevel' = validated.authority_scope_level
       AND NULLIF(existing.consumption_context ->> 'industryKey', '')
             IS NOT DISTINCT FROM validated.authority_industry_key
       AND existing.consumption_context ->> 'generationBatchId' = validated.generation_batch_id
       AND existing.consumption_context -> 'inputTaskIds' = validated.normalized_input_task_ids
     WHERE NOT EXISTS (
       SELECT 1 FROM inserted
        WHERE inserted.consumption_key = validated.derived_consumption_key
     )
  ), resolved AS (
    SELECT consumption_key FROM inserted
    UNION
    SELECT consumption_key FROM exact_existing
  ), summary AS (
    SELECT validation.requested_count,
           validation.validated_count,
           COUNT(resolved.consumption_key)::INTEGER AS resolved_count,
           COALESCE(array_agg(resolved.consumption_key ORDER BY resolved.consumption_key)
             FILTER (WHERE resolved.consumption_key IS NOT NULL), ARRAY[]::TEXT[]) AS resolved_keys
      FROM validation
      LEFT JOIN resolved ON TRUE
     GROUP BY validation.requested_count, validation.validated_count
  )
  SELECT summary.requested_count,
         summary.validated_count,
         summary.resolved_count,
         summary.resolved_keys
    INTO requested_count, validated_count, resolved_count, resolved_keys
    FROM summary;

  IF requested_count <> validated_count OR requested_count <> resolved_count THEN
    RAISE EXCEPTION
      'duration_learning_runtime_consumption_authority_validation_failed:%:%:%',
      requested_count,
      validated_count,
      resolved_count;
  END IF;

  RETURN QUERY SELECT unnest(resolved_keys);
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    ALTER FUNCTION public.persist_duration_learning_runtime_consumptions(JSONB)
      OWNER TO service_role;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.persist_duration_learning_runtime_consumptions(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.persist_duration_learning_runtime_consumptions(JSONB)
  TO workbuddy_runtime, service_role;

-- Migration 315's table grant is intentionally removed.  Callers must use the
-- fixed writer above; direct JSON marker/authority injection is not a trusted
-- consumption path.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.duration_learning_runtime_consumptions
  FROM workbuddy_runtime;


DROP POLICY IF EXISTS duration_learning_runtime_evidence_outbox_tombstone_service_policy
  ON public.duration_learning_runtime_evidence_outbox_tombstones;
CREATE POLICY duration_learning_runtime_evidence_outbox_tombstone_service_policy
  ON public.duration_learning_runtime_evidence_outbox_tombstones
  FOR SELECT
  TO service_role
  USING (current_user = 'service_role');

DROP POLICY IF EXISTS duration_learning_runtime_evidence_outbox_tombstone_insert_policy
  ON public.duration_learning_runtime_evidence_outbox_tombstones;
CREATE POLICY duration_learning_runtime_evidence_outbox_tombstone_insert_policy
  ON public.duration_learning_runtime_evidence_outbox_tombstones
  FOR INSERT
  TO service_role
  WITH CHECK (
    current_user = 'service_role'
    AND event_key = scope_snapshot ->> 'eventKey'
    AND company_id::text = scope_snapshot ->> 'companyId'
    AND project_id::text = scope_snapshot ->> 'projectId'
    AND subject_id::text = scope_snapshot ->> 'subjectId'
    AND subject_type = scope_snapshot ->> 'subjectType'
    AND company_id IS NOT NULL
    AND project_id IS NOT NULL
    AND jsonb_typeof(scope_snapshot) = 'object'
  );

CREATE OR REPLACE FUNCTION public.duration_learning_runtime_evidence_outbox_row_is_governable(
  p_company_id UUID,
  p_project_id UUID,
  p_subject_type TEXT,
  p_subject_id UUID,
  p_input_subject_ids JSONB
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
SELECT jsonb_typeof(COALESCE(p_input_subject_ids, '[]'::jsonb)) = 'array'
AND COALESCE(p_input_subject_ids, '[]'::jsonb) ? p_subject_id::text
AND EXISTS (
  SELECT 1 FROM public.projects project
   WHERE project.id = p_project_id
     AND project.company_id = p_company_id
)
AND (
  (p_subject_type = 'task' AND EXISTS (
    SELECT 1 FROM public.tasks task
     WHERE task.id = p_subject_id
       AND task.project_id = p_project_id
  ))
  OR (p_subject_type = 'baseline_item' AND EXISTS (
    SELECT 1 FROM public.task_baseline_items baseline_item
     WHERE baseline_item.id = p_subject_id
       AND baseline_item.project_id = p_project_id
  ))
)
AND NOT EXISTS (
  SELECT 1
    FROM jsonb_array_elements_text(COALESCE(p_input_subject_ids, '[]'::jsonb)) input_subject(subject_id)
   WHERE (
     p_subject_type = 'task'
     AND NOT EXISTS (
       SELECT 1 FROM public.tasks task
        WHERE task.id::text = input_subject.subject_id
          AND task.project_id = p_project_id
     )
   ) OR (
     p_subject_type = 'baseline_item'
     AND NOT EXISTS (
       SELECT 1 FROM public.task_baseline_items baseline_item
        WHERE baseline_item.id::text = input_subject.subject_id
          AND baseline_item.project_id = p_project_id
     )
   )
);
$$;

REVOKE ALL ON FUNCTION public.duration_learning_runtime_evidence_outbox_row_is_governable(
  UUID, UUID, TEXT, UUID, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.duration_learning_runtime_evidence_outbox_row_is_governable(
  UUID, UUID, TEXT, UUID, JSONB
) TO workbuddy_runtime, service_role;

DROP POLICY IF EXISTS duration_learning_runtime_evidence_outbox_runtime_policy
  ON public.duration_learning_runtime_evidence_outbox;
DROP POLICY IF EXISTS duration_learning_runtime_evidence_outbox_runtime_select
  ON public.duration_learning_runtime_evidence_outbox;
DROP POLICY IF EXISTS duration_learning_runtime_evidence_outbox_runtime_insert
  ON public.duration_learning_runtime_evidence_outbox;
DROP POLICY IF EXISTS duration_learning_runtime_evidence_outbox_runtime_update
  ON public.duration_learning_runtime_evidence_outbox;
CREATE POLICY duration_learning_runtime_evidence_outbox_runtime_select
  ON public.duration_learning_runtime_evidence_outbox
  FOR SELECT
  TO workbuddy_runtime
  USING (
    (current_user = 'workbuddy_runtime' OR pg_has_role(current_user, 'workbuddy_runtime', 'member'))
    AND public.duration_learning_runtime_evidence_outbox_row_is_governable(
      duration_learning_runtime_evidence_outbox.company_id,
      duration_learning_runtime_evidence_outbox.project_id,
      duration_learning_runtime_evidence_outbox.subject_type,
      duration_learning_runtime_evidence_outbox.subject_id,
      duration_learning_runtime_evidence_outbox.input_subject_ids
    )
  );

CREATE POLICY duration_learning_runtime_evidence_outbox_runtime_insert
  ON public.duration_learning_runtime_evidence_outbox
  FOR INSERT
  TO workbuddy_runtime
  WITH CHECK (
    (current_user = 'workbuddy_runtime' OR pg_has_role(current_user, 'workbuddy_runtime', 'member'))
    AND duration_learning_runtime_evidence_outbox.processing_status = 'pending'
    AND duration_learning_runtime_evidence_outbox.attempt_count = 0
    AND duration_learning_runtime_evidence_outbox.lease_owner IS NULL
    AND duration_learning_runtime_evidence_outbox.lease_expires_at IS NULL
    AND duration_learning_runtime_evidence_outbox.completed_at IS NULL
    AND duration_learning_runtime_evidence_outbox.cancelled_at IS NULL
    AND duration_learning_runtime_evidence_outbox.cancellation_reason IS NULL
    AND public.duration_learning_runtime_evidence_outbox_row_is_governable(
      duration_learning_runtime_evidence_outbox.company_id,
      duration_learning_runtime_evidence_outbox.project_id,
      duration_learning_runtime_evidence_outbox.subject_type,
      duration_learning_runtime_evidence_outbox.subject_id,
      duration_learning_runtime_evidence_outbox.input_subject_ids
    )
    AND public.duration_learning_runtime_evidence_outbox_row_is_authorized(
      duration_learning_runtime_evidence_outbox.event_type,
      duration_learning_runtime_evidence_outbox.company_id,
      duration_learning_runtime_evidence_outbox.project_id,
      duration_learning_runtime_evidence_outbox.subject_type,
      duration_learning_runtime_evidence_outbox.subject_id,
      duration_learning_runtime_evidence_outbox.asset_key,
      duration_learning_runtime_evidence_outbox.publication_key,
      duration_learning_runtime_evidence_outbox.artifact_key,
      duration_learning_runtime_evidence_outbox.scope_level,
      duration_learning_runtime_evidence_outbox.industry_key,
      duration_learning_runtime_evidence_outbox.input_subject_ids,
      duration_learning_runtime_evidence_outbox.input_task_ids,
      duration_learning_runtime_evidence_outbox.payload
    )
  );

CREATE POLICY duration_learning_runtime_evidence_outbox_runtime_update
  ON public.duration_learning_runtime_evidence_outbox
  FOR UPDATE
  TO workbuddy_runtime
  USING (
    (current_user = 'workbuddy_runtime' OR pg_has_role(current_user, 'workbuddy_runtime', 'member'))
    AND public.duration_learning_runtime_evidence_outbox_row_is_governable(
      duration_learning_runtime_evidence_outbox.company_id,
      duration_learning_runtime_evidence_outbox.project_id,
      duration_learning_runtime_evidence_outbox.subject_type,
      duration_learning_runtime_evidence_outbox.subject_id,
      duration_learning_runtime_evidence_outbox.input_subject_ids
    )
  )
  WITH CHECK (
    (current_user = 'workbuddy_runtime' OR pg_has_role(current_user, 'workbuddy_runtime', 'member'))
    AND public.duration_learning_runtime_evidence_outbox_row_is_governable(
      duration_learning_runtime_evidence_outbox.company_id,
      duration_learning_runtime_evidence_outbox.project_id,
      duration_learning_runtime_evidence_outbox.subject_type,
      duration_learning_runtime_evidence_outbox.subject_id,
      duration_learning_runtime_evidence_outbox.input_subject_ids
    )
    AND (
      public.duration_learning_runtime_evidence_outbox_row_is_authorized(
        duration_learning_runtime_evidence_outbox.event_type,
        duration_learning_runtime_evidence_outbox.company_id,
        duration_learning_runtime_evidence_outbox.project_id,
        duration_learning_runtime_evidence_outbox.subject_type,
        duration_learning_runtime_evidence_outbox.subject_id,
        duration_learning_runtime_evidence_outbox.asset_key,
        duration_learning_runtime_evidence_outbox.publication_key,
        duration_learning_runtime_evidence_outbox.artifact_key,
        duration_learning_runtime_evidence_outbox.scope_level,
        duration_learning_runtime_evidence_outbox.industry_key,
        duration_learning_runtime_evidence_outbox.input_subject_ids,
        duration_learning_runtime_evidence_outbox.input_task_ids,
        duration_learning_runtime_evidence_outbox.payload
      )
      OR (
        duration_learning_runtime_evidence_outbox.processing_status = 'cancelled'
        AND duration_learning_runtime_evidence_outbox.cancelled_at IS NOT NULL
        AND NULLIF(duration_learning_runtime_evidence_outbox.cancellation_reason, '') IS NOT NULL
        AND duration_learning_runtime_evidence_outbox.lease_owner IS NULL
        AND duration_learning_runtime_evidence_outbox.lease_expires_at IS NULL
        AND duration_learning_runtime_evidence_outbox.completed_at IS NULL
        AND jsonb_typeof(duration_learning_runtime_evidence_outbox.cancellation_scope_snapshot) = 'object'
        AND duration_learning_runtime_evidence_outbox.cancellation_scope_snapshot ->> 'eventKey'
              = duration_learning_runtime_evidence_outbox.event_key
        AND duration_learning_runtime_evidence_outbox.cancellation_scope_snapshot ->> 'companyId'
              = duration_learning_runtime_evidence_outbox.company_id::text
        AND duration_learning_runtime_evidence_outbox.cancellation_scope_snapshot ->> 'projectId'
              = duration_learning_runtime_evidence_outbox.project_id::text
        AND duration_learning_runtime_evidence_outbox.cancellation_scope_snapshot ->> 'subjectType'
              = duration_learning_runtime_evidence_outbox.subject_type
        AND duration_learning_runtime_evidence_outbox.cancellation_scope_snapshot ->> 'subjectId'
              = duration_learning_runtime_evidence_outbox.subject_id::text
      )
    )
  );

DROP POLICY IF EXISTS duration_learning_runtime_evidence_outbox_service_policy
  ON public.duration_learning_runtime_evidence_outbox;
CREATE POLICY duration_learning_runtime_evidence_outbox_service_policy
  ON public.duration_learning_runtime_evidence_outbox
  FOR ALL
  TO service_role
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects project
      WHERE project.id = duration_learning_runtime_evidence_outbox.project_id
        AND project.company_id = duration_learning_runtime_evidence_outbox.company_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(duration_learning_runtime_evidence_outbox.input_subject_ids)
        input_subject(subject_id)
      WHERE (
        duration_learning_runtime_evidence_outbox.subject_type = 'task'
        AND NOT EXISTS (
          SELECT 1 FROM public.tasks task
          WHERE task.id = input_subject.subject_id::uuid
            AND task.project_id = duration_learning_runtime_evidence_outbox.project_id
        )
      ) OR (
        duration_learning_runtime_evidence_outbox.subject_type = 'baseline_item'
        AND NOT EXISTS (
          SELECT 1 FROM public.task_baseline_items baseline_item
          WHERE baseline_item.id = input_subject.subject_id::uuid
            AND baseline_item.project_id = duration_learning_runtime_evidence_outbox.project_id
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects project
      WHERE project.id = duration_learning_runtime_evidence_outbox.project_id
        AND project.company_id = duration_learning_runtime_evidence_outbox.company_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(duration_learning_runtime_evidence_outbox.input_subject_ids)
        input_subject(subject_id)
      WHERE (
        duration_learning_runtime_evidence_outbox.subject_type = 'task'
        AND NOT EXISTS (
          SELECT 1 FROM public.tasks task
          WHERE task.id = input_subject.subject_id::uuid
            AND task.project_id = duration_learning_runtime_evidence_outbox.project_id
        )
      ) OR (
        duration_learning_runtime_evidence_outbox.subject_type = 'baseline_item'
        AND NOT EXISTS (
          SELECT 1 FROM public.task_baseline_items baseline_item
          WHERE baseline_item.id = input_subject.subject_id::uuid
            AND baseline_item.project_id = duration_learning_runtime_evidence_outbox.project_id
        )
      )
    )
  );

COMMENT ON TABLE public.duration_learning_runtime_evidence_outbox IS
  'Durable, idempotent handoff from committed task/baseline materialization to duration prediction and WBS candidate evidence writers; preview and replay paths never enqueue rows.';
COMMENT ON COLUMN public.duration_learning_runtime_evidence_outbox.event_key IS
  'Deterministic SHA-256 identity over tenant, subject, publication/artifact/input lineage and payload.';
COMMENT ON COLUMN public.duration_learning_runtime_evidence_outbox.subject_type IS
  'task and baseline_item are intentionally distinct; baseline items never produce task-accuracy predictions.';

NOTIFY pgrst, 'reload schema';

COMMIT;
