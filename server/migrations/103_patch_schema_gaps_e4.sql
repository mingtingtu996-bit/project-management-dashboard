-- E4 补丁：修复 B1-BUG-002 / B1-BUG-003 / B1-BUG-004 / A1-BUG-002 schema 缺口
-- 本文件为幂等补丁，可安全重复执行

-- B1-BUG-003: risks 表缺少多列（schema cache 报错，逐列 ADD IF NOT EXISTS 幂等补齐）
ALTER TABLE IF EXISTS public.risks
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.risks
  ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.risks
  ADD COLUMN IF NOT EXISTS impact_description TEXT;
ALTER TABLE IF EXISTS public.risks
  ADD COLUMN IF NOT EXISTS risk_type VARCHAR(50);
ALTER TABLE IF EXISTS public.risks
  ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.risks
  ADD COLUMN IF NOT EXISTS owner_name VARCHAR(255);
ALTER TABLE IF EXISTS public.risks
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- B1-BUG-002: tasks 表缺少 conditions_met_count 等列（approve_delay_request_atomic RPC 依赖）
ALTER TABLE IF EXISTS public.tasks
  ADD COLUMN IF NOT EXISTS conditions_met_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conditions_total_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS obstacles_active_count INTEGER DEFAULT 0;

UPDATE public.tasks
SET
  conditions_met_count   = COALESCE(conditions_met_count, 0),
  conditions_total_count = COALESCE(conditions_total_count, 0),
  obstacles_active_count = COALESCE(obstacles_active_count, 0)
WHERE
  conditions_met_count IS NULL
  OR conditions_total_count IS NULL
  OR obstacles_active_count IS NULL;

-- B1-BUG-004: task_progress_snapshots 缺少唯一索引（migration 097 未在真实库执行）
-- 第一步：回填 NULL / 空白的 event_type 和 event_source
UPDATE public.task_progress_snapshots
SET
  event_type   = COALESCE(NULLIF(BTRIM(event_type), ''), 'task_update'),
  event_source = COALESCE(NULLIF(BTRIM(event_source), ''), CASE WHEN is_auto_generated THEN 'system_auto' ELSE 'manual' END)
WHERE event_type IS NULL OR BTRIM(event_type) = ''
   OR event_source IS NULL OR BTRIM(event_source) = '';

-- 第二步：去重——保留每组最新一条，删除其余重复行（migration 103 首版漏掉此步导致索引创建静默失败）
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY task_id, snapshot_date, event_type, event_source
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.task_progress_snapshots
)
DELETE FROM public.task_progress_snapshots
WHERE id IN (
  SELECT id
  FROM ranked
  WHERE rn > 1
);

-- 第三步：先 DROP 已有索引（可能因重复行只部分创建），再重建
DROP INDEX IF EXISTS uq_task_progress_snapshots_daily_event;
CREATE UNIQUE INDEX uq_task_progress_snapshots_daily_event
  ON public.task_progress_snapshots(task_id, snapshot_date, event_type, event_source);

-- A1-BUG-002: users 表缺少 updated_at 列（auth-profile 路由 UPDATE 时报错）
ALTER TABLE IF EXISTS public.users
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.users
SET updated_at = NOW()
WHERE updated_at IS NULL;

