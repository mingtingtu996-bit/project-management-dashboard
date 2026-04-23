-- 前期证照 12.x 硬化：证照事项原子创建函数
-- 说明：
-- - certificate_work_items + certificate_dependencies 在同一数据库事务内完成写入
-- - certificate_approvals 仅保留为历史兼容残留，不再作为新主链入口

CREATE OR REPLACE FUNCTION create_certificate_work_item_atomic(
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
RETURNS certificate_work_items
LANGUAGE plpgsql
AS $$
DECLARE
  v_work_item certificate_work_items%ROWTYPE;
  v_certificate_id UUID;
BEGIN
  INSERT INTO certificate_work_items (
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
    p_is_shared,
    p_next_action,
    p_next_action_due_date,
    p_is_blocked,
    p_block_reason,
    p_sort_order,
    p_notes,
    COALESCE(p_latest_record_at, NOW()),
    NOW(),
    NOW()
  )
  RETURNING * INTO v_work_item;

  IF p_certificate_ids IS NOT NULL THEN
    FOREACH v_certificate_id IN ARRAY p_certificate_ids LOOP
      INSERT INTO certificate_dependencies (
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
      );
    END LOOP;
  END IF;

  RETURN v_work_item;
END;
$$;

COMMENT ON FUNCTION create_certificate_work_item_atomic IS
  '证照事项原子创建函数：work item 与 certificate_dependencies 同事务写入。';
