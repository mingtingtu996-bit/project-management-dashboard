-- v1.4.23.1 warning escalation RPC content-field closeout.
-- notifications uses content, not message. Keep this as an additive patch
-- instead of editing the historical 131 migration and changing its checksum.

BEGIN;

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
