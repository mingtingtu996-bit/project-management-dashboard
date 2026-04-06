-- ============================================================
-- FULL_MIGRATION_ALL_IN_ONE.sql
-- 鎴垮湴浜у伐绋嬬鐞嗙郴缁?V4.1  瀹屾暣鏁版嵁搴撹縼绉伙紙鍚堝苟鐗堬級
-- 鍚堝苟鑷? 001~017 鍏ㄩ儴杩佺Щ鏂囦欢
-- 宸茶烦杩? 007_enable_rls_policies.sql锛堜緷璧?auth.uid()锛屾棤鐧诲綍绯荤粺涓嶉€傜敤锛?
-- 浣跨敤鏂规硶: 绮樿创鍒?Supabase SQL Editor 鐐瑰嚮 Run 鍗冲彲
-- ============================================================


-- ============================================================
-- 鏉ヨ嚜: 001_initial_schema.sql
-- ============================================================
-- 椤圭洰绠＄悊绯荤粺鏁版嵁搴撳垵濮嬪寲鑴氭湰
-- 鎵ц鍓嶈鍦?Supabase SQL Editor 涓繍琛?

-- 鐢ㄦ埛琛紙鏃犳敞鍐屾ā寮忥紝浣跨敤device_id锛?
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  joined_at TIMESTAMP DEFAULT NOW(),
  last_active TIMESTAMP DEFAULT NOW()
);

-- 椤圭洰琛?
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  primary_invitation_code VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 浠诲姟琛?
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'todo',
  priority VARCHAR(20) DEFAULT 'medium',
  start_date DATE,
  end_date DATE,
  progress INTEGER DEFAULT 0,
  assignee VARCHAR(100),
  assignee_unit VARCHAR(100),
  dependencies UUID[],
  is_milestone BOOLEAN DEFAULT FALSE,
  version INTEGER DEFAULT 1,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 椋庨櫓琛?
CREATE TABLE IF NOT EXISTS risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  level VARCHAR(20) DEFAULT 'medium',
  status VARCHAR(20) DEFAULT 'identified',
  probability INTEGER DEFAULT 50,
  impact INTEGER DEFAULT 50,
  mitigation TEXT,
  task_id UUID REFERENCES tasks(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 閲岀▼纰戣〃
CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  target_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 閭€璇风爜琛?
CREATE TABLE IF NOT EXISTS project_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  invitation_code VARCHAR(50) UNIQUE NOT NULL,
  permission_level VARCHAR(20) DEFAULT 'editor',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  is_revoked BOOLEAN DEFAULT FALSE,
  used_count INTEGER DEFAULT 0,
  max_uses INTEGER
);

-- 椤圭洰鎴愬憳琛?
CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  invitation_code_id UUID REFERENCES project_invitations(id),
  permission_level VARCHAR(20) DEFAULT 'editor',
  joined_at TIMESTAMP DEFAULT NOW(),
  last_activity TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

-- 鍒涘缓绱㈠紩
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_risks_project ON risks(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_invitations_project ON project_invitations(project_id);
CREATE INDEX IF NOT EXISTS idx_members_project ON project_members(project_id);

-- 鍚敤RLS绛栫暐锛堝彲閫夛紝鐢熶骇鐜寤鸿鍚敤锛?
-- 娉ㄦ剰: 鍚敤RLS鍚庨渶瑕侀厤缃浉搴旂殑绛栫暐


-- ============================================================
-- 鏉ヨ嚜: 002_add_phase1_tables.sql
-- ============================================================
-- 浠诲姟寮€宸ユ潯浠躲€侀樆纰嶃€佸欢鏈熷巻鍙层€侀獙鏀惰鍒掋€乄BS妯℃澘銆佸墠鏈熻瘉鐓?
-- 鎴垮湴浜у伐绋嬬鐞嗙郴缁烿4.1 Phase 1 鏁版嵁搴撹縼绉?
-- 鎵ц鏃堕棿: 2026-03-22

-- 1. task_conditions锛堝紑宸ユ潯浠惰〃锛?
CREATE TABLE IF NOT EXISTS task_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  condition_type TEXT NOT NULL CHECK (condition_type IN ('鍥剧焊', '鏉愭枡', '浜哄憳', '璁惧', '鍏朵粬')),
  name TEXT NOT NULL,
  description TEXT,
  is_satisfied BOOLEAN NOT NULL DEFAULT FALSE,
  attachments JSONB DEFAULT '[]',
  confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. task_obstacles锛堥樆纰嶈褰曡〃锛?
CREATE TABLE IF NOT EXISTS task_obstacles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  obstacle_type TEXT NOT NULL CHECK (obstacle_type IN ('浜哄憳', '鏉愭枡', '璁惧', '鐜', '璁捐', '鍏朵粬')),
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT '涓? CHECK (severity IN ('浣?, '涓?, '楂?, '涓ラ噸')),
  status TEXT NOT NULL DEFAULT '寰呭鐞? CHECK (status IN ('寰呭鐞?, '澶勭悊涓?, '宸茶В鍐?, '鏃犳硶瑙ｅ喅')),
  resolution TEXT,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. task_delay_history锛堝欢鏈熷巻鍙茶〃锛?
CREATE TABLE IF NOT EXISTS task_delay_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  original_date DATE NOT NULL,
  delayed_date DATE NOT NULL,
  delay_days INTEGER NOT NULL CHECK (delay_days > 0),
  delay_type TEXT NOT NULL CHECK (delay_type IN ('涓诲姩鐢宠', '琚姩寤舵湡', '瀹㈣鍥犵礌')),
  reason TEXT NOT NULL,
  delay_reason TEXT,
  approved_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. acceptance_plans锛堥獙鏀惰鍒掕〃锛?
CREATE TABLE IF NOT EXISTS acceptance_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  acceptance_type TEXT NOT NULL CHECK (acceptance_type IN ('鍒嗛」', '鍒嗛儴', '绔ｅ伐', '娑堥槻', '鐜繚', '瑙勫垝', '鑺傝兘', '鏅鸿兘', '鍏朵粬')),
  acceptance_name TEXT NOT NULL,
  planned_date DATE NOT NULL,
  actual_date DATE,
  status TEXT NOT NULL DEFAULT '寰呴獙鏀? CHECK (status IN ('寰呴獙鏀?, '楠屾敹涓?, '宸查€氳繃', '鏈€氳繃')),
  documents JSONB DEFAULT '[]',
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. wbs_templates锛圵BS妯℃澘琛級
CREATE TABLE IF NOT EXISTS wbs_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name TEXT NOT NULL,
  template_type TEXT NOT NULL CHECK (template_type IN ('浣忓畢', '鍟嗕笟', '宸ヤ笟', '甯傛斂')),
  description TEXT,
  wbs_nodes JSONB NOT NULL DEFAULT '[]',
  is_default BOOLEAN DEFAULT FALSE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT template_name_unique UNIQUE (template_name, template_type)
);

