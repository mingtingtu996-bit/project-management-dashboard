-- 055: risks 表前置迁移 —— 新增来源追踪字段，移除已废弃字段
-- 执行顺序：必须在 056_create_issues_table.sql 之前完成
-- 影响：source_type / source_id / chain_id 是升级链传播的基础

-- ─── 1. 新增来源追踪字段 ────────────────────────────────────────────────────────
ALTER TABLE risks
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(50)
    CHECK (source_type IN ('manual', 'warning_converted', 'warning_auto_escalated', 'source_deleted')),
  ADD COLUMN IF NOT EXISTS source_id UUID,
  ADD COLUMN IF NOT EXISTS chain_id UUID,
  ADD COLUMN IF NOT EXISTS pending_manual_close BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS linked_issue_id UUID,
  ADD COLUMN IF NOT EXISTS closed_reason VARCHAR(100),
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- ─── 2. 移除废弃字段 ─────────────────────────────────────────────────────────────
-- mitigation_plan: §1.2 已删除，处理/应对留在线下
ALTER TABLE risks DROP COLUMN IF EXISTS mitigation_plan;

-- ─── 3. 移除 occurred 状态枚举值（Postgres 需重建约束）───────────────────────────
-- 先删除旧约束，再重建不含 occurred 的约束
DO $$
BEGIN
  -- 更新已有 occurred 记录为 mitigating（兜底）
  UPDATE risks SET status = 'mitigating' WHERE status = 'occurred';

  -- 查找并删除 status 列上的 CHECK 约束
  DECLARE
    v_constraint_name TEXT;
  BEGIN
    SELECT conname INTO v_constraint_name
    FROM pg_constraint
    WHERE conrelid = 'risks'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%occurred%';

    IF v_constraint_name IS NOT NULL THEN
      EXECUTE 'ALTER TABLE risks DROP CONSTRAINT ' || quote_ident(v_constraint_name);
    END IF;
  END;

  -- 重建不含 occurred 的约束
  BEGIN
    ALTER TABLE risks
      ADD CONSTRAINT risks_status_check
        CHECK (status IN ('identified', 'mitigating', 'closed'));
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- ─── 4. 建立复合索引（支持上游反向查询）─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_risks_source ON risks (source_id, source_type)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_risks_chain_id ON risks (chain_id)
  WHERE chain_id IS NOT NULL;
