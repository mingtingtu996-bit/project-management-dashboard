-- Migration 052: Persist task timeline events
-- Goal: keep task timeline as a historical event stream instead of snapshot-only derivation

CREATE TABLE IF NOT EXISTS task_timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('task', 'milestone', 'condition', 'obstacle')),
  title TEXT NOT NULL,
  description TEXT,
  status_label TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_task_timeline_events_project ON task_timeline_events(project_id);
CREATE INDEX IF NOT EXISTS idx_task_timeline_events_task ON task_timeline_events(task_id);
CREATE INDEX IF NOT EXISTS idx_task_timeline_events_occurred_at ON task_timeline_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_task_timeline_events_type ON task_timeline_events(event_type);

ALTER TABLE task_timeline_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_timeline_events_select_policy" ON task_timeline_events;
CREATE POLICY "task_timeline_events_select_policy" ON task_timeline_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = task_timeline_events.project_id));

DROP POLICY IF EXISTS "task_timeline_events_insert_policy" ON task_timeline_events;
CREATE POLICY "task_timeline_events_insert_policy" ON task_timeline_events FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "task_timeline_events_update_policy" ON task_timeline_events;
CREATE POLICY "task_timeline_events_update_policy" ON task_timeline_events FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION record_task_timeline_event(
  p_project_id UUID,
  p_task_id UUID,
  p_event_type TEXT,
  p_title TEXT,
  p_description TEXT,
  p_status_label TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_created_by UUID DEFAULT NULL,
  p_occurred_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO task_timeline_events (
    project_id,
    task_id,
    event_type,
    title,
    description,
    status_label,
    metadata,
    occurred_at,
    created_by
  ) VALUES (
    p_project_id,
    p_task_id,
    p_event_type,
    p_title,
    p_description,
    p_status_label,
    COALESCE(p_metadata, '{}'::jsonb),
    COALESCE(p_occurred_at, NOW()),
    p_created_by
  );
END;
$$ LANGUAGE plpgsql;

-- Backfill current task states so existing projects already have a readable history.
INSERT INTO task_timeline_events (
  project_id,
  task_id,
  event_type,
  title,
  description,
  status_label,
  metadata,
  occurred_at,
  created_by
)
SELECT
  t.project_id,
  t.id,
  'task',
  COALESCE(t.title, '未命名任务'),
  COALESCE(
    '状态：' || COALESCE(t.status, '未知')
    || '；进度：' || COALESCE(t.progress, 0)::text || '%'
    || '；计划完成：' || COALESCE(TO_CHAR(t.end_date, 'YYYY-MM-DD'), '未设置'),
    '任务状态变化'
  ),
  CASE
    WHEN COALESCE(t.progress, 0) >= 100 OR t.status IN ('已完成', 'completed') THEN '已完成'
    WHEN t.status IN ('进行中', 'in_progress') OR COALESCE(t.progress, 0) > 0 THEN '进行中'
    WHEN t.status IN ('已暂停', 'blocked') THEN '已暂停'
    ELSE '未开始'
  END,
  jsonb_build_object(
    'source', 'backfill',
    'event', 'task_snapshot',
    'progress', COALESCE(t.progress, 0),
    'status', COALESCE(t.status, '未知'),
    'is_milestone', COALESCE(t.is_milestone, FALSE)
  ),
  COALESCE(t.actual_end_date::timestamptz, t.actual_start_date::timestamptz, t.first_progress_at::timestamptz, t.updated_at, t.created_at, NOW()),
  t.updated_by
FROM tasks t
WHERE NOT EXISTS (
  SELECT 1
  FROM task_timeline_events e
  WHERE e.project_id = t.project_id
    AND e.task_id = t.id
    AND e.event_type = 'task'
)
ON CONFLICT DO NOTHING;

INSERT INTO task_timeline_events (
  project_id,
  task_id,
  event_type,
  title,
  description,
  status_label,
  metadata,
  occurred_at,
  created_by
)
SELECT
  t.project_id,
  t.id,
  'milestone',
  COALESCE(t.title, '未命名任务'),
  '里程碑节点已纳入时间线',
  CASE
    WHEN COALESCE(t.progress, 0) >= 100 OR t.status IN ('已完成', 'completed') THEN '已完成'
    WHEN t.status IN ('进行中', 'in_progress') OR COALESCE(t.progress, 0) > 0 THEN '进行中'
    WHEN t.status IN ('已暂停', 'blocked') THEN '已暂停'
    ELSE '未开始'
  END,
  jsonb_build_object('source', 'backfill', 'event', 'milestone_snapshot'),
  COALESCE(t.actual_end_date::timestamptz, t.actual_start_date::timestamptz, t.first_progress_at::timestamptz, t.updated_at, t.created_at, NOW()),
  t.updated_by
FROM tasks t
WHERE COALESCE(t.is_milestone, FALSE) = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM task_timeline_events e
    WHERE e.project_id = t.project_id
      AND e.task_id = t.id
      AND e.event_type = 'milestone'
  )
