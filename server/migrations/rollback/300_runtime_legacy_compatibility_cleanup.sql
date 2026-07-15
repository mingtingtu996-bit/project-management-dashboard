-- Manual rollback for migration 300. Run only after stopping application writes.
-- Canonical records remain authoritative; this reconstructs the retired shape
-- from migration metadata without deleting canonical data.

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS device_id VARCHAR(255);

UPDATE public.users
SET
  role = CASE WHEN global_role = 'company_admin' THEN 'company_admin' ELSE 'member' END,
  device_id = COALESCE(NULLIF(device_id, ''), 'user-' || COALESCE(NULLIF(username, ''), id::text));

ALTER TABLE public.users ALTER COLUMN device_id SET NOT NULL;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES public.engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS preceding_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responsible_unit TEXT,
  ADD COLUMN IF NOT EXISTS assignee_unit VARCHAR(100);

ALTER TABLE public.task_conditions
  ADD COLUMN IF NOT EXISTS responsible_unit VARCHAR(255);

UPDATE public.tasks task
SET
  phase_id = COALESCE(task.phase_id, task.phase_object_id),
  responsible_unit = COALESCE(task.responsible_unit, participant_unit.unit_name),
  assignee_unit = COALESCE(task.assignee_unit, participant_unit.unit_name)
FROM public.participant_units participant_unit
WHERE participant_unit.id = task.participant_unit_id;

UPDATE public.tasks task
SET preceding_task_id = dependency.dependency_task_id
FROM (
  SELECT DISTINCT ON (project_id, task_id)
    project_id,
    task_id,
    dependency_task_id
  FROM public.task_dependencies
  WHERE status = 'active'
    AND dependency_type = 'FS'
  ORDER BY project_id, task_id, created_at, id
) dependency
WHERE task.project_id = dependency.project_id
  AND task.id = dependency.task_id
  AND task.preceding_task_id IS NULL;

UPDATE public.task_conditions condition
SET responsible_unit = COALESCE(condition.responsible_unit, participant_unit.unit_name)
FROM public.participant_units participant_unit
WHERE participant_unit.id = condition.participant_unit_id;

ALTER TABLE public.acceptance_plans
  ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responsible_unit TEXT;

UPDATE public.acceptance_plans plan
SET responsible_unit = COALESCE(plan.responsible_unit, participant_unit.unit_name)
FROM public.participant_units participant_unit
WHERE participant_unit.id = plan.participant_unit_id;

UPDATE public.acceptance_plans plan
SET task_id = link.target_entity_id::uuid
FROM (
  SELECT DISTINCT ON (project_id, source_entity_id)
    project_id,
    source_entity_id,
    target_entity_id
  FROM public.project_entity_links
  WHERE source_entity_type = 'acceptance_plan'
    AND target_entity_type = 'task'
    AND relation_type = 'covers_task'
    AND status = 'active'
  ORDER BY project_id, source_entity_id, created_at, id
) link
WHERE plan.project_id = link.project_id
  AND plan.id::text = link.source_entity_id
  AND plan.task_id IS NULL;

ALTER TABLE public.task_baseline_items
  DROP CONSTRAINT IF EXISTS task_baseline_items_source_milestone_id_fkey;
ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS fk_tasks_canonical_milestone_id;

CREATE TABLE IF NOT EXISTS public.milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  target_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  baseline_date DATE,
  current_plan_date DATE,
  actual_date DATE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

INSERT INTO public.milestones (
  id,
  project_id,
  title,
  description,
  target_date,
  status,
  completed_at,
  created_at,
  baseline_date,
  current_plan_date,
  actual_date,
  created_by
)
SELECT
  (task.planning_governance_metadata -> 'migration300LegacyMilestone' ->> 'id')::uuid,
  task.project_id,
  task.title,
  task.description,
  COALESCE(
    (task.planning_governance_metadata -> 'migration300LegacyMilestone' ->> 'targetDate')::date,
    task.planned_end_date,
    task.end_date,
    CURRENT_DATE
  ),
  COALESCE(
    NULLIF(task.planning_governance_metadata -> 'migration300LegacyMilestone' ->> 'status', ''),
    task.status,
    'pending'
  ),
  task.actual_end_date::timestamp,
  task.created_at,
  task.baseline_end,
  COALESCE(task.planned_end_date, task.end_date),
  task.actual_end_date,
  task.created_by
