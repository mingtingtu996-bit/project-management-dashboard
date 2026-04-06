-- 安全修复：启用RLS策略
-- 房地产工程管理系统V4.1 安全漏洞修复
-- 执行时间: 2026-03-22
-- 修复内容: 为7个表启用RLS并创建租户隔离策略

-- ============================================
-- 1. 创建通用RLS辅助函数
-- ============================================

-- 检查用户是否是项目成员的函数
CREATE OR REPLACE FUNCTION is_project_member(project_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = project_uuid 
      AND user_id = user_uuid 
      AND is_active = TRUE
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 检查用户是否是项目所有者的函数
CREATE OR REPLACE FUNCTION is_project_owner(project_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM projects
    WHERE id = project_uuid 
      AND owner_id = user_uuid
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 检查用户是否有编辑权限（owner或editor）
CREATE OR REPLACE FUNCTION has_project_edit_permission(project_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = project_uuid 
      AND user_id = user_uuid 
      AND is_active = TRUE
      AND permission_level IN ('owner', 'editor')
  ) OR EXISTS (
    SELECT 1 FROM projects
    WHERE id = project_uuid 
      AND owner_id = user_uuid
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================
-- 2. 启用 tasks 表的 RLS
-- ============================================

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- SELECT 策略：项目成员可以查看自己项目的任务
CREATE POLICY "tasks_select_own" ON tasks
  FOR SELECT USING (
    is_project_member(project_id, auth.uid()) OR
    created_by = auth.uid()
  );

-- INSERT 策略：项目成员可以创建任务
CREATE POLICY "tasks_insert_own" ON tasks
  FOR INSERT WITH CHECK (
    is_project_member(project_id, auth.uid())
  );

-- UPDATE 策略：项目成员可以更新任务
CREATE POLICY "tasks_update_own" ON tasks
  FOR UPDATE USING (
    is_project_member(project_id, auth.uid()) OR
    created_by = auth.uid()
  );

-- DELETE 策略：只有项目所有者和创建者可以删除任务
CREATE POLICY "tasks_delete_own" ON tasks
  FOR DELETE USING (
    has_project_edit_permission(project_id, auth.uid()) OR
    created_by = auth.uid()
  );

-- ============================================
-- 3. 启用 milestones 表的 RLS
-- ============================================

ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "milestones_select_own" ON milestones
  FOR SELECT USING (
    is_project_member(project_id, auth.uid()) OR
    created_by = auth.uid()
  );

CREATE POLICY "milestones_insert_own" ON milestones
  FOR INSERT WITH CHECK (
    is_project_member(project_id, auth.uid())
  );

CREATE POLICY "milestones_update_own" ON milestones
  FOR UPDATE USING (
    is_project_member(project_id, auth.uid()) OR
    created_by = auth.uid()
  );

CREATE POLICY "milestones_delete_own" ON milestones
  FOR DELETE USING (
    has_project_edit_permission(project_id, auth.uid()) OR
    created_by = auth.uid()
  );

-- ============================================
-- 4. 启用 task_conditions 表的 RLS
-- ============================================

ALTER TABLE task_conditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_conditions_select_own" ON task_conditions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_conditions.task_id
        AND is_project_member(t.project_id, auth.uid())
    ) OR
    created_by = auth.uid()
  );

CREATE POLICY "task_conditions_insert_own" ON task_conditions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_conditions.task_id
        AND is_project_member(t.project_id, auth.uid())
    )
  );

CREATE POLICY "task_conditions_update_own" ON task_conditions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_conditions.task_id
        AND is_project_member(t.project_id, auth.uid())
    ) OR
    created_by = auth.uid()
  );

CREATE POLICY "task_conditions_delete_own" ON task_conditions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_conditions.task_id
        AND has_project_edit_permission(t.project_id, auth.uid())
    ) OR
    created_by = auth.uid()
  );

-- ============================================
-- 5. 启用 task_obstacles 表的 RLS
-- ============================================

ALTER TABLE task_obstacles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_obstacles_select_own" ON task_obstacles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_obstacles.task_id
        AND is_project_member(t.project_id, auth.uid())
    ) OR
    created_by = auth.uid()
  );

CREATE POLICY "task_obstacles_insert_own" ON task_obstacles
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_obstacles.task_id
        AND is_project_member(t.project_id, auth.uid())
    )
  );

CREATE POLICY "task_obstacles_update_own" ON task_obstacles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_obstacles.task_id
        AND is_project_member(t.project_id, auth.uid())
    ) OR
    created_by = auth.uid()
  );

CREATE POLICY "task_obstacles_delete_own" ON task_obstacles
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_obstacles.task_id
        AND has_project_edit_permission(t.project_id, auth.uid())
    ) OR
    created_by = auth.uid()
  );

-- ============================================
-- 6. 启用 acceptance_plans 表的 RLS
-- ============================================

ALTER TABLE acceptance_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acceptance_plans_select_own" ON acceptance_plans
  FOR SELECT USING (
    is_project_member(project_id, auth.uid()) OR
    created_by = auth.uid()
  );

