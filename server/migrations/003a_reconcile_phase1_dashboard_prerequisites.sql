-- Reconcile Phase 1 dashboard prerequisites for fresh database replay.
-- Earlier clean-bundle bootstraps carried these columns outside the canonical
-- migration chain; keep this migration idempotent so 004 can run on staging.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT '未开始',
  ADD COLUMN IF NOT EXISTS health_score INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS health_status VARCHAR(50) DEFAULT '亚健康',
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS budget NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS location VARCHAR(255);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS planned_start_date DATE,
  ADD COLUMN IF NOT EXISTS planned_end_date DATE;

UPDATE tasks
   SET planned_start_date = COALESCE(planned_start_date, start_date),
       planned_end_date = COALESCE(planned_end_date, end_date)
 WHERE planned_start_date IS NULL
    OR planned_end_date IS NULL;

ALTER TABLE task_conditions
  ADD COLUMN IF NOT EXISTS status TEXT;

UPDATE task_conditions
   SET status = CASE
     WHEN COALESCE(is_satisfied, FALSE) THEN '已满足'
     ELSE '未满足'
   END
 WHERE status IS NULL;
