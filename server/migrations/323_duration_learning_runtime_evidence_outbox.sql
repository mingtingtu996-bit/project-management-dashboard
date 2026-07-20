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
    CHECK (processing_status IN ('pending', 'processing', 'failed', 'completed')),
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
        )
        OR event_type = 'wbs_candidate'
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

ALTER TABLE public.duration_learning_runtime_evidence_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duration_learning_runtime_evidence_outbox FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.duration_learning_runtime_evidence_outbox FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.duration_learning_runtime_evidence_outbox
  TO workbuddy_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_learning_runtime_evidence_outbox
  TO service_role;

DROP POLICY IF EXISTS duration_learning_runtime_evidence_outbox_runtime_policy
  ON public.duration_learning_runtime_evidence_outbox;
CREATE POLICY duration_learning_runtime_evidence_outbox_runtime_policy
  ON public.duration_learning_runtime_evidence_outbox
  FOR ALL
  TO workbuddy_runtime
  USING (
    (current_user = 'workbuddy_runtime' OR pg_has_role(current_user, 'workbuddy_runtime', 'member'))
    AND EXISTS (
      SELECT 1
      FROM public.projects project
      WHERE project.id = duration_learning_runtime_evidence_outbox.project_id
        AND project.company_id = duration_learning_runtime_evidence_outbox.company_id
    )
    AND (
      (
        duration_learning_runtime_evidence_outbox.subject_type = 'task'
        AND EXISTS (
          SELECT 1
          FROM public.tasks task
          WHERE task.id = duration_learning_runtime_evidence_outbox.subject_id
            AND task.project_id = duration_learning_runtime_evidence_outbox.project_id
        )
      )
      OR (
        duration_learning_runtime_evidence_outbox.subject_type = 'baseline_item'
        AND EXISTS (
          SELECT 1
          FROM public.task_baseline_items baseline_item
          WHERE baseline_item.id = duration_learning_runtime_evidence_outbox.subject_id
            AND baseline_item.project_id = duration_learning_runtime_evidence_outbox.project_id
        )
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(duration_learning_runtime_evidence_outbox.input_subject_ids)
        input_subject(subject_id)
      WHERE (
        duration_learning_runtime_evidence_outbox.subject_type = 'task'
        AND NOT EXISTS (
          SELECT 1
          FROM public.tasks task
          WHERE task.id = input_subject.subject_id::uuid
            AND task.project_id = duration_learning_runtime_evidence_outbox.project_id
        )
      ) OR (
        duration_learning_runtime_evidence_outbox.subject_type = 'baseline_item'
        AND NOT EXISTS (
          SELECT 1
          FROM public.task_baseline_items baseline_item
          WHERE baseline_item.id = input_subject.subject_id::uuid
            AND baseline_item.project_id = duration_learning_runtime_evidence_outbox.project_id
        )
      )
    )
    AND (
      duration_learning_runtime_evidence_outbox.event_type = 'wbs_candidate'
      OR EXISTS (
        SELECT 1
        FROM public.duration_learning_runtime_publications publication
        WHERE publication.publication_key = duration_learning_runtime_evidence_outbox.publication_key
          AND publication.asset_key = duration_learning_runtime_evidence_outbox.asset_key
          AND publication.artifact_key = duration_learning_runtime_evidence_outbox.artifact_key
          AND publication.scope_level = duration_learning_runtime_evidence_outbox.scope_level
          AND (
            (publication.publication_stage = 'canary' AND publication.monitoring_status IN ('pending', 'collecting', 'passed'))
            OR (publication.publication_stage = 'stable' AND publication.monitoring_status = 'passed')
          )
          AND (
            (
              publication.scope_level = 'project'
              AND publication.company_id = duration_learning_runtime_evidence_outbox.company_id
              AND publication.project_id = duration_learning_runtime_evidence_outbox.project_id
            )
            OR (
              publication.scope_level = 'company'
              AND publication.company_id = duration_learning_runtime_evidence_outbox.company_id
            )
            OR (
              publication.scope_level = 'industry'
              AND publication.industry_key = duration_learning_runtime_evidence_outbox.industry_key
            )
            OR publication.scope_level = 'global'
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
    AND (
      (
        duration_learning_runtime_evidence_outbox.subject_type = 'task'
        AND EXISTS (
          SELECT 1
          FROM public.tasks task
          WHERE task.id = duration_learning_runtime_evidence_outbox.subject_id
            AND task.project_id = duration_learning_runtime_evidence_outbox.project_id
        )
      )
      OR (
        duration_learning_runtime_evidence_outbox.subject_type = 'baseline_item'
        AND EXISTS (
          SELECT 1
          FROM public.task_baseline_items baseline_item
          WHERE baseline_item.id = duration_learning_runtime_evidence_outbox.subject_id
            AND baseline_item.project_id = duration_learning_runtime_evidence_outbox.project_id
        )
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(duration_learning_runtime_evidence_outbox.input_subject_ids)
        input_subject(subject_id)
      WHERE (
        duration_learning_runtime_evidence_outbox.subject_type = 'task'
        AND NOT EXISTS (
          SELECT 1
          FROM public.tasks task
          WHERE task.id = input_subject.subject_id::uuid
            AND task.project_id = duration_learning_runtime_evidence_outbox.project_id
        )
      ) OR (
        duration_learning_runtime_evidence_outbox.subject_type = 'baseline_item'
        AND NOT EXISTS (
          SELECT 1
          FROM public.task_baseline_items baseline_item
          WHERE baseline_item.id = input_subject.subject_id::uuid
            AND baseline_item.project_id = duration_learning_runtime_evidence_outbox.project_id
        )
      )
    )
    AND (
      duration_learning_runtime_evidence_outbox.event_type = 'wbs_candidate'
      OR EXISTS (
        SELECT 1
        FROM public.duration_learning_runtime_publications publication
        WHERE publication.publication_key = duration_learning_runtime_evidence_outbox.publication_key
          AND publication.asset_key = duration_learning_runtime_evidence_outbox.asset_key
          AND publication.artifact_key = duration_learning_runtime_evidence_outbox.artifact_key
          AND publication.scope_level = duration_learning_runtime_evidence_outbox.scope_level
          AND (
            (publication.publication_stage = 'canary' AND publication.monitoring_status IN ('pending', 'collecting', 'passed'))
            OR (publication.publication_stage = 'stable' AND publication.monitoring_status = 'passed')
          )
          AND (
            (
              publication.scope_level = 'project'
              AND publication.company_id = duration_learning_runtime_evidence_outbox.company_id
              AND publication.project_id = duration_learning_runtime_evidence_outbox.project_id
            )
            OR (
              publication.scope_level = 'company'
              AND publication.company_id = duration_learning_runtime_evidence_outbox.company_id
            )
            OR (
              publication.scope_level = 'industry'
              AND publication.industry_key = duration_learning_runtime_evidence_outbox.industry_key
            )
            OR publication.scope_level = 'global'
          )
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