ON CONFLICT DO NOTHING;

INSERT INTO task_timeline_events (
  project_id,
  task_id,
  event_type,
  title,
  description,
  status_label,
  metadata,
  occurred_at,
  created_by
)
SELECT
  c.project_id,
  c.task_id,
  'condition',
  COALESCE(c.name, '开工条件'),
  CASE WHEN COALESCE(c.is_satisfied, FALSE) THEN '开工条件已满足' ELSE '开工条件待满足' END,
  CASE WHEN COALESCE(c.is_satisfied, FALSE) THEN '已满足' ELSE '待满足' END,
  jsonb_build_object(
    'source', 'backfill',
    'event', 'condition_snapshot',
    'is_satisfied', COALESCE(c.is_satisfied, FALSE),
    'condition_type', COALESCE(c.condition_type, '其他')
  ),
  COALESCE(c.confirmed_at, c.updated_at, c.created_at, NOW()),
  c.created_by
FROM task_conditions c
WHERE NOT EXISTS (
  SELECT 1
  FROM task_timeline_events e
  WHERE e.project_id = c.project_id
    AND e.task_id = c.task_id
    AND e.event_type = 'condition'
    AND e.title = COALESCE(c.name, '开工条件')
)
ON CONFLICT DO NOTHING;

INSERT INTO task_timeline_events (
  project_id,
  task_id,
  event_type,
  title,
  description,
  status_label,
  metadata,
  occurred_at,
  created_by
)
SELECT
  o.project_id,
  o.task_id,
  'obstacle',
  COALESCE(o.description, '阻碍事项'),
  CASE
    WHEN o.status IN ('已解决', 'resolved', 'closed') THEN '阻碍已解决'
    WHEN o.status IN ('处理中', 'resolving') THEN '阻碍处理中'
    WHEN o.status IN ('无法解决', 'blocked') THEN '阻碍暂时无法解决'
    ELSE '现场存在阻碍，需关注'
  END,
  CASE
    WHEN o.status IN ('已解决', 'resolved', 'closed') THEN '已解决'
    WHEN o.status IN ('处理中', 'resolving') THEN '处理中'
    WHEN o.status IN ('无法解决', 'blocked') THEN '无法解决'
    ELSE '待处理'
  END,
  jsonb_build_object(
    'source', 'backfill',
    'event', 'obstacle_snapshot',
    'status', COALESCE(o.status, '待处理'),
    'obstacle_type', COALESCE(o.obstacle_type, '其他'),
    'severity', COALESCE(o.severity, '中')
  ),
  COALESCE(o.resolved_at, o.updated_at, o.created_at, NOW()),
  o.created_by
FROM task_obstacles o
WHERE NOT EXISTS (
  SELECT 1
  FROM task_timeline_events e
  WHERE e.project_id = o.project_id
    AND e.task_id = o.task_id
    AND e.event_type = 'obstacle'
    AND e.title = COALESCE(o.description, '阻碍事项')
)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION sync_task_timeline_for_task()
RETURNS TRIGGER AS $$
DECLARE
  v_status_label TEXT;
  v_description TEXT;
  v_occurred_at TIMESTAMPTZ;
