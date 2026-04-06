-- ============================================================
-- Dashboard 物化视图
-- 房地产工程管理系统V4.1 Phase 1
-- 执行时间: 2026-03-22
-- ============================================================

-- 创建物化视图：项目Dashboard统计
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_project_dashboard AS
SELECT 
    p.id AS project_id,
    p.name AS project_name,
    p.status AS project_status,
    p.health_score,
    p.health_status,
    p.start_date,
    p.end_date AS project_end_date,
    p.budget,
    p.location,
    
    -- 任务统计
    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS total_tasks,
    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = '已完成') AS completed_tasks,
    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = '进行中') AS ongoing_tasks,
    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = '未开始') AS pending_tasks,
    
    -- 里程碑统计
    (SELECT COUNT(*) FROM milestones m WHERE m.project_id = p.id) AS total_milestones,
    (SELECT COUNT(*) FROM milestones m WHERE m.project_id = p.id AND m.status = '已完成') AS completed_milestones,
    (SELECT COUNT(*) FROM milestones m WHERE m.project_id = p.id AND m.status = '已延期') AS delayed_milestones,
    
    -- 延期任务统计
    (SELECT COUNT(*) FROM tasks t 
     WHERE t.project_id = p.id 
     AND t.planned_end_date < CURRENT_DATE 
     AND t.status NOT IN ('已完成', '已暂停')) AS overdue_tasks,
    
    -- 条件统计
    (SELECT COUNT(*) FROM task_conditions tc 
     JOIN tasks t ON tc.task_id = t.id 
     WHERE t.project_id = p.id) AS total_conditions,
    (SELECT COUNT(*) FROM task_conditions tc 
     JOIN tasks t ON tc.task_id = t.id 
     WHERE t.project_id = p.id AND tc.status = '已满足') AS satisfied_conditions,
    (SELECT COUNT(*) FROM task_conditions tc 
     JOIN tasks t ON tc.task_id = t.id 
     WHERE t.project_id = p.id AND tc.status = '未满足') AS unsatisfied_conditions,
    
    -- 阻碍统计
    (SELECT COUNT(*) FROM task_obstacles ob 
     JOIN tasks t ON ob.task_id = t.id 
     WHERE t.project_id = p.id) AS total_obstacles,
    (SELECT COUNT(*) FROM task_obstacles ob 
     JOIN tasks t ON ob.task_id = t.id 
     WHERE t.project_id = p.id AND ob.status = '待处理') AS pending_obstacles,
    (SELECT COUNT(*) FROM task_obstacles ob 
     JOIN tasks t ON ob.task_id = t.id 
     WHERE t.project_id = p.id AND ob.status = '处理中') AS processing_obstacles,
    
    -- 验收统计
    (SELECT COUNT(*) FROM acceptance_plans ap 
     WHERE ap.project_id = p.id) AS total_acceptance_plans,
    (SELECT COUNT(*) FROM acceptance_plans ap 
     WHERE ap.project_id = p.id AND ap.status = '已通过') AS passed_acceptance_plans,
    (SELECT COUNT(*) FROM acceptance_plans ap 
     WHERE ap.project_id = p.id AND ap.status = '待验收') AS pending_acceptance_plans,
    
    -- 证照统计
    (SELECT COUNT(*) FROM pre_milestones pm 
     WHERE pm.project_id = p.id) AS total_pre_milestones,
    (SELECT COUNT(*) FROM pre_milestones pm 
     WHERE pm.project_id = p.id AND pm.status = '已取得') AS obtained_pre_milestones,
    (SELECT COUNT(*) FROM pre_milestones pm 
     WHERE pm.project_id = p.id AND pm.status IN ('办理中', '需延期')) AS processing_pre_milestones,
    
    -- 更新时间
    NOW() AS last_refreshed
FROM projects p;

-- 为物化视图创建唯一索引（支持CONCURRENTLY刷新）
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_project_dashboard_project_id 
ON mv_project_dashboard(project_id);

