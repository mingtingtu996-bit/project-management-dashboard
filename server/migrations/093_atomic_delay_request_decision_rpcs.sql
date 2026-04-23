BEGIN;

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
    id,
    project_id,
    entity_type,
    entity_id,
    field_name,
    old_value,
    new_value,
    changed_by,
    changed_at,
    change_source
  ) VALUES (
    gen_random_uuid(),
    v_project_id,
    'delay_request',
    v_delay_request.id,
    'status',
    v_old_delay_status,
    'approved',
    p_reviewer_id,
    v_timestamp,
    'approval'
  );

  INSERT INTO public.change_logs (
    id,
    project_id,
    entity_type,
    entity_id,
    field_name,
    old_value,
    new_value,
    changed_by,
    changed_at,
    change_source
  ) VALUES (
    gen_random_uuid(),
    v_project_id,
    'task',
    v_task.id,
    'end_date',
    v_old_task_end_date,
    v_delay_request.delayed_date::TEXT,
    p_reviewer_id,
    v_timestamp,
    'approval'
  );

  INSERT INTO public.change_logs (
    id,
    project_id,
    entity_type,
    entity_id,
    field_name,
    old_value,
    new_value,
    changed_by,
    changed_at,
    change_source
  ) VALUES (
    gen_random_uuid(),
    v_project_id,
    'task',
    v_task.id,
    'planned_end_date',
    v_old_task_planned_end_date,
    v_delay_request.delayed_date::TEXT,
    p_reviewer_id,
    v_timestamp,
    'approval'
  );

  INSERT INTO public.task_progress_snapshots (
    id,
    task_id,
    progress,
    snapshot_date,
    event_type,
    event_source,
    notes,
    status,
    conditions_met_count,
    conditions_total_count,
    obstacles_active_count,
    recorded_by,
    is_auto_generated,
    created_at
  ) VALUES (
    gen_random_uuid(),
    v_task.id,
    COALESCE(v_task.progress, 0),
    v_timestamp::DATE,
    'delay_approved',
    'delay_request',
    '延期审批通过，计划完成时间调整为 ' || v_delay_request.delayed_date::TEXT,
    COALESCE(v_task.status, 'todo'),
    COALESCE(v_task.conditions_met_count, 0),
    COALESCE(v_task.conditions_total_count, 0),
    COALESCE(v_task.obstacles_active_count, 0),
    p_reviewer_id,
    TRUE,
    v_timestamp
  );

  INSERT INTO public.task_progress_snapshots (
    id,
    task_id,
    progress,
    snapshot_date,
    event_type,
    event_source,
    notes,
    status,
    conditions_met_count,
    conditions_total_count,
    obstacles_active_count,
    recorded_by,
    is_auto_generated,
    created_at
  ) VALUES (
    gen_random_uuid(),
    v_task.id,
    COALESCE(v_task.progress, 0),
    v_timestamp::DATE,
    'delay_approved_assessment',
    'delay_request',
    '延期审批通过后触发后续影响评估',
    COALESCE(v_task.status, 'todo'),
    COALESCE(v_task.conditions_met_count, 0),
    COALESCE(v_task.conditions_total_count, 0),
    COALESCE(v_task.obstacles_active_count, 0),
    p_reviewer_id,
    TRUE,
    v_timestamp
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
        AND (
          LOWER(COALESCE(pm.role, '')) IN ('owner', 'admin', 'pm')
          OR LOWER(COALESCE(pm.permission_level, '')) = 'owner'
        )
    ) all_recipients
    WHERE recipient_id IS NOT NULL
      AND BTRIM(recipient_id) <> ''
  ) deduped;

  IF jsonb_array_length(v_recipients) > 0 THEN
    INSERT INTO public.notifications (
      id,
      project_id,
      task_id,
      delay_request_id,
      type,
      notification_type,
      severity,
      level,
      title,
      content,
      is_read,
      is_broadcast,
      source_entity_type,
      source_entity_id,
      category,
      recipients,
      channel,
      status,
      metadata,
      first_seen_at,
      is_escalated,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_project_id,
      v_task.id,
      v_delay_request.id,
      'delay_approved',
      'flow-reminder',
      'info',
      'info',
      '延期申请已审批通过',
      '任务“' || COALESCE(v_task.title, v_delay_request.task_id::TEXT) || '”延期至 ' || v_delay_request.delayed_date::TEXT || ' 已生效。',
      FALSE,
      FALSE,
      'delay_request',
      v_delay_request.id::TEXT,
      NULL,
      v_recipients,
      'in_app',
      'unread',
      jsonb_build_object(
        'delay_request_id', v_delay_request.id,
        'original_date', v_delay_request.original_date,
        'delayed_date', v_delay_request.delayed_date,
        'delay_days', v_delay_request.delay_days,
        'approved_by', p_reviewer_id
      ),
      v_timestamp,
      FALSE,
      v_timestamp,
      v_timestamp
    );

    INSERT INTO public.notifications (
      id,
      project_id,
      task_id,
      delay_request_id,
      type,
      notification_type,
      severity,
      level,
      title,
      content,
      is_read,
      is_broadcast,
      source_entity_type,
      source_entity_id,
      category,
      recipients,
      channel,
      status,
      metadata,
      first_seen_at,
      is_escalated,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_project_id,
      v_task.id,
      v_delay_request.id,
      CASE WHEN v_is_critical THEN 'critical_path_delay_approved_assessment' ELSE 'delay_approved_assessment' END,
      'flow-reminder',
      CASE WHEN v_is_critical THEN 'critical' ELSE 'warning' END,
      CASE WHEN v_is_critical THEN 'critical' ELSE 'warning' END,
      CASE WHEN v_is_critical THEN '关键路径延期已批准，需专项复核' ELSE '延期已批准，需后续复核' END,
      CASE
        WHEN v_is_critical THEN '关键路径任务“' || COALESCE(v_task.title, v_delay_request.task_id::TEXT) || '”延期已批准，请立即复核关键路径、健康度与后续承诺。'
        ELSE '任务“' || COALESCE(v_task.title, v_delay_request.task_id::TEXT) || '”延期已批准，请继续复核对月计划与项目健康度的影响。'
      END,
      FALSE,
      v_is_critical,
      'delay_request',
      v_delay_request.id::TEXT,
      NULL,
      v_recipients,
      'in_app',
      'unread',
      jsonb_build_object(
        'delay_request_id', v_delay_request.id,
        'approved_by', p_reviewer_id,
        'assessment_event_type', 'delay_approved_assessment',
        'is_critical_task', v_is_critical
      ),
      v_timestamp,
      FALSE,
      v_timestamp,
      v_timestamp
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
    id,
    project_id,
    entity_type,
    entity_id,
    field_name,
    old_value,
    new_value,
    changed_by,
    changed_at,
    change_source
  ) VALUES (
    gen_random_uuid(),
    v_project_id,
    'delay_request',
    v_delay_request.id,
    'status',
    v_old_delay_status,
    'rejected',
    p_reviewer_id,
    v_timestamp,
    'approval'
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
        AND (
          LOWER(COALESCE(pm.role, '')) IN ('owner', 'admin', 'pm')
          OR LOWER(COALESCE(pm.permission_level, '')) = 'owner'
        )
    ) all_recipients
    WHERE recipient_id IS NOT NULL
      AND BTRIM(recipient_id) <> ''
  ) deduped;

  IF jsonb_array_length(v_recipients) > 0 THEN
    INSERT INTO public.notifications (
      id,
      project_id,
      task_id,
      delay_request_id,
      type,
      notification_type,
      severity,
      level,
      title,
      content,
      is_read,
      is_broadcast,
      source_entity_type,
      source_entity_id,
      category,
      recipients,
      channel,
      status,
      metadata,
      first_seen_at,
      is_escalated,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_project_id,
      v_task.id,
      v_delay_request.id,
      'delay_rejected',
      'flow-reminder',
      'warning',
      'warning',
      '延期申请已驳回',
      '任务“' || COALESCE(v_task.title, v_delay_request.task_id::TEXT) || '”的延期申请未获通过，请补充原因后重新提交。',
      FALSE,
      FALSE,
      'delay_request',
      v_delay_request.id::TEXT,
      NULL,
      v_recipients,
      'in_app',
      'unread',
      jsonb_build_object(
        'delay_request_id', v_delay_request.id,
        'reviewed_by', p_reviewer_id
      ),
      v_timestamp,
      FALSE,
      v_timestamp,
      v_timestamp
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

NOTIFY pgrst, 'reload schema';

COMMIT;
