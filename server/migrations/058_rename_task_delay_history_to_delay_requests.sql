-- 058: Rename task_delay_history to delay_requests and extend the shared delay base
-- 前置依赖：任务延迟历史表与任务表已存在

BEGIN;

ALTER TABLE IF EXISTS task_delay_history RENAME TO delay_requests;

ALTER TABLE IF EXISTS delay_requests
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS chain_id UUID;

ALTER TABLE IF EXISTS delay_requests
  ALTER COLUMN approved_by DROP NOT NULL;

UPDATE delay_requests
SET
  status = COALESCE(status, 'approved'),
  requested_at = COALESCE(requested_at, created_at),
  reviewed_at = COALESCE(reviewed_at, approved_at),
  reviewed_by = COALESCE(reviewed_by, approved_by),
  requested_by = COALESCE(requested_by, approved_by)
WHERE status IS NULL
   OR requested_at IS NULL
   OR reviewed_at IS NULL
   OR reviewed_by IS NULL
   OR requested_by IS NULL;

ALTER TABLE task_progress_snapshots
  ADD COLUMN IF NOT EXISTS status VARCHAR(40),
  ADD COLUMN IF NOT EXISTS conditions_met_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conditions_total_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS obstacles_active_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_auto_generated BOOLEAN DEFAULT TRUE;

COMMIT;