-- 6. pre_milestones锛堝墠鏈熻瘉鐓ц〃锛?
CREATE TABLE IF NOT EXISTS pre_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_type TEXT NOT NULL CHECK (milestone_type IN ('鍦熷湴璇?, '瑙勫垝璇?, '鏂藉伐璇?, '棰勫敭璇?, '浜ф潈璇?, '鍏朵粬')),
  milestone_name TEXT NOT NULL,
  application_date DATE,
  issue_date DATE,
  expiry_date DATE,
  status TEXT NOT NULL DEFAULT '寰呯敵璇? CHECK (status IN ('寰呯敵璇?, '鍔炵悊涓?, '宸插彇寰?, '宸茶繃鏈?, '闇€寤舵湡')),
  document_no TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 鍒涘缓绱㈠紩
CREATE INDEX IF NOT EXISTS idx_task_conditions_task ON task_conditions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_obstacles_task ON task_obstacles(task_id);
CREATE INDEX IF NOT EXISTS idx_task_delay_history_task ON task_delay_history(task_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_plans_project ON acceptance_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_plans_task ON acceptance_plans(task_id);
CREATE INDEX IF NOT EXISTS idx_wbs_templates_type ON wbs_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_pre_milestones_project ON pre_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_pre_milestones_type ON pre_milestones(milestone_type);

-- 鍒涘缓瑙﹀彂鍣細鑷姩鏇存柊 updated_at 瀛楁
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_task_conditions_updated_at
  BEFORE UPDATE ON task_conditions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_task_obstacles_updated_at
  BEFORE UPDATE ON task_obstacles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_acceptance_plans_updated_at
  BEFORE UPDATE ON acceptance_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wbs_templates_updated_at
  BEFORE UPDATE ON wbs_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pre_milestones_updated_at
  BEFORE UPDATE ON pre_milestones
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 鏉ヨ嚜: 003_add_task_locks_and_logs.sql
-- ============================================================
-- ============================================================
-- Phase 1 琛ュ厖鏁版嵁搴撹縼绉?
-- 鎴垮湴浜у伐绋嬬鐞嗙郴缁烿4.1 Phase 1 琛ュ厖
-- 鎵ц鏃堕棿: 2026-03-22
-- ============================================================

-- 1. task_locks锛堝畾鏃朵换鍔￠攣琛級
CREATE TABLE IF NOT EXISTS task_locks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 浠诲姟鏍囪瘑
    job_name VARCHAR(100) NOT NULL UNIQUE,
    
    -- 閿佺姸鎬?
    is_locked BOOLEAN DEFAULT FALSE,
    
    -- 閿佷俊鎭?
    locked_by VARCHAR(100),
    locked_at TIMESTAMP,
    lock_expires_at TIMESTAMP,
    
    -- 閿侀厤缃?
    lock_duration_seconds INTEGER DEFAULT 300,
    max_retries INTEGER DEFAULT 3,
    
    -- 鍏冩暟鎹?
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. job_execution_logs锛堝畾鏃朵换鍔℃墽琛屾棩蹇楄〃锛?
CREATE TABLE IF NOT EXISTS job_execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 浠诲姟淇℃伅
    job_name VARCHAR(100) NOT NULL,
    job_type VARCHAR(50),
    
    -- 鎵ц鐘舵€?
    status VARCHAR(20) NOT NULL
      CHECK (status IN ('pending', 'running', 'success', 'failed', 'timeout', 'cancelled')),
    
    -- 鎵ц鏃堕棿
    started_at TIMESTAMP NOT NULL,
    finished_at TIMESTAMP,
    duration_ms INTEGER,
    
    -- 杈撳叆杈撳嚭
    input_data JSONB DEFAULT '{}',
    output_data JSONB DEFAULT '{}',
    error_message TEXT,
    error_stack TEXT,
    
    -- 鎵ц鐜
    executed_by VARCHAR(100),
    hostname VARCHAR(100),
    process_id INTEGER,
    
    -- 閲嶈瘯淇℃伅
    retry_count INTEGER DEFAULT 0,
    original_log_id UUID REFERENCES job_execution_logs(id),
    
    -- 鍏冩暟鎹?
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. 涓簍ask_locks琛ㄦ坊鍔爑pdated_at瑙﹀彂鍣?
CREATE TRIGGER update_task_locks_updated_at
  BEFORE UPDATE ON task_locks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 4. 鍒涘缓绱㈠紩
CREATE INDEX IF NOT EXISTS idx_task_locks_job ON task_locks(job_name);
CREATE INDEX IF NOT EXISTS idx_task_locks_locked ON task_locks(is_locked, lock_expires_at);
CREATE INDEX IF NOT EXISTS idx_job_logs_name ON job_execution_logs(job_name);
CREATE INDEX IF NOT EXISTS idx_job_logs_status ON job_execution_logs(status);
CREATE INDEX IF NOT EXISTS idx_job_logs_started ON job_execution_logs(started_at);

-- 5. task_locks琛ㄦ敞閲?
COMMENT ON TABLE task_locks IS '瀹氭椂浠诲姟閿佽〃锛岄槻姝㈠垎甯冨紡鐜涓嬬殑浠诲姟閲嶅鎵ц';
COMMENT ON TABLE job_execution_logs IS '瀹氭椂浠诲姟鎵ц鏃ュ織琛紝璁板綍浠诲姟鎵ц鍘嗗彶';


-- ============================================================
-- 鏉ヨ嚜: 004_add_dashboard_view.sql
-- ============================================================
-- ============================================================
-- Dashboard 鐗╁寲瑙嗗浘
-- 鎴垮湴浜у伐绋嬬鐞嗙郴缁烿4.1 Phase 1
-- 鎵ц鏃堕棿: 2026-03-22
-- ============================================================

-- 鍒涘缓鐗╁寲瑙嗗浘锛氶」鐩瓺ashboard缁熻
-- [璺宠繃MV] CREATE MATERIALIZED VIEW IF NOT EXISTS mv_project_dashboard AS
-- [璺宠繃MV] SELECT 
-- [璺宠繃MV]     p.id AS project_id,
-- [璺宠繃MV]     p.name AS project_name,
-- [璺宠繃MV]     p.status AS project_status,
-- [璺宠繃MV]     p.health_score,
-- [璺宠繃MV]     p.health_status,
-- [璺宠繃MV]     p.start_date,
-- [璺宠繃MV]     p.end_date AS project_end_date,
-- [璺宠繃MV]     p.budget,
-- [璺宠繃MV]     p.location,
    
-- [璺宠繃MV]     -- 浠诲姟缁熻
-- [璺宠繃MV]     (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS total_tasks,
-- [璺宠繃MV]     (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = '宸插畬鎴?) AS completed_tasks,
-- [璺宠繃MV]     (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = '杩涜涓?) AS ongoing_tasks,
-- [璺宠繃MV]     (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = '鏈紑濮?) AS pending_tasks,
    
-- [璺宠繃MV]     -- 閲岀▼纰戠粺璁?
-- [璺宠繃MV]     (SELECT COUNT(*) FROM milestones m WHERE m.project_id = p.id) AS total_milestones,
-- [璺宠繃MV]     (SELECT COUNT(*) FROM milestones m WHERE m.project_id = p.id AND m.status = '宸插畬鎴?) AS completed_milestones,
-- [璺宠繃MV]     (SELECT COUNT(*) FROM milestones m WHERE m.project_id = p.id AND m.status = '宸插欢鏈?) AS delayed_milestones,
    
-- [璺宠繃MV]     -- 寤舵湡浠诲姟缁熻
-- [璺宠繃MV]     (SELECT COUNT(*) FROM tasks t 
-- [璺宠繃MV]      WHERE t.project_id = p.id 
-- [璺宠繃MV]      AND t.planned_end_date < CURRENT_DATE 
-- [璺宠繃MV]      AND t.status NOT IN ('宸插畬鎴?, '宸叉殏鍋?)) AS overdue_tasks,
    
-- [璺宠繃MV]     -- 鏉′欢缁熻
-- [璺宠繃MV]     (SELECT COUNT(*) FROM task_conditions tc 
-- [璺宠繃MV]      JOIN tasks t ON tc.task_id = t.id 
-- [璺宠繃MV]      WHERE t.project_id = p.id) AS total_conditions,
-- [璺宠繃MV]     (SELECT COUNT(*) FROM task_conditions tc 
-- [璺宠繃MV]      JOIN tasks t ON tc.task_id = t.id 
-- [璺宠繃MV]      WHERE t.project_id = p.id AND tc.status = '宸叉弧瓒?) AS satisfied_conditions,
-- [璺宠繃MV]     (SELECT COUNT(*) FROM task_conditions tc 
-- [璺宠繃MV]      JOIN tasks t ON tc.task_id = t.id 
-- [璺宠繃MV]      WHERE t.project_id = p.id AND tc.status = '鏈弧瓒?) AS unsatisfied_conditions,
    
-- [璺宠繃MV]     -- 闃荤缁熻
-- [璺宠繃MV]     (SELECT COUNT(*) FROM task_obstacles ob 
-- [璺宠繃MV]      JOIN tasks t ON ob.task_id = t.id 
-- [璺宠繃MV]      WHERE t.project_id = p.id) AS total_obstacles,
-- [璺宠繃MV]     (SELECT COUNT(*) FROM task_obstacles ob 
-- [璺宠繃MV]      JOIN tasks t ON ob.task_id = t.id 
-- [璺宠繃MV]      WHERE t.project_id = p.id AND ob.status = '寰呭鐞?) AS pending_obstacles,
-- [璺宠繃MV]     (SELECT COUNT(*) FROM task_obstacles ob 
-- [璺宠繃MV]      JOIN tasks t ON ob.task_id = t.id 
-- [璺宠繃MV]      WHERE t.project_id = p.id AND ob.status = '澶勭悊涓?) AS processing_obstacles,
    
-- [璺宠繃MV]     -- 楠屾敹缁熻
-- [璺宠繃MV]     (SELECT COUNT(*) FROM acceptance_plans ap 
-- [璺宠繃MV]      WHERE ap.project_id = p.id) AS total_acceptance_plans,
-- [璺宠繃MV]     (SELECT COUNT(*) FROM acceptance_plans ap 
-- [璺宠繃MV]      WHERE ap.project_id = p.id AND ap.status = '宸查€氳繃') AS passed_acceptance_plans,
-- [璺宠繃MV]     (SELECT COUNT(*) FROM acceptance_plans ap 
-- [璺宠繃MV]      WHERE ap.project_id = p.id AND ap.status = '寰呴獙鏀?) AS pending_acceptance_plans,
    
-- [璺宠繃MV]     -- 璇佺収缁熻
-- [璺宠繃MV]     (SELECT COUNT(*) FROM pre_milestones pm 
-- [璺宠繃MV]      WHERE pm.project_id = p.id) AS total_pre_milestones,
-- [璺宠繃MV]     (SELECT COUNT(*) FROM pre_milestones pm 
-- [璺宠繃MV]      WHERE pm.project_id = p.id AND pm.status = '宸插彇寰?) AS obtained_pre_milestones,
-- [璺宠繃MV]     (SELECT COUNT(*) FROM pre_milestones pm 
-- [璺宠繃MV]      WHERE pm.project_id = p.id AND pm.status IN ('鍔炵悊涓?, '闇€寤舵湡')) AS processing_pre_milestones,
    
-- [璺宠繃MV]     -- 鏇存柊鏃堕棿
-- [璺宠繃MV]     NOW() AS last_refreshed
-- [璺宠繃MV] FROM projects p;

-- 涓虹墿鍖栬鍥惧垱寤哄敮涓€绱㈠紩锛堟敮鎸丆ONCURRENTLY鍒锋柊锛?
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_project_dashboard_project_id 
ON mv_project_dashboard(project_id);

-- 娣诲姞娉ㄩ噴
COMMENT ON MATERIALIZED VIEW mv_project_dashboard IS '椤圭洰Dashboard鐗╁寲瑙嗗浘锛屽瓨鍌ㄩ」鐩骇缁熻姹囨€绘暟鎹?;

-- 6. 鍒涘缓鏇村瑙﹀彂鍣紙Phase 1 琛ュ厖锛?

-- 6.1 浠诲姟瀹屾垚鏃惰嚜鍔ㄩ棴鍚堝叧鑱旀潯浠?
CREATE OR REPLACE FUNCTION auto_complete_conditions()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = '宸插畬鎴? AND OLD.status != '宸插畬鎴? THEN
    UPDATE task_conditions
    SET status = '宸茬‘璁?, confirmed_at = NOW()
    WHERE task_id = NEW.id AND status = '宸叉弧瓒?;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_complete_conditions
  AFTER UPDATE ON tasks
  FOR EACH ROW
  WHEN (NEW.status = '宸插畬鎴?)
  EXECUTE FUNCTION auto_complete_conditions();

-- 6.2 鏉′欢瀹屾垚鏃惰嚜鍔ㄦ洿鏂颁换鍔¤繘搴?
CREATE OR REPLACE FUNCTION update_task_progress_on_condition_complete()
RETURNS TRIGGER AS $$
DECLARE
  v_total_conditions INTEGER;
  v_completed_conditions INTEGER;
  v_progress INTEGER;
BEGIN
  IF NEW.status IN ('宸叉弧瓒?, '宸茬‘璁?) AND OLD.status NOT IN ('宸叉弧瓒?, '宸茬‘璁?) THEN
    SELECT COUNT(*), COUNT(*) FILTER (WHERE status IN ('宸叉弧瓒?, '宸茬‘璁?))
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

-- 6.3 寤舵湡鍘嗗彶鑷姩璁板綍锛堥€氳繃浠诲姟鐘舵€佸彉鏇磋Е鍙戯級
CREATE OR REPLACE FUNCTION record_task_delay_history()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.planned_end_date < OLD.planned_end_date 
     AND NEW.planned_end_date < CURRENT_DATE
     AND NEW.status NOT IN ('宸插畬鎴?, '宸叉殏鍋?) THEN
    INSERT INTO task_delay_history (task_id, original_date, delayed_date, delay_days, reason)
    VALUES (
      NEW.id,
      OLD.planned_end_date,
      NEW.planned_end_date,
      OLD.planned_end_date - NEW.planned_end_date,
      '璁″垝寤舵湡'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_record_task_delay
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION record_task_delay_history();

-- 6.4 鍋ュ悍搴﹁嚜鍔ㄦ洿鏂板嚱鏁?
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
  -- 鑾峰彇浠诲姟缁熻
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = '宸插畬鎴?)
    INTO v_total_tasks, v_completed_tasks
    FROM tasks WHERE project_id = p_project_id;
  v_task_completion_rate := CASE WHEN v_total_tasks > 0 THEN v_completed_tasks::NUMERIC / v_total_tasks ELSE 1 END;
  
  -- 鑾峰彇閲岀▼纰戠粺璁?
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = '宸插畬鎴?)
    INTO v_total_milestones, v_completed_milestones
    FROM milestones WHERE project_id = p_project_id;
  v_milestone_achievement_rate := CASE WHEN v_total_milestones > 0 THEN v_completed_milestones::NUMERIC / v_total_milestones ELSE 1 END;
  
  -- 寤舵湡椋庨櫓
  SELECT COUNT(*) INTO v_overdue_tasks
    FROM tasks 
    WHERE project_id = p_project_id 
    AND planned_end_date < CURRENT_DATE 
    AND status NOT IN ('宸插畬鎴?, '宸叉殏鍋?);
  v_delay_risk_score := CASE WHEN v_total_tasks > 0 THEN 100 - (v_overdue_tasks::NUMERIC / v_total_tasks * 100) ELSE 100 END;
  
  -- 鏉′欢瀹屾垚鐜?
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status IN ('宸叉弧瓒?, '宸茬‘璁?))
    INTO v_total_conditions, v_completed_conditions
    FROM task_conditions tc
    JOIN tasks t ON tc.task_id = t.id
    WHERE t.project_id = p_project_id;
  v_condition_completion_rate := CASE WHEN v_total_conditions > 0 THEN v_completed_conditions::NUMERIC / v_total_conditions ELSE 1 END;
  
  -- 闃荤椋庨櫓
  SELECT COUNT(*) INTO v_active_obstacles
    FROM task_obstacles o
    JOIN tasks t ON o.task_id = t.id
    WHERE t.project_id = p_project_id AND o.status = '澶勭悊涓?;
  v_obstacle_risk_score := 100 - (v_active_obstacles * 10);
  
  -- 璁＄畻鍔犳潈鍋ュ悍搴?
  v_health_score := ROUND(
    v_task_completion_rate * 30 +
    v_milestone_achievement_rate * 25 +
    v_delay_risk_score * 0.20 +
    v_condition_completion_rate * 15 +
    v_obstacle_risk_score * 0.10
  );
  
  -- 纭畾鍋ュ悍鐘舵€?
  v_health_status := CASE 
    WHEN v_health_score >= 80 THEN '鍋ュ悍'
    WHEN v_health_score >= 60 THEN '浜氬仴搴?
    WHEN v_health_score >= 40 THEN '棰勮'
    ELSE '鍗遍櫓'
  END;
  
  RETURN QUERY SELECT v_health_score, v_health_status;
END;
$$ LANGUAGE plpgsql;

-- 6.5 鍋ュ悍搴﹁嚜鍔ㄦ洿鏂拌Е鍙戝櫒
CREATE OR REPLACE FUNCTION update_project_health_on_change()
RETURNS TRIGGER AS $$
DECLARE
  v_project_id UUID;
BEGIN
  -- 鑾峰彇鍏宠仈椤圭洰ID
  IF TG_TABLE_NAME = 'tasks' THEN
    v_project_id := NEW.project_id;
  ELSIF TG_TABLE_NAME = 'milestones' THEN
    v_project_id := NEW.project_id;
  ELSIF TG_TABLE_NAME = 'task_conditions' THEN
    SELECT project_id INTO v_project_id FROM tasks WHERE id = NEW.task_id;
  ELSIF TG_TABLE_NAME = 'task_obstacles' THEN
    SELECT project_id INTO v_project_id FROM tasks WHERE id = NEW.task_id;
  END IF;
  
  -- 鏇存柊鍋ュ悍搴?
  UPDATE projects
  SET (health_score, health_status) = (
    SELECT health_score, health_status 
    FROM calculate_project_health_score(v_project_id)
  )
  WHERE id = v_project_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 涓虹浉鍏宠〃鍒涘缓瑙﹀彂鍣?
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

-- 娣诲姞娉ㄩ噴
COMMENT ON FUNCTION calculate_project_health_score(UUID) IS '璁＄畻椤圭洰鍋ュ悍搴﹀緱鍒?;
COMMENT ON FUNCTION update_project_health_on_change() IS '浠诲姟/閲岀▼纰?鏉′欢/闃荤鍙樻洿鏃惰嚜鍔ㄦ洿鏂板仴搴峰害';


-- ============================================================
-- 鏉ヨ嚜: 005_add_pre_milestone_conditions.sql
-- ============================================================
-- ============================================================
-- 鍓嶆湡璇佺収鏉′欢鍏宠仈琛?+ WBS缁撴瀯琛?
-- 鎴垮湴浜у伐绋嬬鐞嗙郴缁烿4.1 Phase 3
-- 鎵ц鏃堕棿: 2026-03-22
-- ============================================================

-- 鍚敤ltree鎵╁睍锛堢敤浜嶹BS灞傜骇璺緞绠＄悊锛?
CREATE EXTENSION IF NOT EXISTS ltree;

-- 1. pre_milestone_conditions锛堝墠鏈熻瘉鐓ф潯浠跺叧鑱旇〃锛?
CREATE TABLE IF NOT EXISTS pre_milestone_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 鍏宠仈鐨勮瘉鐓?
    pre_milestone_id UUID NOT NULL 
      REFERENCES pre_milestones(id) ON DELETE CASCADE,
    
    -- 鏉′欢淇℃伅
    condition_type VARCHAR(50) NOT NULL,
    condition_name TEXT NOT NULL,
    description TEXT,
    
    -- 鐘舵€?
    status VARCHAR(20) DEFAULT '寰呭鐞?
      CHECK (status IN ('寰呭鐞?, '宸叉弧瓒?, '鏈弧瓒?, '宸茬‘璁?)),
    
    -- 鏃堕棿鍜屼汉鍛?
    target_date DATE,
    completed_date DATE,
    completed_by UUID REFERENCES users(id),
    notes TEXT,
    
    -- 鍏冩暟鎹?
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. wbs_structure锛圵BS灞傜骇缁撴瀯琛級
CREATE TABLE IF NOT EXISTS wbs_structure (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- WBS鍩烘湰淇℃伅
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES wbs_structure(id) ON DELETE CASCADE,

    -- WBS缂栫爜鍜岃矾寰勶紙浣跨敤ltree鎵╁睍锛?
    wbs_code VARCHAR(100) NOT NULL,
    wbs_path LTREE NOT NULL,
    wbs_level INTEGER NOT NULL CHECK (wbs_level >= 0 AND wbs_level <= 4),

    -- 鑺傜偣淇℃伅
    node_name VARCHAR(200) NOT NULL,
    node_code VARCHAR(50),
    description TEXT,

    -- 灞傜骇
    level INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER DEFAULT 0,

    -- 鐘舵€?
    status VARCHAR(20) DEFAULT '寰呭紑濮?
      CHECK (status IN ('寰呭紑濮?, '杩涜涓?, '宸插畬鎴?, '宸叉殏鍋?, '宸插彇娑?)),

    -- 鏃堕棿
    planned_start_date DATE,
    planned_end_date DATE,
    actual_start_date DATE,
    actual_end_date DATE,

    -- 杩涘害
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),

    -- 璐ｄ换浜?
    responsible_user_id UUID REFERENCES users(id),

    -- 鎵╁睍
    properties JSONB DEFAULT '{}',

    -- 鍏冩暟鎹?
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. wbs_task_links锛圵BS鑺傜偣涓庝换鍔″叧鑱旇〃锛?
CREATE TABLE IF NOT EXISTS wbs_task_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 鍏宠仈鍏崇郴
    wbs_node_id UUID NOT NULL 
      REFERENCES wbs_structure(id) ON DELETE CASCADE,
    task_id UUID NOT NULL 
      REFERENCES tasks(id) ON DELETE CASCADE,
    
    -- 鍏宠仈绫诲瀷
    link_type VARCHAR(20) DEFAULT 'subtask'
      CHECK (link_type IN ('subtask', 'milestone', 'delivery', 'dependency')),
    
    -- 鍏冩暟鎹?
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(wbs_node_id, task_id)
);

-- 4. acceptance_nodes锛堥獙鏀惰妭鐐硅〃锛?
CREATE TABLE IF NOT EXISTS acceptance_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 鍏宠仈楠屾敹璁″垝
    acceptance_plan_id UUID NOT NULL 
      REFERENCES acceptance_plans(id) ON DELETE CASCADE,
    
    -- 鑺傜偣淇℃伅
    node_name VARCHAR(200) NOT NULL,
    node_type VARCHAR(50),
    description TEXT,
    
    -- 鐘舵€?
    status VARCHAR(20) DEFAULT '寰呴獙鏀?
      CHECK (status IN ('寰呴獙鏀?, '楠屾敹涓?, '宸查€氳繃', '鏈€氳繃', '闇€琛ュ厖')),
    
    -- 鏃堕棿
    planned_date DATE,
    actual_date DATE,
    
    -- 楠屾敹缁撴灉
    result JSONB DEFAULT '{}',
    documents JSONB DEFAULT '[]',
    notes TEXT,
    
    -- 楠屾敹浜?
    accepted_by UUID REFERENCES users(id),
    accepted_at TIMESTAMP,
    
    -- 鍏冩暟鎹?
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 鍒涘缓绱㈠紩
CREATE INDEX IF NOT EXISTS idx_pre_milestone_conditions_milestone 
  ON pre_milestone_conditions(pre_milestone_id);

CREATE INDEX IF NOT EXISTS idx_wbs_structure_project
  ON wbs_structure(project_id);
CREATE INDEX IF NOT EXISTS idx_wbs_structure_parent
  ON wbs_structure(parent_id);
CREATE INDEX IF NOT EXISTS idx_wbs_structure_wbs_path
  ON wbs_structure USING GIST(wbs_path);
CREATE INDEX IF NOT EXISTS idx_wbs_structure_wbs_code
  ON wbs_structure(wbs_code);

CREATE INDEX IF NOT EXISTS idx_wbs_task_links_wbs 
  ON wbs_task_links(wbs_node_id);
CREATE INDEX IF NOT EXISTS idx_wbs_task_links_task 
  ON wbs_task_links(task_id);

CREATE INDEX IF NOT EXISTS idx_acceptance_nodes_plan 
  ON acceptance_nodes(acceptance_plan_id);

-- 鍒涘缓瑙﹀彂鍣?
CREATE TRIGGER update_pre_milestone_conditions_updated_at
  BEFORE UPDATE ON pre_milestone_conditions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wbs_structure_updated_at
  BEFORE UPDATE ON wbs_structure
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_acceptance_nodes_updated_at
  BEFORE UPDATE ON acceptance_nodes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 娣诲姞娉ㄩ噴
COMMENT ON TABLE pre_milestone_conditions IS '鍓嶆湡璇佺収鏉′欢鍏宠仈琛紝璁板綍璇佺収鍔炵悊鐨勫墠缃潯浠?;
COMMENT ON TABLE wbs_structure IS 'WBS灞傜骇缁撴瀯琛紝瀛樺偍椤圭洰WBS鍒嗚В缁撴瀯';
COMMENT ON TABLE wbs_task_links IS 'WBS鑺傜偣涓庝换鍔″叧鑱旇〃锛屽缓绔媁BS鑺傜偣涓庝换鍔＄殑鏄犲皠鍏崇郴';
COMMENT ON TABLE acceptance_nodes IS '楠屾敹鑺傜偣琛紝瀛樺偍楠屾敹璁″垝涓嬬殑鍏蜂綋楠屾敹鑺傜偣';


-- ============================================================
-- 鏉ヨ嚜: 006_add_task_completion_reports.sql
-- ============================================================
-- 浠诲姟瀹屾垚鎬荤粨琛?
-- 鎴垮湴浜у伐绋嬬鐞嗙郴缁烿4.1 Phase 3.6 鏁版嵁搴撹縼绉?
-- 鎵ц鏃堕棿: 2026-03-22

-- 1. task_completion_reports锛堜换鍔″畬鎴愭€荤粨琛級
CREATE TABLE IF NOT EXISTS task_completion_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- 鍩烘湰淇℃伅
  report_type TEXT NOT NULL CHECK (report_type IN ('task', 'building', 'sub_project', 'project')),
  title TEXT NOT NULL,
  summary TEXT,
  
  -- 鏁堢巼缁熻
  planned_duration INTEGER NOT NULL,      -- 璁″垝宸ユ湡锛堝ぉ锛?
  actual_duration INTEGER NOT NULL,       -- 瀹為檯宸ユ湡锛堝ぉ锛?
  efficiency_ratio NUMERIC(5, 2) NOT NULL, -- 鏁堢巼姣?
  efficiency_status TEXT NOT NULL DEFAULT 'normal' CHECK (efficiency_status IN ('fast', 'normal', 'slow')),
  
  -- 寤舵湡缁熻
  total_delay_days INTEGER NOT NULL DEFAULT 0,
  delay_count INTEGER NOT NULL DEFAULT 0,
  delay_details JSONB DEFAULT '[]',
  
  -- 闃荤缁熻
  obstacle_count INTEGER NOT NULL DEFAULT 0,
  obstacles_summary TEXT,
  
  -- 瀹屾垚璐ㄩ噺
  quality_score INTEGER CHECK (quality_score BETWEEN 0 AND 100),
  quality_notes TEXT,
  
  -- 鎬荤粨鍐呭
  highlights TEXT,
  issues TEXT,
  lessons_learned TEXT,
  
  -- 鍏冩暟鎹?
  generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. task_progress_snapshots锛堜换鍔¤繘搴﹀揩鐓ц〃锛? 鐢ㄤ簬鏁堢巼璁＄畻
CREATE TABLE IF NOT EXISTS task_progress_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  progress INTEGER NOT NULL CHECK (progress BETWEEN 0 AND 100),
  snapshot_date DATE NOT NULL,
  is_auto_generated BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 鍞竴绾︽潫锛氬悓涓€浠诲姟姣忓ぉ鏈€澶氫竴鏉¤嚜鍔ㄧ敓鎴愮殑蹇収
  CONSTRAINT daily_snapshot UNIQUE (task_id, snapshot_date, is_auto_generated)
);

-- 鍒涘缓绱㈠紩
CREATE INDEX IF NOT EXISTS idx_task_completion_reports_task ON task_completion_reports(task_id);
CREATE INDEX IF NOT EXISTS idx_task_completion_reports_project ON task_completion_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_task_completion_reports_type ON task_completion_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_task_completion_reports_date ON task_completion_reports(generated_at);

CREATE INDEX IF NOT EXISTS idx_task_progress_snapshots_task ON task_progress_snapshots(task_id);
CREATE INDEX IF NOT EXISTS idx_task_progress_snapshots_date ON task_progress_snapshots(snapshot_date);

-- 鍒涘缓瑙﹀彂鍣細鑷姩鏇存柊 updated_at 瀛楁
CREATE TRIGGER update_task_completion_reports_updated_at
  BEFORE UPDATE ON task_completion_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 鍒涘缓瑙﹀彂鍣細浠诲姟杩涘害杈惧埌100%鏃惰嚜鍔ㄧ敓鎴愭€荤粨鎶ュ憡
CREATE OR REPLACE FUNCTION auto_generate_completion_report()
RETURNS TRIGGER AS $$
BEGIN
  -- 褰撲换鍔¤繘搴︽洿鏂颁负100%鏃讹紝瑙﹀彂鎬荤粨鎶ュ憡鐢熸垚
  IF NEW.progress = 100 AND (OLD.progress IS NULL OR OLD.progress < 100) THEN
    INSERT INTO task_completion_reports (
      task_id,
      project_id,
      report_type,
      title,
      summary,
      planned_duration,
      actual_duration,
      efficiency_ratio,
      efficiency_status,
      generated_by,
      generated_at
    )
    SELECT
      NEW.id,
      NEW.project_id,
      'task',
      COALESCE(NEW.name, '浠诲姟') || ' 瀹屾垚鎬荤粨',
      '浠诲姟宸插畬鎴愶紝鑷姩鐢熸垚鎬荤粨鎶ュ憡',
      EXTRACT(DAY FROM (NEW.planned_end_date - NEW.start_date)),
      EXTRACT(DAY FROM (CURRENT_DATE - NEW.start_date)),
      -- 鏁堢巼姣旀殏鏃惰涓?锛岀敱鏈嶅姟灞傞噸鏂拌绠?
      1.0,
      'normal',
      NEW.updated_by,
      NOW()
    ON CONFLICT DO NOTHING; -- 閬垮厤閲嶅鎻掑叆
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_generate_report
  AFTER UPDATE OF progress ON tasks
  FOR EACH ROW
  WHEN (NEW.progress = 100 AND (OLD.progress IS NULL OR OLD.progress < 100))
  EXECUTE FUNCTION auto_generate_completion_report();

-- 鍒涘缓瑙﹀彂鍣細浠诲姟杩涘害鏇存柊鏃惰褰曞揩鐓?
CREATE OR REPLACE FUNCTION auto_record_progress_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  -- 鍙湁褰撹繘搴﹀彂鐢熷彉鍖栨椂鎵嶈褰曞揩鐓?
  IF NEW.progress IS DISTINCT FROM OLD.progress THEN
    INSERT INTO task_progress_snapshots (task_id, progress, snapshot_date, notes)
    VALUES (
      NEW.id,
      NEW.progress,
      CURRENT_DATE,
      '杩涘害鏇存柊: ' || NEW.progress || '%'
    )
    ON CONFLICT (task_id, snapshot_date, is_auto_generated) 
    DO UPDATE SET 
      progress = NEW.progress,
      notes = EXCLUDED.notes;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_record_snapshot
  AFTER UPDATE OF progress ON tasks
  FOR EACH ROW
  WHEN (NEW.progress IS NOT NULL)
  EXECUTE FUNCTION auto_record_progress_snapshot();

-- [璺宠繃] 007_enable_rls_policies.sql (RLS auth.uid() 渚濊禆)


-- ============================================================
-- 鏉ヨ嚜: 008_fix_phase36_triggers.sql
-- ============================================================
-- Phase 3.6 瑙﹀彂鍣ㄥ瓧娈靛紩鐢ㄤ慨澶?
-- 淇闂: P0-001, P0-002
-- 鎵ц鏃堕棿: 2026-03-22

-- =====================================================
-- 淇 1: 淇 auto_generate_completion_report 鍑芥暟
-- 闂: 
--   - P0-001: 寮曠敤浜嗕笉瀛樺湪鐨勫瓧娈?planned_end_date锛屽簲鏀逛负 end_date
--   - P0-002: 寮曠敤浜嗕笉瀛樺湪鐨勫瓧娈?name锛屽簲鏀逛负 title
-- =====================================================

-- 鍏堝垹闄よЕ鍙戝櫒锛堜緷璧栧嚱鏁帮級
DROP TRIGGER IF EXISTS trigger_auto_generate_report ON tasks;

-- 鍒犻櫎鏃у嚱鏁?
DROP FUNCTION IF EXISTS auto_generate_completion_report();

-- 鍒涘缓淇鍚庣殑鍑芥暟
CREATE OR REPLACE FUNCTION auto_generate_completion_report()
RETURNS TRIGGER AS $$
BEGIN
  -- 褰撲换鍔¤繘搴︽洿鏂颁负100%鏃讹紝瑙﹀彂鎬荤粨鎶ュ憡鐢熸垚
  IF NEW.progress = 100 AND (OLD.progress IS NULL OR OLD.progress < 100) THEN
    INSERT INTO task_completion_reports (
      task_id,
      project_id,
      report_type,
      title,
      summary,
      planned_duration,
      actual_duration,
      efficiency_ratio,
      efficiency_status,
      generated_by,
      generated_at
    )
    SELECT
      NEW.id,
      NEW.project_id,
      'task',
      COALESCE(NEW.title, '浠诲姟') || ' 瀹屾垚鎬荤粨',  -- 淇: name -> title
      '浠诲姟宸插畬鎴愶紝鑷姩鐢熸垚鎬荤粨鎶ュ憡',
      EXTRACT(DAY FROM (NEW.end_date - NEW.start_date)),  -- 淇: planned_end_date -> end_date
      EXTRACT(DAY FROM (CURRENT_DATE - NEW.start_date)),
      -- 鏁堢巼姣旇涓?NULL锛岀敱鏈嶅姟灞傞噸鏂拌绠楋紙閬垮厤纭紪鐮佸€硷級
      NULL,
      'normal',
      NEW.updated_by,
      NOW()
    ON CONFLICT DO NOTHING; -- 閬垮厤閲嶅鎻掑叆
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 閲嶆柊鍒涘缓瑙﹀彂鍣?
CREATE TRIGGER trigger_auto_generate_report
  AFTER UPDATE OF progress ON tasks
  FOR EACH ROW
  WHEN (NEW.progress = 100 AND (OLD.progress IS NULL OR OLD.progress < 100))
  EXECUTE FUNCTION auto_generate_completion_report();

-- =====================================================
-- 淇 2: 娣诲姞瑙﹀彂鍣ㄥ紓甯稿鐞嗭紙澧炲己鍋ュ．鎬э級
-- =====================================================

-- 鍒涘缓鏃ュ織琛紙濡傛灉涓嶅瓨鍦級鐢ㄤ簬璁板綍瑙﹀彂鍣ㄥ紓甯?
CREATE TABLE IF NOT EXISTS trigger_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL,
  record_id UUID,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'warning')),
  message TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 鍒涘缓绱㈠紩
CREATE INDEX IF NOT EXISTS idx_trigger_logs_name ON trigger_execution_logs(trigger_name);
CREATE INDEX IF NOT EXISTS idx_trigger_logs_status ON trigger_execution_logs(status);
CREATE INDEX IF NOT EXISTS idx_trigger_logs_created ON trigger_execution_logs(created_at);

-- =====================================================
-- 淇 3: 鍒涘缓甯﹀紓甯稿鐞嗙殑鍖呰鍑芥暟锛堝彲閫夊寮猴級
-- =====================================================

CREATE OR REPLACE FUNCTION safe_generate_completion_report()
RETURNS TRIGGER AS $$
BEGIN
  -- 璋冪敤涓诲嚱鏁板苟鎹曡幏寮傚父
  BEGIN
    -- 妫€鏌ュ繀瑕佸瓧娈垫槸鍚﹀瓨鍦?
    IF NEW.id IS NULL OR NEW.project_id IS NULL THEN
      RAISE WARNING '瑙﹀彂鍣ㄦ墽琛岃烦杩? task_id 鎴?project_id 涓虹┖';
      RETURN NEW;
    END IF;
    
    -- 璋冪敤涓婚€昏緫
    RETURN auto_generate_completion_report();
    
  EXCEPTION WHEN OTHERS THEN
    -- 璁板綍閿欒鏃ュ織
    INSERT INTO trigger_execution_logs (
      trigger_name,
      table_name,
      operation,
      record_id,
      status,
      message,
      details
    ) VALUES (
      'trigger_auto_generate_report',
      'tasks',
      'UPDATE',
      NEW.id,
      'error',
      SQLERRM,
      jsonb_build_object(
        'sqlstate', SQLSTATE,
        'task_id', NEW.id,
        'progress', NEW.progress
      )
    );
    
    -- 瑙﹀彂鍣ㄥ紓甯镐笉搴旈樆姝㈠師鎿嶄綔锛岃繑鍥?NEW 缁х画鎵ц
    RETURN NEW;
  END;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 楠岃瘉淇
-- =====================================================

-- 娣诲姞娉ㄩ噴璇存槑淇鍐呭
COMMENT ON FUNCTION auto_generate_completion_report() IS 
'浠诲姟瀹屾垚鏃惰嚜鍔ㄧ敓鎴愭€荤粨鎶ュ憡锛堝凡淇瀛楁寮曠敤锛歯ame->title, planned_end_date->end_date锛?;

-- 楠岃瘉瑙﹀彂鍣ㄧ姸鎬?
DO $$
BEGIN
  RAISE NOTICE 'Phase 3.6 瑙﹀彂鍣ㄤ慨澶嶅畬鎴?';
  RAISE NOTICE '  - P0-001: planned_end_date -> end_date (宸蹭慨澶?';
  RAISE NOTICE '  - P0-002: name -> title (宸蹭慨澶?';
  RAISE NOTICE '  - efficiency_ratio 鏀逛负 NULL锛岀敱鏈嶅姟灞傝绠?;
END $$;


-- ============================================================
-- 鏉ヨ嚜: 009_add_job_execution_logs.sql
-- ============================================================
-- 鍒涘缓浠诲姟鎵ц鏃ュ織琛?
-- 璁板綍鎵€鏈夊畾鏃朵换鍔＄殑鎵ц鍘嗗彶锛屼究浜庣洃鎺у拰鎺掓煡闂

CREATE TABLE IF NOT EXISTS job_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'timeout')),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  result JSONB,
  error_message TEXT,
  job_id TEXT,
  triggered_by TEXT CHECK (triggered_by IN ('scheduler', 'manual', 'api')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 鍒涘缓绱㈠紩浠ユ彁楂樻煡璇㈡€ц兘
CREATE INDEX idx_job_execution_logs_job_name ON job_execution_logs(job_name);
CREATE INDEX idx_job_execution_logs_status ON job_execution_logs(status);
CREATE INDEX idx_job_execution_logs_started_at ON job_execution_logs(started_at DESC);
CREATE INDEX idx_job_execution_logs_job_id ON job_execution_logs(job_id);

-- 娣诲姞娉ㄩ噴
COMMENT ON TABLE job_execution_logs IS '瀹氭椂浠诲姟鎵ц鏃ュ織琛紝璁板綍鎵€鏈夊畾鏃朵换鍔＄殑鎵ц鍘嗗彶';
COMMENT ON COLUMN job_execution_logs.job_name IS '浠诲姟鍚嶇О锛堝: riskStatisticsJob, autoAlertService.daily锛?;
COMMENT ON COLUMN job_execution_logs.status IS '鎵ц鐘舵€? success=鎴愬姛, error=澶辫触, timeout=瓒呮椂';
COMMENT ON COLUMN job_execution_logs.started_at IS '浠诲姟寮€濮嬫椂闂?;
COMMENT ON COLUMN job_execution_logs.completed_at IS '浠诲姟瀹屾垚鏃堕棿';
COMMENT ON COLUMN job_execution_logs.duration_ms IS '浠诲姟鎵ц鏃堕暱锛堟绉掞級';
COMMENT ON COLUMN job_execution_logs.result IS '浠诲姟鎵ц缁撴灉锛圝SON鏍煎紡锛?;
COMMENT ON COLUMN job_execution_logs.error_message IS '閿欒娑堟伅锛堜粎褰搒tatus=error鏃舵湁鍊硷級';
COMMENT ON COLUMN job_execution_logs.job_id IS '浠诲姟鎵цID锛堢敤浜庤拷韪墜鍔ㄨЕ鍙戠殑浠诲姟锛?;
COMMENT ON COLUMN job_execution_logs.triggered_by IS '瑙﹀彂鏂瑰紡: scheduler=瀹氭椂璋冨害, manual=鎵嬪姩瑙﹀彂, api=API璋冪敤';

-- 鍒涘缓娓呯悊鏃ф棩蹇楃殑鍑芥暟锛堜繚鐣欐渶杩?0澶╋級
CREATE OR REPLACE FUNCTION cleanup_old_job_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM job_execution_logs
  WHERE started_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS deleted_count;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 娣诲姞娉ㄩ噴
COMMENT ON FUNCTION cleanup_old_job_logs IS '娓呯悊90澶╁墠鐨勬棫浠诲姟鎵ц鏃ュ織';


-- ============================================================
-- 鏉ヨ嚜: 009_fix_delivery_issues.sql
-- ============================================================
-- ============================================================
-- 淇浜や粯璁″垝閬楃暀闂
-- 鎴垮湴浜у伐绋嬬鐞嗙郴缁烿4.1 琛ヤ竵杩佺Щ
-- 鎵ц鏃堕棿: 2026-03-23
-- 淇鍐呭:
--   DEL-001 (P1): 鍒涘缓 task_milestones 浠诲姟閲岀▼纰戝叧鑱旇〃
--   DEL-002 (P2): 鍒涘缓 trg_pre_milestone_status_update 瑙﹀彂鍣?
-- ============================================================

-- ============================================================
-- DEL-001: task_milestones锛堜换鍔￠噷绋嬬鍏宠仈琛級
-- 鐢ㄤ簬鍏宠仈浠诲姟鍜岄噷绋嬬锛屾敮鎸侀噷绋嬬浣滀负閲岀▼纰戝瓙绫诲瀷
-- ============================================================

CREATE TABLE IF NOT EXISTS task_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 鍏宠仈浠诲姟
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    
    -- 鍏宠仈閲岀▼纰?
    milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
    
    -- 鍏宠仈绫诲瀷锛氬叧鑱?鍏抽敭/渚濊禆
    relation_type TEXT NOT NULL DEFAULT '鍏宠仈'
        CHECK (relation_type IN ('鍏宠仈', '鍏抽敭', '渚濊禆')),
    
    -- 鍏冩暟鎹?
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 鍞竴绾︽潫锛氬悓涓€浠诲姟涓嶉噸澶嶅叧鑱斿悓涓€閲岀▼纰?
    UNIQUE(task_id, milestone_id)
);

-- 绱㈠紩
CREATE INDEX IF NOT EXISTS idx_task_milestones_task
    ON task_milestones(task_id);

CREATE INDEX IF NOT EXISTS idx_task_milestones_milestone
    ON task_milestones(milestone_id);

-- updated_at 鑷姩鏇存柊瑙﹀彂鍣?
CREATE TRIGGER update_task_milestones_updated_at
    BEFORE UPDATE ON task_milestones
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- DEL-002: trg_pre_milestone_status_update
-- 鍓嶆湡閲岀▼纰戠姸鎬佽嚜鍔ㄦ洿鏂拌Е鍙戝櫒
-- 褰?pre_milestone_conditions 鍏ㄩ儴婊¤冻鏃讹紝鑷姩灏?pre_milestone 鐘舵€佹敼涓?宸插彇寰?
-- ============================================================

CREATE OR REPLACE FUNCTION fn_update_pre_milestone_status()
RETURNS TRIGGER AS $$
DECLARE
    v_pre_milestone_id UUID;
    v_total_conditions INTEGER;
    v_satisfied_conditions INTEGER;
    v_current_status TEXT;
BEGIN
    -- 纭畾鍙楀奖鍝嶇殑 pre_milestone_id
    IF TG_OP = 'DELETE' THEN
        v_pre_milestone_id := OLD.pre_milestone_id;
    ELSE
        v_pre_milestone_id := NEW.pre_milestone_id;
    END IF;

    -- 鏌ヨ褰撳墠璇佺収鐘舵€?
    SELECT status INTO v_current_status
    FROM pre_milestones
    WHERE id = v_pre_milestone_id;

    -- 宸插彇寰?/ 宸茶繃鏈?鐘舵€佷笉鍋氳嚜鍔ㄥ彉鏇?
    IF v_current_status IN ('宸插彇寰?, '宸茶繃鏈?) THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- 缁熻鏉′欢鎬绘暟鍜屽凡婊¤冻鏁伴噺
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status IN ('宸叉弧瓒?, '宸茬‘璁?))
    INTO v_total_conditions, v_satisfied_conditions
    FROM pre_milestone_conditions
    WHERE pre_milestone_id = v_pre_milestone_id;

    -- 鍏ㄩ儴鏉′欢婊¤冻 鈫?鐘舵€佹洿鏂颁负"宸插彇寰?
    IF v_total_conditions > 0 AND v_total_conditions = v_satisfied_conditions THEN
        UPDATE pre_milestones
        SET status = '宸插彇寰?,
            issue_date = COALESCE(issue_date, CURRENT_DATE),
            updated_at = NOW()
        WHERE id = v_pre_milestone_id
          AND status NOT IN ('宸插彇寰?, '宸茶繃鏈?);

    -- 瀛樺湪鏈弧瓒虫潯浠朵笖褰撳墠涓?寰呯敵璇? 鈫?鏇存柊涓?鍔炵悊涓?
    ELSIF v_satisfied_conditions > 0 AND v_current_status = '寰呯敵璇? THEN
        UPDATE pre_milestones
        SET status = '鍔炵悊涓?,
            updated_at = NOW()
        WHERE id = v_pre_milestone_id
          AND status = '寰呯敵璇?;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 缁戝畾鍒?pre_milestone_conditions 琛?
CREATE TRIGGER trg_pre_milestone_status_update
    AFTER INSERT OR UPDATE OR DELETE ON pre_milestone_conditions
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_pre_milestone_status();

-- ============================================================
-- 楠岃瘉娉ㄩ噴
-- ============================================================
-- 鎵ц鍚庨鏈熺粨鏋滐細
--   SELECT COUNT(*) FROM task_milestones;  鈫?0锛堢┖琛ㄦ甯革級
--   \d task_milestones                     鈫?瀛楁缁撴瀯瀹屾暣
--   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_pre_milestone_status_update';
--   鈫?杩斿洖 1 琛?
-- ============================================================


-- ============================================================
-- 鏉ヨ嚜: 010_add_missing_tables.sql
-- ============================================================
-- Migration 010: Add missing tables and fields from design review
-- Date: 2026-03-23

-- 1. Add predecessor_ids field to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS predecessor_ids JSONB;
CREATE INDEX IF NOT EXISTS idx_tasks_predecessor_ids_gin ON tasks USING GIN(predecessor_ids);

-- 2. Create task_progress_history table
CREATE TABLE IF NOT EXISTS task_progress_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    progress INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_task_progress_history_task_id ON task_progress_history(task_id);
CREATE INDEX IF NOT EXISTS idx_task_progress_history_created_at ON task_progress_history(created_at);
CREATE INDEX IF NOT EXISTS idx_task_progress_history_task_created_by ON task_progress_history(task_id, created_by);

-- 3. Create acceptance_records table
CREATE TABLE IF NOT EXISTS acceptance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    acceptance_plan_id UUID NOT NULL REFERENCES acceptance_plans(id) ON DELETE CASCADE,
    record_date DATE NOT NULL,
    acceptance_result VARCHAR(50) NOT NULL,
    score INTEGER,
    findings TEXT,
    issues JSONB,
    attachments JSONB,
    attendees JSONB,
    next_action TEXT,
    next_action_date DATE,
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_acceptance_records_acceptance_plan_id ON acceptance_records(acceptance_plan_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_records_record_date ON acceptance_records(record_date);
CREATE INDEX IF NOT EXISTS idx_acceptance_records_acceptance_result ON acceptance_records(acceptance_result);
CREATE INDEX IF NOT EXISTS idx_acceptance_records_attachments_gin ON acceptance_records USING GIN(attachments);
CREATE INDEX IF NOT EXISTS idx_acceptance_records_attendees_gin ON acceptance_records USING GIN(attendees);

-- 4. Create system_settings table
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value JSONB NOT NULL,
    setting_type VARCHAR(50) DEFAULT 'string',
    category VARCHAR(50) NOT NULL,
    description TEXT,
    is_editable BOOLEAN DEFAULT TRUE,
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key);
CREATE INDEX IF NOT EXISTS idx_system_settings_value_gin ON system_settings USING GIN(setting_value);

-- Insert default system settings
INSERT INTO system_settings (setting_key, setting_value, setting_type, category, description, is_system) VALUES
('risk.alert.thresholds', '{"critical": 7, "high": 14, "medium": 7}', 'json', 'risk_alert', '椋庨櫓棰勮闃堝€奸厤缃?, TRUE),
('risk.consecutive.lag.weeks', '{"high": 2, "medium": 1}', 'json', 'risk_alert', '杩炵画婊炲悗鍛ㄦ暟闃堝€?, TRUE),
('obstacle.timeout.days', '{"warning": 3, "critical": 7, "severe": 14}', 'json', 'risk_alert', '闃荤瓒呮椂澶╂暟闃堝€?, TRUE),
('dialog.frequency.defaults', '{"daily_max": 3, "cooldown_minutes": 60}', 'json', 'dialog_frequency', '寮圭獥棰戠巼榛樿閰嶇疆', TRUE),
('ai.duration.confidence.min', '{"value": 0.6}', 'json', 'ai', 'AI宸ユ湡棰勬祴鏈€灏忕疆淇″害', TRUE)
ON CONFLICT (setting_key) DO NOTHING;

-- 5. Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    target_type VARCHAR(50),
    target_id UUID,
    priority VARCHAR(20) DEFAULT 'normal',
    channel VARCHAR(50) DEFAULT 'in_app',
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_notification_type ON notifications(notification_type);

-- Enable RLS on new tables
ALTER TABLE task_progress_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE acceptance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for task_progress_history
DO $body$ BEGIN DROP POLICY "task_progress_history_select_policy" ON task_progress_history; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "task_progress_history_select_policy" ON task_progress_history FOR SELECT
    USING (EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_progress_history.task_id AND t.deleted_at IS NULL));

DO $body$ BEGIN DROP POLICY "task_progress_history_insert_policy" ON task_progress_history; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "task_progress_history_insert_policy" ON task_progress_history FOR INSERT
-- [璺宠繃 auth.uid()]     WITH CHECK (auth.uid() IS NOT NULL);

DO $body$ BEGIN DROP POLICY "task_progress_history_update_policy" ON task_progress_history; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "task_progress_history_update_policy" ON task_progress_history FOR UPDATE
-- [璺宠繃 auth.uid()]     USING (auth.uid() IS NOT NULL);

-- RLS Policies for acceptance_records
DO $body$ BEGIN DROP POLICY "acceptance_records_select_policy" ON acceptance_records; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "acceptance_records_select_policy" ON acceptance_records FOR SELECT
    USING (EXISTS (SELECT 1 FROM acceptance_plans ap WHERE ap.id = acceptance_records.acceptance_plan_id AND ap.deleted_at IS NULL));

DO $body$ BEGIN DROP POLICY "acceptance_records_insert_policy" ON acceptance_records; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "acceptance_records_insert_policy" ON acceptance_records FOR INSERT
-- [璺宠繃 auth.uid()]     WITH CHECK (auth.uid() IS NOT NULL);

DO $body$ BEGIN DROP POLICY "acceptance_records_update_policy" ON acceptance_records; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "acceptance_records_update_policy" ON acceptance_records FOR UPDATE
-- [璺宠繃 auth.uid()]     USING (auth.uid() IS NOT NULL);

-- RLS Policies for system_settings (read-only for regular users)
DO $body$ BEGIN DROP POLICY "system_settings_select_policy" ON system_settings; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "system_settings_select_policy" ON system_settings FOR SELECT
    USING (TRUE);

DO $body$ BEGIN DROP POLICY "system_settings_insert_policy" ON system_settings; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "system_settings_insert_policy" ON system_settings FOR INSERT
-- [璺宠繃 auth.uid()]     WITH CHECK (auth.uid() IS NOT NULL);

DO $body$ BEGIN DROP POLICY "system_settings_update_policy" ON system_settings; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "system_settings_update_policy" ON system_settings FOR UPDATE
-- [璺宠繃 auth.uid()]     USING (auth.uid() IS NOT NULL);

-- RLS Policies for notifications
DO $body$ BEGIN DROP POLICY "notifications_select_policy" ON notifications; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "notifications_select_policy" ON notifications FOR SELECT
-- [璺宠繃 auth.uid()]     USING (user_id = auth.uid() OR is_system = TRUE);

DO $body$ BEGIN DROP POLICY "notifications_insert_policy" ON notifications; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "notifications_insert_policy" ON notifications FOR INSERT
-- [璺宠繃 auth.uid()]     WITH CHECK (auth.uid() IS NOT NULL);

DO $body$ BEGIN DROP POLICY "notifications_update_policy" ON notifications; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "notifications_update_policy" ON notifications FOR UPDATE
-- [璺宠繃 auth.uid()]     USING (user_id = auth.uid());


-- ============================================================
-- 鏉ヨ嚜: 011_add_missing_tables_phase2.sql
-- ============================================================
-- Migration 011: Add missing tables phase 2 (phases, wbs_template_nodes, dialog_frequency)
-- Date: 2026-03-23

-- 1. Create phases table (鍒嗘湡琛?
CREATE TABLE IF NOT EXISTS phases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    phase_name VARCHAR(255) NOT NULL,
    phase_code VARCHAR(100),
    phase_sequence INTEGER NOT NULL DEFAULT 0,
    start_date DATE,
    end_date DATE,
    phase_status VARCHAR(50) DEFAULT 'planning',
    area_size DECIMAL(15, 2),
    building_count INTEGER,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_phases_project_id ON phases(project_id);
CREATE INDEX IF NOT EXISTS idx_phases_phase_sequence ON phases(phase_sequence);
CREATE INDEX IF NOT EXISTS idx_phases_phase_status ON phases(phase_status);

-- 2. Create wbs_template_nodes table (WBS妯℃澘鑺傜偣琛?
CREATE TABLE IF NOT EXISTS wbs_template_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES wbs_templates(id) ON DELETE CASCADE,
    parent_node_id UUID REFERENCES wbs_template_nodes(id) ON DELETE CASCADE,
    wbs_level VARCHAR(50) NOT NULL,
    wbs_code VARCHAR(100),
    node_name VARCHAR(255) NOT NULL,
    node_description TEXT,
    sequence INTEGER NOT NULL DEFAULT 0,
    standard_duration INTEGER,
    estimated_cost DECIMAL(15, 2),
    required_resources JSONB,
    dependencies JSONB,
    is_milestone BOOLEAN DEFAULT FALSE,
    acceptance_plan JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wbs_template_nodes_template_id ON wbs_template_nodes(template_id);
CREATE INDEX IF NOT EXISTS idx_wbs_template_nodes_parent_node_id ON wbs_template_nodes(parent_node_id);
CREATE INDEX IF NOT EXISTS idx_wbs_template_nodes_sequence ON wbs_template_nodes(sequence);
CREATE INDEX IF NOT EXISTS idx_wbs_template_nodes_required_resources_gin ON wbs_template_nodes USING GIN(required_resources);
CREATE INDEX IF NOT EXISTS idx_wbs_template_nodes_dependencies_gin ON wbs_template_nodes USING GIN(dependencies);
CREATE INDEX IF NOT EXISTS idx_wbs_template_nodes_acceptance_plan_gin ON wbs_template_nodes USING GIN(acceptance_plan);

-- 3. Create dialog_frequency_control table (寮圭獥棰戠巼鎺у埗琛?
CREATE TABLE IF NOT EXISTS dialog_frequency_control (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dialog_type VARCHAR(50) NOT NULL,
    target_id VARCHAR(100),
    trigger_count INTEGER DEFAULT 1,
    last_triggered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    first_triggered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_suppressed BOOLEAN DEFAULT FALSE,
    suppress_until TIMESTAMP WITH TIME ZONE,
    suppress_reason VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dialog_frequency_user_type ON dialog_frequency_control(user_id, dialog_type);
CREATE INDEX IF NOT EXISTS idx_dialog_frequency_target ON dialog_frequency_control(target_id, dialog_type);
CREATE INDEX IF NOT EXISTS idx_dialog_frequency_suppress ON dialog_frequency_control(suppress_until) WHERE is_suppressed = TRUE;

-- 4. Create dialog_frequency_settings table (寮圭獥棰戠巼閰嶇疆琛?
CREATE TABLE IF NOT EXISTS dialog_frequency_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dialog_type VARCHAR(50) NOT NULL UNIQUE,
    enable_first_progress_skip BOOLEAN DEFAULT TRUE,
    first_progress_cool_minutes INTEGER DEFAULT 30,
    daily_max_trigger INTEGER DEFAULT 3,
    cooldown_minutes INTEGER DEFAULT 60,
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Insert default configuration data
INSERT INTO dialog_frequency_settings (dialog_type, enable_first_progress_skip, first_progress_cool_minutes, daily_max_trigger, cooldown_minutes, is_enabled) VALUES
('progress_condition', TRUE, 30, 5, 30, TRUE),
('obstacle_warning', FALSE, 0, 1, 1440, TRUE),
('risk_alert', FALSE, 0, 1, 10080, TRUE),
('delay_warning', FALSE, 0, 2, 4320, TRUE)
ON CONFLICT (dialog_type) DO NOTHING;

-- Enable RLS on new tables
ALTER TABLE phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE wbs_template_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dialog_frequency_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE dialog_frequency_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for phases
DO $body$ BEGIN DROP POLICY "phases_select_policy" ON phases; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "phases_select_policy" ON phases FOR SELECT
    USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = phases.project_id AND p.deleted_at IS NULL));

DO $body$ BEGIN DROP POLICY "phases_insert_policy" ON phases; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "phases_insert_policy" ON phases FOR INSERT
-- [璺宠繃 auth.uid()]     WITH CHECK (auth.uid() IS NOT NULL);

DO $body$ BEGIN DROP POLICY "phases_update_policy" ON phases; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "phases_update_policy" ON phases FOR UPDATE
-- [璺宠繃 auth.uid()]     USING (auth.uid() IS NOT NULL);

-- RLS Policies for wbs_template_nodes
DO $body$ BEGIN DROP POLICY "wbs_template_nodes_select_policy" ON wbs_template_nodes; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "wbs_template_nodes_select_policy" ON wbs_template_nodes FOR SELECT
    USING (EXISTS (SELECT 1 FROM wbs_templates wt WHERE wt.id = wbs_template_nodes.template_id AND wt.deleted_at IS NULL));

DO $body$ BEGIN DROP POLICY "wbs_template_nodes_insert_policy" ON wbs_template_nodes; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "wbs_template_nodes_insert_policy" ON wbs_template_nodes FOR INSERT
-- [璺宠繃 auth.uid()]     WITH CHECK (auth.uid() IS NOT NULL);

DO $body$ BEGIN DROP POLICY "wbs_template_nodes_update_policy" ON wbs_template_nodes; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "wbs_template_nodes_update_policy" ON wbs_template_nodes FOR UPDATE
-- [璺宠繃 auth.uid()]     USING (auth.uid() IS NOT NULL);

-- RLS Policies for dialog_frequency_control
DO $body$ BEGIN DROP POLICY "dialog_frequency_control_select_policy" ON dialog_frequency_control; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "dialog_frequency_control_select_policy" ON dialog_frequency_control FOR SELECT
-- [璺宠繃 auth.uid()]     USING (user_id::text = auth.uid()::text OR user_id IS NULL);

DO $body$ BEGIN DROP POLICY "dialog_frequency_control_insert_policy" ON dialog_frequency_control; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "dialog_frequency_control_insert_policy" ON dialog_frequency_control FOR INSERT
-- [璺宠繃 auth.uid()]     WITH CHECK (auth.uid() IS NOT NULL);

DO $body$ BEGIN DROP POLICY "dialog_frequency_control_update_policy" ON dialog_frequency_control; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "dialog_frequency_control_update_policy" ON dialog_frequency_control FOR UPDATE
-- [璺宠繃 auth.uid()]     USING (auth.uid() IS NOT NULL);

-- RLS Policies for dialog_frequency_settings (read-only for regular users)
DO $body$ BEGIN DROP POLICY "dialog_frequency_settings_select_policy" ON dialog_frequency_settings; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "dialog_frequency_settings_select_policy" ON dialog_frequency_settings FOR SELECT
    USING (TRUE);

DO $body$ BEGIN DROP POLICY "dialog_frequency_settings_insert_policy" ON dialog_frequency_settings; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "dialog_frequency_settings_insert_policy" ON dialog_frequency_settings FOR INSERT
-- [璺宠繃 auth.uid()]     WITH CHECK (auth.uid() IS NOT NULL);

DO $body$ BEGIN DROP POLICY "dialog_frequency_settings_update_policy" ON dialog_frequency_settings; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "dialog_frequency_settings_update_policy" ON dialog_frequency_settings FOR UPDATE
-- [璺宠繃 auth.uid()]     USING (auth.uid() IS NOT NULL);


-- ============================================================
-- 鏉ヨ嚜: 012_fix_wbs_templates.sql
-- ============================================================
-- Migration 012: Fix wbs_templates table issues
-- Date: 2026-03-24
-- Problems:
--   1. created_by NOT NULL constraint prevents template creation (no-login system)
--   2. wbs_template_nodes RLS policy references wbs_templates.deleted_at which doesn't exist
--   3. Add deleted_at to wbs_templates for soft delete support
--   4. Add seed data for common WBS templates

-- 1. Fix created_by: Change NOT NULL to nullable
ALTER TABLE wbs_templates 
  ALTER COLUMN created_by DROP NOT NULL;

-- 2. Add deleted_at column to wbs_templates (needed by wbs_template_nodes RLS policy)
ALTER TABLE wbs_templates 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 3. Fix RLS policies on wbs_templates to work without auth
DO $body$ BEGIN DROP POLICY "wbs_templates_select_policy" ON wbs_templates; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "wbs_templates_select_policy" ON wbs_templates FOR SELECT
    USING (deleted_at IS NULL);

DO $body$ BEGIN DROP POLICY "wbs_templates_insert_policy" ON wbs_templates; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "wbs_templates_insert_policy" ON wbs_templates FOR INSERT
    WITH CHECK (TRUE);

DO $body$ BEGIN DROP POLICY "wbs_templates_update_policy" ON wbs_templates; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "wbs_templates_update_policy" ON wbs_templates FOR UPDATE
    USING (deleted_at IS NULL);

DO $body$ BEGIN DROP POLICY "wbs_templates_delete_policy" ON wbs_templates; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "wbs_templates_delete_policy" ON wbs_templates FOR DELETE
    USING (TRUE);

-- 4. Fix wbs_template_nodes RLS (referenced wbs_templates.deleted_at which now exists)
-- Already defined correctly in 011, just ensure it's applied
DO $body$ BEGIN DROP POLICY "wbs_template_nodes_select_policy" ON wbs_template_nodes; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "wbs_template_nodes_select_policy" ON wbs_template_nodes FOR SELECT
    USING (EXISTS (SELECT 1 FROM wbs_templates wt WHERE wt.id = wbs_template_nodes.template_id AND wt.deleted_at IS NULL));

DO $body$ BEGIN DROP POLICY "wbs_template_nodes_insert_policy" ON wbs_template_nodes; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "wbs_template_nodes_insert_policy" ON wbs_template_nodes FOR INSERT
    WITH CHECK (TRUE);

DO $body$ BEGIN DROP POLICY "wbs_template_nodes_update_policy" ON wbs_template_nodes; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "wbs_template_nodes_update_policy" ON wbs_template_nodes FOR UPDATE
    USING (TRUE);

DO $body$ BEGIN DROP POLICY "wbs_template_nodes_delete_policy" ON wbs_template_nodes; EXCEPTION WHEN undefined_object THEN NULL; END $body$;
CREATE POLICY "wbs_template_nodes_delete_policy" ON wbs_template_nodes FOR DELETE
    USING (TRUE);

-- 5. Seed data: Insert default WBS templates for common project types
INSERT INTO wbs_templates (template_name, template_type, description, wbs_nodes, is_default)
VALUES 
(
  '浣忓畢鏍囧噯WBS妯℃澘',
  '浣忓畢',
  '閫傜敤浜庢櫘閫氫綇瀹呴」鐩殑鏍囧噯WBS浠诲姟鍒嗚В妯℃澘锛屽寘鍚粠鍓嶆湡鍑嗗鍒扮宸ラ獙鏀剁殑瀹屾暣娴佺▼',
  '[
    {"id":"1","name":"鍓嶆湡鍑嗗","level":1,"duration":30,"children":[
      {"id":"1-1","name":"鍙鎬х爺绌?,"level":2,"duration":15},
      {"id":"1-2","name":"绔嬮」瀹℃壒","level":2,"duration":10},
      {"id":"1-3","name":"瑙勫垝璁稿彲璇佸姙鐞?,"level":2,"duration":20}
    ]},
    {"id":"2","name":"鍕樺療璁捐","level":1,"duration":90,"children":[
      {"id":"2-1","name":"鍦拌川鍕樺療","level":2,"duration":20},
      {"id":"2-2","name":"鏂规璁捐","level":2,"duration":30},
      {"id":"2-3","name":"鏂藉伐鍥捐璁?,"level":2,"duration":45}
    ]},
    {"id":"3","name":"鏂藉伐鍑嗗","level":1,"duration":30,"children":[
      {"id":"3-1","name":"鏂藉伐鍥惧鏌?,"level":2,"duration":15},
      {"id":"3-2","name":"鎷涙爣閲囪喘","level":2,"duration":20},
      {"id":"3-3","name":"鏂藉伐璁稿彲璇?,"level":2,"duration":10}
    ]},
    {"id":"4","name":"鍦板熀涓庡熀纭€","level":1,"duration":60,"children":[
      {"id":"4-1","name":"鍦熸柟寮€鎸?,"level":2,"duration":15},
      {"id":"4-2","name":"鍩虹鏂藉伐","level":2,"duration":30},
      {"id":"4-3","name":"鍦颁笅瀹ゆ柦宸?,"level":2,"duration":20}
    ]},
    {"id":"5","name":"涓讳綋缁撴瀯","level":1,"duration":120,"children":[
      {"id":"5-1","name":"閽㈢瓔宸ョ▼","level":2,"duration":60},
      {"id":"5-2","name":"妯℃澘宸ョ▼","level":2,"duration":60},
      {"id":"5-3","name":"娣峰嚌鍦熸祰绛?,"level":2,"duration":45}
    ]},
    {"id":"6","name":"浜屾缁撴瀯涓庤淇?,"level":1,"duration":90,"children":[
      {"id":"6-1","name":"鐮屼綋宸ョ▼","level":2,"duration":30},
      {"id":"6-2","name":"鎶圭伆宸ョ▼","level":2,"duration":25},
      {"id":"6-3","name":"闂ㄧ獥瀹夎","level":2,"duration":15},
      {"id":"6-4","name":"娑傛枡宸ョ▼","level":2,"duration":20}
    ]},
    {"id":"7","name":"鏈虹數瀹夎","level":1,"duration":60,"children":[
      {"id":"7-1","name":"缁欐帓姘村畨瑁?,"level":2,"duration":30},
      {"id":"7-2","name":"寮哄急鐢靛畨瑁?,"level":2,"duration":30},
      {"id":"7-3","name":"鏆栭€氬畨瑁?,"level":2,"duration":20}
    ]},
    {"id":"8","name":"绔ｅ伐楠屾敹","level":1,"duration":30,"children":[
      {"id":"8-1","name":"鍒嗛」宸ョ▼楠屾敹","level":2,"duration":15},
      {"id":"8-2","name":"绔ｅ伐楠屾敹鐢宠","level":2,"duration":5},
      {"id":"8-3","name":"绔ｅ伐澶囨","level":2,"duration":10}
    ]}
  ]'::jsonb,
  TRUE
),
(
  '鍟嗕笟缁煎悎浣揥BS妯℃澘',
  '鍟嗕笟',
  '閫傜敤浜庡晢涓氱患鍚堜綋銆佸啓瀛楁ゼ銆佽喘鐗╀腑蹇冪瓑鍟嗕笟椤圭洰鐨刉BS浠诲姟鍒嗚В妯℃澘',
  '[
    {"id":"1","name":"椤圭洰绛栧垝","level":1,"duration":45,"children":[
      {"id":"1-1","name":"甯傚満璋冪爺","level":2,"duration":20},
      {"id":"1-2","name":"涓氭€佽鍒?,"level":2,"duration":15},
      {"id":"1-3","name":"鎶曡祫鍒嗘瀽","level":2,"duration":15}
    ]},
    {"id":"2","name":"鍓嶆湡鎵嬬画","level":1,"duration":60,"children":[
      {"id":"2-1","name":"鍦熷湴鑾峰彇","level":2,"duration":30},
      {"id":"2-2","name":"瑙勫垝瀹℃壒","level":2,"duration":20},
      {"id":"2-3","name":"寤鸿宸ョ▼璁稿彲","level":2,"duration":15}
    ]},
    {"id":"3","name":"璁捐闃舵","level":1,"duration":120,"children":[
      {"id":"3-1","name":"姒傚康璁捐","level":2,"duration":30},
      {"id":"3-2","name":"鏂规娣卞寲","level":2,"duration":45},
      {"id":"3-3","name":"鏂藉伐鍥惧嚭鍥?,"level":2,"duration":60}
    ]},
    {"id":"4","name":"鏂藉伐闃舵","level":1,"duration":540,"children":[
      {"id":"4-1","name":"鍩哄潙宸ョ▼","level":2,"duration":60},
      {"id":"4-2","name":"鍦颁笅缁撴瀯","level":2,"duration":90},
      {"id":"4-3","name":"鍦颁笂涓讳綋缁撴瀯","level":2,"duration":180},
      {"id":"4-4","name":"骞曞宸ョ▼","level":2,"duration":90},
      {"id":"4-5","name":"鏈虹數瀹夎","level":2,"duration":120},
      {"id":"4-6","name":"绮捐淇伐绋?,"level":2,"duration":120}
    ]},
    {"id":"5","name":"鎷涘晢杩愯惀鍑嗗","level":1,"duration":90,"children":[
      {"id":"5-1","name":"鎷涘晢绛栧垝","level":2,"duration":30},
      {"id":"5-2","name":"涓诲姏搴楃绾?,"level":2,"duration":45},
      {"id":"5-3","name":"寮€涓氱澶?,"level":2,"duration":30}
    ]},
    {"id":"6","name":"绔ｅ伐浜や粯","level":1,"duration":30,"children":[
      {"id":"6-1","name":"绔ｅ伐楠屾敹","level":2,"duration":15},
      {"id":"6-2","name":"娑堥槻楠屾敹","level":2,"duration":10},
      {"id":"6-3","name":"浜ф潈鐧昏","level":2,"duration":10}
    ]}
  ]'::jsonb,
  TRUE
),
(
  '宸ヤ笟鍘傛埧WBS妯℃澘',
  '宸ヤ笟',
  '閫傜敤浜庡伐涓氬巶鎴裤€佷粨鍌ㄧ墿娴佺瓑宸ヤ笟椤圭洰鐨刉BS浠诲姟鍒嗚В妯℃澘',
  '[
    {"id":"1","name":"鍓嶆湡宸ヤ綔","level":1,"duration":30,"children":[
      {"id":"1-1","name":"宸ヨ壓鏂规纭畾","level":2,"duration":15},
      {"id":"1-2","name":"鐜瘎鎶ュ憡","level":2,"duration":20},
      {"id":"1-3","name":"鐢ㄥ湴璁稿彲","level":2,"duration":15}
    ]},
    {"id":"2","name":"璁捐宸ヤ綔","level":1,"duration":60,"children":[
      {"id":"2-1","name":"宸ヨ壓璁捐","level":2,"duration":30},
      {"id":"2-2","name":"寤虹瓚缁撴瀯璁捐","level":2,"duration":35},
      {"id":"2-3","name":"璁惧鍩虹璁捐","level":2,"duration":20}
    ]},
    {"id":"3","name":"涓讳綋鏂藉伐","level":1,"duration":180,"children":[
      {"id":"3-1","name":"鍦板熀澶勭悊","level":2,"duration":30},
      {"id":"3-2","name":"閽㈢粨鏋勫畨瑁?,"level":2,"duration":60},
      {"id":"3-3","name":"鍥存姢绯荤粺","level":2,"duration":30},
      {"id":"3-4","name":"鍦板潽宸ョ▼","level":2,"duration":20}
    ]},
    {"id":"4","name":"璁惧瀹夎","level":1,"duration":90,"children":[
      {"id":"4-1","name":"宸ヨ壓璁惧瀹夎","level":2,"duration":45},
      {"id":"4-2","name":"绠￠亾瀹夎","level":2,"duration":30},
      {"id":"4-3","name":"鐢垫皵瀹夎","level":2,"duration":25}
    ]},
    {"id":"5","name":"璋冭瘯楠屾敹","level":1,"duration":30,"children":[
      {"id":"5-1","name":"鍗曟満璋冭瘯","level":2,"duration":15},
      {"id":"5-2","name":"鑱斿姩璋冭瘯","level":2,"duration":10},
      {"id":"5-3","name":"璇曠敓浜ч獙鏀?,"level":2,"duration":10}
    ]}
  ]'::jsonb,
  TRUE
),
(
  '甯傛斂閬撹矾WBS妯℃澘',
  '甯傛斂',
  '閫傜敤浜庡競鏀块亾璺€佺缃戙€佹ˉ姊佺瓑甯傛斂椤圭洰鐨刉BS浠诲姟鍒嗚В妯℃澘',
  '[
    {"id":"1","name":"鍕樺療璁捐","level":1,"duration":90,"children":[
      {"id":"1-1","name":"娴嬮噺鍕樺療","level":2,"duration":20},
      {"id":"1-2","name":"鍒濇璁捐","level":2,"duration":30},
      {"id":"1-3","name":"鏂藉伐鍥捐璁?,"level":2,"duration":45}
    ]},
    {"id":"2","name":"寰佸湴鎷嗚縼","level":1,"duration":60,"children":[
      {"id":"2-1","name":"寰佸湴鑼冨洿纭畾","level":2,"duration":15},
      {"id":"2-2","name":"鎴垮眿鎷嗚縼","level":2,"duration":30},
      {"id":"2-3","name":"绠＄嚎杩佹敼","level":2,"duration":20}
    ]},
    {"id":"3","name":"璺熀宸ョ▼","level":1,"duration":90,"children":[
      {"id":"3-1","name":"娓呰〃鎹㈠～","level":2,"duration":20},
      {"id":"3-2","name":"璺熀濉瓚鍘嬪疄","level":2,"duration">45},
      {"id":"3-3","name":"杈瑰潯闃叉姢","level":2,"duration":20}
    ]},
    {"id":"4","name":"璺潰宸ョ▼","level":1,"duration":60,"children":[
      {"id":"4-1","name":"鍩哄眰閾鸿","level":2,"duration":20},
      {"id":"4-2","name":"娌ラ潚闈㈠眰","level":2,"duration">30},
      {"id":"4-3","name":"浜鸿閬撻摵瑁?,"level":2,"duration":15}
    ]},
    {"id":"5","name":"闄勫睘宸ョ▼","level":1,"duration":45,"children":[
      {"id":"5-1","name":"闆ㄦ薄姘寸缃?,"level":2,"duration":25},
      {"id":"5-2","name":"璺伅鐓ф槑","level":2,"duration":15},
      {"id":"5-3","name":"浜ら€氭爣蹇楁爣绾?,"level":2,"duration":10}
    ]},
    {"id":"6","name":"绔ｅ伐楠屾敹","level":1,"duration":20,"children":[
      {"id":"6-1","name":"浜ゅ伐妫€娴?,"level":2,"duration":10},
      {"id":"6-2","name":"绔ｅ伐楠屾敹","level":2,"duration":7},
      {"id":"6-3","name":"绉讳氦绠″吇","level":2,"duration":5}
    ]}
  ]'::jsonb,
  TRUE
)
ON CONFLICT (template_name, template_type) DO NOTHING;


-- ============================================================
-- 鏉ヨ嚜: 013_add_risk_statistics.sql
-- ============================================================
-- 椋庨櫓缁熻琛細鐢ㄤ簬瀛樺偍姣忔棩椋庨櫓鏁版嵁蹇収锛屾敮鎸佽秼鍔垮垎鏋?
CREATE TABLE IF NOT EXISTS risk_statistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  stat_date date NOT NULL,
  
  -- 鏂板椋庨櫓鏁伴噺
  new_risks int DEFAULT 0,
  new_high_risks int DEFAULT 0,
  new_medium_risks int DEFAULT 0,
  new_low_risks int DEFAULT 0,
  
  -- 宸插鐞嗛闄╂暟閲?
  resolved_risks int DEFAULT 0,
  resolved_high_risks int DEFAULT 0,
  resolved_medium_risks int DEFAULT 0,
  resolved_low_risks int DEFAULT 0,
  
  -- 褰撳墠椋庨櫓瀛橀噺锛堝揩鐓э級
  total_risks int DEFAULT 0,
  high_risk_count int DEFAULT 0,
  medium_risk_count int DEFAULT 0,
  low_risk_count int DEFAULT 0,
  
  -- 鎸夌被鍨嬬粺璁?
  delay_risks int DEFAULT 0,
  obstacle_risks int DEFAULT 0,
  condition_risks int DEFAULT 0,
  general_risks int DEFAULT 0,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- 姣忎釜椤圭洰姣忓ぉ鍙湁涓€鏉¤褰?
  UNIQUE(project_id, stat_date)
);

-- 绱㈠紩浼樺寲
CREATE INDEX IF NOT EXISTS idx_risk_statistics_project_date 
  ON risk_statistics(project_id, stat_date);
CREATE INDEX IF NOT EXISTS idx_risk_statistics_stat_date 
  ON risk_statistics(stat_date);

-- 鏇存柊鏃堕棿鎴宠Е鍙戝櫒
CREATE OR REPLACE FUNCTION update_risk_statistics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_risk_statistics_updated_at ON risk_statistics;
CREATE TRIGGER trigger_update_risk_statistics_updated_at
  BEFORE UPDATE ON risk_statistics
  FOR EACH ROW
  EXECUTE FUNCTION update_risk_statistics_updated_at();

-- 鍚敤RLS
ALTER TABLE risk_statistics ENABLE ROW LEVEL SECURITY;

-- RLS绛栫暐锛氱敤鎴峰彧鑳芥煡鐪嬭嚜宸辨湁鏉冮檺鐨勯」鐩殑鏁版嵁
CREATE POLICY risk_statistics_select_policy ON risk_statistics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN project_members pm ON p.id = pm.project_id
      WHERE p.id = risk_statistics.project_id
-- [璺宠繃 auth.uid()]       AND pm.user_id = auth.uid()
    )
  );

COMMENT ON TABLE risk_statistics IS '姣忔棩椋庨櫓缁熻蹇収琛紝鐢ㄤ簬瓒嬪娍鍒嗘瀽';
COMMENT ON COLUMN risk_statistics.new_risks IS '褰撴棩鏂板椋庨櫓鎬绘暟';
COMMENT ON COLUMN risk_statistics.resolved_risks IS '褰撴棩宸插鐞嗛闄╂€绘暟';
COMMENT ON COLUMN risk_statistics.total_risks IS '褰撴棩缁撴潫鏃堕闄╁瓨閲?;


-- ============================================================
-- 鏉ヨ嚜: 014_add_project_health_details.sql
-- ============================================================
-- Migration 014: Add project_health_details table
-- Date: 2026-03-24
-- Purpose: 瀛樺偍椤圭洰鍋ュ悍搴﹀垎椤瑰緱鍒嗭紝鏀寔鍋ュ悍搴﹀垎鏋愬拰鍘嗗彶瓒嬪娍锛圥2-02淇锛?

-- 1. 鍦?tasks 琛ㄥ鍔?milestone_level 鍜?milestone_order 瀛楁锛堝鏈垱寤猴級
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS milestone_level INTEGER CHECK (milestone_level IN (1, 2, 3));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS milestone_order INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tasks_milestone_level ON tasks(milestone_level) WHERE is_milestone = TRUE;
CREATE INDEX IF NOT EXISTS idx_tasks_milestone_order ON tasks(milestone_order) WHERE is_milestone = TRUE;

COMMENT ON COLUMN tasks.milestone_level IS '閲岀▼纰戝眰绾э細1=涓€绾?amber)锛?=浜岀骇(blue)锛?=涓夌骇(gray)';
COMMENT ON COLUMN tasks.milestone_order IS '鍚岀骇閲岀▼纰戞帓搴忓簭鍙?;

-- 2. 鍒涘缓 project_health_details 琛紙鏂规B锛氬瓨鍌ㄥ垎椤瑰垎鏁帮級
CREATE TABLE IF NOT EXISTS project_health_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- 鍋ュ悍搴︽€诲垎
    health_score INTEGER NOT NULL DEFAULT 50 CHECK (health_score >= 0 AND health_score <= 100),
    health_status VARCHAR(20) NOT NULL DEFAULT '鑹ソ'
        CHECK (health_status IN ('浼樼', '鑹ソ', '璀﹀憡', '鍗遍櫓')),

    -- 鍒嗛」寰楀垎锛堣皟璇曞拰鍒嗘瀽鐢級
    base_score INTEGER NOT NULL DEFAULT 50,
    task_completion_score INTEGER NOT NULL DEFAULT 0,
    milestone_bonus INTEGER NOT NULL DEFAULT 0,
    delay_penalty INTEGER NOT NULL DEFAULT 0,
    risk_penalty INTEGER NOT NULL DEFAULT 0,

    -- 璁＄畻渚濇嵁锛堝揩鐓э級
    completed_task_count INTEGER DEFAULT 0,
    total_task_count INTEGER DEFAULT 0,
    completed_milestone_count INTEGER DEFAULT 0,
    total_delay_days INTEGER DEFAULT 0,
    high_risk_count INTEGER DEFAULT 0,
    medium_risk_count INTEGER DEFAULT 0,
    low_risk_count INTEGER DEFAULT 0,

    -- 鏃堕棿鎴?
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- 姣忎釜椤圭洰淇濈暀鏈€鏂颁竴鏉★紙鍙煡鍘嗗彶锛?
    UNIQUE (project_id, calculated_at)
);

-- 绱㈠紩锛氭寜椤圭洰+鏃堕棿鏌ヨ
CREATE INDEX IF NOT EXISTS idx_project_health_details_project_id
    ON project_health_details(project_id);
CREATE INDEX IF NOT EXISTS idx_project_health_details_calculated_at
    ON project_health_details(calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_health_details_project_latest
    ON project_health_details(project_id, calculated_at DESC);

-- 鏇存柊鏃堕棿鎴宠Е鍙戝櫒
CREATE OR REPLACE FUNCTION update_project_health_details_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_project_health_details_updated_at ON project_health_details;
CREATE TRIGGER trigger_project_health_details_updated_at
    BEFORE UPDATE ON project_health_details
    FOR EACH ROW
    EXECUTE FUNCTION update_project_health_details_updated_at();

-- 鍚敤RLS
ALTER TABLE project_health_details ENABLE ROW LEVEL SECURITY;

-- RLS绛栫暐锛氶」鐩垚鍛樺彲鏌ヨ
CREATE POLICY project_health_details_select_policy ON project_health_details
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects p
            JOIN project_members pm ON p.id = pm.project_id
            WHERE p.id = project_health_details.project_id
-- [璺宠繃 auth.uid()]             AND pm.user_id = auth.uid()
        )
    );

-- RLS绛栫暐锛氱郴缁熷彲鍐欏叆锛堝悗绔湇鍔★級
CREATE POLICY project_health_details_insert_policy ON project_health_details
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects p
            JOIN project_members pm ON p.id = pm.project_id
            WHERE p.id = project_health_details.project_id
-- [璺宠繃 auth.uid()]             AND pm.user_id = auth.uid()
        )
    );

COMMENT ON TABLE project_health_details IS '椤圭洰鍋ュ悍搴﹀垎椤瑰垎鏁拌〃锛屾敮鎸佸巻鍙茶秼鍔垮垎鏋愬拰鍒嗛」璇婃柇';
COMMENT ON COLUMN project_health_details.health_score IS '缁煎悎鍋ュ悍搴﹀緱鍒嗭紙0-100锛?;
COMMENT ON COLUMN project_health_details.health_status IS '鍋ュ悍搴︾瓑绾э細浼樼(90+)/鑹ソ(70-89)/璀﹀憡(50-69)/鍗遍櫓(0-49)';


-- ============================================================
-- 鏉ヨ嚜: 015_add_license_phase_management.sql
-- ============================================================
-- 璇佺収绠＄悊浼樺寲 - 娣诲姞闃舵绠＄悊鍜屽鎵硅繘搴﹁窡韪?
-- 鎵ц鍓嶈鍦?Supabase SQL Editor 涓繍琛?

-- 1. 缁?projects 琛ㄦ坊鍔犻樁娈电鐞嗙浉鍏冲瓧娈?
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS current_phase VARCHAR(50) DEFAULT 'pre-construction' 
  CHECK (current_phase IN ('pre-construction', 'construction', 'completion', 'delivery')),
ADD COLUMN IF NOT EXISTS construction_unlock_date DATE,
ADD COLUMN IF NOT EXISTS construction_unlock_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS default_wbs_generated BOOLEAN DEFAULT FALSE;

-- 2. 鍒涘缓璇佺収瀹℃壒杩涘害璺熻釜琛?
CREATE TABLE IF NOT EXISTS certificate_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 鍏宠仈鐨勮瘉鐓?
  pre_milestone_id UUID NOT NULL 
    REFERENCES pre_milestones(id) ON DELETE CASCADE,
  
  -- 瀹℃壒姝ラ
  approval_step INTEGER NOT NULL DEFAULT 1,
  step_name VARCHAR(100) NOT NULL,
  step_description TEXT,
  
  -- 瀹℃壒鐘舵€?
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'approved', 'rejected', 'returned')),
  
  -- 瀹℃壒浜哄憳
  approver_name VARCHAR(100),
  approver_unit VARCHAR(100),
  
  -- 鏃堕棿
  planned_start_date DATE,
  planned_end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,
  
  -- 瀹℃壒鎰忚
  approval_comment TEXT,
  
  -- 鎺掑簭
  sort_order INTEGER DEFAULT 0,
  
  -- 鍏冩暟鎹?
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 绱㈠紩
CREATE INDEX IF NOT EXISTS idx_certificate_approvals_milestone 
  ON certificate_approvals(pre_milestone_id);

-- 3. 鍒涘缓璇佺収渚濊禆鍏崇郴琛?
CREATE TABLE IF NOT EXISTS pre_milestone_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 婧愯瘉鐓э紙渚濊禆鏂癸級
  source_milestone_id UUID NOT NULL 
    REFERENCES pre_milestones(id) ON DELETE CASCADE,
  
  -- 鐩爣璇佺収锛堣渚濊禆鏂癸級
  target_milestone_id UUID NOT NULL 
    REFERENCES pre_milestones(id) ON DELETE CASCADE,
  
  -- 渚濊禆绫诲瀷
  dependency_type VARCHAR(20) DEFAULT 'sequential'
    CHECK (dependency_type IN ('sequential', 'parallel', 'conditional')),
  
  -- 鎻忚堪
  description TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(source_milestone_id, target_milestone_id)
);

CREATE INDEX IF NOT EXISTS idx_pre_milestone_deps_source 
  ON pre_milestone_dependencies(source_milestone_id);
CREATE INDEX IF NOT EXISTS idx_pre_milestone_deps_target 
  ON pre_milestone_dependencies(target_milestone_id);

-- 4. 鍒涘缓榛樿鏂藉伐闃舵WBS妯℃澘
ALTER TABLE wbs_templates 
ADD COLUMN IF NOT EXISTS is_construction_default BOOLEAN DEFAULT FALSE;

-- 5. 瑙﹀彂鍣細鑷姩鏇存柊 updated_at
CREATE OR REPLACE FUNCTION update_certificate_approvals_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_certificate_approvals_updated_at
  BEFORE UPDATE ON certificate_approvals
  FOR EACH ROW
  EXECUTE FUNCTION update_certificate_approvals_timestamp();

-- 娉ㄩ噴
COMMENT ON TABLE projects IS '椤圭洰琛?- 娣诲姞浜嗛樁娈电鐞嗗瓧娈?;
COMMENT ON TABLE certificate_approvals IS '璇佺収瀹℃壒杩涘害璺熻釜琛?;
COMMENT ON TABLE pre_milestone_dependencies IS '璇佺収渚濊禆鍏崇郴琛?;


-- ============================================================
-- 鏉ヨ嚜: 016_add_risk_category.sql
-- ============================================================
-- 涓?risks 琛ㄦ坊鍔?risk_category 瀛楁锛堥闄╃被鍨嬶細杩涘害/璐ㄩ噺/鎴愭湰/瀹夊叏/鍚堝悓/澶栭儴/鍏朵粬锛?
ALTER TABLE risks ADD COLUMN IF NOT EXISTS risk_category VARCHAR(20) DEFAULT 'other';

-- 涓哄凡鏈夎褰曟帹鏂粯璁ょ被鍨嬶紙鍏ㄩ儴璁句负 other锛岀敱鐢ㄦ埛鎵嬪姩鏇存柊锛?
COMMENT ON COLUMN risks.risk_category IS '椋庨櫓绫诲瀷锛歱rogress(杩涘害)/quality(璐ㄩ噺)/cost(鎴愭湰)/safety(瀹夊叏)/contract(鍚堝悓)/external(澶栭儴)/other(鍏朵粬)';


-- ============================================================
-- 鏉ヨ嚜: 017_add_standard_processes.sql
-- ============================================================
-- Migration 017: 鏍囧噯宸ュ簭搴撹〃
-- F4: 鎻愪緵鍙悳绱㈢殑鏍囧噯宸ュ簭鍙傝€冩暟鎹紝渚涚敤鎴峰湪鍒涘缓WBS妯℃澘鏃跺弬鑰冨拰寮曠敤

CREATE TABLE IF NOT EXISTS standard_processes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,                    -- 宸ュ簭鍚嶇О锛屽"鍦板熀寮€鎸?
  category   TEXT NOT NULL DEFAULT 'general',  -- 鍒嗙被锛歝ivil/structure/fitout/mep/general
  phase      TEXT,                             -- 鎵€灞為樁娈碉細foundation/structure/enclosure/mep/fitout
  reference_days INTEGER,                      -- 鍙傝€冨伐鏈燂紙澶╋級
  description    TEXT,                         -- 宸ュ簭璇存槑
  tags       TEXT[] DEFAULT '{}',              -- 鎼滅储鏍囩
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_standard_processes_category ON standard_processes(category);
CREATE INDEX IF NOT EXISTS idx_standard_processes_is_active ON standard_processes(is_active);
CREATE INDEX IF NOT EXISTS idx_standard_processes_name ON standard_processes USING gin(to_tsvector('simple', name));

-- 绉嶅瓙鏁版嵁锛氬父瑙佸缓绛戝伐搴?
INSERT INTO standard_processes (name, category, phase, reference_days, description, tags, sort_order) VALUES
  ('鍦哄湴骞虫暣', 'civil', 'preparation', 5,  '寤鸿鍦哄湴鐨勬竻鐞嗕笌骞虫暣宸ヤ綔',        ARRAY['鍦熸柟','鍩虹鍑嗗'], 10),
  ('鍩哄潙寮€鎸?, 'civil', 'foundation',  15, '鎸夎璁℃繁搴﹀紑鎸栧熀鍧?,              ARRAY['鍦熸柟','鍦板熀'], 20),
  ('鍩哄潙鏀姢', 'civil', 'foundation',  20, '鍩哄潙鍥存姢缁撴瀯鏂藉伐',                ARRAY['鏀姢','瀹夊叏'], 30),
  ('鍦板熀澶勭悊', 'civil', 'foundation',  10, '杞急鍦板熀鐨勫姞鍥哄鐞?,              ARRAY['鍦板熀','鍔犲浐'], 40),
  ('妗╁熀鏂藉伐', 'civil', 'foundation',  25, '閽诲瓟鐏屾敞妗╂垨棰勫埗妗╂柦宸?,          ARRAY['妗╁熀','鍦板熀'], 50),
  ('鍩虹鍨眰', 'civil', 'foundation',  3,  '娣峰嚌鍦熷灚灞傛祰绛?,                  ARRAY['娣峰嚌鍦?,'鍩虹'], 60),
  ('鍩虹鏂藉伐', 'structure', 'foundation', 20, '鐙珛鍩虹鎴栨潯褰㈠熀纭€鏂藉伐',         ARRAY['娣峰嚌鍦?,'鍩虹'], 70),
  ('鍦颁笅瀹ゅ簳鏉?, 'structure', 'foundation', 15, '鍦颁笅瀹ゅ簳鏉块挗绛嬬粦鎵庡強娣峰嚌鍦熸祰绛?, ARRAY['娣峰嚌鍦?,'闃叉按'], 80),
  ('鍦颁笅瀹ゅ澧?, 'structure', 'foundation', 20, '鍦颁笅瀹ゅ澧欐柦宸?,               ARRAY['娣峰嚌鍦?,'闃叉按'], 90),
  ('鍦颁笅瀹ら《鏉?, 'structure', 'foundation', 15, '鍦颁笅瀹ら《鏉挎柦宸?,               ARRAY['娣峰嚌鍦?], 100),

  ('涓€灞傜粨鏋勬柦宸?, 'structure', 'structure', 14, '棣栧眰閽㈢瓔缁戞墡銆佹ā鏉裤€佹贩鍑濆湡娴囩瓚', ARRAY['涓讳綋','娣峰嚌鍦?], 110),
  ('鏍囧噯灞傜粨鏋勬柦宸?, 'structure', 'structure', 10, '鏍囧噯灞傛祦姘存柦宸?,             ARRAY['涓讳綋','娣峰嚌鍦?], 120),
  ('妤兼澘鏂藉伐', 'structure', 'structure', 8, '妤兼澘閽㈢瓔缁戞墡鍙婃贩鍑濆湡娴囩瓚',       ARRAY['涓讳綋','妤兼澘'], 130),
  ('妤兼鏂藉伐', 'structure', 'structure', 5, '鐜版祰妤兼鏂藉伐',                    ARRAY['涓讳綋','妤兼'], 140),
  ('灞嬮潰缁撴瀯', 'structure', 'structure', 7, '灞嬮潰鏉挎柦宸?,                      ARRAY['涓讳綋','灞嬮潰'], 150),

  ('澶栧鐮岀瓚', 'fitout', 'enclosure', 15, '澶栧洿鎶ゅ浣撶爩绛?,                   ARRAY['鐮屼綋','澶栧'], 160),
  ('鍐呭鐮岀瓚', 'fitout', 'enclosure', 20, '鍐呴殧澧欑爩绛?,                       ARRAY['鐮屼綋','鍐呭'], 170),
  ('澶栧淇濇俯', 'fitout', 'enclosure', 15, '澶栧淇濇俯绯荤粺鏂藉伐',                  ARRAY['淇濇俯','鑺傝兘'], 180),
  ('澶栧娑傛枡', 'fitout', 'enclosure', 10, '澶栫珛闈㈡秱鏂欐柦宸?,                    ARRAY['澶栫珛闈?,'娑傛枡'], 190),
  ('灞嬮潰闃叉按', 'fitout', 'enclosure', 8, '灞嬮潰闃叉按灞傛柦宸?,                    ARRAY['闃叉按','灞嬮潰'], 200),
  ('澶栫獥瀹夎', 'fitout', 'enclosure', 10, '閾濆悎閲戦棬绐楀畨瑁?,                    ARRAY['闂ㄧ獥','澶栫珛闈?], 210),

  ('缁欐帓姘寸閬?, 'mep', 'mep', 20, '缁欐帓姘翠富绠￠亾鍙婃敮绠″畨瑁?,                   ARRAY['姘寸數','缁欐帓姘?], 220),
  ('寮虹數绾跨', 'mep', 'mep', 15, '鐢垫皵绾跨棰勫煁鍙婃ˉ鏋跺畨瑁?,                    ARRAY['姘寸數','寮虹數'], 230),
  ('寮辩數绾跨', 'mep', 'mep', 12, '寮辩數绯荤粺绠＄嚎瀹夎',                         ARRAY['姘寸數','寮辩數'], 240),
  ('閫氶绌鸿皟', 'mep', 'mep', 25, '閫氶绌鸿皟绯荤粺瀹夎',                          ARRAY['鏈虹數','绌鸿皟'], 250),
  ('娑堥槻绯荤粺', 'mep', 'mep', 20, '娑堥槻绠￠亾鍙婂柗娣嬬郴缁熷畨瑁?,                    ARRAY['鏈虹數','娑堥槻'], 260),
  ('鐢垫瀹夎', 'mep', 'mep', 30, '鐢垫璁惧瀹夎鍙婅皟璇?,                        ARRAY['鏈虹數','鐢垫'], 270),

  ('鍦伴潰鎵惧钩', 'fitout', 'fitout', 5, '鍦伴潰鎵惧钩灞傛柦宸?,                       ARRAY['瑁呬慨','鍦伴潰'], 280),
  ('鍐呭鎶圭伆', 'fitout', 'fitout', 10, '鍐呭鎶圭伆鎵惧钩',                        ARRAY['瑁呬慨','鎶圭伆'], 290),
  ('鍐呭娑傛枡', 'fitout', 'fitout', 8, '鍐呭涔宠兌婕嗘柦宸?,                       ARRAY['瑁呬慨','娑傛枡'], 300),
  ('鍦扮爾閾鸿创', 'fitout', 'fitout', 10, '鍦扮爾鎴栨湪鍦版澘閾鸿',                    ARRAY['瑁呬慨','鍦伴潰'], 310),
  ('鍚婇《鏂藉伐', 'fitout', 'fitout', 8, '杞婚挗榫欓鍚婇《鏂藉伐',                     ARRAY['瑁呬慨','鍚婇《'], 320),
  ('鍗敓娲佸叿瀹夎', 'fitout', 'fitout', 5, '鍗荡璁惧瀹夎璋冭瘯',                  ARRAY['瑁呬慨','娲佸叿'], 330),
  ('闂ㄧ獥濂楀畨瑁?, 'fitout', 'fitout', 7, '鍐呴棬鍙婇棬濂楀畨瑁?,                      ARRAY['瑁呬慨','闂ㄧ獥'], 340),

  ('绔ｅ伐娓呯悊', 'general', 'completion', 5, '鏂藉伐鍨冨溇娓呰繍鍙婂満鍦版竻娲?,           ARRAY['绔ｅ伐','娓呯悊'], 350),
  ('绔ｅ伐楠屾敹', 'general', 'completion', 7, '缁勭粐绔ｅ伐楠屾敹鎵嬬画',                  ARRAY['绔ｅ伐','楠屾敹'], 360),
  ('璐ㄩ噺妫€娴?, 'general', 'completion', 5, '鍚勫垎閮ㄥ垎椤瑰伐绋嬭川閲忔娴?,            ARRAY['璐ㄩ噺','妫€娴?], 370),
  ('妗ｆ鏁寸悊', 'general', 'completion', 3, '宸ョ▼璧勬枡鏁寸悊褰掓。',                  ARRAY['绔ｅ伐','妗ｆ'], 380)
ON CONFLICT DO NOTHING;


