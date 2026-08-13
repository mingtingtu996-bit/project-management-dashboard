-- Preserve the linked issue while returning converted risks to manual close.

BEGIN;

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
SET search_path = public, pg_temp
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
    status = 'mitigating',
    pending_manual_close = TRUE,
    closed_reason = NULL,
    closed_at = NULL,
    closure_result_code = NULL,
    closure_result_summary = NULL,
    closure_effectiveness = NULL,
    closure_evidence_refs = '[]'::JSONB,
    closure_cause_attribution_id = NULL,
    closed_by = NULL,
    closure_recorded_at = NULL,
    updated_at = v_timestamp
  WHERE id = p_risk_id;

  RETURN v_issue_id;
END;
$$;

DO $$
DECLARE
  function_oid OID := to_regprocedure(
    'public.create_issue_from_risk_atomic(uuid,character varying,text,text,character varying,integer)'
  );
  function_definition TEXT;
  function_config TEXT[];
BEGIN
  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'migration 338 rollback did not restore create_issue_from_risk_atomic';
  END IF;

  SELECT pg_get_functiondef(function_oid), proconfig
  INTO function_definition, function_config
  FROM pg_proc
  WHERE oid = function_oid;

  IF POSITION('status = ''mitigating''' IN function_definition) = 0
     OR POSITION('pending_manual_close = TRUE' IN function_definition) = 0
     OR POSITION('status = ''closed''' IN function_definition) > 0 THEN
    RAISE EXCEPTION 'migration 338 rollback function body failed readback';
  END IF;

  IF NOT COALESCE(function_config, ARRAY[]::TEXT[])
    @> ARRAY['search_path=public, pg_temp']::TEXT[] THEN
    RAISE EXCEPTION 'migration 338 rollback function search_path readback failed';
  END IF;

  RAISE NOTICE 'MIGRATION_338_RISK_ISSUE_ATOMIC_CLOSURE_OUTCOME_ROLLBACK_COMPLETE';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
