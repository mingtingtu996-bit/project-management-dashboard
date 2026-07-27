-- Append-only cross-domain execution-fact authority with atomic compatibility projections.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 326';
  END IF;
  IF to_regprocedure('workbuddy_private.is_active_company_member(uuid,text[])') IS NULL THEN
    RAISE EXCEPTION 'workbuddy_private.is_active_company_member(uuid,text[]) is required before migration 326';
  END IF;
  IF to_regprocedure('workbuddy_private.is_active_project_member(uuid,text[])') IS NULL THEN
    RAISE EXCEPTION 'workbuddy_private.is_active_project_member(uuid,text[]) is required before migration 326';
  END IF;
END
$$;

-- BEGIN MIGRATION 326
CREATE TABLE IF NOT EXISTS public.execution_fact_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('task','risk','issue','material_batch','drawing_version','certificate_work_item','acceptance_plan')),
  entity_id UUID NOT NULL,
  fact_type TEXT NOT NULL CHECK (fact_type IN (
    'task.actual_start_date','task.actual_end_date','task.first_progress_at','task.progress','task.status',
    'risk.status','risk.closure','issue.status','issue.closure',
    'material_batch.actual_arrival_date','drawing_version.current',
    'certificate_work_item.status','certificate_work_item.actual_finish_date',
    'acceptance_plan.status','acceptance_plan.actual_date'
  )),
  fact_value JSONB NOT NULL CHECK (pg_column_size(fact_value) <= 32768),
  effective_at TIMESTAMPTZ NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_module TEXT NOT NULL CHECK (NULLIF(BTRIM(source_module), '') IS NOT NULL AND LENGTH(source_module) <= 160),
  source_event_id TEXT NOT NULL CHECK (NULLIF(BTRIM(source_event_id), '') IS NOT NULL AND LENGTH(source_event_id) <= 256),
  actor_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  evidence_refs JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(evidence_refs) = 'array' AND pg_column_size(evidence_refs) <= 32768),
  confidence NUMERIC(5,4) NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
  supersedes_event_id UUID NULL REFERENCES public.execution_fact_events(id) ON DELETE RESTRICT,
  supersession_kind TEXT NOT NULL CHECK (supersession_kind IN ('initial','new_observation','correction')),
  correction_reason TEXT NULL,
  idempotency_key TEXT NOT NULL CHECK (NULLIF(BTRIM(idempotency_key), '') IS NOT NULL AND LENGTH(idempotency_key) <= 256),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (project_id, company_id) REFERENCES public.projects(id, company_id) ON UPDATE RESTRICT ON DELETE CASCADE,
  UNIQUE (company_id, idempotency_key),
  CONSTRAINT execution_fact_events_entity_fact_type_check CHECK (
    (entity_type = 'task' AND fact_type IN ('task.actual_start_date','task.actual_end_date','task.first_progress_at','task.progress','task.status'))
    OR (entity_type = 'risk' AND fact_type IN ('risk.status','risk.closure'))
    OR (entity_type = 'issue' AND fact_type IN ('issue.status','issue.closure'))
    OR (entity_type = 'material_batch' AND fact_type = 'material_batch.actual_arrival_date')
    OR (entity_type = 'drawing_version' AND fact_type = 'drawing_version.current')
    OR (entity_type = 'certificate_work_item' AND fact_type IN ('certificate_work_item.status','certificate_work_item.actual_finish_date'))
    OR (entity_type = 'acceptance_plan' AND fact_type IN ('acceptance_plan.status','acceptance_plan.actual_date'))
  ),
  CONSTRAINT execution_fact_events_supersession_state_check CHECK (
    (supersession_kind = 'initial' AND supersedes_event_id IS NULL AND correction_reason IS NULL)
    OR (supersession_kind = 'new_observation' AND supersedes_event_id IS NOT NULL AND correction_reason IS NULL)
    OR (
      supersession_kind = 'correction'
      AND supersedes_event_id IS NOT NULL
      AND NULLIF(BTRIM(correction_reason), '') IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX uq_execution_fact_events_superseded_once
  ON public.execution_fact_events (supersedes_event_id)
  WHERE supersedes_event_id IS NOT NULL;

CREATE INDEX idx_execution_fact_events_stream
  ON public.execution_fact_events (
    company_id,
    project_id,
    entity_type,
    entity_id,
    fact_type,
    effective_at DESC,
    observed_at DESC
  );

CREATE INDEX idx_execution_fact_events_source
  ON public.execution_fact_events (company_id, source_module, source_event_id);

CREATE OR REPLACE FUNCTION workbuddy_private.ensure_execution_fact_event_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  project_company_id UUID;
  entity_project_id UUID;
  current_event_id UUID;
  superseded_company_id UUID;
  superseded_project_id UUID;
  superseded_entity_type TEXT;
  superseded_entity_id UUID;
  superseded_fact_type TEXT;
BEGIN
  SELECT project.company_id
    INTO project_company_id
    FROM public.projects project
   WHERE project.id = NEW.project_id
   FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'execution fact project not found';
  END IF;
  IF project_company_id IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'execution fact project/company mismatch';
  END IF;

  CASE NEW.entity_type
    WHEN 'task' THEN
      SELECT task.project_id INTO entity_project_id
        FROM public.tasks task WHERE task.id = NEW.entity_id FOR KEY SHARE;
    WHEN 'risk' THEN
      SELECT risk.project_id INTO entity_project_id
        FROM public.risks risk WHERE risk.id = NEW.entity_id FOR KEY SHARE;
    WHEN 'issue' THEN
      SELECT issue.project_id INTO entity_project_id
        FROM public.issues issue WHERE issue.id = NEW.entity_id FOR KEY SHARE;
    WHEN 'material_batch' THEN
      SELECT material.project_id INTO entity_project_id
        FROM public.project_materials material WHERE material.id = NEW.entity_id FOR KEY SHARE;
    WHEN 'drawing_version' THEN
      SELECT drawing_version.project_id INTO entity_project_id
        FROM public.drawing_versions drawing_version WHERE drawing_version.id = NEW.entity_id FOR KEY SHARE;
    WHEN 'certificate_work_item' THEN
      SELECT work_item.project_id INTO entity_project_id
        FROM public.certificate_work_items work_item WHERE work_item.id = NEW.entity_id FOR KEY SHARE;
    WHEN 'acceptance_plan' THEN
      SELECT acceptance_plan.project_id INTO entity_project_id
        FROM public.acceptance_plans acceptance_plan WHERE acceptance_plan.id = NEW.entity_id FOR KEY SHARE;
  END CASE;

  IF entity_project_id IS NULL OR entity_project_id IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'execution fact entity does not belong to the governed project';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      NEW.company_id::TEXT || ':' || NEW.project_id::TEXT || ':' || NEW.entity_type || ':' || NEW.entity_id::TEXT || ':' || NEW.fact_type,
      0
    )
  );

  SELECT event.id
    INTO current_event_id
    FROM public.execution_fact_events event
   WHERE event.company_id = NEW.company_id
     AND event.project_id = NEW.project_id
     AND event.entity_type = NEW.entity_type
     AND event.entity_id = NEW.entity_id
     AND event.fact_type = NEW.fact_type
     AND NOT EXISTS (
       SELECT 1
         FROM public.execution_fact_events successor
        WHERE successor.supersedes_event_id = event.id
     )
   ORDER BY event.effective_at DESC, event.observed_at DESC, event.id DESC
   LIMIT 1
   FOR UPDATE;

  IF current_event_id IS NULL THEN
    IF NEW.supersedes_event_id IS NOT NULL OR NEW.supersession_kind <> 'initial' THEN
      RAISE EXCEPTION 'initial execution fact cannot supersede another event';
    END IF;
  ELSIF NEW.supersedes_event_id IS DISTINCT FROM current_event_id THEN
    RAISE EXCEPTION 'execution fact must supersede the current fact stream head';
  END IF;

  IF NEW.supersedes_event_id IS NOT NULL THEN
    SELECT prior.company_id, prior.project_id, prior.entity_type, prior.entity_id, prior.fact_type
      INTO superseded_company_id, superseded_project_id, superseded_entity_type, superseded_entity_id, superseded_fact_type
      FROM public.execution_fact_events prior
     WHERE prior.id = NEW.supersedes_event_id
     FOR KEY SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'execution fact superseded event not found';
    END IF;
    IF superseded_company_id IS DISTINCT FROM NEW.company_id
       OR superseded_project_id IS DISTINCT FROM NEW.project_id
       OR superseded_entity_type IS DISTINCT FROM NEW.entity_type
       OR superseded_entity_id IS DISTINCT FROM NEW.entity_id
       OR superseded_fact_type IS DISTINCT FROM NEW.fact_type THEN
      RAISE EXCEPTION 'execution fact supersession must stay in the same fact stream';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION workbuddy_private.reject_execution_fact_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1
      FROM public.projects project
     WHERE project.id = OLD.project_id
  ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'execution_fact_events is append-only';