-- 添加注释
COMMENT ON MATERIALIZED VIEW mv_project_dashboard IS '项目Dashboard物化视图，存储项目级统计汇总数据';

-- 6. 创建更多触发器（Phase 1 补充）

-- 6.1 任务完成时自动闭合关联条件
CREATE OR REPLACE FUNCTION auto_complete_conditions()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = '已完成' AND OLD.status != '已完成' THEN
    UPDATE task_conditions
    SET status = '已确认', confirmed_at = NOW()
    WHERE task_id = NEW.id AND status = '已满足';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_complete_conditions
  AFTER UPDATE ON tasks
  FOR EACH ROW
  WHEN (NEW.status = '已完成')
  EXECUTE FUNCTION auto_complete_conditions();

-- 6.2 条件完成时自动更新任务进度
CREATE OR REPLACE FUNCTION update_task_progress_on_condition_complete()
RETURNS TRIGGER AS $$
DECLARE
  v_total_conditions INTEGER;
  v_completed_conditions INTEGER;
  v_progress INTEGER;
BEGIN
  IF NEW.status IN ('已满足', '已确认') AND OLD.status NOT IN ('已满足', '已确认') THEN
    SELECT COUNT(*), COUNT(*) FILTER (WHERE status IN ('已满足', '已确认'))
    INTO v_total_conditions, v_completed_conditions
    FROM task_conditions
    WHERE task_id = NEW.task_id;
    
    IF v_total_conditions > 0 THEN
      v_progress := ROUND((v_completed_conditions::NUMERIC / v_total_conditions) * 100);
      UPDATE tasks
      SET progress = v_progress
      WHERE id = NEW.task_id AND progress < v_progress;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_task_progress_on_condition
  AFTER UPDATE ON task_conditions
  FOR EACH ROW
  EXECUTE FUNCTION update_task_progress_on_condition_complete();

-- 6.3 延期历史自动记录（通过任务状态变更触发）
CREATE OR REPLACE FUNCTION record_task_delay_history()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.planned_end_date < OLD.planned_end_date 
     AND NEW.planned_end_date < CURRENT_DATE
     AND NEW.status NOT IN ('已完成', '已暂停') THEN
    INSERT INTO task_delay_history (task_id, original_date, delayed_date, delay_days, reason)
    VALUES (
      NEW.id,
      OLD.planned_end_date,
      NEW.planned_end_date,
      OLD.planned_end_date - NEW.planned_end_date,
      '计划延期'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_record_task_delay
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION record_task_delay_history();

-- 6.4 健康度自动更新函数
CREATE OR REPLACE FUNCTION calculate_project_health_score(p_project_id UUID)
RETURNS TABLE(
  health_score INTEGER,
  health_status VARCHAR(20)
) AS $$
DECLARE
  v_total_tasks INTEGER;
  v_completed_tasks INTEGER;
  v_task_completion_rate NUMERIC;
  v_total_milestones INTEGER;
  v_completed_milestones INTEGER;
  v_milestone_achievement_rate NUMERIC;
  v_overdue_tasks INTEGER;
  v_delay_risk_score NUMERIC;
  v_total_conditions INTEGER;
  v_completed_conditions INTEGER;
  v_condition_completion_rate NUMERIC;
  v_active_obstacles INTEGER;
  v_obstacle_risk_score NUMERIC;
  v_health_score INTEGER;
  v_health_status VARCHAR(20);
BEGIN
  -- 获取任务统计
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = '已完成')
    INTO v_total_tasks, v_completed_tasks
    FROM tasks WHERE project_id = p_project_id;
  v_task_completion_rate := CASE WHEN v_total_tasks > 0 THEN v_completed_tasks::NUMERIC / v_total_tasks ELSE 1 END;
  
  -- 获取里程碑统计
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = '已完成')
    INTO v_total_milestones, v_completed_milestones
    FROM milestones WHERE project_id = p_project_id;
  v_milestone_achievement_rate := CASE WHEN v_total_milestones > 0 THEN v_completed_milestones::NUMERIC / v_total_milestones ELSE 1 END;
  
  -- 延期风险
  SELECT COUNT(*) INTO v_overdue_tasks
    FROM tasks 
    WHERE project_id = p_project_id 
    AND planned_end_date < CURRENT_DATE 
    AND status NOT IN ('已完成', '已暂停');
  v_delay_risk_score := CASE WHEN v_total_tasks > 0 THEN 100 - (v_overdue_tasks::NUMERIC / v_total_tasks * 100) ELSE 100 END;
  
  -- 条件完成率
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status IN ('已满足', '已确认'))
    INTO v_total_conditions, v_completed_conditions
    FROM task_conditions tc
    JOIN tasks t ON tc.task_id = t.id
    WHERE t.project_id = p_project_id;
  v_condition_completion_rate := CASE WHEN v_total_conditions > 0 THEN v_completed_conditions::NUMERIC / v_total_conditions ELSE 1 END;
  
  -- 阻碍风险
  SELECT COUNT(*) INTO v_active_obstacles
    FROM task_obstacles o
    JOIN tasks t ON o.task_id = t.id
    WHERE t.project_id = p_project_id AND o.status = '处理中';
  v_obstacle_risk_score := 100 - (v_active_obstacles * 10);
  
  -- 计算加权健康度
  v_health_score := ROUND(
    v_task_completion_rate * 30 +
    v_milestone_achievement_rate * 25 +
    v_delay_risk_score * 0.20 +
    v_condition_completion_rate * 15 +
    v_obstacle_risk_score * 0.10
  );
  
  -- 确定健康状态
  v_health_status := CASE 
    WHEN v_health_score >= 80 THEN '健康'
    WHEN v_health_score >= 60 THEN '亚健康'
    WHEN v_health_score >= 40 THEN '预警'
    ELSE '危险'
  END;
  
  RETURN QUERY SELECT v_health_score, v_health_status;