CREATE POLICY "acceptance_plans_insert_own" ON acceptance_plans
  FOR INSERT WITH CHECK (
    is_project_member(project_id, auth.uid())
  );

CREATE POLICY "acceptance_plans_update_own" ON acceptance_plans
  FOR UPDATE USING (
    is_project_member(project_id, auth.uid()) OR
    created_by = auth.uid()
  );

CREATE POLICY "acceptance_plans_delete_own" ON acceptance_plans
  FOR DELETE USING (
    has_project_edit_permission(project_id, auth.uid()) OR
    created_by = auth.uid()
  );

-- ============================================
-- 7. 启用 wbs_templates 表的 RLS
-- ============================================

ALTER TABLE wbs_templates ENABLE ROW LEVEL SECURITY;

-- WBS模板：所有用户可查看系统模板和公开模板
CREATE POLICY "wbs_templates_select" ON wbs_templates
  FOR SELECT USING (
    is_system = TRUE OR
    is_public = TRUE OR
    created_by = auth.uid() OR
    is_project_member(project_id, auth.uid())
  );

-- 只有项目成员可以创建模板
CREATE POLICY "wbs_templates_insert_own" ON wbs_templates
  FOR INSERT WITH CHECK (
    is_project_member(project_id, auth.uid())
  );

-- 只有创建者或项目编辑者可以更新
CREATE POLICY "wbs_templates_update_own" ON wbs_templates
  FOR UPDATE USING (
    (is_system = FALSE AND created_by = auth.uid()) OR
    has_project_edit_permission(project_id, auth.uid())
  );

-- 只有创建者或项目编辑者可以删除（系统模板不可删除）
CREATE POLICY "wbs_templates_delete_own" ON wbs_templates
  FOR DELETE USING (
    is_system = FALSE AND (
      created_by = auth.uid() OR
      has_project_edit_permission(project_id, auth.uid())
    )
  );

-- ============================================
-- 8. 启用 pre_milestones 表的 RLS
-- ============================================

ALTER TABLE pre_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pre_milestones_select_own" ON pre_milestones
  FOR SELECT USING (
    is_project_member(project_id, auth.uid()) OR
    created_by = auth.uid()
  );

CREATE POLICY "pre_milestones_insert_own" ON pre_milestones
  FOR INSERT WITH CHECK (
    is_project_member(project_id, auth.uid())
  );

CREATE POLICY "pre_milestones_update_own" ON pre_milestones
  FOR UPDATE USING (
    is_project_member(project_id, auth.uid()) OR
    created_by = auth.uid()
  );

CREATE POLICY "pre_milestones_delete_own" ON pre_milestones
  FOR DELETE USING (
    has_project_edit_permission(project_id, auth.uid()) OR
    created_by = auth.uid()
  );

-- ============================================
-- 9. 启用 acceptance_nodes 表的 RLS
-- ============================================

ALTER TABLE acceptance_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acceptance_nodes_select_own" ON acceptance_nodes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM acceptance_plans ap
      WHERE ap.id = acceptance_nodes.plan_id
        AND is_project_member(ap.project_id, auth.uid())
    ) OR
    created_by = auth.uid()
  );

CREATE POLICY "acceptance_nodes_insert_own" ON acceptance_nodes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM acceptance_plans ap
      WHERE ap.id = acceptance_nodes.plan_id
        AND is_project_member(ap.project_id, auth.uid())
    )
  );

CREATE POLICY "acceptance_nodes_update_own" ON acceptance_nodes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM acceptance_plans ap
      WHERE ap.id = acceptance_nodes.plan_id
        AND is_project_member(ap.project_id, auth.uid())
    ) OR
    created_by = auth.uid()
  );

CREATE POLICY "acceptance_nodes_delete_own" ON acceptance_nodes
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM acceptance_plans ap
      WHERE ap.id = acceptance_nodes.plan_id
        AND has_project_edit_permission(ap.project_id, auth.uid())
    ) OR
    created_by = auth.uid()
  );

-- ============================================
-- 10. 启用 task_delay_history 表的 RLS
-- ============================================

ALTER TABLE task_delay_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_delay_history_select_own" ON task_delay_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_delay_history.task_id
        AND is_project_member(t.project_id, auth.uid())
    ) OR
    created_by = auth.uid()
  );

CREATE POLICY "task_delay_history_insert_own" ON task_delay_history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_delay_history.task_id
        AND is_project_member(t.project_id, auth.uid())
    )
  );

-- 延期历史记录不允许更新和删除（审计日志性质）

-- ============================================
-- 11. 启用 pre_milestone_conditions 表的 RLS
-- ============================================

ALTER TABLE pre_milestone_conditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pre_milestone_conditions_select_own" ON pre_milestone_conditions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pre_milestones pm
      WHERE pm.id = pre_milestone_conditions.pre_milestone_id
        AND is_project_member(pm.project_id, auth.uid())
    ) OR
    created_by = auth.uid()
  );

CREATE POLICY "pre_milestone_conditions_insert_own" ON pre_milestone_conditions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM pre_milestones pm
      WHERE pm.id = pre_milestone_conditions.pre_milestone_id
        AND is_project_member(pm.project_id, auth.uid())
    )
  );