-- B1-BUG-002: approve_delay_request_atomic / reject_delay_request_atomic RPC 函数
-- 原定义在 migration 093，但真实库未执行；此处幂等补入
CREATE OR REPLACE FUNCTION public.approve_delay_request_atomic(
  p_delay_request_id UUID,
  p_reviewer_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_delay_request public.delay_requests%ROWTYPE;
  v_task public.tasks%ROWTYPE;
  v_project_id UUID;
  v_timestamp TIMESTAMPTZ := NOW();
  v_recipients JSONB := '[]'::jsonb;
  v_is_critical BOOLEAN := FALSE;
  v_old_delay_status TEXT;
  v_old_task_end_date TEXT;
  v_old_task_planned_end_date TEXT;
BEGIN
  SELECT *
  INTO v_delay_request
  FROM public.delay_requests
  WHERE id = p_delay_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'DELAY_REQUEST_NOT_FOUND',
      'message', '延期申请不存在',
      'status_code', 404
    );
  END IF;

  IF COALESCE(v_delay_request.status, 'pending') <> 'pending' THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'DELAY_REQUEST_STATE_INVALID',
      'message', '只有待审批延期申请可以通过',
      'status_code', 422
    );
  END IF;

  SELECT *
  INTO v_task
  FROM public.tasks
  WHERE id = v_delay_request.task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'TASK_NOT_FOUND',
      'message', '任务不存在',
      'status_code', 404
    );
  END IF;

  v_project_id := COALESCE(v_delay_request.project_id, v_task.project_id);
  v_is_critical := COALESCE(v_task.is_critical, FALSE) OR v_delay_request.chain_id IS NOT NULL;
  v_old_delay_status := COALESCE(v_delay_request.status, 'pending');
  v_old_task_end_date := COALESCE(v_task.end_date::TEXT, NULL);
  v_old_task_planned_end_date := COALESCE(v_task.planned_end_date::TEXT, NULL);

  UPDATE public.delay_requests
  SET
    status = 'approved',
    reviewed_by = p_reviewer_id,
    reviewed_at = v_timestamp,
    approved_by = p_reviewer_id,
    approved_at = v_timestamp,
    updated_at = v_timestamp
  WHERE id = p_delay_request_id;

  UPDATE public.tasks
  SET
    end_date = v_delay_request.delayed_date,
    planned_end_date = v_delay_request.delayed_date,
    updated_at = v_timestamp
  WHERE id = v_delay_request.task_id;

  INSERT INTO public.change_logs (
    id, project_id, entity_type, entity_id, field_name,
    old_value, new_value, changed_by, changed_at, change_source
  ) VALUES (
    gen_random_uuid(), v_project_id, 'delay_request', v_delay_request.id, 'status',
    v_old_delay_status, 'approved', p_reviewer_id, v_timestamp, 'approval'
  );

  INSERT INTO public.change_logs (
    id, project_id, entity_type, entity_id, field_name,
    old_value, new_value, changed_by, changed_at, change_source
  ) VALUES (
    gen_random_uuid(), v_project_id, 'task', v_task.id, 'end_date',
    v_old_task_end_date, v_delay_request.delayed_date::TEXT, p_reviewer_id, v_timestamp, 'approval'
  );

  INSERT INTO public.change_logs (
    id, project_id, entity_type, entity_id, field_name,
    old_value, new_value, changed_by, changed_at, change_source
  ) VALUES (
    gen_random_uuid(), v_project_id, 'task', v_task.id, 'planned_end_date',
    v_old_task_planned_end_date, v_delay_request.delayed_date::TEXT, p_reviewer_id, v_timestamp, 'approval'
  );

  INSERT INTO public.task_progress_snapshots (
    id, task_id, progress, snapshot_date, event_type, event_source,
    notes, status, conditions_met_count, conditions_total_count,
    obstacles_active_count, recorded_by, is_auto_generated, created_at
  ) VALUES (
    gen_random_uuid(), v_task.id, COALESCE(v_task.progress, 0), v_timestamp::DATE,
    'delay_approved', 'delay_request',
    '延期审批通过，计划完成时间调整为 ' || v_delay_request.delayed_date::TEXT,
    COALESCE(v_task.status, 'todo'),
    COALESCE(v_task.conditions_met_count, 0),
    COALESCE(v_task.conditions_total_count, 0),
    COALESCE(v_task.obstacles_active_count, 0),
    p_reviewer_id, TRUE, v_timestamp
  )
  ON CONFLICT (task_id, snapshot_date, event_type, event_source)
  DO UPDATE SET
    progress = EXCLUDED.progress,
    notes = EXCLUDED.notes,
    status = EXCLUDED.status,
    conditions_met_count = EXCLUDED.conditions_met_count,
    conditions_total_count = EXCLUDED.conditions_total_count,
    obstacles_active_count = EXCLUDED.obstacles_active_count,
    recorded_by = EXCLUDED.recorded_by,
    created_at = EXCLUDED.created_at;

  INSERT INTO public.task_progress_snapshots (
    id, task_id, progress, snapshot_date, event_type, event_source,
    notes, status, conditions_met_count, conditions_total_count,
    obstacles_active_count, recorded_by, is_auto_generated, created_at
  ) VALUES (
    gen_random_uuid(), v_task.id, COALESCE(v_task.progress, 0), v_timestamp::DATE,
    'delay_approved_assessment', 'delay_request',
    '延期审批通过后触发后续影响评估',
    COALESCE(v_task.status, 'todo'),
    COALESCE(v_task.conditions_met_count, 0),
    COALESCE(v_task.conditions_total_count, 0),
    COALESCE(v_task.obstacles_active_count, 0),
    p_reviewer_id, TRUE, v_timestamp
  )
  ON CONFLICT (task_id, snapshot_date, event_type, event_source)
  DO UPDATE SET
    progress = EXCLUDED.progress,
    notes = EXCLUDED.notes,
    status = EXCLUDED.status,
    conditions_met_count = EXCLUDED.conditions_met_count,
    conditions_total_count = EXCLUDED.conditions_total_count,
    obstacles_active_count = EXCLUDED.obstacles_active_count,
    recorded_by = EXCLUDED.recorded_by,
    created_at = EXCLUDED.created_at;

  SELECT COALESCE(jsonb_agg(recipient_id), '[]'::jsonb)
  INTO v_recipients
  FROM (
    SELECT DISTINCT recipient_id
    FROM (
      SELECT v_delay_request.requested_by::TEXT AS recipient_id
      UNION ALL
      SELECT p.owner_id::TEXT
      FROM public.projects p
      WHERE p.id = v_project_id
      UNION ALL
      SELECT pm.user_id::TEXT
      FROM public.project_members pm
      WHERE pm.project_id = v_project_id
        AND LOWER(COALESCE(pm.permission_level, '')) IN ('owner', 'admin', 'editor')
    ) all_recipients
    WHERE recipient_id IS NOT NULL
      AND BTRIM(recipient_id) <> ''
  ) deduped;

  IF jsonb_array_length(v_recipients) > 0 THEN
    INSERT INTO public.notifications (
      id, project_id, task_id, delay_request_id, type, notification_type,
      severity, level, title, content, is_read, is_broadcast,
      source_entity_type, source_entity_id, category, recipients, channel,
      status, metadata, first_seen_at, is_escalated, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_project_id, v_task.id, v_delay_request.id,
      'delay_approved', 'flow-reminder', 'info', 'info',
      '延期申请已审批通过',
      '任务"' || COALESCE(v_task.title, v_delay_request.task_id::TEXT) || '"延期至 ' || v_delay_request.delayed_date::TEXT || ' 已生效。',
      FALSE, FALSE, 'delay_request', v_delay_request.id::TEXT, NULL,
      v_recipients, 'in_app', 'unread',
      jsonb_build_object(
        'delay_request_id', v_delay_request.id,
        'original_date', v_delay_request.original_date,
        'delayed_date', v_delay_request.delayed_date,
        'delay_days', v_delay_request.delay_days,
        'approved_by', p_reviewer_id
      ),
      v_timestamp, FALSE, v_timestamp, v_timestamp
    );

    INSERT INTO public.notifications (
      id, project_id, task_id, delay_request_id, type, notification_type,
      severity, level, title, content, is_read, is_broadcast,
      source_entity_type, source_entity_id, category, recipients, channel,
      status, metadata, first_seen_at, is_escalated, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_project_id, v_task.id, v_delay_request.id,
      CASE WHEN v_is_critical THEN 'critical_path_delay_approved_assessment' ELSE 'delay_approved_assessment' END,
      'flow-reminder',
      CASE WHEN v_is_critical THEN 'critical' ELSE 'warning' END,
      CASE WHEN v_is_critical THEN 'critical' ELSE 'warning' END,
      CASE WHEN v_is_critical THEN '关键路径延期已批准，需专项复核' ELSE '延期已批准，需后续复核' END,
      CASE
        WHEN v_is_critical THEN '关键路径任务"' || COALESCE(v_task.title, v_delay_request.task_id::TEXT) || '"延期已批准，请立即复核关键路径、健康度与后续承诺。'
        ELSE '任务"' || COALESCE(v_task.title, v_delay_request.task_id::TEXT) || '"延期已批准，请继续复核对月计划与项目健康度的影响。'
      END,
      FALSE, v_is_critical, 'delay_request', v_delay_request.id::TEXT, NULL,
      v_recipients, 'in_app', 'unread',
      jsonb_build_object(
        'delay_request_id', v_delay_request.id,
        'approved_by', p_reviewer_id,
        'assessment_event_type', 'delay_approved_assessment',
        'is_critical_task', v_is_critical
      ),
      v_timestamp, FALSE, v_timestamp, v_timestamp
    );
  END IF;

  SELECT *
  INTO v_delay_request
  FROM public.delay_requests
  WHERE id = p_delay_request_id;

  SELECT *
  INTO v_task
  FROM public.tasks
  WHERE id = v_task.id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'project_id', v_project_id,
    'delay_request', to_jsonb(v_delay_request),
    'task', to_jsonb(v_task)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_delay_request_atomic(
  p_delay_request_id UUID,
  p_reviewer_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_delay_request public.delay_requests%ROWTYPE;
  v_task public.tasks%ROWTYPE;
  v_project_id UUID;
  v_timestamp TIMESTAMPTZ := NOW();
  v_recipients JSONB := '[]'::jsonb;
  v_old_delay_status TEXT;
BEGIN
  SELECT *
  INTO v_delay_request
  FROM public.delay_requests
  WHERE id = p_delay_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'DELAY_REQUEST_NOT_FOUND',
      'message', '延期申请不存在',
      'status_code', 404
    );
  END IF;

  IF COALESCE(v_delay_request.status, 'pending') <> 'pending' THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'DELAY_REQUEST_STATE_INVALID',
      'message', '只有待审批延期申请可以驳回',
      'status_code', 422
    );
  END IF;

  SELECT *
  INTO v_task
  FROM public.tasks
  WHERE id = v_delay_request.task_id;

  v_project_id := COALESCE(v_delay_request.project_id, v_task.project_id);
  v_old_delay_status := COALESCE(v_delay_request.status, 'pending');

  UPDATE public.delay_requests
  SET
    status = 'rejected',
    reviewed_by = p_reviewer_id,
    reviewed_at = v_timestamp,
    updated_at = v_timestamp
  WHERE id = p_delay_request_id;

  INSERT INTO public.change_logs (
    id, project_id, entity_type, entity_id, field_name,
    old_value, new_value, changed_by, changed_at, change_source
  ) VALUES (
    gen_random_uuid(), v_project_id, 'delay_request', v_delay_request.id, 'status',
    v_old_delay_status, 'rejected', p_reviewer_id, v_timestamp, 'approval'
  );

  SELECT COALESCE(jsonb_agg(recipient_id), '[]'::jsonb)
  INTO v_recipients
  FROM (
    SELECT DISTINCT recipient_id
    FROM (
      SELECT v_delay_request.requested_by::TEXT AS recipient_id
      UNION ALL
      SELECT p.owner_id::TEXT
      FROM public.projects p
      WHERE p.id = v_project_id
      UNION ALL
      SELECT pm.user_id::TEXT
      FROM public.project_members pm
      WHERE pm.project_id = v_project_id
        AND LOWER(COALESCE(pm.permission_level, '')) IN ('owner', 'admin', 'editor')
    ) all_recipients
    WHERE recipient_id IS NOT NULL
      AND BTRIM(recipient_id) <> ''
  ) deduped;

  IF jsonb_array_length(v_recipients) > 0 THEN
    INSERT INTO public.notifications (
      id, project_id, task_id, delay_request_id, type, notification_type,
      severity, level, title, content, is_read, is_broadcast,
      source_entity_type, source_entity_id, category, recipients, channel,
      status, metadata, first_seen_at, is_escalated, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_project_id, v_task.id, v_delay_request.id,
      'delay_rejected', 'flow-reminder', 'warning', 'warning',
      '延期申请已驳回',
      '任务"' || COALESCE(v_task.title, v_delay_request.task_id::TEXT) || '"的延期申请未获通过，请补充原因后重新提交。',
      FALSE, FALSE, 'delay_request', v_delay_request.id::TEXT, NULL,
      v_recipients, 'in_app', 'unread',
      jsonb_build_object(
        'delay_request_id', v_delay_request.id,
        'reviewed_by', p_reviewer_id
      ),
      v_timestamp, FALSE, v_timestamp, v_timestamp
    );
  END IF;

  SELECT *
  INTO v_delay_request
  FROM public.delay_requests
  WHERE id = p_delay_request_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'project_id', v_project_id,
    'delay_request', to_jsonb(v_delay_request)
  );
