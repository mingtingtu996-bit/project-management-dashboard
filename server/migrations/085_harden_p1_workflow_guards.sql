BEGIN;

ALTER TABLE public.task_conditions
  ADD COLUMN IF NOT EXISTS satisfied_reason VARCHAR(40),
  ADD COLUMN IF NOT EXISTS satisfied_reason_note TEXT;

CREATE INDEX IF NOT EXISTS idx_task_conditions_satisfied_reason
  ON public.task_conditions (satisfied_reason)
  WHERE satisfied_reason IS NOT NULL;

CREATE OR REPLACE FUNCTION public.mark_source_deleted_on_downstream_atomic(
  p_source_entity_type TEXT,
  p_source_entity_id TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_timestamp TIMESTAMPTZ := NOW();
  v_total INTEGER := 0;
  v_row_count INTEGER := 0;
BEGIN
  UPDATE public.risks
  SET
    source_type = 'source_deleted',
    updated_at = v_timestamp
  WHERE source_entity_type = p_source_entity_type
    AND source_entity_id = p_source_entity_id;
  GET DIAGNOSTICS v_total = ROW_COUNT;

  UPDATE public.issues
  SET
    source_type = 'source_deleted',
    updated_at = v_timestamp
  WHERE source_entity_type = p_source_entity_type
    AND source_entity_id = p_source_entity_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_total := v_total + v_row_count;

  RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_warning_as_risk_atomic(
  p_warning_id UUID,
  p_source_type VARCHAR DEFAULT 'warning_converted'
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_notification public.notifications%ROWTYPE;
  v_existing_risk_id UUID;
  v_risk_id UUID;
  v_chain_id UUID;
  v_warning_token TEXT;
  v_risk_level VARCHAR(20);
  v_risk_category VARCHAR(20);
  v_probability INTEGER;
  v_impact INTEGER;
  v_timestamp TIMESTAMPTZ := NOW();
BEGIN
  SELECT *
  INTO v_notification
  FROM public.notifications
  WHERE id = p_warning_id
    AND source_entity_type = 'warning'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_notification.escalated_to_risk_id IS NOT NULL THEN
    RETURN v_notification.escalated_to_risk_id;
  END IF;

  SELECT id
  INTO v_existing_risk_id
  FROM public.risks
  WHERE source_entity_type = 'warning'
    AND (
      source_id = p_warning_id
      OR source_entity_id = p_warning_id::TEXT
    )
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  v_chain_id := COALESCE(v_notification.chain_id, gen_random_uuid());
  v_warning_token := LOWER(COALESCE(v_notification.category, v_notification.type, ''));

  IF LOWER(COALESCE(v_notification.severity, 'warning')) = 'critical' THEN
    v_risk_level := 'critical';
    v_probability := 90;
    v_impact := 90;
  ELSIF LOWER(COALESCE(v_notification.severity, 'warning')) = 'warning' THEN
    v_risk_level := 'high';
    v_probability := 75;
    v_impact := 75;
  ELSE
    v_risk_level := 'medium';
    v_probability := 60;
    v_impact := 60;
  END IF;

  IF POSITION('delay' IN v_warning_token) > 0 OR POSITION('critical_path' IN v_warning_token) > 0 THEN
    v_risk_category := 'progress';
  ELSIF POSITION('permit' IN v_warning_token) > 0 OR POSITION('acceptance' IN v_warning_token) > 0 THEN
    v_risk_category := 'external';
  ELSIF POSITION('obstacle' IN v_warning_token) > 0 THEN
    v_risk_category := 'external';
  ELSE
    v_risk_category := 'other';
  END IF;

  IF v_existing_risk_id IS NULL THEN
    INSERT INTO public.risks (
      id,
      project_id,
      task_id,
      title,
      description,
      level,
      status,
      probability,
      impact,
      risk_category,
      source_type,
      source_id,
      source_entity_type,
      source_entity_id,
      chain_id,
      pending_manual_close,
      linked_issue_id,
      closed_reason,
      closed_at,
      version,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_notification.project_id,
      v_notification.task_id,
      v_notification.title,
      v_notification.content,
      v_risk_level,
      'identified',
      v_probability,
      v_impact,
      v_risk_category,
      COALESCE(p_source_type, 'warning_converted'),
      p_warning_id,
      'warning',
      p_warning_id::TEXT,
      v_chain_id,
      FALSE,
      NULL,
      NULL,
      NULL,
      1,
      v_timestamp,
      v_timestamp
    )
    RETURNING id INTO v_risk_id;
  ELSE
    v_risk_id := v_existing_risk_id;
  END IF;

  UPDATE public.notifications
  SET
    chain_id = v_chain_id,
    escalated_to_risk_id = v_risk_id,
    escalated_at = v_timestamp,
    is_escalated = TRUE,
    acknowledged_at = COALESCE(acknowledged_at, v_timestamp),
    status = 'escalated',
    updated_at = v_timestamp
  WHERE id = p_warning_id;

  RETURN v_risk_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_issue_from_risk_atomic(
  p_risk_id UUID,
  p_issue_source_type VARCHAR,
  p_title TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_severity VARCHAR DEFAULT NULL,
  p_priority INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_risk public.risks%ROWTYPE;
  v_existing_issue_id UUID;
  v_issue_id UUID;
  v_chain_id UUID;
  v_severity VARCHAR(20);
  v_priority INTEGER;
  v_timestamp TIMESTAMPTZ := NOW();
BEGIN
  SELECT *
  INTO v_risk
  FROM public.risks
  WHERE id = p_risk_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_risk.linked_issue_id IS NOT NULL THEN
    RETURN v_risk.linked_issue_id;
  END IF;

  SELECT id
  INTO v_existing_issue_id
  FROM public.issues
  WHERE source_entity_type = 'risk'
    AND (
      source_id = p_risk_id
      OR source_entity_id = p_risk_id::TEXT
    )
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  v_chain_id := COALESCE(v_risk.chain_id, gen_random_uuid());
  v_severity := COALESCE(
    p_severity,
    CASE LOWER(COALESCE(v_risk.level, 'medium'))
      WHEN 'critical' THEN 'critical'
      WHEN 'high' THEN 'high'
      WHEN 'low' THEN 'low'
      ELSE 'medium'
    END
  );
  v_priority := COALESCE(
    p_priority,
    CASE p_issue_source_type
      WHEN 'risk_auto_escalated' THEN
        CASE v_severity
          WHEN 'critical' THEN 80
          WHEN 'high' THEN 60
          WHEN 'medium' THEN 40
          ELSE 20
        END
      ELSE
        CASE v_severity
          WHEN 'critical' THEN 60
          WHEN 'high' THEN 45
          WHEN 'medium' THEN 30
          ELSE 15
        END
    END
  );

  IF v_existing_issue_id IS NULL THEN
    INSERT INTO public.issues (
      id,
      project_id,
      task_id,
      title,
      description,
      source_type,
      source_id,
      source_entity_type,
      source_entity_id,
      chain_id,
      severity,
      priority,
      pending_manual_close,
      status,
      closed_reason,
      closed_at,
      version,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_risk.project_id,
      v_risk.task_id,
      COALESCE(p_title, v_risk.title),
      COALESCE(p_description, v_risk.description),
      COALESCE(p_issue_source_type, 'risk_converted'),
      p_risk_id,
      'risk',
      p_risk_id::TEXT,
      v_chain_id,
      v_severity,
      v_priority,
      FALSE,
      'open',
      NULL,
      NULL,
      1,
      v_timestamp,
      v_timestamp
    )
    RETURNING id INTO v_issue_id;
  ELSE
    v_issue_id := v_existing_issue_id;
  END IF;

  UPDATE public.risks
  SET
    chain_id = v_chain_id,
    linked_issue_id = v_issue_id,
    status = 'closed',
    closed_reason = 'converted_to_issue',
    closed_at = v_timestamp,
    updated_at = v_timestamp
  WHERE id = p_risk_id;

  RETURN v_issue_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_task_condition_with_source_backfill_atomic(
  p_condition_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1
  FROM public.task_conditions
  WHERE id = p_condition_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  PERFORM public.mark_source_deleted_on_downstream_atomic('task_condition', p_condition_id::TEXT);
  DELETE FROM public.task_conditions WHERE id = p_condition_id;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_task_obstacle_with_source_backfill_atomic(
  p_obstacle_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1
  FROM public.task_obstacles
  WHERE id = p_obstacle_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  PERFORM public.mark_source_deleted_on_downstream_atomic('task_obstacle', p_obstacle_id::TEXT);
  DELETE FROM public.task_obstacles WHERE id = p_obstacle_id;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_risk_with_source_backfill_atomic(
  p_risk_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1
  FROM public.risks
  WHERE id = p_risk_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  PERFORM public.mark_source_deleted_on_downstream_atomic('risk', p_risk_id::TEXT);
  DELETE FROM public.risks WHERE id = p_risk_id;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_task_with_source_backfill_atomic(
  p_task_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_condition RECORD;
  v_obstacle RECORD;
  v_acceptance RECORD;
BEGIN
  PERFORM 1
  FROM public.tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  PERFORM public.mark_source_deleted_on_downstream_atomic('task', p_task_id::TEXT);

  FOR v_condition IN
    SELECT id
    FROM public.task_conditions
    WHERE task_id = p_task_id
  LOOP
    PERFORM public.mark_source_deleted_on_downstream_atomic('task_condition', v_condition.id::TEXT);
  END LOOP;

  FOR v_obstacle IN
    SELECT id
    FROM public.task_obstacles
    WHERE task_id = p_task_id
  LOOP
    PERFORM public.mark_source_deleted_on_downstream_atomic('task_obstacle', v_obstacle.id::TEXT);
  END LOOP;

  FOR v_acceptance IN
    SELECT id
    FROM public.acceptance_plans
    WHERE task_id = p_task_id
  LOOP
    PERFORM public.mark_source_deleted_on_downstream_atomic('acceptance_plan', v_acceptance.id::TEXT);
  END LOOP;

  DELETE FROM public.tasks WHERE id = p_task_id;
  RETURN TRUE;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