CREATE POLICY "pre_milestone_conditions_update_own" ON pre_milestone_conditions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM pre_milestones pm
      WHERE pm.id = pre_milestone_conditions.pre_milestone_id
        AND is_project_member(pm.project_id, auth.uid())
    ) OR
    created_by = auth.uid()
  );

CREATE POLICY "pre_milestone_conditions_delete_own" ON pre_milestone_conditions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM pre_milestones pm
      WHERE pm.id = pre_milestone_conditions.pre_milestone_id
        AND has_project_edit_permission(pm.project_id, auth.uid())
    ) OR
    created_by = auth.uid()
  );

-- ============================================
-- 12. 启用 task_completion_reports 表的 RLS
-- ============================================

ALTER TABLE task_completion_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_completion_reports_select_own" ON task_completion_reports
  FOR SELECT USING (
    is_project_member(project_id, auth.uid()) OR
    generated_by = auth.uid()
  );

CREATE POLICY "task_completion_reports_insert_own" ON task_completion_reports
  FOR INSERT WITH CHECK (
    is_project_member(project_id, auth.uid())
  );

CREATE POLICY "task_completion_reports_update_own" ON task_completion_reports
  FOR UPDATE USING (
    is_project_member(project_id, auth.uid()) OR
    generated_by = auth.uid()
  );

-- 完成报告不允许删除（审计日志性质）

-- ============================================
-- 13. 启用 task_progress_snapshots 表的 RLS
-- ============================================

ALTER TABLE task_progress_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_progress_snapshots_select_own" ON task_progress_snapshots
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_progress_snapshots.task_id
        AND is_project_member(t.project_id, auth.uid())
    )
  );

-- 进度快照只允许系统自动插入，不允许手动操作

-- ============================================
-- 14. 启用 wbs_structure 表的 RLS
-- ============================================

ALTER TABLE wbs_structure ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wbs_structure_select_own" ON wbs_structure
  FOR SELECT USING (
    is_project_member(project_id, auth.uid()) OR
    created_by = auth.uid()
  );

CREATE POLICY "wbs_structure_insert_own" ON wbs_structure
  FOR INSERT WITH CHECK (
    is_project_member(project_id, auth.uid())
  );

CREATE POLICY "wbs_structure_update_own" ON wbs_structure
  FOR UPDATE USING (
    is_project_member(project_id, auth.uid()) OR
    created_by = auth.uid()
  );

CREATE POLICY "wbs_structure_delete_own" ON wbs_structure
  FOR DELETE USING (
    has_project_edit_permission(project_id, auth.uid()) OR
    created_by = auth.uid()
  );

-- ============================================
-- 15. 启用 wbs_task_links 表的 RLS
-- ============================================

ALTER TABLE wbs_task_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wbs_task_links_select_own" ON wbs_task_links
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM wbs_structure ws
      WHERE ws.id = wbs_task_links.wbs_node_id
        AND is_project_member(ws.project_id, auth.uid())
    ) OR
    created_by = auth.uid()
  );

CREATE POLICY "wbs_task_links_insert_own" ON wbs_task_links
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM wbs_structure ws
      WHERE ws.id = wbs_task_links.wbs_node_id
        AND is_project_member(ws.project_id, auth.uid())
    )
  );

CREATE POLICY "wbs_task_links_update_own" ON wbs_task_links
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM wbs_structure ws
      WHERE ws.id = wbs_task_links.wbs_node_id
        AND is_project_member(ws.project_id, auth.uid())
    ) OR
    created_by = auth.uid()
  );

CREATE POLICY "wbs_task_links_delete_own" ON wbs_task_links
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM wbs_structure ws
      WHERE ws.id = wbs_task_links.wbs_node_id
        AND has_project_edit_permission(ws.project_id, auth.uid())
    ) OR
    created_by = auth.uid()
  );

-- ============================================
-- 16. 启用 job_execution_logs 表的 RLS
-- ============================================

ALTER TABLE job_execution_logs ENABLE ROW LEVEL SECURITY;

-- 执行日志只允许查看自己项目的日志
CREATE POLICY "job_execution_logs_select_own" ON job_execution_logs
  FOR SELECT USING (
    is_project_member(project_id, auth.uid())
  );

-- 执行日志只允许系统自动插入

-- ============================================
-- 17. 启用 task_locks 表的 RLS
-- ============================================

ALTER TABLE task_locks ENABLE ROW LEVEL SECURITY;

-- 任务锁只允许查看自己项目的锁
CREATE POLICY "task_locks_select_own" ON task_locks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_locks.task_id
        AND is_project_member(t.project_id, auth.uid())
    )
  );

-- 任务锁只允许系统操作

-- ============================================
-- 修复完成注释
-- ============================================

COMMENT ON FUNCTION is_project_member IS '检查用户是否是项目成员';
COMMENT ON FUNCTION is_project_owner IS '检查用户是否是项目所有者';
COMMENT ON FUNCTION has_project_edit_permission IS '检查用户是否有项目编辑权限';
