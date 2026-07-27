-- 133_v1414_change_audit_governance.sql
-- v1.4.14: Standardize change_logs + operation_logs + change_action_types dictionary
-- v1.4.15: deletion_retention_events table

BEGIN;

-- ============================================================
-- v1.4.14: change_logs hardening
-- ============================================================
ALTER TABLE change_logs
  ADD COLUMN IF NOT EXISTS action_type TEXT,
  ADD COLUMN IF NOT EXISTS action_group TEXT,
  ADD COLUMN IF NOT EXISTS request_id TEXT,
  ADD COLUMN IF NOT EXISTS before_snapshot JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS after_snapshot JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS retention_policy TEXT NOT NULL DEFAULT 'project_lifecycle';

-- Widen entity_type/change_source constraints to accept all known values.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'change_logs_entity_type_check') THEN
    ALTER TABLE change_logs DROP CONSTRAINT change_logs_entity_type_check;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'change_logs_change_source_check') THEN
    ALTER TABLE change_logs DROP CONSTRAINT change_logs_change_source_check;
  END IF;
END $$;

-- Backfill action_type from existing field_name/source_type for old records.
UPDATE change_logs SET action_type = 'field_update' WHERE action_type IS NULL AND field_name IS NOT NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'change_logs'
      AND column_name = 'source_type'
  ) THEN
    EXECUTE 'UPDATE change_logs SET action_type = source_type WHERE action_type IS NULL AND source_type IS NOT NULL';
  END IF;
END $$;
UPDATE change_logs SET action_type = 'unknown' WHERE action_type IS NULL;

-- Normalize old change_source to new standard values.
UPDATE change_logs SET change_source = 'user_save' WHERE change_source IN ('manual_adjusted', 'manual_edit', 'user_edit');
UPDATE change_logs SET change_source = 'user_confirm' WHERE change_source IN ('manual_close_confirmation', 'manual_keep_processing', 'baseline_revision', 'monthly_plan_confirm');
UPDATE change_logs SET change_source = 'force_action' WHERE change_source IN ('admin_force', 'force_unlock', 'force_close');
UPDATE change_logs SET change_source = 'approved_correction' WHERE change_source IN ('approval', 'correction_request_approved');
UPDATE change_logs SET change_source = 'high_privilege_correction' WHERE change_source IN ('monthly_plan_correction', 'baseline_correction', 'admin_correction');
UPDATE change_logs SET change_source = 'system_auto' WHERE change_source IN ('system', 'auto', 'system_generated', 'scheduler');
UPDATE change_logs SET change_source = 'imported' WHERE change_source IN ('import', 'csv_import', 'batch_import');
UPDATE change_logs SET change_source = 'backfill' WHERE change_source IN ('migration', 'data_backfill', 'legacy_migration');