END;
$$ LANGUAGE plpgsql;

-- 6.5 健康度自动更新触发器
CREATE OR REPLACE FUNCTION update_project_health_on_change()
RETURNS TRIGGER AS $$
DECLARE
  v_project_id UUID;
BEGIN
  -- 获取关联项目ID
  IF TG_TABLE_NAME = 'tasks' THEN
    v_project_id := NEW.project_id;
  ELSIF TG_TABLE_NAME = 'milestones' THEN
    v_project_id := NEW.project_id;
  ELSIF TG_TABLE_NAME = 'task_conditions' THEN
    SELECT project_id INTO v_project_id FROM tasks WHERE id = NEW.task_id;
  ELSIF TG_TABLE_NAME = 'task_obstacles' THEN
    SELECT project_id INTO v_project_id FROM tasks WHERE id = NEW.task_id;
  END IF;
  
  -- 更新健康度
  UPDATE projects
  SET (health_score, health_status) = (
    SELECT health_score, health_status 
    FROM calculate_project_health_score(v_project_id)
  )
  WHERE id = v_project_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为相关表创建触发器
CREATE TRIGGER trigger_update_health_tasks
  AFTER INSERT OR UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_project_health_on_change();

CREATE TRIGGER trigger_update_health_milestones
  AFTER INSERT OR UPDATE ON milestones
  FOR EACH ROW
  EXECUTE FUNCTION update_project_health_on_change();

CREATE TRIGGER trigger_update_health_conditions
  AFTER INSERT OR UPDATE ON task_conditions
  FOR EACH ROW
  EXECUTE FUNCTION update_project_health_on_change();

CREATE TRIGGER trigger_update_health_obstacles
  AFTER INSERT OR UPDATE ON task_obstacles
  FOR EACH ROW
  EXECUTE FUNCTION update_project_health_on_change();

-- 添加注释
COMMENT ON FUNCTION calculate_project_health_score(UUID) IS '计算项目健康度得分';
COMMENT ON FUNCTION update_project_health_on_change() IS '任务/里程碑/条件/阻碍变更时自动更新健康度';
