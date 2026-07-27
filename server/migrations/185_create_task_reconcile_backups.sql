-- v1.4.22.1 §10.7b: Task reconcile backup table for governance rollback
CREATE TABLE IF NOT EXISTS task_reconcile_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  reconcile_batch_id TEXT NOT NULL,
  task_snapshot JSONB NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 30-day TTL: cleanup job deletes rows older than 30 days
  CONSTRAINT fk_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_reconcile_backups_batch ON task_reconcile_backups(reconcile_batch_id);
CREATE INDEX IF NOT EXISTS idx_task_reconcile_backups_project ON task_reconcile_backups(project_id);
CREATE INDEX IF NOT EXISTS idx_task_reconcile_backups_created ON task_reconcile_backups(created_at);
