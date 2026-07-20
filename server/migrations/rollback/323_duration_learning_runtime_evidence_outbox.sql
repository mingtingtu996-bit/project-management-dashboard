-- Roll back the duration-learning committed-evidence outbox boundary.

BEGIN;

REVOKE ALL ON FUNCTION public.persist_duration_learning_runtime_consumptions(JSONB)
  FROM PUBLIC, workbuddy_runtime, service_role;
DROP FUNCTION IF EXISTS public.persist_duration_learning_runtime_consumptions(JSONB);
REVOKE ALL ON FUNCTION public.duration_learning_runtime_evidence_outbox_row_is_authorized(
  TEXT, UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB
) FROM PUBLIC, workbuddy_runtime, service_role;
DROP FUNCTION IF EXISTS public.duration_learning_runtime_evidence_outbox_row_is_authorized(
  TEXT, UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB
);
REVOKE ALL ON FUNCTION public.duration_learning_runtime_evidence_outbox_row_is_governable(
  UUID, UUID, TEXT, UUID, JSONB
) FROM PUBLIC, workbuddy_runtime, service_role;
DROP FUNCTION IF EXISTS public.duration_learning_runtime_evidence_outbox_row_is_governable(
  UUID, UUID, TEXT, UUID, JSONB
);

-- Restore the migration-315 append policy exactly when removing the 323
-- evidence hardening boundary.
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
    AND EXISTS (
      SELECT 1
      FROM public.projects project
      WHERE project.id = duration_learning_runtime_consumptions.project_id
        AND project.company_id = duration_learning_runtime_consumptions.company_id
    )
    AND (
      (duration_learning_runtime_consumptions.task_id IS NOT NULL AND EXISTS (
          SELECT 1
          FROM public.tasks task
          WHERE task.id = duration_learning_runtime_consumptions.task_id
            AND task.project_id = duration_learning_runtime_consumptions.project_id
        ))
      OR (
        duration_learning_runtime_consumptions.baseline_item_id IS NOT NULL
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
          )
          OR (
            publication.scope_level = 'company'
            AND publication.company_id = duration_learning_runtime_consumptions.company_id
          )
          OR (
            publication.scope_level = 'industry'
            AND publication.industry_key = NULLIF(
              duration_learning_runtime_consumptions.consumption_context ->> 'industryKey',
              ''
            )
          )
          OR publication.scope_level = 'global'
        )
    )
  );

GRANT SELECT, INSERT ON TABLE public.duration_learning_runtime_consumptions
  TO workbuddy_runtime;


DROP TRIGGER IF EXISTS duration_learning_runtime_evidence_outbox_tombstone_on_delete
  ON public.duration_learning_runtime_evidence_outbox;
DROP TRIGGER IF EXISTS duration_learning_runtime_evidence_outbox_cancel_task_on_delete
  ON public.tasks;
DROP TRIGGER IF EXISTS duration_learning_runtime_evidence_outbox_cancel_baseline_item_on_delete
  ON public.task_baseline_items;
DROP FUNCTION IF EXISTS public.cancel_duration_learning_runtime_evidence_before_subject_delete();
DROP FUNCTION IF EXISTS public.archive_duration_learning_runtime_evidence_outbox_tombstone();
DROP TABLE IF EXISTS public.duration_learning_runtime_evidence_outbox_tombstones;
DROP TABLE IF EXISTS public.duration_learning_runtime_evidence_outbox;

NOTIFY pgrst, 'reload schema';

COMMIT;