END
$$;

DROP TRIGGER IF EXISTS ensure_execution_fact_event_scope_trigger
  ON public.execution_fact_events;
CREATE TRIGGER ensure_execution_fact_event_scope_trigger
  BEFORE INSERT ON public.execution_fact_events
  FOR EACH ROW
  EXECUTE FUNCTION workbuddy_private.ensure_execution_fact_event_scope();

DROP TRIGGER IF EXISTS reject_execution_fact_event_mutation_trigger
  ON public.execution_fact_events;
CREATE TRIGGER reject_execution_fact_event_mutation_trigger
  BEFORE UPDATE OR DELETE ON public.execution_fact_events
  FOR EACH ROW
  EXECUTE FUNCTION workbuddy_private.reject_execution_fact_event_mutation();

WITH candidate_facts AS (
  SELECT project.company_id,
         task.project_id,
         'task'::TEXT AS entity_type,
         task.id AS entity_id,
         'task.actual_start_date'::TEXT AS fact_type,
         COALESCE(to_jsonb(task.actual_start_date), 'null'::JSONB) AS fact_value,
         COALESCE(task.updated_at, task.created_at, NOW()) AS effective_at
    FROM public.tasks task
    JOIN public.projects project ON project.id = task.project_id
  UNION ALL
  SELECT project.company_id, task.project_id, 'task', task.id,
         'task.actual_end_date', COALESCE(to_jsonb(task.actual_end_date), 'null'::JSONB),
         COALESCE(task.updated_at, task.created_at, NOW())
    FROM public.tasks task
    JOIN public.projects project ON project.id = task.project_id
  UNION ALL
  SELECT project.company_id, task.project_id, 'task', task.id,
         'task.first_progress_at', COALESCE(to_jsonb(task.first_progress_at), 'null'::JSONB),
         COALESCE(task.updated_at, task.created_at, NOW())
    FROM public.tasks task
    JOIN public.projects project ON project.id = task.project_id
  UNION ALL
  SELECT project.company_id, task.project_id, 'task', task.id,
         'task.progress', to_jsonb(task.progress),
         COALESCE(task.updated_at, task.created_at, NOW())
    FROM public.tasks task
    JOIN public.projects project ON project.id = task.project_id
   WHERE task.progress IS NOT NULL
  UNION ALL
  SELECT project.company_id, task.project_id, 'task', task.id,
         'task.status', to_jsonb(task.status),
         COALESCE(task.updated_at, task.created_at, NOW())
    FROM public.tasks task
    JOIN public.projects project ON project.id = task.project_id
   WHERE NULLIF(BTRIM(task.status), '') IS NOT NULL
  UNION ALL
  SELECT project.company_id, risk.project_id, 'risk', risk.id,
         'risk.status', to_jsonb(risk.status),
         COALESCE(risk.updated_at, risk.created_at, NOW())
    FROM public.risks risk
    JOIN public.projects project ON project.id = risk.project_id
   WHERE NULLIF(BTRIM(risk.status), '') IS NOT NULL
  UNION ALL
  SELECT project.company_id, risk.project_id, 'risk', risk.id,
         'risk.closure',
         jsonb_strip_nulls(jsonb_build_object(
           'status', risk.status,
           'resultCode', risk.closure_result_code,
           'resultSummary', risk.closure_result_summary,
           'effectiveness', risk.closure_effectiveness,
           'evidenceRefs', risk.closure_evidence_refs,
           'causeAttributionId', risk.closure_cause_attribution_id,
           'closedBy', risk.closed_by,
           'recordedAt', risk.closure_recorded_at
         )),
         COALESCE(risk.closure_recorded_at, risk.closed_at, risk.resolved_at, risk.updated_at, risk.created_at, NOW())
    FROM public.risks risk
    JOIN public.projects project ON project.id = risk.project_id
   WHERE risk.status = 'closed'
  UNION ALL
  SELECT project.company_id, issue.project_id, 'issue', issue.id,
         'issue.status', to_jsonb(issue.status),
         COALESCE(issue.updated_at, issue.created_at, NOW())
    FROM public.issues issue
    JOIN public.projects project ON project.id = issue.project_id
   WHERE NULLIF(BTRIM(issue.status), '') IS NOT NULL
  UNION ALL
  SELECT project.company_id, issue.project_id, 'issue', issue.id,
         'issue.closure',
         jsonb_strip_nulls(jsonb_build_object(
           'status', issue.status,
           'resultCode', issue.closure_result_code,
           'resultSummary', issue.closure_result_summary,
           'effectiveness', issue.closure_effectiveness,
           'evidenceRefs', issue.closure_evidence_refs,
           'causeAttributionId', issue.closure_cause_attribution_id,
           'closedBy', issue.closed_by,
           'recordedAt', issue.closure_recorded_at
         )),
         COALESCE(issue.closure_recorded_at, issue.closed_at, issue.updated_at, issue.created_at, NOW())
    FROM public.issues issue
    JOIN public.projects project ON project.id = issue.project_id
   WHERE issue.status = 'closed'
  UNION ALL
  SELECT project.company_id, material.project_id, 'material_batch', material.id,
         'material_batch.actual_arrival_date', COALESCE(to_jsonb(material.actual_arrival_date), 'null'::JSONB),
         COALESCE(material.updated_at, material.created_at, NOW())
    FROM public.project_materials material
    JOIN public.projects project ON project.id = material.project_id
  UNION ALL
  SELECT project.company_id, drawing_version.project_id, 'drawing_version', drawing_version.id,
         'drawing_version.current', to_jsonb(COALESCE(drawing_version.is_current_version, FALSE)),
         COALESCE(drawing_version.updated_at, drawing_version.created_at, NOW())
    FROM public.drawing_versions drawing_version
    JOIN public.projects project ON project.id = drawing_version.project_id
  UNION ALL
  SELECT project.company_id, work_item.project_id, 'certificate_work_item', work_item.id,
         'certificate_work_item.status', to_jsonb(work_item.status),
         COALESCE(work_item.updated_at, work_item.created_at, NOW())
    FROM public.certificate_work_items work_item
    JOIN public.projects project ON project.id = work_item.project_id
   WHERE NULLIF(BTRIM(work_item.status), '') IS NOT NULL
  UNION ALL
  SELECT project.company_id, work_item.project_id, 'certificate_work_item', work_item.id,
         'certificate_work_item.actual_finish_date', COALESCE(to_jsonb(work_item.actual_finish_date), 'null'::JSONB),
         COALESCE(work_item.updated_at, work_item.created_at, NOW())
    FROM public.certificate_work_items work_item
    JOIN public.projects project ON project.id = work_item.project_id
  UNION ALL
  SELECT project.company_id, acceptance_plan.project_id, 'acceptance_plan', acceptance_plan.id,
         'acceptance_plan.status', to_jsonb(acceptance_plan.status),
         COALESCE(acceptance_plan.updated_at, acceptance_plan.created_at, NOW())
    FROM public.acceptance_plans acceptance_plan
    JOIN public.projects project ON project.id = acceptance_plan.project_id
   WHERE NULLIF(BTRIM(acceptance_plan.status), '') IS NOT NULL
  UNION ALL
  SELECT project.company_id, acceptance_plan.project_id, 'acceptance_plan', acceptance_plan.id,
         'acceptance_plan.actual_date', COALESCE(to_jsonb(acceptance_plan.actual_date), 'null'::JSONB),
         COALESCE(acceptance_plan.updated_at, acceptance_plan.created_at, NOW())
    FROM public.acceptance_plans acceptance_plan
    JOIN public.projects project ON project.id = acceptance_plan.project_id
), backfill AS (
  SELECT candidate_facts.*,
         candidate_facts.effective_at AS observed_at,
         'migration.326_execution_fact_governance'::TEXT AS source_module,
         'backfill:' || candidate_facts.entity_type || ':' || candidate_facts.entity_id::TEXT || ':' || candidate_facts.fact_type AS source_event_id,
         jsonb_build_array('compatibility_projection_backfill', candidate_facts.fact_type) AS evidence_refs,
         'initial'::TEXT AS supersession_kind,
         'migration326:' || candidate_facts.entity_type || ':' || candidate_facts.entity_id::TEXT || ':' || candidate_facts.fact_type AS idempotency_key
    FROM candidate_facts
)
INSERT INTO public.execution_fact_events (
  company_id, project_id, entity_type, entity_id, fact_type, fact_value,
  effective_at, observed_at, source_module, source_event_id, actor_user_id,
  evidence_refs, confidence, supersedes_event_id, supersession_kind,
  correction_reason, idempotency_key
)
SELECT backfill.company_id,
       backfill.project_id,
       backfill.entity_type,
       backfill.entity_id,
       backfill.fact_type,
       backfill.fact_value,
       backfill.effective_at,
       backfill.observed_at,
       backfill.source_module,
       backfill.source_event_id,
       NULL,
       backfill.evidence_refs,
       1,
       NULL,
       backfill.supersession_kind,
       NULL,
       backfill.idempotency_key
  FROM backfill
 WHERE NOT EXISTS (
   SELECT 1
     FROM public.execution_fact_events existing
    WHERE existing.company_id = backfill.company_id
      AND existing.idempotency_key = backfill.idempotency_key
 )