BEGIN
  v_status_label := CASE
    WHEN COALESCE(NEW.progress, 0) >= 100 OR NEW.status IN ('已完成', 'completed') THEN '已完成'
    WHEN NEW.status IN ('进行中', 'in_progress') OR COALESCE(NEW.progress, 0) > 0 THEN '进行中'
    WHEN NEW.status IN ('已暂停', 'blocked') THEN '已暂停'
    ELSE '未开始'
  END;

  v_occurred_at := COALESCE(
    NEW.actual_end_date::timestamptz,
    NEW.actual_start_date::timestamptz,
    NEW.first_progress_at::timestamptz,
    NEW.updated_at,
    NEW.created_at,
    NOW()
  );

  IF TG_OP = 'INSERT' THEN
    v_description := '状态：' || COALESCE(NEW.status, '未知')
      || '；进度：' || COALESCE(NEW.progress, 0)::text || '%'
      || '；计划完成：' || COALESCE(TO_CHAR(NEW.end_date, 'YYYY-MM-DD'), '未设置');

    PERFORM record_task_timeline_event(
      NEW.project_id,
      NEW.id,
      'task',
      COALESCE(NEW.title, '未命名任务'),
      v_description,
      v_status_label,
      jsonb_build_object(
        'source', 'tasks',
        'event', 'created',
        'progress', COALESCE(NEW.progress, 0),
        'status', COALESCE(NEW.status, '未知')
      ),
      NEW.updated_by,
      v_occurred_at
    );

    IF COALESCE(NEW.is_milestone, FALSE) THEN
      PERFORM record_task_timeline_event(
        NEW.project_id,
        NEW.id,
        'milestone',
        COALESCE(NEW.title, '未命名任务'),
        '任务被标记为里程碑节点',
        v_status_label,
        jsonb_build_object('source', 'tasks', 'event', 'milestone_marked'),
        NEW.updated_by,
        v_occurred_at
      );
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
      OR COALESCE(NEW.progress, 0) IS DISTINCT FROM COALESCE(OLD.progress, 0)
      OR NEW.start_date IS DISTINCT FROM OLD.start_date
      OR NEW.end_date IS DISTINCT FROM OLD.end_date
      OR NEW.actual_start_date IS DISTINCT FROM OLD.actual_start_date
      OR NEW.actual_end_date IS DISTINCT FROM OLD.actual_end_date
      OR NEW.first_progress_at IS DISTINCT FROM OLD.first_progress_at THEN
      v_description := '状态：' || COALESCE(NEW.status, '未知')
        || '；进度：' || COALESCE(NEW.progress, 0)::text || '%'
        || '；计划完成：' || COALESCE(TO_CHAR(NEW.end_date, 'YYYY-MM-DD'), '未设置');

      PERFORM record_task_timeline_event(
        NEW.project_id,
        NEW.id,
        'task',
        COALESCE(NEW.title, '未命名任务'),
        v_description,
        v_status_label,
        jsonb_build_object(
          'source', 'tasks',
          'event', 'updated',
          'old_status', COALESCE(OLD.status, ''),
          'new_status', COALESCE(NEW.status, ''),
          'old_progress', COALESCE(OLD.progress, 0),
          'new_progress', COALESCE(NEW.progress, 0)
        ),
        NEW.updated_by,
        v_occurred_at
      );
    END IF;

    IF COALESCE(NEW.is_milestone, FALSE) AND NOT COALESCE(OLD.is_milestone, FALSE) THEN
      PERFORM record_task_timeline_event(
        NEW.project_id,
        NEW.id,
        'milestone',
        COALESCE(NEW.title, '未命名任务'),
        '任务被标记为里程碑节点',
        v_status_label,
        jsonb_build_object('source', 'tasks', 'event', 'milestone_marked'),
        NEW.updated_by,
        v_occurred_at
      );
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_task_timeline_tasks ON tasks;
CREATE TRIGGER trigger_task_timeline_tasks
  AFTER INSERT OR UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION sync_task_timeline_for_task();

