-- Preserve the remaining legacy runtime data in canonical relations before
-- removing retired tables, columns, and role-based policies.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regclass('public.users') IS NULL
     OR to_regclass('public.tasks') IS NULL
     OR to_regclass('public.task_conditions') IS NULL
     OR to_regclass('public.participant_units') IS NULL
     OR to_regclass('public.milestones') IS NULL
     OR to_regclass('public.task_milestones') IS NULL
     OR to_regclass('public.warnings') IS NULL
     OR to_regclass('public.notifications') IS NULL
     OR to_regclass('public.task_baseline_items') IS NULL
     OR to_regclass('public.acceptance_plans') IS NULL
     OR to_regclass('public.project_entity_links') IS NULL
     OR to_regclass('public.task_dependencies') IS NULL
     OR to_regclass('public.engineering_objects') IS NULL THEN
    RAISE EXCEPTION 'migration 300 requires both the canonical runtime tables and the retired source objects';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.users
    WHERE global_role IS NULL
       OR BTRIM(global_role) NOT IN ('company_admin', 'regular')
  ) THEN
    RAISE EXCEPTION 'migration 300 cannot remove users.role while global_role is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.acceptance_plans ap
    LEFT JOIN public.tasks t ON t.id = ap.task_id
    WHERE ap.task_id IS NOT NULL
      AND (t.id IS NULL OR t.project_id IS DISTINCT FROM ap.project_id)
  ) THEN
    RAISE EXCEPTION 'migration 300 found an acceptance plan task outside its project';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tasks task
    LEFT JOIN public.tasks predecessor ON predecessor.id = task.preceding_task_id
    WHERE task.preceding_task_id IS NOT NULL
      AND (
        predecessor.id IS NULL
        OR predecessor.project_id IS DISTINCT FROM task.project_id
        OR predecessor.id = task.id
      )
  ) THEN
    RAISE EXCEPTION 'migration 300 found an invalid direct predecessor reference';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tasks task
    LEFT JOIN public.engineering_objects phase_object
      ON phase_object.id = task.phase_id
     AND phase_object.project_id = task.project_id
     AND phase_object.object_type = 'phase'
    WHERE task.phase_id IS NOT NULL
      AND phase_object.id IS NULL
      AND task.phase_id IS DISTINCT FROM task.project_id
  ) THEN
    RAISE EXCEPTION 'migration 300 found a phase_id that cannot be mapped to a phase object';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.task_milestones relation
    JOIN public.tasks task ON task.id = relation.task_id
    JOIN public.milestones milestone ON milestone.id = relation.milestone_id
    WHERE task.project_id IS DISTINCT FROM milestone.project_id
  ) THEN
    RAISE EXCEPTION 'migration 300 found a milestone relation outside its project';
  END IF;

  IF EXISTS (
    SELECT relation.task_id
    FROM public.task_milestones relation
    GROUP BY relation.task_id
    HAVING COUNT(DISTINCT relation.milestone_id) > 1
  ) THEN
    RAISE EXCEPTION 'migration 300 cannot map multiple milestone targets into tasks.milestone_id';
  END IF;

  IF EXISTS (
    SELECT canonical_task.id
    FROM public.milestones milestone
    JOIN public.tasks canonical_task
      ON canonical_task.project_id IS NOT DISTINCT FROM milestone.project_id
     AND LOWER(BTRIM(canonical_task.title)) = LOWER(BTRIM(milestone.title))
     AND canonical_task.is_milestone IS TRUE
    GROUP BY canonical_task.id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'migration 300 found duplicate legacy milestones for one canonical task';
  END IF;

  IF EXISTS (
    SELECT milestone.id
    FROM public.milestones milestone
    JOIN public.tasks canonical_task
      ON canonical_task.project_id IS NOT DISTINCT FROM milestone.project_id
     AND LOWER(BTRIM(canonical_task.title)) = LOWER(BTRIM(milestone.title))
     AND canonical_task.is_milestone IS TRUE
    GROUP BY milestone.id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'migration 300 found an ambiguous canonical milestone title match';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.warnings warning
    LEFT JOIN public.tasks task ON task.id = warning.task_id
    WHERE warning.task_id IS NOT NULL
      AND (task.id IS NULL OR task.project_id IS DISTINCT FROM warning.project_id)
  ) THEN
    RAISE EXCEPTION 'migration 300 found a warning task outside its project';
  END IF;
END
$$;

CREATE TEMP TABLE migration_300_milestone_map (
  old_milestone_id UUID PRIMARY KEY,
  canonical_task_id UUID NOT NULL,
  mapping_source TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO migration_300_milestone_map (
  old_milestone_id,
  canonical_task_id,
  mapping_source
)
SELECT
  milestone.id,
  canonical_task.id,
  'same_project_title'
FROM public.milestones milestone
JOIN public.tasks canonical_task
  ON canonical_task.project_id IS NOT DISTINCT FROM milestone.project_id
 AND LOWER(BTRIM(canonical_task.title)) = LOWER(BTRIM(milestone.title))
 AND canonical_task.is_milestone IS TRUE;

INSERT INTO migration_300_milestone_map (
  old_milestone_id,
  canonical_task_id,
  mapping_source
)
SELECT
  milestone.id,
  CASE
    WHEN colliding_task.id IS NULL THEN milestone.id
    ELSE gen_random_uuid()
  END,
  'created_from_legacy_milestone'
FROM public.milestones milestone
LEFT JOIN migration_300_milestone_map existing_map
  ON existing_map.old_milestone_id = milestone.id
LEFT JOIN public.tasks colliding_task
  ON colliding_task.id = milestone.id
WHERE existing_map.old_milestone_id IS NULL;

INSERT INTO public.tasks (
  id,
  project_id,
  title,
  description,
  status,
  priority,
  end_date,
  progress,
  is_milestone,
  task_type,
  planned_end_date,
  actual_end_date,
  created_by,
  created_at,
  updated_at,
  baseline_end,
  progress_method,
  key_node_type,
  planning_governance_metadata
)
SELECT
  milestone_map.canonical_task_id,
  milestone.project_id,
  milestone.title,
  milestone.description,
  CASE
    WHEN milestone.resolved_status = 'completed' THEN 'completed'
    WHEN milestone.resolved_status IN ('in_progress', 'active') THEN 'in_progress'
    ELSE milestone.resolved_status
  END,
  'high',
  COALESCE(milestone.current_plan_date, milestone.target_date),
  CASE WHEN milestone.resolved_status = 'completed' THEN 100 ELSE 0 END,
  TRUE,
  'milestone',
  COALESCE(milestone.current_plan_date, milestone.target_date),
  COALESCE(milestone.actual_date, milestone.completed_at::date),
  milestone.created_by,
  milestone.created_at,
  NOW(),
  COALESCE(milestone.baseline_date, milestone.target_date),
  'milestone',
  'milestone',
  jsonb_build_object(
    'migration300LegacyMilestone',
    jsonb_build_object(
      'id', milestone.id::text,
      'status', milestone.status,
      'targetDate', milestone.target_date,
      'mappingSource', milestone_map.mapping_source,
      'migratedBy', '300_runtime_legacy_compatibility_cleanup'
    )
  )
FROM (
  SELECT
    source.*,
    CASE
      WHEN LOWER(COALESCE(source.status, '')) IN ('completed', 'done')
        OR source.actual_date IS NOT NULL
        OR source.completed_at IS NOT NULL
      THEN 'completed'
      ELSE COALESCE(NULLIF(LOWER(BTRIM(source.status)), ''), 'pending')
    END AS resolved_status
  FROM public.milestones source
) milestone
JOIN migration_300_milestone_map milestone_map
  ON milestone_map.old_milestone_id = milestone.id
LEFT JOIN public.tasks existing_task
  ON existing_task.id = milestone_map.canonical_task_id
WHERE existing_task.id IS NULL;

UPDATE public.tasks canonical_task
SET
  description = COALESCE(canonical_task.description, milestone.description),
  is_milestone = TRUE,
  task_type = CASE
    WHEN canonical_task.task_type IS NULL OR canonical_task.task_type = 'task' THEN 'milestone'
    ELSE canonical_task.task_type
  END,
  planned_end_date = COALESCE(
    canonical_task.planned_end_date,
    milestone.current_plan_date,
    milestone.target_date
  ),
  end_date = COALESCE(
    canonical_task.end_date,
    milestone.current_plan_date,
    milestone.target_date
  ),
  baseline_end = COALESCE(canonical_task.baseline_end, milestone.baseline_date, milestone.target_date),
  actual_end_date = COALESCE(canonical_task.actual_end_date, milestone.actual_date, milestone.completed_at::date),
  created_by = COALESCE(canonical_task.created_by, milestone.created_by),
  planning_governance_metadata = COALESCE(canonical_task.planning_governance_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'migration300LegacyMilestone',
      jsonb_build_object(
        'id', milestone.id::text,
        'status', milestone.status,
        'targetDate', milestone.target_date,
        'mappingSource', milestone_map.mapping_source,
        'migratedBy', '300_runtime_legacy_compatibility_cleanup'
      )
    ),
  updated_at = NOW()
FROM public.milestones milestone
JOIN migration_300_milestone_map milestone_map
  ON milestone_map.old_milestone_id = milestone.id
WHERE canonical_task.id = milestone_map.canonical_task_id;

UPDATE public.task_baseline_items baseline_item
SET generation_metadata = COALESCE(baseline_item.generation_metadata, '{}'::jsonb)
  || jsonb_build_object(
    'migration300LegacySourceMilestoneId',
    baseline_item.source_milestone_id::text
  )
WHERE baseline_item.source_milestone_id IS NOT NULL;

ALTER TABLE public.task_baseline_items
  DROP CONSTRAINT IF EXISTS task_baseline_items_source_milestone_id_fkey;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT constraint_row.conname
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid = 'public.tasks'::regclass
      AND constraint_row.confrelid = 'public.milestones'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.tasks DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END
$$;

UPDATE public.task_baseline_items baseline_item
SET source_milestone_id = milestone_map.canonical_task_id
FROM migration_300_milestone_map milestone_map
WHERE baseline_item.source_milestone_id = milestone_map.old_milestone_id;

UPDATE public.tasks task
SET planning_governance_metadata = COALESCE(task.planning_governance_metadata, '{}'::jsonb)
  || jsonb_build_object(
    'migration300LegacyMilestoneRelation',
    jsonb_build_object(
      'oldMilestoneId', relation.milestone_id::text,
      'canonicalMilestoneTaskId', milestone_map.canonical_task_id::text,
      'relationType', relation.relation_type,
      'migratedBy', '300_runtime_legacy_compatibility_cleanup'
    )
  )
FROM public.task_milestones relation
JOIN migration_300_milestone_map milestone_map
  ON milestone_map.old_milestone_id = relation.milestone_id
WHERE task.id = relation.task_id;

UPDATE public.tasks task
SET milestone_id = milestone_map.canonical_task_id
FROM public.task_milestones relation
JOIN migration_300_milestone_map milestone_map
  ON milestone_map.old_milestone_id = relation.milestone_id
WHERE task.id = relation.task_id
  AND task.id <> milestone_map.canonical_task_id
  AND (
    task.milestone_id IS NULL
    OR task.milestone_id = relation.milestone_id
    OR task.milestone_id = milestone_map.canonical_task_id
  );

ALTER TABLE public.tasks
  ADD CONSTRAINT fk_tasks_canonical_milestone_id
  FOREIGN KEY (milestone_id) REFERENCES public.tasks(id) ON DELETE SET NULL;

ALTER TABLE public.task_baseline_items
  ADD CONSTRAINT task_baseline_items_source_milestone_id_fkey
  FOREIGN KEY (source_milestone_id) REFERENCES public.tasks(id) ON DELETE SET NULL;

INSERT INTO public.notifications (
  id,
  user_id,
  notification_type,
  title,
  content,
  target_type,
  target_id,
  priority,
  channel,
  is_read,
  is_system,
  read_at,
  metadata,
  created_at,
  project_id,
  task_id,
  type,
  severity,
  level,
  is_broadcast,
  source_entity_type,
  source_entity_id,
  category,
  status,
  first_seen_at,
  acknowledged_at,
  resolved_at,
  updated_at,
  company_id,
  warning_lifecycle_status,
  lifecycle_status,
  dedupe_key
)
SELECT
  CASE WHEN id_collision.id IS NULL THEN warning.id ELSE gen_random_uuid() END,
  NULL,
  'warning',
  warning.title,
  warning.description,
  CASE WHEN warning.task_id IS NULL THEN 'project' ELSE 'task' END,
  COALESCE(warning.task_id, warning.project_id),
  CASE WHEN warning.warning_level = 'critical' THEN 'high' ELSE 'normal' END,
  'in_app',
  COALESCE(warning.is_acknowledged, FALSE) OR COALESCE(warning.resolved, FALSE),
  TRUE,
  COALESCE(warning.acknowledged_at, warning.resolved_at),
  jsonb_build_object(
    'migratedBy', '300_runtime_legacy_compatibility_cleanup',
    'legacyWarningId', warning.id::text,
    'legacyAcknowledgedBy', warning.acknowledged_by,
    'legacyResolvedBy', warning.resolved_by
  ),
  warning.created_at,
  warning.project_id,
  warning.task_id,
  warning.warning_type,
  warning.warning_level,
  warning.warning_level,
  TRUE,
  'warning',
  warning.id::text,
  warning.warning_type,
  CASE
    WHEN COALESCE(warning.resolved, FALSE) THEN 'resolved'
    WHEN COALESCE(warning.is_acknowledged, FALSE) THEN 'acknowledged'
    ELSE 'active'
  END,
  warning.created_at,
  warning.acknowledged_at,
  warning.resolved_at,
  COALESCE(warning.updated_at, warning.created_at, NOW()),
  project.company_id,
  CASE
    WHEN COALESCE(warning.resolved, FALSE) THEN 'resolved'
    WHEN COALESCE(warning.is_acknowledged, FALSE) THEN 'acknowledged'
    ELSE 'active'
  END,
  CASE WHEN COALESCE(warning.resolved, FALSE) THEN 'closed' ELSE 'active' END,
  'migration-300-warning:' || warning.id::text
FROM public.warnings warning
JOIN public.projects project ON project.id = warning.project_id
LEFT JOIN public.notifications id_collision ON id_collision.id = warning.id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.notifications canonical_warning
  WHERE canonical_warning.source_entity_type = 'warning'
    AND canonical_warning.source_entity_id = warning.id::text
);

WITH unit_sources AS (
  SELECT task.project_id, BTRIM(task.responsible_unit) AS unit_name
  FROM public.tasks task
  WHERE NULLIF(BTRIM(task.responsible_unit), '') IS NOT NULL
  UNION
  SELECT task.project_id, BTRIM(task.assignee_unit) AS unit_name
  FROM public.tasks task
  WHERE NULLIF(BTRIM(task.assignee_unit), '') IS NOT NULL
  UNION
  SELECT condition.project_id, BTRIM(condition.responsible_unit) AS unit_name
  FROM public.task_conditions condition
  WHERE NULLIF(BTRIM(condition.responsible_unit), '') IS NOT NULL
  UNION
  SELECT plan.project_id, BTRIM(plan.responsible_unit) AS unit_name
  FROM public.acceptance_plans plan
  WHERE NULLIF(BTRIM(plan.responsible_unit), '') IS NOT NULL
), normalized_sources AS (
  SELECT DISTINCT ON (project_id, LOWER(unit_name))
    project_id,
    unit_name
  FROM unit_sources
  ORDER BY project_id, LOWER(unit_name), unit_name
)
INSERT INTO public.participant_units (
  id,
  project_id,
  unit_name,
  unit_type,
  unit_status,
  governance_metadata
)
SELECT
  gen_random_uuid(),
  source.project_id,
  source.unit_name,
  '其他',
  'active',
  jsonb_build_object(
    'migratedBy', '300_runtime_legacy_compatibility_cleanup',
    'source', 'retired_responsible_unit_text'
  )
FROM normalized_sources source
WHERE NOT EXISTS (
  SELECT 1
  FROM public.participant_units participant_unit
  WHERE participant_unit.project_id IS NOT DISTINCT FROM source.project_id
    AND LOWER(BTRIM(participant_unit.unit_name)) = LOWER(source.unit_name)
);

WITH task_unit_source AS (
  SELECT
    task.id AS task_id,
    task.project_id,
    COALESCE(NULLIF(BTRIM(task.responsible_unit), ''), NULLIF(BTRIM(task.assignee_unit), '')) AS unit_name
  FROM public.tasks task
), participant_unit AS (
  SELECT DISTINCT ON (source.task_id)
    source.task_id,
    unit.id
  FROM task_unit_source source
  JOIN public.participant_units unit
    ON unit.project_id IS NOT DISTINCT FROM source.project_id
   AND LOWER(BTRIM(unit.unit_name)) = LOWER(source.unit_name)
  WHERE source.unit_name IS NOT NULL
  ORDER BY source.task_id, unit.created_at, unit.id
)
UPDATE public.tasks task
SET participant_unit_id = participant_unit.id
FROM participant_unit
WHERE task.id = participant_unit.task_id
  AND task.participant_unit_id IS DISTINCT FROM participant_unit.id;

WITH participant_unit AS (
  SELECT DISTINCT ON (condition.id)
    condition.id AS condition_id,
    unit.id
  FROM public.task_conditions condition
  JOIN public.participant_units unit
    ON unit.project_id IS NOT DISTINCT FROM condition.project_id
   AND LOWER(BTRIM(unit.unit_name)) = LOWER(BTRIM(condition.responsible_unit))
  WHERE NULLIF(BTRIM(condition.responsible_unit), '') IS NOT NULL
  ORDER BY condition.id, unit.created_at, unit.id
)
UPDATE public.task_conditions condition
SET participant_unit_id = participant_unit.id
FROM participant_unit
WHERE condition.id = participant_unit.condition_id
  AND condition.participant_unit_id IS DISTINCT FROM participant_unit.id;

WITH participant_unit AS (
  SELECT DISTINCT ON (plan.id)
    plan.id AS plan_id,
    unit.id
  FROM public.acceptance_plans plan
  JOIN public.participant_units unit
    ON unit.project_id IS NOT DISTINCT FROM plan.project_id
   AND LOWER(BTRIM(unit.unit_name)) = LOWER(BTRIM(plan.responsible_unit))
  WHERE NULLIF(BTRIM(plan.responsible_unit), '') IS NOT NULL
  ORDER BY plan.id, unit.created_at, unit.id
)
UPDATE public.acceptance_plans plan
SET participant_unit_id = participant_unit.id
FROM participant_unit
WHERE plan.id = participant_unit.plan_id
  AND plan.participant_unit_id IS DISTINCT FROM participant_unit.id;

UPDATE public.tasks task
SET phase_object_id = eo.id
FROM public.engineering_objects eo
WHERE task.phase_id = eo.id
  AND eo.project_id = task.project_id
  AND eo.object_type = 'phase'
  AND task.phase_object_id IS NULL;

INSERT INTO public.task_dependencies (
  project_id,
  task_id,
  dependency_task_id,
  dependency_type,
  lag_days,
  required_for_start,
  source_type,
  status,
  metadata,
  inference_confidence,
  inference_reason,
  evaluated_at
)
SELECT
  task.project_id,
  task.id,
  task.preceding_task_id,
  'FS',
  0,
  TRUE,
  'legacy_direct_predecessor',
  'active',
  jsonb_build_object('migratedBy', '300_runtime_legacy_compatibility_cleanup'),
  'high',
  'Migrated from the retired direct predecessor column',
  NOW()
FROM public.tasks task
WHERE task.preceding_task_id IS NOT NULL
ON CONFLICT (project_id, task_id, dependency_task_id, dependency_type)
  WHERE status = 'active'
DO NOTHING;

INSERT INTO public.project_entity_links (
  project_id,
  source_entity_type,
  source_entity_id,
  target_entity_type,
  target_entity_id,
  relation_type,
  relation_strength,
  status,
  source_ref_field,
  display_snapshot,
  metadata,
  created_at,
  updated_at
)
SELECT
  plan.project_id,
  'acceptance_plan',
  plan.id::text,
  'task',
  plan.task_id::text,
  'covers_task',
  'legacy_mapped',
  'active',
  'task_id',
  jsonb_build_object('acceptanceName', plan.acceptance_name),
  jsonb_build_object('migratedBy', '300_runtime_legacy_compatibility_cleanup'),
  COALESCE(plan.created_at, NOW()),
  NOW()
FROM public.acceptance_plans plan
WHERE plan.task_id IS NOT NULL
ON CONFLICT (
  project_id,
  source_entity_type,
  source_entity_id,
  target_entity_type,
  target_entity_id,
  relation_type
)
  WHERE status = 'active'
DO NOTHING;

UPDATE public.notifications
SET warning_lifecycle_status = CASE
  WHEN COALESCE(is_escalated, FALSE) = TRUE OR escalated_to_risk_id IS NOT NULL THEN 'escalated'
  WHEN resolved_at IS NOT NULL OR resolved_source IS NOT NULL OR status = 'resolved' THEN 'resolved'
  WHEN muted_until IS NOT NULL AND muted_until > NOW() THEN 'muted'
  WHEN acknowledged_at IS NOT NULL OR status = 'acknowledged' THEN 'acknowledged'
  WHEN first_seen_at IS NOT NULL THEN 'active'
  ELSE 'created'
END
WHERE source_entity_type = 'warning'
  AND (warning_lifecycle_status IS NULL OR BTRIM(warning_lifecycle_status) = '');

UPDATE public.notifications
SET metadata = metadata - 'personal_states'
WHERE jsonb_typeof(metadata) = 'object'
  AND metadata ? 'personal_states';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM migration_300_milestone_map)
     <> (SELECT COUNT(*) FROM public.milestones) THEN
    RAISE EXCEPTION 'migration 300 did not map every legacy milestone';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM migration_300_milestone_map milestone_map
    LEFT JOIN public.tasks canonical_task ON canonical_task.id = milestone_map.canonical_task_id
    WHERE canonical_task.id IS NULL OR canonical_task.is_milestone IS DISTINCT FROM TRUE
  ) THEN
    RAISE EXCEPTION 'migration 300 did not preserve every legacy milestone as a canonical task';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.task_milestones relation
    JOIN migration_300_milestone_map milestone_map
      ON milestone_map.old_milestone_id = relation.milestone_id
    JOIN public.tasks task ON task.id = relation.task_id
    WHERE NOT (
      task.milestone_id = milestone_map.canonical_task_id
      OR task.id = milestone_map.canonical_task_id
    )
      OR COALESCE(
        task.planning_governance_metadata
          -> 'migration300LegacyMilestoneRelation'
          ->> 'oldMilestoneId',
        ''
      ) <> relation.milestone_id::text
  ) THEN
    RAISE EXCEPTION 'migration 300 did not preserve every legacy task milestone relation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.task_baseline_items baseline_item
    WHERE baseline_item.generation_metadata ? 'migration300LegacySourceMilestoneId'
      AND NOT EXISTS (
        SELECT 1
        FROM migration_300_milestone_map milestone_map
        WHERE milestone_map.old_milestone_id::text = baseline_item.generation_metadata ->> 'migration300LegacySourceMilestoneId'
          AND milestone_map.canonical_task_id = baseline_item.source_milestone_id
      )
  ) THEN
    RAISE EXCEPTION 'migration 300 did not preserve every baseline milestone source';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.warnings warning
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.notifications canonical_warning
      WHERE canonical_warning.source_entity_type = 'warning'
        AND canonical_warning.source_entity_id = warning.id::text
        AND canonical_warning.project_id = warning.project_id
    )
  ) THEN
    RAISE EXCEPTION 'migration 300 did not preserve every warning as a canonical notification';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tasks task
    LEFT JOIN public.participant_units participant_unit ON participant_unit.id = task.participant_unit_id
    WHERE COALESCE(NULLIF(BTRIM(task.responsible_unit), ''), NULLIF(BTRIM(task.assignee_unit), '')) IS NOT NULL
      AND (
        participant_unit.id IS NULL
        OR participant_unit.project_id IS DISTINCT FROM task.project_id
        OR LOWER(BTRIM(participant_unit.unit_name))
          <> LOWER(COALESCE(NULLIF(BTRIM(task.responsible_unit), ''), NULLIF(BTRIM(task.assignee_unit), '')))
      )
  ) THEN
    RAISE EXCEPTION 'migration 300 did not preserve every task participant unit';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.task_conditions condition
    LEFT JOIN public.participant_units participant_unit ON participant_unit.id = condition.participant_unit_id
    WHERE NULLIF(BTRIM(condition.responsible_unit), '') IS NOT NULL
      AND (
        participant_unit.id IS NULL
        OR participant_unit.project_id IS DISTINCT FROM condition.project_id
        OR LOWER(BTRIM(participant_unit.unit_name)) <> LOWER(BTRIM(condition.responsible_unit))
      )
  ) THEN
    RAISE EXCEPTION 'migration 300 did not preserve every condition participant unit';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.acceptance_plans plan
    LEFT JOIN public.participant_units participant_unit ON participant_unit.id = plan.participant_unit_id
    WHERE NULLIF(BTRIM(plan.responsible_unit), '') IS NOT NULL
      AND (
        participant_unit.id IS NULL
        OR participant_unit.project_id IS DISTINCT FROM plan.project_id
        OR LOWER(BTRIM(participant_unit.unit_name)) <> LOWER(BTRIM(plan.responsible_unit))
      )
  ) THEN
    RAISE EXCEPTION 'migration 300 did not preserve every acceptance plan participant unit';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.acceptance_plans plan
    WHERE plan.task_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.project_entity_links link
        WHERE link.project_id = plan.project_id
          AND link.source_entity_type = 'acceptance_plan'
          AND link.source_entity_id = plan.id::text
          AND link.target_entity_type = 'task'
          AND link.target_entity_id = plan.task_id::text
          AND link.relation_type = 'covers_task'
          AND link.status = 'active'
      )
  ) THEN
    RAISE EXCEPTION 'migration 300 did not preserve every acceptance plan task link';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tasks task
    WHERE task.preceding_task_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.task_dependencies dependency
        WHERE dependency.project_id = task.project_id
          AND dependency.task_id = task.id
          AND dependency.dependency_task_id = task.preceding_task_id
          AND dependency.dependency_type = 'FS'
          AND dependency.status = 'active'
      )
  ) THEN
    RAISE EXCEPTION 'migration 300 did not preserve every direct predecessor relation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tasks task
    JOIN public.engineering_objects engineering_object
      ON engineering_object.id = task.phase_id
     AND engineering_object.project_id = task.project_id
     AND engineering_object.object_type = 'phase'
    WHERE task.phase_object_id IS DISTINCT FROM engineering_object.id
  ) THEN
    RAISE EXCEPTION 'migration 300 did not preserve every valid phase object reference';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notifications
    WHERE source_entity_type = 'warning'
      AND (warning_lifecycle_status IS NULL OR BTRIM(warning_lifecycle_status) = '')
  ) THEN
    RAISE EXCEPTION 'migration 300 left warning lifecycle status incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notifications
    WHERE jsonb_typeof(metadata) = 'object'
      AND metadata ? 'personal_states'
  ) THEN
    RAISE EXCEPTION 'migration 300 left legacy personal notification state in metadata';
  END IF;
