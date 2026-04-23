BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  source_type VARCHAR(60) NOT NULL DEFAULT 'manual',
  source_id UUID,
  source_entity_type VARCHAR(50),
  source_entity_id TEXT,
  chain_id UUID,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium',
  priority INTEGER NOT NULL DEFAULT 50,
  pending_manual_close BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  closed_reason VARCHAR(100),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE public.issues
  ADD COLUMN IF NOT EXISTS source_entity_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS source_entity_id TEXT,
  ADD COLUMN IF NOT EXISTS closed_reason VARCHAR(100),
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

UPDATE public.issues
SET
  severity = COALESCE(severity, 'medium'),
  priority = COALESCE(priority, 50),
  pending_manual_close = COALESCE(pending_manual_close, FALSE),
  status = COALESCE(status, 'open'),
  version = COALESCE(version, 1),
  updated_at = COALESCE(updated_at, created_at, NOW())
WHERE severity IS NULL
   OR priority IS NULL
   OR pending_manual_close IS NULL
   OR status IS NULL
   OR version IS NULL
   OR updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_issues_project ON public.issues(project_id);
CREATE INDEX IF NOT EXISTS idx_issues_task ON public.issues(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_issues_chain_id ON public.issues(chain_id) WHERE chain_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_issues_source ON public.issues(source_id, source_type) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_issues_source_entity ON public.issues(source_entity_type, source_entity_id);

CREATE OR REPLACE FUNCTION public.update_issues_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS issues_updated_at ON public.issues;
CREATE TRIGGER issues_updated_at
  BEFORE UPDATE ON public.issues
  FOR EACH ROW
  EXECUTE FUNCTION public.update_issues_updated_at();

CREATE TABLE IF NOT EXISTS public.change_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id UUID NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  change_reason TEXT,
  changed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  change_source VARCHAR(40) NOT NULL DEFAULT 'manual_adjusted'
);

