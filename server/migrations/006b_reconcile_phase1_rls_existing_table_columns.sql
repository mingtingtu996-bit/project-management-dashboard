-- Reconcile existing Phase 1 tables whose early definitions used legacy names.

ALTER TABLE acceptance_nodes
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES acceptance_plans(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

UPDATE acceptance_nodes
   SET plan_id = acceptance_plan_id
 WHERE plan_id IS NULL
   AND acceptance_plan_id IS NOT NULL;

ALTER TABLE pre_milestone_conditions
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE wbs_task_links
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