FROM public.tasks task
WHERE task.planning_governance_metadata ? 'migration300LegacyMilestone'
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.task_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  milestone_id UUID NOT NULL REFERENCES public.milestones(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL DEFAULT '关联'
    CHECK (relation_type IN ('关联', '关键', '依赖')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (task_id, milestone_id)
);

INSERT INTO public.task_milestones (
  task_id,
  milestone_id,
  relation_type
)
SELECT
  task.id,
  (task.planning_governance_metadata -> 'migration300LegacyMilestoneRelation' ->> 'oldMilestoneId')::uuid,
  COALESCE(
    NULLIF(task.planning_governance_metadata -> 'migration300LegacyMilestoneRelation' ->> 'relationType', ''),
    '关联'
  )
FROM public.tasks task
WHERE task.planning_governance_metadata ? 'migration300LegacyMilestoneRelation'
ON CONFLICT (task_id, milestone_id) DO NOTHING;

UPDATE public.tasks task
SET milestone_id = (
  task.planning_governance_metadata -> 'migration300LegacyMilestoneRelation' ->> 'oldMilestoneId'
)::uuid
WHERE task.planning_governance_metadata ? 'migration300LegacyMilestoneRelation';

UPDATE public.task_baseline_items baseline_item
SET
  source_milestone_id = (
    baseline_item.generation_metadata ->> 'migration300LegacySourceMilestoneId'
  )::uuid,
  generation_metadata = baseline_item.generation_metadata - 'migration300LegacySourceMilestoneId'
WHERE baseline_item.generation_metadata ? 'migration300LegacySourceMilestoneId';

ALTER TABLE public.tasks
  ADD CONSTRAINT fk_tasks_milestone_id
  FOREIGN KEY (milestone_id) REFERENCES public.milestones(id) ON DELETE SET NULL;

ALTER TABLE public.task_baseline_items
  ADD CONSTRAINT task_baseline_items_source_milestone_id_fkey
  FOREIGN KEY (source_milestone_id) REFERENCES public.milestones(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  warning_type VARCHAR(50) NOT NULL,
  warning_level VARCHAR(20) NOT NULL CHECK (warning_level IN ('info', 'warning', 'critical')),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  is_acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.warnings (
  id,
  project_id,
  task_id,
  warning_type,
  warning_level,
  title,
  description,
  is_acknowledged,
  acknowledged_at,
  acknowledged_by,
  resolved,
  resolved_at,
  resolved_by,
  created_at,
  updated_at
)
SELECT
  notification.source_entity_id::uuid,
  notification.project_id,
  notification.task_id,
  COALESCE(notification.category, notification.type, 'warning'),
  COALESCE(notification.severity, notification.level, 'warning'),
  notification.title,
  notification.content,
  notification.acknowledged_at IS NOT NULL,
  notification.acknowledged_at,
  NULLIF(notification.metadata ->> 'legacyAcknowledgedBy', '')::uuid,
  notification.resolved_at IS NOT NULL,
  notification.resolved_at,
  NULLIF(notification.metadata ->> 'legacyResolvedBy', '')::uuid,
  notification.created_at,
  notification.updated_at
FROM public.notifications notification
WHERE notification.source_entity_type = 'warning'
  AND notification.metadata ->> 'migratedBy' = '300_runtime_legacy_compatibility_cleanup'
  AND notification.source_entity_id ~* '^[0-9a-f-]{36}$'
ON CONFLICT (id) DO NOTHING;

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
        AND user_row.role = 'company_admin'
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
        AND user_row.role = 'company_admin'
    )
    OR (SELECT current_setting('role', TRUE) = 'service_role')
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_device_id ON public.users(device_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_tasks_preceding_task_id ON public.tasks(preceding_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_milestone_id ON public.tasks(milestone_id) WHERE milestone_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_milestones_task ON public.task_milestones(task_id);
CREATE INDEX IF NOT EXISTS idx_task_milestones_milestone ON public.task_milestones(milestone_id);
CREATE INDEX IF NOT EXISTS idx_warnings_project_id ON public.warnings(project_id);
CREATE INDEX IF NOT EXISTS idx_warnings_task_id ON public.warnings(task_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_plans_task ON public.acceptance_plans(task_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