-- ============================================================
-- v1.4.14: change_action_types dictionary
-- ============================================================
CREATE TABLE IF NOT EXISTS change_action_types (
  action_type TEXT PRIMARY KEY,
  action_name TEXT NOT NULL,
  action_group TEXT NOT NULL,
  entity_type TEXT,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  requires_reason BOOLEAN NOT NULL DEFAULT false,
  user_visible BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Use ASCII names so this migration is not sensitive to file encoding.
INSERT INTO change_action_types (action_type, action_name, action_group, entity_type, requires_approval, requires_reason, user_visible) VALUES
  ('field_update', 'Field update', 'edit', NULL, false, false, false),
  ('task_create', 'Task created', 'create', 'task', false, false, true),
  ('task_update', 'Task updated', 'edit', 'task', false, false, true),
  ('task_list_commit', 'Task list commit summary', 'edit', 'task_list', false, false, true),
  ('task_delete', 'Task deleted', 'delete', 'task', false, false, true),
  ('task_progress', 'Task progress saved', 'edit', 'task', false, false, true),
  ('task_complete', 'Task completed', 'confirm', 'task', false, false, true),
  ('task_reopen', 'Task reopened', 'confirm', 'task', false, false, true),
  ('baseline_publish', 'Baseline published', 'confirm', 'task_baseline', false, false, true),
  ('baseline_generate', 'Baseline generated', 'create', 'task_baseline', false, false, true),
  ('baseline_commit', 'Baseline draft commit summary', 'edit', 'baseline', false, false, true),
  ('monthly_confirm', 'Monthly plan confirmed', 'confirm', 'monthly_plan', false, false, true),
  ('monthly_generate', 'Monthly plan generated', 'create', 'monthly_plan', false, false, true),
  ('monthly_plan_commit', 'Monthly plan draft commit summary', 'edit', 'monthly_plan', false, false, true),
  ('monthly_close', 'Monthly plan closed', 'confirm', 'monthly_plan', false, false, true),
  ('risk_create', 'Risk created', 'create', 'risk', false, false, true),
  ('risk_close', 'Risk closed', 'confirm', 'risk', false, false, true),
  ('risk_convert_issue', 'Risk converted to issue', 'confirm', 'risk', false, false, true),
  ('issue_create', 'Issue created', 'create', 'issue', false, false, true),
  ('issue_close', 'Issue closed', 'confirm', 'issue', false, false, true),
  ('blockage_create', 'Blockage created', 'create', 'task_obstacle', false, false, true),
  ('blockage_close', 'Blockage closed', 'confirm', 'task_obstacle', false, false, true),
  ('condition_satisfy', 'Condition satisfied', 'confirm', 'task_condition', false, false, true),
  ('condition_create', 'Condition created', 'create', 'task_condition', false, false, true),
  ('milestone_mark', 'Milestone marked', 'confirm', 'task', false, false, true),
  ('milestone_unmark', 'Milestone unmarked', 'confirm', 'task', false, false, true),
  ('dependency_change', 'Dependency changed', 'edit', 'task_dependency', false, false, false),
  ('warning_acknowledge', 'Warning acknowledged', 'confirm', 'warning', false, false, true),
  ('warning_escalate', 'Warning escalated', 'confirm', 'warning', false, false, false),
  ('warning_resolve', 'Warning resolved', 'auto', 'warning', false, false, false),
  ('history_correction', 'History correction', 'governance', NULL, true, true, false),
  ('frozen_correction', 'Frozen-period correction', 'governance', NULL, true, true, false),
  ('backfill', 'Backfill', 'governance', NULL, false, false, false),
  ('import', 'Import', 'import', NULL, false, false, true),
  ('template_generate', 'Template generated', 'create', 'task', false, false, true),
  ('scope_change', 'Scope object changed', 'edit', 'engineering_object', false, false, true),
  ('participant_unit_change', 'Participant unit changed', 'edit', 'participant_unit', false, false, true),
  ('drawing_version', 'Drawing version changed', 'confirm', 'construction_drawing', false, false, true),
  ('acceptance_record', 'Acceptance record changed', 'confirm', 'acceptance_plan', false, false, true),
  ('certificate_status', 'Certificate status changed', 'confirm', 'certificate_work_item', false, false, true),
  ('governance_approval', 'Governance approval', 'governance', NULL, true, true, false),
  ('permission_change', 'Permission changed', 'governance', 'project_member', false, false, true),
  ('retention_decision', 'Retention decision', 'delete', NULL, false, false, false),
  ('retention_confirmed', 'Retention decision confirmed', 'confirm', NULL, false, true, false),
  -- v1.4.14 required bootstrap: task lifecycle
  ('task_progress_saved', 'Task progress saved', 'edit', 'task', false, false, false),
  ('task_actual_start_auto', 'Task actual start auto-filled', 'auto', 'task', false, false, false),
  ('task_actual_end_auto', 'Task actual end auto-filled', 'auto', 'task', false, false, false),
  ('task_planned_dates_updated', 'Task planned dates updated', 'edit', 'task', false, false, false),
  ('task_fact_corrected', 'Task fact corrected', 'governance', 'task', true, true, false),
  ('task_code_generated', 'Task code generated', 'auto', 'task_code', false, false, false),
  ('task_code_reassigned', 'Task code reassigned', 'governance', 'task_code', false, false, false),
  -- Engineering objects
  ('engineering_object_created', 'Engineering object created', 'create', 'engineering_object', false, false, true),
  ('engineering_object_disabled', 'Engineering object disabled', 'delete', 'engineering_object', false, false, true),
  ('engineering_object_restored', 'Engineering object restored', 'confirm', 'engineering_object', false, false, true),
  -- Engineering category
  ('engineering_category_calibrated', 'Engineering category calibrated', 'auto', 'engineering_category', false, false, false),
  -- Status dictionary
  ('status_dictionary_version', 'Status dictionary version created', 'create', 'status_dictionary', false, false, false),
  ('status_dictionary_normalized', 'Status auto-normalized', 'auto', 'status_dictionary', false, false, false),
  -- Conditions & obstacles (specific)
  ('condition_auto_satisfied', 'Condition auto-satisfied', 'auto', 'task_condition', false, false, false),
  ('condition_light_confirmed', 'Condition light-confirmed', 'confirm', 'task_condition', false, false, false),
  ('condition_not_applicable', 'Condition marked not applicable', 'confirm', 'task_condition', false, false, false),
  ('obstacle_degraded', 'Obstacle degraded', 'auto', 'task_obstacle', false, false, false),
  ('obstacle_suggested_close', 'Obstacle suggested close', 'auto', 'task_obstacle', false, false, false),
  ('obstacle_reopened', 'Obstacle reopened', 'confirm', 'task_obstacle', false, false, true),
  -- Draft lock
  ('draft_lock_acquired', 'Draft lock acquired', 'auto', 'planning_draft_lock', false, false, false),
  ('draft_lock_released', 'Draft lock released', 'auto', 'planning_draft_lock', false, false, false),
  -- Baseline & monthly plan (specific)
  ('baseline_suggestion_accepted', 'Baseline suggestion accepted', 'confirm', 'task_baseline', false, false, false),
  ('baseline_suggestion_ignored', 'Baseline suggestion ignored', 'confirm', 'task_baseline', false, false, false),
  ('monthly_correction_executed', 'Monthly correction executed', 'governance', 'monthly_plan', true, true, false),
  ('monthly_closed_incomplete', 'Monthly closed with incomplete data', 'confirm', 'monthly_plan', false, false, false),
  -- Milestone & key node
  ('milestone_marked', 'Milestone marked', 'confirm', 'task', false, false, true),
  ('milestone_unmarked', 'Milestone unmarked', 'confirm', 'task', false, false, true),
  ('key_node_algorithm_suggested', 'Key node algorithm suggested', 'auto', 'task', false, false, false),
  -- Drawing (specific)
  ('drawing_approved', 'Drawing approved', 'confirm', 'construction_drawing', false, false, true),
  ('drawing_voided', 'Drawing voided', 'confirm', 'construction_drawing', false, false, true),
  ('drawing_replaced', 'Drawing replaced', 'confirm', 'construction_drawing', false, false, true),
  -- Certificate (specific)
  ('certificate_completed', 'Certificate completed', 'confirm', 'certificate_work_item', false, false, true),
  ('certificate_voided', 'Certificate voided', 'confirm', 'certificate_work_item', false, false, true),
  -- Acceptance (specific)
  ('acceptance_submitted', 'Acceptance submitted', 'confirm', 'acceptance_plan', false, false, true),
  ('acceptance_passed', 'Acceptance passed', 'confirm', 'acceptance_plan', false, false, true),
  ('acceptance_rectifying', 'Acceptance rectifying', 'confirm', 'acceptance_plan', false, false, true),
  ('acceptance_archived', 'Acceptance archived', 'confirm', 'acceptance_plan', false, false, true),
  ('acceptance_task_linked', 'Acceptance task linked', 'edit', 'acceptance_plan', false, false, false),
  -- Material (specific)
  ('material_arrival_confirmed', 'Material arrival confirmed', 'confirm', 'project_material', false, false, true),
  ('material_sample_confirmed', 'Material sample confirmed', 'confirm', 'project_material', false, false, true),
  -- Participant unit (specific)
  ('participant_unit_archived', 'Participant unit archived', 'delete', 'participant_unit', false, false, true),
  ('participant_unit_merged', 'Participant unit merged', 'governance', 'participant_unit', false, false, false),
  -- Project member (specific)
  ('project_member_added', 'Project member added', 'create', 'project_member', false, false, true),
  ('project_member_removed', 'Project member removed', 'delete', 'project_member', false, false, true),
  ('project_member_role_changed', 'Project member role changed', 'edit', 'project_member', false, false, true),
  ('owner_transferred', 'Project owner transferred', 'governance', 'project_member', false, false, true),
  -- Lineage
  ('lineage_import_batch_created', 'Import batch created', 'import', 'data_import_batch', false, false, true)
ON CONFLICT (action_type) DO UPDATE SET
  action_name = EXCLUDED.action_name,
  action_group = EXCLUDED.action_group,
  entity_type = EXCLUDED.entity_type,
  requires_approval = EXCLUDED.requires_approval,
  requires_reason = EXCLUDED.requires_reason,
  user_visible = EXCLUDED.user_visible;

CREATE INDEX IF NOT EXISTS idx_change_action_types_group ON change_action_types(action_group, entity_type);

-- ============================================================
-- v1.4.14: governance_approval_records table
-- ============================================================
CREATE TABLE IF NOT EXISTS governance_approval_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  requested_action TEXT NOT NULL,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_governance_approval_project
  ON governance_approval_records(project_id, status, created_at DESC);

-- ============================================================
-- v1.4.15: deletion_retention_events table
-- ============================================================
CREATE TABLE IF NOT EXISTS deletion_retention_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NULL,
  project_name_snapshot TEXT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_name_snapshot TEXT NULL,
  requested_action TEXT NOT NULL,
  resolved_action TEXT NOT NULL,
  requested_allowed BOOLEAN NOT NULL DEFAULT false,
  resolved_allowed BOOLEAN NOT NULL DEFAULT false,
  execution_mode TEXT NOT NULL DEFAULT 'reject',
  execution_status TEXT NOT NULL DEFAULT 'decided',
  requires_user_confirmation BOOLEAN NOT NULL DEFAULT false,
  reason_code TEXT NOT NULL,
  reference_summary JSONB NOT NULL DEFAULT '{}',
  affected_entity_ids JSONB NOT NULL DEFAULT '[]',
  suggested_action JSONB NOT NULL DEFAULT '{}',
  actor_id UUID NULL,
  change_log_id UUID NULL,
  operation_log_id BIGINT NULL,
  request_id TEXT NULL,
  confirmed_by UUID NULL,
  confirmed_at TIMESTAMPTZ NULL,
  executed_at TIMESTAMPTZ NULL,
  decision_token TEXT NULL,
  expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_retention_events_token
  ON deletion_retention_events(decision_token) WHERE decision_token IS NOT NULL;

-- Bring an already-created early table up to the final v1.4.15 shape.
ALTER TABLE deletion_retention_events
  ADD COLUMN IF NOT EXISTS project_name_snapshot TEXT NULL,
  ADD COLUMN IF NOT EXISTS entity_name_snapshot TEXT NULL,
  ADD COLUMN IF NOT EXISTS requested_action TEXT,
  ADD COLUMN IF NOT EXISTS resolved_action TEXT,
  ADD COLUMN IF NOT EXISTS requested_allowed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolved_allowed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS execution_mode TEXT NOT NULL DEFAULT 'reject',
  ADD COLUMN IF NOT EXISTS execution_status TEXT NOT NULL DEFAULT 'decided',
  ADD COLUMN IF NOT EXISTS requires_user_confirmation BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reason_code TEXT,
  ADD COLUMN IF NOT EXISTS affected_entity_ids JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS suggested_action JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS actor_id UUID NULL,
  ADD COLUMN IF NOT EXISTS change_log_id UUID NULL,
  ADD COLUMN IF NOT EXISTS operation_log_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS request_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS confirmed_by UUID NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ NULL;

DO $$
DECLARE
  has_user_action BOOLEAN;
  has_retention_decision BOOLEAN;
  has_decision_reason BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deletion_retention_events' AND column_name = 'user_action'
  ) INTO has_user_action;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deletion_retention_events' AND column_name = 'retention_decision'
  ) INTO has_retention_decision;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deletion_retention_events' AND column_name = 'decision_reason'
  ) INTO has_decision_reason;

  IF has_user_action THEN
    EXECUTE 'UPDATE deletion_retention_events SET requested_action = COALESCE(requested_action, user_action, ''delete'') WHERE requested_action IS NULL';
  ELSE
    UPDATE deletion_retention_events SET requested_action = 'delete' WHERE requested_action IS NULL;
  END IF;

  IF has_retention_decision THEN
    EXECUTE 'UPDATE deletion_retention_events SET resolved_action = COALESCE(resolved_action, retention_decision, ''reject'') WHERE resolved_action IS NULL';
  ELSE
    UPDATE deletion_retention_events SET resolved_action = 'reject' WHERE resolved_action IS NULL;
  END IF;

  IF has_decision_reason THEN
    EXECUTE 'UPDATE deletion_retention_events SET reason_code = COALESCE(reason_code, decision_reason, ''legacy_retention_decision'') WHERE reason_code IS NULL';
  ELSE
    UPDATE deletion_retention_events SET reason_code = 'legacy_retention_decision' WHERE reason_code IS NULL;
  END IF;
