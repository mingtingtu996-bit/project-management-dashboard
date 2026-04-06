-- ============================================================
-- 修复交付计划遗留问题
-- 房地产工程管理系统V4.1 补丁迁移
-- 执行时间: 2026-03-23
-- 修复内容:
--   DEL-001 (P1): 创建 task_milestones 任务里程碑关联表
--   DEL-002 (P2): 创建 trg_pre_milestone_status_update 触发器
-- ============================================================

-- ============================================================
-- DEL-001: task_milestones（任务里程碑关联表）
-- 用于关联任务和里程碑，支持里程碑作为里程碑子类型
-- ============================================================

CREATE TABLE IF NOT EXISTS task_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 关联任务
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    
    -- 关联里程碑
    milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
    
    -- 关联类型：关联/关键/依赖
    relation_type TEXT NOT NULL DEFAULT '关联'
        CHECK (relation_type IN ('关联', '关键', '依赖')),
    
    -- 元数据
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 唯一约束：同一任务不重复关联同一里程碑
    UNIQUE(task_id, milestone_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_task_milestones_task
    ON task_milestones(task_id);

CREATE INDEX IF NOT EXISTS idx_task_milestones_milestone
    ON task_milestones(milestone_id);

-- updated_at 自动更新触发器
CREATE TRIGGER update_task_milestones_updated_at
    BEFORE UPDATE ON task_milestones
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- DEL-002: trg_pre_milestone_status_update
-- 前期里程碑状态自动更新触发器
-- 当 pre_milestone_conditions 全部满足时，自动将 pre_milestone 状态改为"已取得"
-- ============================================================

CREATE OR REPLACE FUNCTION fn_update_pre_milestone_status()
RETURNS TRIGGER AS $$
DECLARE
    v_pre_milestone_id UUID;
    v_total_conditions INTEGER;
    v_satisfied_conditions INTEGER;
    v_current_status TEXT;
BEGIN
    -- 确定受影响的 pre_milestone_id
    IF TG_OP = 'DELETE' THEN
        v_pre_milestone_id := OLD.pre_milestone_id;
    ELSE
        v_pre_milestone_id := NEW.pre_milestone_id;
    END IF;

    -- 查询当前证照状态
    SELECT status INTO v_current_status
    FROM pre_milestones
    WHERE id = v_pre_milestone_id;

    -- 已取得 / 已过期 状态不做自动变更
    IF v_current_status IN ('已取得', '已过期') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- 统计条件总数和已满足数量
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status IN ('已满足', '已确认'))
    INTO v_total_conditions, v_satisfied_conditions
    FROM pre_milestone_conditions
    WHERE pre_milestone_id = v_pre_milestone_id;

    -- 全部条件满足 → 状态更新为"已取得"
    IF v_total_conditions > 0 AND v_total_conditions = v_satisfied_conditions THEN
        UPDATE pre_milestones
        SET status = '已取得',
            issue_date = COALESCE(issue_date, CURRENT_DATE),
            updated_at = NOW()
        WHERE id = v_pre_milestone_id
          AND status NOT IN ('已取得', '已过期');

    -- 存在未满足条件且当前为"待申请" → 更新为"办理中"
    ELSIF v_satisfied_conditions > 0 AND v_current_status = '待申请' THEN
        UPDATE pre_milestones
        SET status = '办理中',
            updated_at = NOW()
        WHERE id = v_pre_milestone_id
          AND status = '待申请';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 绑定到 pre_milestone_conditions 表
CREATE TRIGGER trg_pre_milestone_status_update
    AFTER INSERT OR UPDATE OR DELETE ON pre_milestone_conditions
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_pre_milestone_status();

-- ============================================================
-- 验证注释
-- ============================================================
-- 执行后预期结果：
--   SELECT COUNT(*) FROM task_milestones;  → 0（空表正常）
--   \d task_milestones                     → 字段结构完整
--   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_pre_milestone_status_update';
--   → 返回 1 行
-- ============================================================