END;
$$;

-- D4-BUG-001: pre_milestones 的 milestone_type CHECK 约束仅接受旧中文值，
-- 而 POST 路由的 normalizeCertificateType() 写入英文规范值，导致 INSERT 500。
-- 同理 status CHECK 也仅接受旧中文值，而 normalizeCertificateStatus() 写入英文值。

-- 第一步：回填存量中文 milestone_type 为英文规范值
UPDATE public.pre_milestones SET milestone_type = 'land_certificate'             WHERE milestone_type = '土地证';
UPDATE public.pre_milestones SET milestone_type = 'land_use_planning_permit'      WHERE milestone_type = '规划证';
UPDATE public.pre_milestones SET milestone_type = 'construction_permit'           WHERE milestone_type = '施工证';
UPDATE public.pre_milestones SET milestone_type = 'engineering_planning_permit'   WHERE milestone_type = '预售证';
UPDATE public.pre_milestones SET milestone_type = 'land_certificate'              WHERE milestone_type = '产权证';

-- 第二步：回填存量中文 status 为英文规范值
UPDATE public.pre_milestones SET status = 'pending'              WHERE status = '待申请';
UPDATE public.pre_milestones SET status = 'preparing_documents'  WHERE status = '办理中';
UPDATE public.pre_milestones SET status = 'issued'               WHERE status = '已取得';
UPDATE public.pre_milestones SET status = 'expired'              WHERE status = '已过期';
UPDATE public.pre_milestones SET status = 'supplement_required'  WHERE status = '需延期';

-- 第三步：替换 milestone_type CHECK 约束
ALTER TABLE public.pre_milestones DROP CONSTRAINT IF EXISTS pre_milestones_milestone_type_check;
ALTER TABLE public.pre_milestones ADD CONSTRAINT pre_milestones_milestone_type_check
  CHECK (milestone_type IN (
    'land_certificate', 'land_use_planning_permit', 'engineering_planning_permit', 'construction_permit',
    '土地证', '规划证', '施工证', '预售证', '产权证', '其他'
  ));

-- 第四步：替换 status CHECK 约束
ALTER TABLE public.pre_milestones DROP CONSTRAINT IF EXISTS pre_milestones_status_check;
ALTER TABLE public.pre_milestones ADD CONSTRAINT pre_milestones_status_check
  CHECK (status IN (
    'pending', 'preparing_documents', 'internal_review', 'external_submission',
    'supplement_required', 'approved', 'issued', 'expired', 'voided',
    '待申请', '办理中', '已取得', '已过期', '需延期'
  ));

-- 刷新 PostgREST schema cache，使新增列和 RPC 函数立即可用
NOTIFY pgrst, 'reload schema';