END $$;

ALTER TABLE deletion_retention_events
  ALTER COLUMN requested_action SET NOT NULL,
  ALTER COLUMN resolved_action SET NOT NULL,
  ALTER COLUMN reason_code SET NOT NULL;

ALTER TABLE deletion_retention_events DROP CONSTRAINT IF EXISTS deletion_retention_events_project_id_fkey;
ALTER TABLE deletion_retention_events DROP CONSTRAINT IF EXISTS deletion_retention_events_actor_id_fkey;
ALTER TABLE deletion_retention_events DROP CONSTRAINT IF EXISTS deletion_retention_events_change_log_id_fkey;
ALTER TABLE deletion_retention_events DROP CONSTRAINT IF EXISTS deletion_retention_events_operation_log_id_fkey;
ALTER TABLE deletion_retention_events DROP CONSTRAINT IF EXISTS deletion_retention_events_confirmed_by_fkey;

ALTER TABLE deletion_retention_events
  ADD CONSTRAINT deletion_retention_events_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  ADD CONSTRAINT deletion_retention_events_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT deletion_retention_events_change_log_id_fkey
    FOREIGN KEY (change_log_id) REFERENCES change_logs(id) ON DELETE SET NULL,
  ADD CONSTRAINT deletion_retention_events_operation_log_id_fkey
    FOREIGN KEY (operation_log_id) REFERENCES operation_logs(id) ON DELETE SET NULL,
  ADD CONSTRAINT deletion_retention_events_confirmed_by_fkey
    FOREIGN KEY (confirmed_by) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deletion_retention_events_project
  ON deletion_retention_events(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deletion_retention_events_entity
  ON deletion_retention_events(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deletion_retention_events_request
  ON deletion_retention_events(request_id);

-- ============================================================
-- v1.4.15: operation_logs boundary clarification
-- ============================================================
-- operation_logs is for technical/security audit only, not business change tracking.
ALTER TABLE operation_logs
  ADD COLUMN IF NOT EXISTS audit_domain TEXT NOT NULL DEFAULT 'technical',
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'info';

COMMIT;
