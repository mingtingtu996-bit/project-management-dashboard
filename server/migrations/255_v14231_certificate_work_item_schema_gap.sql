-- v1.4.23.1 certificate work item schema gap closeout.
--
-- UIUX/pre-milestone read models consume certificate_work_items.certificate_ids
-- as a first-class denormalized read column, while older environments only
-- persisted the relation in certificate_dependencies. Keep the dependency edge
-- as the authority and backfill the read column from it.

ALTER TABLE IF EXISTS public.certificate_work_items
  ADD COLUMN IF NOT EXISTS certificate_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

UPDATE public.certificate_work_items cwi
SET certificate_ids = COALESCE(linked.certificate_ids, ARRAY[]::UUID[]),
    is_shared = COALESCE(array_length(linked.certificate_ids, 1), 0) > 1,
    updated_at = NOW()
FROM (
  SELECT
    successor_id,
    array_agg(predecessor_id ORDER BY created_at ASC, predecessor_id ASC) AS certificate_ids
  FROM public.certificate_dependencies
  WHERE predecessor_type = 'certificate'
    AND successor_type = 'work_item'
  GROUP BY successor_id
) linked
WHERE cwi.id = linked.successor_id
  AND (
    cwi.certificate_ids IS DISTINCT FROM linked.certificate_ids
    OR cwi.is_shared IS DISTINCT FROM (COALESCE(array_length(linked.certificate_ids, 1), 0) > 1)
  );

UPDATE public.certificate_work_items cwi
SET certificate_ids = ARRAY[]::UUID[],
    is_shared = false,
    updated_at = NOW()
WHERE NOT EXISTS (
  SELECT 1
  FROM public.certificate_dependencies cd
  WHERE cd.predecessor_type = 'certificate'
    AND cd.successor_type = 'work_item'
    AND cd.successor_id = cwi.id
)
AND cwi.certificate_ids <> ARRAY[]::UUID[];

CREATE OR REPLACE FUNCTION public.create_certificate_work_item_atomic(
  p_id UUID,
  p_project_id UUID,
  p_item_code VARCHAR(64),
  p_item_name VARCHAR(200),
  p_item_stage VARCHAR(32),
  p_status VARCHAR(40),
  p_planned_finish_date DATE,
  p_actual_finish_date DATE,
  p_approving_authority VARCHAR(100),
  p_is_shared BOOLEAN,
  p_next_action TEXT,
  p_next_action_due_date DATE,
  p_is_blocked BOOLEAN,
  p_block_reason TEXT,
  p_sort_order INTEGER,
  p_notes TEXT,
  p_latest_record_at TIMESTAMP,
  p_certificate_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS public.certificate_work_items
LANGUAGE plpgsql
AS $$
DECLARE
  v_work_item public.certificate_work_items%ROWTYPE;
  v_certificate_id UUID;
  v_certificate_ids UUID[] := COALESCE(p_certificate_ids, ARRAY[]::UUID[]);
BEGIN
  INSERT INTO public.certificate_work_items (
    id,
    project_id,
    item_code,
    item_name,
    item_stage,
    status,
    planned_finish_date,
    actual_finish_date,
    approving_authority,
    is_shared,
    next_action,
    next_action_due_date,
    is_blocked,
    block_reason,
    sort_order,
    notes,
    latest_record_at,
    certificate_ids,
    created_at,
    updated_at
  ) VALUES (
    p_id,
    p_project_id,
    p_item_code,
    p_item_name,
    p_item_stage,
    p_status,
    p_planned_finish_date,
    p_actual_finish_date,
    p_approving_authority,
    COALESCE(p_is_shared, array_length(v_certificate_ids, 1) > 1, false),
    p_next_action,
    p_next_action_due_date,
    p_is_blocked,
    p_block_reason,
    p_sort_order,
    p_notes,
    COALESCE(p_latest_record_at, NOW()),
    v_certificate_ids,
    NOW(),
    NOW()
  )
  RETURNING * INTO v_work_item;

  FOREACH v_certificate_id IN ARRAY v_certificate_ids LOOP
    INSERT INTO public.certificate_dependencies (
      id,
      project_id,
      predecessor_type,
      predecessor_id,
      successor_type,
      successor_id,
      dependency_kind,
      notes,
      created_at
    ) VALUES (
      gen_random_uuid(),
      p_project_id,
      'certificate',
      v_certificate_id,
      'work_item',
      p_id,
      'hard',
      NULL,
      NOW()
    )
    ON CONFLICT (project_id, predecessor_type, predecessor_id, successor_type, successor_id, dependency_kind)
    DO NOTHING;
  END LOOP;

  RETURN v_work_item;
END;
$$;

COMMENT ON COLUMN public.certificate_work_items.certificate_ids IS
  'Denormalized certificate ids for pre-milestone read models; certificate_dependencies remains the relation authority.';

COMMENT ON FUNCTION public.create_certificate_work_item_atomic IS
  '证照事项原子创建函数：work item 同步写 certificate_ids 读列，并与 certificate_dependencies 同事务写入。';

NOTIFY pgrst, 'reload schema';