ON CONFLICT (company_id, idempotency_key) DO NOTHING;

REVOKE ALL ON FUNCTION workbuddy_private.ensure_execution_fact_event_scope()
  FROM PUBLIC, anon, authenticated, workbuddy_runtime;
REVOKE ALL ON FUNCTION workbuddy_private.reject_execution_fact_event_mutation()
  FROM PUBLIC, anon, authenticated, workbuddy_runtime;

ALTER TABLE public.execution_fact_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.execution_fact_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.execution_fact_events FROM PUBLIC, anon, authenticated, workbuddy_runtime;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.execution_fact_events FROM service_role';
  END IF;
END
$$;

GRANT SELECT ON TABLE public.execution_fact_events TO authenticated;
GRANT SELECT, INSERT ON TABLE public.execution_fact_events TO workbuddy_runtime;

DROP POLICY IF EXISTS execution_fact_events_member_read
  ON public.execution_fact_events;
CREATE POLICY execution_fact_events_member_read
  ON public.execution_fact_events
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND workbuddy_private.is_active_company_member(
      execution_fact_events.company_id,
      NULL::TEXT[]
    )
    AND (
      workbuddy_private.is_active_company_member(
        execution_fact_events.company_id,
        ARRAY['company_admin']::TEXT[]
      )
      OR workbuddy_private.is_active_project_member(
        execution_fact_events.project_id,
        NULL::TEXT[]
      )
    )
    AND EXISTS (
      SELECT 1
        FROM public.projects project
       WHERE project.id = execution_fact_events.project_id
         AND project.company_id = execution_fact_events.company_id
    )
  );