CREATE OR REPLACE FUNCTION sync_task_timeline_for_condition()
RETURNS TRIGGER AS $$
DECLARE
  v_status_label TEXT;
  v_description TEXT;
  v_occurred_at TIMESTAMPTZ;
BEGIN
  v_status_label := CASE WHEN COALESCE(NEW.is_satisfied, FALSE) THEN '已满足' ELSE '待满足' END;
  v_occurred_at := COALESCE(NEW.confirmed_at, NEW.updated_at, NEW.created_at, NOW());

  IF TG_OP = 'INSERT' THEN
    v_description := CASE WHEN COALESCE(NEW.is_satisfied, FALSE)
      THEN '开工条件已满足'
      ELSE '开工条件待满足'
    END;

    PERFORM record_task_timeline_event(
      NEW.project_id,
      NEW.task_id,
      'condition',
      COALESCE(NEW.name, '开工条件'),
      v_description,
      v_status_label,
      jsonb_build_object(
        'source', 'task_conditions',
        'event', 'created',
        'is_satisfied', COALESCE(NEW.is_satisfied, FALSE),
        'condition_type', COALESCE(NEW.condition_type, '其他')
      ),
      NEW.created_by,
      v_occurred_at
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_satisfied IS DISTINCT FROM OLD.is_satisfied
      OR NEW.name IS DISTINCT FROM OLD.name
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.condition_type IS DISTINCT FROM OLD.condition_type THEN
      v_description := CASE WHEN COALESCE(NEW.is_satisfied, FALSE)
        THEN '开工条件已满足'
        ELSE '开工条件待满足'
      END;

      PERFORM record_task_timeline_event(
        NEW.project_id,
        NEW.task_id,
        'condition',
        COALESCE(NEW.name, '开工条件'),
        v_description,
        v_status_label,
        jsonb_build_object(
          'source', 'task_conditions',
          'event', 'updated',
          'old_is_satisfied', COALESCE(OLD.is_satisfied, FALSE),
          'new_is_satisfied', COALESCE(NEW.is_satisfied, FALSE),
          'condition_type', COALESCE(NEW.condition_type, '其他')
        ),
        NEW.confirmed_by,
        v_occurred_at
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM record_task_timeline_event(
      OLD.project_id,
      OLD.task_id,
      'condition',
      COALESCE(OLD.name, '开工条件'),
      '开工条件记录已删除',
      CASE WHEN COALESCE(OLD.is_satisfied, FALSE) THEN '已满足' ELSE '待满足' END,
      jsonb_build_object(
        'source', 'task_conditions',
        'event', 'deleted',
        'is_satisfied', COALESCE(OLD.is_satisfied, FALSE),
        'condition_type', COALESCE(OLD.condition_type, '其他')
      ),
      OLD.created_by,
      COALESCE(OLD.updated_at, OLD.created_at, NOW())
    );
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_task_timeline_conditions ON task_conditions;
CREATE TRIGGER trigger_task_timeline_conditions
  AFTER INSERT OR UPDATE OR DELETE ON task_conditions
  FOR EACH ROW
  EXECUTE FUNCTION sync_task_timeline_for_condition();

CREATE OR REPLACE FUNCTION sync_task_timeline_for_obstacle()
RETURNS TRIGGER AS $$
DECLARE
  v_status_label TEXT;
  v_description TEXT;
  v_occurred_at TIMESTAMPTZ;
BEGIN
  v_status_label := CASE
    WHEN COALESCE(NEW.status, OLD.status) IN ('已解决', 'resolved', 'closed') THEN '已解决'
    WHEN COALESCE(NEW.status, OLD.status) IN ('处理中', 'resolving') THEN '处理中'
    WHEN COALESCE(NEW.status, OLD.status) IN ('无法解决', 'blocked') THEN '无法解决'
    ELSE '待处理'
  END;

  v_occurred_at := COALESCE(
    NEW.resolved_at,
    NEW.updated_at,
    NEW.created_at,
    OLD.resolved_at,
    OLD.updated_at,
    OLD.created_at,
    NOW()
  );

  IF TG_OP = 'INSERT' THEN
    v_description := CASE
      WHEN COALESCE(NEW.status, '待处理') IN ('已解决', 'resolved', 'closed') THEN '阻碍已解决'
      WHEN COALESCE(NEW.status, '待处理') IN ('处理中', 'resolving') THEN '阻碍处理中'
      WHEN COALESCE(NEW.status, '待处理') IN ('无法解决', 'blocked') THEN '阻碍暂时无法解决'
      ELSE '现场存在阻碍，需关注'
    END;

    PERFORM record_task_timeline_event(
      NEW.project_id,
      NEW.task_id,
      'obstacle',
      COALESCE(NEW.description, '阻碍事项'),
      v_description,
      v_status_label,
      jsonb_build_object(
        'source', 'task_obstacles',
        'event', 'created',
        'status', COALESCE(NEW.status, '待处理'),
        'obstacle_type', COALESCE(NEW.obstacle_type, '其他'),
        'severity', COALESCE(NEW.severity, '中')
      ),
      NEW.created_by,
      v_occurred_at
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.resolution IS DISTINCT FROM OLD.resolution
      OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
      OR NEW.obstacle_type IS DISTINCT FROM OLD.obstacle_type
      OR NEW.severity IS DISTINCT FROM OLD.severity THEN
      v_description := CASE
        WHEN COALESCE(NEW.status, '待处理') IN ('已解决', 'resolved', 'closed') THEN '阻碍已解决'
        WHEN COALESCE(NEW.status, '待处理') IN ('处理中', 'resolving') THEN '阻碍处理中'
        WHEN COALESCE(NEW.status, '待处理') IN ('无法解决', 'blocked') THEN '阻碍暂时无法解决'
        ELSE '现场存在阻碍，需关注'
      END;

      PERFORM record_task_timeline_event(
        NEW.project_id,
        NEW.task_id,
        'obstacle',
        COALESCE(NEW.description, '阻碍事项'),
        v_description,
        v_status_label,
        jsonb_build_object(
          'source', 'task_obstacles',
          'event', 'updated',
          'old_status', COALESCE(OLD.status, '待处理'),
          'new_status', COALESCE(NEW.status, '待处理'),
          'obstacle_type', COALESCE(NEW.obstacle_type, '其他'),
          'severity', COALESCE(NEW.severity, '中')
        ),
        NEW.created_by,
        v_occurred_at
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM record_task_timeline_event(
      OLD.project_id,
      OLD.task_id,
      'obstacle',
      COALESCE(OLD.description, '阻碍事项'),
      '阻碍记录已删除',
      CASE
        WHEN COALESCE(OLD.status, '待处理') IN ('已解决', 'resolved', 'closed') THEN '已解决'
        WHEN COALESCE(OLD.status, '待处理') IN ('处理中', 'resolving') THEN '处理中'
        WHEN COALESCE(OLD.status, '待处理') IN ('无法解决', 'blocked') THEN '无法解决'
        ELSE '待处理'
      END,
      jsonb_build_object(
        'source', 'task_obstacles',
        'event', 'deleted',
        'status', COALESCE(OLD.status, '待处理'),
        'obstacle_type', COALESCE(OLD.obstacle_type, '其他'),
        'severity', COALESCE(OLD.severity, '中')
      ),
      OLD.created_by,
      COALESCE(OLD.resolved_at, OLD.updated_at, OLD.created_at, NOW())
    );
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_task_timeline_obstacles ON task_obstacles;
CREATE TRIGGER trigger_task_timeline_obstacles
  AFTER INSERT OR UPDATE OR DELETE ON task_obstacles
  FOR EACH ROW
  EXECUTE FUNCTION sync_task_timeline_for_obstacle();
