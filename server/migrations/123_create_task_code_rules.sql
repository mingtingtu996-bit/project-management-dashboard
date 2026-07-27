-- 123_create_task_code_rules.sql
-- v1.4.4 Construction task code rules system.
-- Adds project_code, task code rules, sequences, history, and standard work code indexes.

BEGIN;

-- ============================================================
-- 0. Helper: nextval RPC wrapper
-- ============================================================
CREATE OR REPLACE FUNCTION public.nextval(seq_name TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  val INTEGER;
BEGIN
  EXECUTE format('SELECT nextval(%I)', seq_name) INTO val;
  RETURN val;
END;
$$;

DROP FUNCTION IF EXISTS public.nextval(TEXT);

-- ============================================================
-- 0.1 Atomic sequence increment RPC (SELECT FOR UPDATE lock)
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_task_code_sequence(
  p_project_id UUID,
  p_rule_id UUID,
  p_sequence_key TEXT,
  p_seq_length INTEGER DEFAULT 3
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_next_val INTEGER;
BEGIN
  -- Upsert if not exists
  INSERT INTO task_code_sequences (project_id, rule_id, sequence_key, current_value)
  VALUES (p_project_id, p_rule_id, p_sequence_key, 0)
  ON CONFLICT (project_id, rule_id, sequence_key) DO NOTHING;

  -- Lock and increment
  SELECT * INTO v_row FROM task_code_sequences
  WHERE project_id = p_project_id AND rule_id = p_rule_id AND sequence_key = p_sequence_key
  FOR UPDATE;

  v_next_val := v_row.current_value + 1;

  UPDATE task_code_sequences SET current_value = v_next_val, updated_at = NOW()
  WHERE id = v_row.id;

  RETURN LPAD(v_next_val::TEXT, p_seq_length, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.increment_task_code_sequence(UUID, UUID, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_task_code_sequence(UUID, UUID, TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.increment_task_code_sequence(UUID, UUID, TEXT, INTEGER) FROM authenticated;

-- ============================================================
-- 1. projects: project_code
-- ============================================================
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_code TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_code_generated_at TIMESTAMPTZ;
CREATE SEQUENCE IF NOT EXISTS project_code_seq START WITH 1 INCREMENT BY 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_project_code
  ON projects(project_code) WHERE project_code IS NOT NULL;

-- ============================================================
-- 2. tasks: task_code_rule_id / task_code_generated_at
-- ============================================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_code_rule_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_code_generated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tasks_task_code_rule_id
  ON tasks(task_code_rule_id) WHERE task_code_rule_id IS NOT NULL;

-- ============================================================
-- 3. engineering_categories: standard_work_code idempotent confirm
-- ============================================================
ALTER TABLE engineering_categories ADD COLUMN IF NOT EXISTS standard_work_code TEXT;
ALTER TABLE engineering_categories ADD COLUMN IF NOT EXISTS standard_work_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_system_standard_work_code
  ON engineering_categories(standard_work_code)
  WHERE project_id IS NULL AND standard_work_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_project_standard_work_code
  ON engineering_categories(project_id, standard_work_code)
  WHERE project_id IS NOT NULL AND standard_work_code IS NOT NULL;

-- ============================================================
-- 4. project_task_code_rules
-- ============================================================
CREATE TABLE IF NOT EXISTS project_task_code_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL DEFAULT '默认任务编码规则',
  rule_version TEXT NOT NULL DEFAULT 'v1',
  delimiter TEXT NOT NULL DEFAULT '-',
  sequence_length INTEGER NOT NULL DEFAULT 3,
  include_project BOOLEAN NOT NULL DEFAULT true,
  include_phase BOOLEAN NOT NULL DEFAULT true,
  include_section BOOLEAN NOT NULL DEFAULT true,
  include_building BOOLEAN NOT NULL DEFAULT true,
  include_floor BOOLEAN NOT NULL DEFAULT true,
  include_zone BOOLEAN NOT NULL DEFAULT true,
  include_professional BOOLEAN NOT NULL DEFAULT true,
  include_work_code BOOLEAN NOT NULL DEFAULT true,
  enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_task_code_rules_enabled
  ON project_task_code_rules(project_id) WHERE enabled = true;

ALTER TABLE project_task_code_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_task_code_rules_select_policy ON project_task_code_rules;
CREATE POLICY project_task_code_rules_select_policy ON project_task_code_rules
  FOR SELECT USING ((SELECT current_setting('role', true) = 'service_role'));
DROP POLICY IF EXISTS project_task_code_rules_write_policy ON project_task_code_rules;
CREATE POLICY project_task_code_rules_write_policy ON project_task_code_rules
  FOR ALL USING ((SELECT current_setting('role', true) = 'service_role'))
  WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

-- ============================================================
-- 5. task_code_sequences
-- ============================================================
CREATE TABLE IF NOT EXISTS task_code_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES project_task_code_rules(id) ON DELETE CASCADE,
  sequence_key TEXT NOT NULL,
  current_value INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, rule_id, sequence_key)
);

ALTER TABLE task_code_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_code_sequences_policy ON task_code_sequences;
CREATE POLICY task_code_sequences_policy ON task_code_sequences
  FOR ALL USING ((SELECT current_setting('role', true) = 'service_role'))
  WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

-- ============================================================
-- 6. task_code_history
-- ============================================================
CREATE TABLE IF NOT EXISTS task_code_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  old_task_code TEXT,
  new_task_code TEXT NOT NULL,
  change_reason TEXT NOT NULL,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_task_code_history_task_id
  ON task_code_history(task_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_code_history_project_id
  ON task_code_history(project_id, changed_at DESC);

ALTER TABLE task_code_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_code_history_select_policy ON task_code_history;
CREATE POLICY task_code_history_select_policy ON task_code_history
  FOR SELECT USING ((SELECT current_setting('role', true) = 'service_role'));
DROP POLICY IF EXISTS task_code_history_write_policy ON task_code_history;
CREATE POLICY task_code_history_write_policy ON task_code_history
  FOR INSERT WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

-- ============================================================
-- 7. FK: tasks.task_code_rule_id -> project_task_code_rules
-- ============================================================
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_task_code_rule_id_fkey;
ALTER TABLE tasks ADD CONSTRAINT tasks_task_code_rule_id_fkey
  FOREIGN KEY (task_code_rule_id) REFERENCES project_task_code_rules(id) ON DELETE SET NULL;

COMMIT;
