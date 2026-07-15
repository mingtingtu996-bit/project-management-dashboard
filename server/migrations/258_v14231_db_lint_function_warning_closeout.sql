-- v1.4.23.1 Supabase DB lint function-warning closeout.
-- Recreate the current live RPC definitions without unused PL/pgSQL variables.

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_task_with_source_backfill_atomic(
  p_task_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_condition RECORD;
  v_obstacle RECORD;
  v_plan RECORD;
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

  FOR v_plan IN
    SELECT id
    FROM public.acceptance_plans
    WHERE task_id = p_task_id
  LOOP
    PERFORM public.mark_source_deleted_on_downstream_atomic('acceptance_plan', v_plan.id::TEXT);
  END LOOP;

  DELETE FROM public.task_preceding_relations
  WHERE task_id = p_task_id;

  DELETE FROM public.tasks
  WHERE id = p_task_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_task_dependencies(
  p_task_id UUID,
  p_deps JSONB
)
RETURNS SETOF task_dependencies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dep JSONB;
  dep_ids UUID[];
BEGIN
  DELETE FROM task_dependencies WHERE task_id = p_task_id;

  FOR dep IN SELECT * FROM jsonb_array_elements(p_deps)
  LOOP
    INSERT INTO task_dependencies (
      id, project_id, task_id, dependency_task_id,
      dependency_type, lag_days, required_for_start, source_type,
      created_at, updated_at
    ) VALUES (
      COALESCE((dep->>'id')::UUID, gen_random_uuid()),
      COALESCE((dep->>'project_id')::UUID, (SELECT project_id FROM tasks WHERE id = p_task_id)),
      p_task_id,
      (dep->>'dependency_task_id')::UUID,
      COALESCE(dep->>'dependency_type', 'FS'),
      COALESCE((dep->>'lag_days')::INTEGER, 0),
      COALESCE((dep->>'required_for_start')::BOOLEAN, true),
      COALESCE(dep->>'source_type', 'manual'),
      COALESCE((dep->>'created_at')::TIMESTAMPTZ, NOW()),
      COALESCE((dep->>'updated_at')::TIMESTAMPTZ, NOW())
    );
  END LOOP;

  SELECT array_agg(dependency_task_id) INTO dep_ids
    FROM task_dependencies WHERE task_id = p_task_id;
  UPDATE tasks SET dependencies = COALESCE(dep_ids, '{}') WHERE id = p_task_id;

  RETURN QUERY SELECT * FROM task_dependencies WHERE task_id = p_task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_task_dependencies(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_task_dependencies(UUID, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.replace_task_dependencies(UUID, JSONB) FROM authenticated;

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
  v_risk_level VARCHAR(20);
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
    v_impact := 50;
  END IF;

  IF v_existing_risk_id IS NOT NULL THEN
    v_risk_id := v_existing_risk_id;
    UPDATE public.risks
    SET level = v_risk_level,
        probability = v_probability,
        impact = v_impact,
        status = 'identified',
        source_type = p_source_type,
        updated_at = v_timestamp
    WHERE id = v_risk_id;
  ELSE
    v_risk_id := gen_random_uuid();
    INSERT INTO public.risks (
      id, project_id, title, description, level, status,
      source_type, source_id, source_entity_type, source_entity_id,
      chain_id, probability, impact,
      created_at, updated_at
    ) VALUES (
      v_risk_id,
      v_notification.project_id,
      COALESCE(v_notification.title, v_notification.content, '预警升级风险'),
      COALESCE(v_notification.content, ''),
      v_risk_level,
      'identified',
      p_source_type,
      p_warning_id,
      'warning',
      v_notification.source_entity_id,
      v_chain_id,
      v_probability,
      v_impact,
      v_timestamp,
      v_timestamp
    );
  END IF;

  UPDATE public.notifications
  SET escalated_to_risk_id = v_risk_id,
      escalated_at = v_timestamp,
      is_escalated = true,
      warning_lifecycle_status = 'escalated',
      updated_at = v_timestamp
  WHERE id = p_warning_id;

  RETURN v_risk_id;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