DROP POLICY IF EXISTS execution_fact_events_backend_runtime_read
  ON public.execution_fact_events;
CREATE POLICY execution_fact_events_backend_runtime_read
  ON public.execution_fact_events
  FOR SELECT
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS execution_fact_events_backend_runtime_insert
  ON public.execution_fact_events;
CREATE POLICY execution_fact_events_backend_runtime_insert
  ON public.execution_fact_events
  FOR INSERT
  TO workbuddy_runtime
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

CREATE OR REPLACE VIEW public.current_execution_facts
WITH (security_invoker = true)
AS
SELECT event.*
  FROM public.execution_fact_events event
 WHERE NOT EXISTS (
   SELECT 1
     FROM public.execution_fact_events successor
    WHERE successor.supersedes_event_id = event.id
 );

REVOKE ALL ON TABLE public.current_execution_facts FROM PUBLIC, anon, authenticated, workbuddy_runtime;
GRANT SELECT ON TABLE public.current_execution_facts TO authenticated, workbuddy_runtime;

COMMENT ON TABLE public.execution_fact_events IS
  'Append-only tenant-scoped authority for cross-domain execution facts; legacy columns are transactional compatibility projections only.';
COMMENT ON VIEW public.current_execution_facts IS
  'Current execution fact stream heads selected by append-only supersession lineage.';

-- END MIGRATION 326
NOTIFY pgrst, 'reload schema';

COMMIT;