CREATE INDEX IF NOT EXISTS idx_change_logs_entity ON public.change_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_change_logs_project ON public.change_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_change_logs_changed_at ON public.change_logs(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_logs_changed_by ON public.change_logs(changed_by) WHERE changed_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.participant_units (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  unit_name TEXT NOT NULL,
  unit_type TEXT NOT NULL,
  contact_name TEXT,
  contact_role TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_participant_units_project_id ON public.participant_units(project_id);
CREATE INDEX IF NOT EXISTS idx_participant_units_unit_name ON public.participant_units(unit_name);
CREATE INDEX IF NOT EXISTS idx_participant_units_unit_type ON public.participant_units(unit_type);

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS responsible_unit TEXT,
  ADD COLUMN IF NOT EXISTS participant_unit_id UUID REFERENCES public.participant_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tasks_participant_unit_id ON public.tasks(participant_unit_id);

UPDATE public.tasks
SET responsible_unit = COALESCE(NULLIF(BTRIM(assignee_unit), ''), responsible_unit)
WHERE responsible_unit IS NULL
  AND NULLIF(BTRIM(assignee_unit), '') IS NOT NULL;

WITH project_candidates AS (
  SELECT
    participant_unit_id,
    (ARRAY_AGG(project_id ORDER BY project_id::text))[1] AS project_id,
    COUNT(DISTINCT project_id) AS project_count
  FROM public.tasks
  WHERE participant_unit_id IS NOT NULL
  GROUP BY participant_unit_id
)
UPDATE public.participant_units pu
SET project_id = pc.project_id
FROM project_candidates pc
WHERE pu.id = pc.participant_unit_id
  AND pu.project_id IS NULL
  AND pc.project_count = 1;

UPDATE public.tasks t
SET participant_unit_id = pu.id
FROM public.participant_units pu
WHERE t.participant_unit_id IS NULL
  AND pu.unit_name = COALESCE(NULLIF(BTRIM(t.responsible_unit), ''), NULLIF(BTRIM(t.assignee_unit), ''));

CREATE TABLE IF NOT EXISTS public.acceptance_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  catalog_code TEXT,
  catalog_name TEXT NOT NULL,
  phase_code TEXT,
  scope_level TEXT,
  planned_finish_date DATE,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_acceptance_catalog_project_code
  ON public.acceptance_catalog(project_id, catalog_code)
  WHERE catalog_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_acceptance_catalog_project_id ON public.acceptance_catalog(project_id);

CREATE TABLE IF NOT EXISTS public.acceptance_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  source_plan_id UUID NOT NULL REFERENCES public.acceptance_plans(id) ON DELETE CASCADE,
  target_plan_id UUID NOT NULL REFERENCES public.acceptance_plans(id) ON DELETE CASCADE,
  dependency_kind TEXT NOT NULL DEFAULT 'hard'
    CHECK (dependency_kind IN ('hard', 'soft')),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acceptance_dependencies_project_id
  ON public.acceptance_dependencies(project_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_dependencies_source_plan_id
  ON public.acceptance_dependencies(source_plan_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_dependencies_target_plan_id
  ON public.acceptance_dependencies(target_plan_id);

CREATE TABLE IF NOT EXISTS public.acceptance_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  plan_id UUID NOT NULL REFERENCES public.acceptance_plans(id) ON DELETE CASCADE,
  requirement_type TEXT NOT NULL,
  source_entity_type TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  is_satisfied BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acceptance_requirements_project_id
  ON public.acceptance_requirements(project_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_requirements_plan_id
  ON public.acceptance_requirements(plan_id);

ALTER TABLE public.acceptance_plans
  ADD COLUMN IF NOT EXISTS building_id TEXT,
  ADD COLUMN IF NOT EXISTS scope_level TEXT,
  ADD COLUMN IF NOT EXISTS participant_unit_id UUID REFERENCES public.participant_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS catalog_id UUID,
  ADD COLUMN IF NOT EXISTS phase TEXT,
  ADD COLUMN IF NOT EXISTS phase_order INTEGER,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER,
  ADD COLUMN IF NOT EXISTS parallel_group_id TEXT,
  ADD COLUMN IF NOT EXISTS position JSONB,
  ADD COLUMN IF NOT EXISTS depends_on JSONB,
  ADD COLUMN IF NOT EXISTS depended_by JSONB;

CREATE INDEX IF NOT EXISTS idx_acceptance_plans_participant_unit_id
  ON public.acceptance_plans(participant_unit_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_acceptance_plans_catalog_id'
  ) THEN
    ALTER TABLE public.acceptance_plans
      ADD CONSTRAINT fk_acceptance_plans_catalog_id
      FOREIGN KEY (catalog_id) REFERENCES public.acceptance_catalog(id) ON DELETE SET NULL;
  END IF;
END
$$;

ALTER TABLE public.acceptance_records
  ADD COLUMN IF NOT EXISTS project_id UUID,
  ADD COLUMN IF NOT EXISTS plan_id UUID,
  ADD COLUMN IF NOT EXISTS record_type TEXT,
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS operator TEXT,
  ADD COLUMN IF NOT EXISTS attachments JSONB;

UPDATE public.acceptance_records
SET plan_id = acceptance_plan_id
WHERE plan_id IS NULL
  AND acceptance_plan_id IS NOT NULL;

UPDATE public.acceptance_records ar
SET project_id = ap.project_id
FROM public.acceptance_plans ap
WHERE ar.project_id IS NULL
  AND ar.acceptance_plan_id = ap.id;

CREATE INDEX IF NOT EXISTS idx_acceptance_records_project_id
  ON public.acceptance_records(project_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_records_plan_id
  ON public.acceptance_records(plan_id);

CREATE TABLE IF NOT EXISTS public.certificate_work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  item_code VARCHAR(64),
  item_name VARCHAR(200) NOT NULL,
  item_stage VARCHAR(32) NOT NULL DEFAULT '资料准备',
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  planned_finish_date DATE,
  actual_finish_date DATE,
  approving_authority VARCHAR(100),
  is_shared BOOLEAN DEFAULT FALSE,
  next_action TEXT,
  next_action_due_date DATE,
  is_blocked BOOLEAN DEFAULT FALSE,
  block_reason TEXT,
  sort_order INTEGER DEFAULT 0,
  notes TEXT,
  latest_record_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_certificate_work_items_project
  ON public.certificate_work_items(project_id);
CREATE INDEX IF NOT EXISTS idx_certificate_work_items_stage
  ON public.certificate_work_items(project_id, item_stage);
CREATE INDEX IF NOT EXISTS idx_certificate_work_items_status
  ON public.certificate_work_items(project_id, status);

CREATE TABLE IF NOT EXISTS public.certificate_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  predecessor_type VARCHAR(20) NOT NULL,
  predecessor_id UUID NOT NULL,
  successor_type VARCHAR(20) NOT NULL,
  successor_id UUID NOT NULL,
  dependency_kind VARCHAR(20) NOT NULL DEFAULT 'hard',
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, predecessor_type, predecessor_id, successor_type, successor_id, dependency_kind)
);

CREATE INDEX IF NOT EXISTS idx_certificate_dependencies_project
  ON public.certificate_dependencies(project_id);
CREATE INDEX IF NOT EXISTS idx_certificate_dependencies_predecessor
  ON public.certificate_dependencies(project_id, predecessor_type, predecessor_id);
CREATE INDEX IF NOT EXISTS idx_certificate_dependencies_successor
  ON public.certificate_dependencies(project_id, successor_type, successor_id);

CREATE OR REPLACE FUNCTION public.update_certificate_work_items_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_certificate_work_items_updated_at ON public.certificate_work_items;
CREATE TRIGGER update_certificate_work_items_updated_at
  BEFORE UPDATE ON public.certificate_work_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_certificate_work_items_timestamp();

CREATE OR REPLACE FUNCTION public.create_certificate_work_item_atomic(
  p_id UUID,
  p_project_id UUID,
  p_item_code VARCHAR(64),
  p_item_name VARCHAR(200),
  p_item_stage VARCHAR(32),
  p_status VARCHAR(40),
  p_planned_finish_date DATE,
  p_actual_finish_date DATE,
  p_approving_authority VARCHAR(100),
  p_is_shared BOOLEAN,
  p_next_action TEXT,
  p_next_action_due_date DATE,
  p_is_blocked BOOLEAN,
  p_block_reason TEXT,
  p_sort_order INTEGER,
  p_notes TEXT,
  p_latest_record_at TIMESTAMP,
  p_certificate_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS public.certificate_work_items
LANGUAGE plpgsql
AS $$
DECLARE
  v_work_item public.certificate_work_items%ROWTYPE;
  v_certificate_id UUID;
BEGIN
  INSERT INTO public.certificate_work_items (
    id,
    project_id,
    item_code,
    item_name,
    item_stage,
    status,
    planned_finish_date,
    actual_finish_date,
    approving_authority,
    is_shared,
    next_action,
    next_action_due_date,
    is_blocked,
    block_reason,
    sort_order,
    notes,
    latest_record_at,
    created_at,
    updated_at
  ) VALUES (
    p_id,
    p_project_id,
    p_item_code,
    p_item_name,
    p_item_stage,
    p_status,
    p_planned_finish_date,
    p_actual_finish_date,
    p_approving_authority,
    p_is_shared,
    p_next_action,
    p_next_action_due_date,
    p_is_blocked,
    p_block_reason,
    p_sort_order,
    p_notes,
    COALESCE(p_latest_record_at, NOW()),
    NOW(),
    NOW()
  )
  RETURNING * INTO v_work_item;

  IF p_certificate_ids IS NOT NULL THEN
    FOREACH v_certificate_id IN ARRAY p_certificate_ids LOOP
      INSERT INTO public.certificate_dependencies (
        id,
        project_id,
        predecessor_type,
        predecessor_id,
        successor_type,
        successor_id,
        dependency_kind,
        notes,
        created_at
      ) VALUES (
        gen_random_uuid(),
        p_project_id,
        'certificate',
        v_certificate_id,
        'work_item',
        p_id,
        'hard',
        NULL,
        NOW()
      );
    END LOOP;
  END IF;

  RETURN v_work_item;
END;
$$;

CREATE TABLE IF NOT EXISTS public.task_critical_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  mode VARCHAR(32) NOT NULL,
  anchor_type VARCHAR(16),
  left_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  right_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  reason TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT task_critical_overrides_unique_task_mode UNIQUE (project_id, task_id, mode)
);

CREATE INDEX IF NOT EXISTS idx_task_critical_overrides_project_id
  ON public.task_critical_overrides(project_id);
CREATE INDEX IF NOT EXISTS idx_task_critical_overrides_task_id
  ON public.task_critical_overrides(task_id);

INSERT INTO public.task_critical_overrides (
  id,
  project_id,
  task_id,
  mode,
  anchor_type,
  left_task_id,
  right_task_id,
  reason,
  created_by,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  t.project_id,
  t.id,
  'manual_attention',
  NULL,
  NULL,
  NULL,
  'migrated from tasks.is_critical',
  NULL,
  NOW(),
  NOW()
FROM public.tasks t
WHERE t.is_critical = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM public.task_critical_overrides o
    WHERE o.project_id = t.project_id
      AND o.task_id = t.id
      AND o.mode = 'manual_attention'
  );

CREATE TABLE IF NOT EXISTS public.warning_acknowledgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id UUID NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  warning_type VARCHAR(50) NOT NULL,
  warning_signature VARCHAR(255) NOT NULL,
  acked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_warning_acknowledgments_user_signature
  ON public.warning_acknowledgments(user_id, warning_signature);
CREATE INDEX IF NOT EXISTS idx_warning_acknowledgments_project
  ON public.warning_acknowledgments(project_id, user_id);

ALTER TABLE public.risks
  ADD COLUMN IF NOT EXISTS category VARCHAR(50),
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS source_id UUID,
  ADD COLUMN IF NOT EXISTS chain_id UUID,
  ADD COLUMN IF NOT EXISTS pending_manual_close BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS linked_issue_id UUID,
  ADD COLUMN IF NOT EXISTS closed_reason VARCHAR(100),
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_entity_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS source_entity_id TEXT;

UPDATE public.risks
SET
  category = COALESCE(category, risk_category, 'other'),
  version = COALESCE(version, 1),
  pending_manual_close = COALESCE(pending_manual_close, FALSE)
WHERE category IS NULL
   OR version IS NULL
   OR pending_manual_close IS NULL;

CREATE INDEX IF NOT EXISTS idx_risks_source ON public.risks(source_id, source_type)
  WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_risks_chain_id ON public.risks(chain_id)
  WHERE chain_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_risks_source_entity ON public.risks(source_entity_type, source_entity_id);

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS project_id UUID,
  ADD COLUMN IF NOT EXISTS task_id UUID,
  ADD COLUMN IF NOT EXISTS risk_id UUID,
  ADD COLUMN IF NOT EXISTS type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS severity VARCHAR(30),
  ADD COLUMN IF NOT EXISTS level VARCHAR(30),
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_broadcast BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS source_entity_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS source_entity_id TEXT,
  ADD COLUMN IF NOT EXISTS category VARCHAR(100),
  ADD COLUMN IF NOT EXISTS delay_request_id UUID,
  ADD COLUMN IF NOT EXISTS recipients JSONB,
  ADD COLUMN IF NOT EXISTS status VARCHAR(30),
  ADD COLUMN IF NOT EXISTS chain_id UUID,
  ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated_to_risk_id UUID,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_escalated BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.notifications
  ALTER COLUMN user_id DROP NOT NULL;

UPDATE public.notifications
SET
  project_id = COALESCE(project_id, NULL),
  task_id = COALESCE(task_id, CASE WHEN target_type = 'task' THEN target_id ELSE NULL END),
  type = COALESCE(type, notification_type, target_type, 'system'),
  severity = COALESCE(severity, level, priority, 'info'),
  level = COALESCE(level, severity, priority, 'normal'),
  source_entity_type = COALESCE(source_entity_type, target_type),
  source_entity_id = COALESCE(source_entity_id, target_id::text),
  recipients = COALESCE(
    recipients,
    CASE WHEN user_id IS NOT NULL THEN jsonb_build_array(user_id::text) ELSE '[]'::jsonb END
  ),
  status = COALESCE(status, CASE WHEN COALESCE(is_read, FALSE) THEN 'read' ELSE 'unread' END),
  first_seen_at = COALESCE(first_seen_at, created_at, NOW()),
  updated_at = COALESCE(updated_at, read_at, sent_at, created_at, NOW())
WHERE project_id IS NULL
   OR task_id IS NULL
   OR type IS NULL
   OR severity IS NULL
   OR level IS NULL
   OR source_entity_type IS NULL
   OR source_entity_id IS NULL
   OR recipients IS NULL
   OR status IS NULL
   OR first_seen_at IS NULL
   OR updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_project_id
  ON public.notifications(project_id);
CREATE INDEX IF NOT EXISTS idx_notifications_task_id
  ON public.notifications(task_id)
  WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_source_entity
  ON public.notifications(source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status_created_at
  ON public.notifications(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_warning_chain_id
  ON public.notifications(chain_id)
  WHERE chain_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_warning_source_signature
  ON public.notifications(source_entity_type, source_entity_id)
  WHERE source_entity_type = 'warning';
CREATE INDEX IF NOT EXISTS idx_notifications_warning_status
  ON public.notifications(status, source_entity_type)
  WHERE source_entity_type = 'warning';

ALTER TABLE public.task_progress_snapshots
  ADD COLUMN IF NOT EXISTS event_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS event_source VARCHAR(50);

UPDATE public.task_progress_snapshots
SET
  event_type = COALESCE(event_type, 'task_update'),
  event_source = COALESCE(event_source, CASE WHEN is_auto_generated THEN 'system_auto' ELSE 'manual' END)
WHERE event_type IS NULL
   OR event_source IS NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