END
$$;

DROP POLICY IF EXISTS engineering_categories_select_policy ON public.engineering_categories;
CREATE POLICY engineering_categories_select_policy ON public.engineering_categories
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_members project_member
      WHERE project_member.project_id = engineering_categories.project_id
        AND project_member.user_id = auth.uid()
    )
    OR project_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.users user_row
      WHERE user_row.id = auth.uid()
        AND user_row.global_role = 'company_admin'
    )
    OR (SELECT current_setting('role', TRUE) = 'service_role')
  );

DROP POLICY IF EXISTS engineering_objects_select_policy ON public.engineering_objects;
CREATE POLICY engineering_objects_select_policy ON public.engineering_objects
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_members project_member
      WHERE project_member.project_id = engineering_objects.project_id
        AND project_member.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.users user_row
      WHERE user_row.id = auth.uid()
        AND user_row.global_role = 'company_admin'
    )
    OR (SELECT current_setting('role', TRUE) = 'service_role')
  );

DROP TABLE public.task_milestones;
DROP TABLE public.milestones;
DROP TABLE public.warnings;

ALTER TABLE public.users DROP COLUMN IF EXISTS role;
ALTER TABLE public.users DROP COLUMN IF EXISTS device_id;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS phase_id;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS preceding_task_id;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS responsible_unit;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS assignee_unit;
ALTER TABLE public.task_conditions DROP COLUMN IF EXISTS responsible_unit;
ALTER TABLE public.acceptance_plans DROP COLUMN IF EXISTS task_id;
ALTER TABLE public.acceptance_plans DROP COLUMN IF EXISTS responsible_unit;

NOTIFY pgrst, 'reload schema';

COMMIT;
