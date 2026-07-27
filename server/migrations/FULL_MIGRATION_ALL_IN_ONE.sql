-- DEPRECATED: do not use for new environment bootstrap
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
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,  -- 鏃犵櫥褰曠郴缁熷厑璁窷ULL
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
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,  -- 鏃犵櫥褰曠郴缁熷厑璁窷ULL
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. task_delay_history锛堝欢鏈熷巻鍙茶〃锛?
-- Legacy task_delay_history table retired: final schema must not create it.

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
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,  -- 鏃犵櫥褰曠郴缁熷厑璁窷ULL
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
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,  -- 鏃犵櫥褰曠郴缁熷厑璁窷ULL锛?12涔熸湁淇锛?
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT template_name_unique UNIQUE (template_name, template_type)
);

-- 6. pre_milestones锛堝墠鏈熻瘉鐓ц〃锛?
CREATE TABLE IF NOT EXISTS pre_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_type TEXT NOT NULL CHECK (milestone_type IN (
    'land_certificate',
    'land_use_planning_permit',
    'engineering_planning_permit',
    'construction_permit'
  )),
  milestone_name TEXT NOT NULL,
  certificate_type TEXT,
  certificate_name TEXT,
  application_date DATE,
  issue_date DATE,
  expiry_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'preparing_documents',
    'internal_review',
    'external_submission',
    'supplement_required',
    'approved',
    'issued',
    'expired',
    'voided'
  )),
  certificate_no TEXT,
  current_stage VARCHAR(32),
  planned_finish_date DATE,
  actual_finish_date DATE,
  approving_authority VARCHAR(100),
  issuing_authority TEXT,
  next_action TEXT,
  next_action_due_date DATE,
  is_blocked BOOLEAN DEFAULT FALSE,
  block_reason TEXT,
  latest_record_at TIMESTAMPTZ,
  description TEXT,
  phase_id UUID,
  lead_unit TEXT,
  planned_start_date DATE,
  planned_end_date DATE,
  responsible_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 鍒涘缓绱㈠紩
CREATE INDEX IF NOT EXISTS idx_task_conditions_task ON task_conditions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_obstacles_task ON task_obstacles(task_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_plans_project ON acceptance_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_plans_task ON acceptance_plans(task_id);
CREATE INDEX IF NOT EXISTS idx_wbs_templates_type ON wbs_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_pre_milestones_project ON pre_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_pre_milestones_type ON pre_milestones(milestone_type);
CREATE INDEX IF NOT EXISTS idx_pre_milestones_certificate_type ON pre_milestones(project_id, certificate_type);
CREATE INDEX IF NOT EXISTS idx_pre_milestones_status_current ON pre_milestones(project_id, status);

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

-- [璺宠繃] 鐗╁寲瑙嗗浘绱㈠紩锛堣鍥惧凡琚敞閲婏紝璺宠繃姝ょ储寮曪級
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_project_dashboard_project_id
-- ON mv_project_dashboard(project_id);

-- [璺宠繃] COMMENT ON MATERIALIZED VIEW mv_project_dashboard IS '椤圭洰Dashboard鐗╁寲瑙嗗浘';

-- 6. 鍒涘缓鏇村瑙﹀彂鍣紙Phase 1 琛ュ厖锛?

-- 6.1 浠诲姟瀹屾垚鏃惰嚜鍔ㄩ棴鍚堝叧鑱旀潯浠?
CREATE OR REPLACE FUNCTION auto_complete_conditions()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = '宸插畬鎴? AND OLD.status != '宸插畬鎴? THEN
    UPDATE task_conditions
    SET is_satisfied = TRUE, confirmed_at = NOW()
    WHERE task_id = NEW.id AND is_satisfied = FALSE;
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
-- Legacy record_task_delay_history trigger function retired.


-- 6.4 Legacy DB health scorer removed; projectHealthService is the authoritative scorer.
DROP FUNCTION IF EXISTS calculate_project_health_score(UUID) CASCADE;
DROP FUNCTION IF EXISTS update_project_health_on_change() CASCADE;
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
  snapshot_date DATE NOT NULL
  is_auto_generated BOOLEAN DEFAULT TRUE,
  event_type VARCHAR(50),
  event_source VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
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
    INSERT INTO task_progress_snapshots (
      task_id,
      progress,
      snapshot_date,
      event_type,
      event_source,
      notes
    )
    VALUES (
      NEW.id,
      NEW.progress,
      CURRENT_DATE,
      'task_update',
      'db_trigger',
      '进度更新: ' || NEW.progress || '%'
    )
    ON CONFLICT (task_id, snapshot_date, event_type, event_source)
    DO UPDATE SET
      progress = EXCLUDED.progress,
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
-- 鎵╁睍浠诲姟鎵ц鏃ュ織琛紙鍦?03涓凡鍒涘缓鍩虹鐗堬紝杩欓噷琛ュ厖棰濆瀛楁锛?

-- 琛ュ厖003涓己灏戠殑瀛楁锛堜娇鐢ˋDD COLUMN IF NOT EXISTS閬垮厤鍐茬獊锛?
ALTER TABLE job_execution_logs
  ADD COLUMN IF NOT EXISTS result JSONB,
  ADD COLUMN IF NOT EXISTS job_id TEXT,
  ADD COLUMN IF NOT EXISTS triggered_by TEXT CHECK (triggered_by IN ('scheduler', 'manual', 'api'));

-- 琛ュ厖绱㈠紩锛?09鐗堟湰绱㈠紩锛孖F NOT EXISTS閬垮厤鍐茬獊锛?
CREATE INDEX IF NOT EXISTS idx_job_execution_logs_job_name ON job_execution_logs(job_name);
CREATE INDEX IF NOT EXISTS idx_job_execution_logs_status ON job_execution_logs(status);
CREATE INDEX IF NOT EXISTS idx_job_execution_logs_started_at ON job_execution_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_execution_logs_job_id ON job_execution_logs(job_id);

-- 娣诲姞娉ㄩ噴
COMMENT ON TABLE job_execution_logs IS '瀹氭椂浠诲姟鎵ц鏃ュ織琛紝璁板綍鎵€鏈夊畾鏃朵换鍔＄殑鎵ц鍘嗗彶';
COMMENT ON COLUMN job_execution_logs.job_name IS '浠诲姟鍚嶇О锛堝: riskStatisticsJob, conditionAlertJob锛?;
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
    IF TG_OP = 'DELETE' THEN
        v_pre_milestone_id := OLD.pre_milestone_id;
    ELSE
        v_pre_milestone_id := NEW.pre_milestone_id;
    END IF;

    SELECT status INTO v_current_status
    FROM pre_milestones
    WHERE id = v_pre_milestone_id;

    IF v_current_status IN ('issued', 'expired', 'voided') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status IN ('已满足', '已确认'))
    INTO v_total_conditions, v_satisfied_conditions
    FROM pre_milestone_conditions
    WHERE pre_milestone_id = v_pre_milestone_id;

    IF v_total_conditions > 0 AND v_total_conditions = v_satisfied_conditions THEN
        UPDATE pre_milestones
        SET status = 'issued',
            issue_date = COALESCE(issue_date, CURRENT_DATE),
            updated_at = NOW()
        WHERE id = v_pre_milestone_id
          AND status NOT IN ('issued', 'expired', 'voided');
    ELSIF v_satisfied_conditions > 0 AND v_current_status = 'pending' THEN
        UPDATE pre_milestones
        SET status = 'preparing_documents',
            updated_at = NOW()
        WHERE id = v_pre_milestone_id
          AND status = 'pending';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_pre_milestone_status_update
    AFTER INSERT OR UPDATE OR DELETE ON pre_milestone_conditions
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_pre_milestone_status();

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
-- Legacy project_health_details table removed; projectHealthService details are returned by API and project_daily_snapshot owns trends.
DROP TABLE IF EXISTS project_health_details CASCADE;
DROP FUNCTION IF EXISTS update_project_health_details_updated_at() CASCADE;
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
  dependency_kind VARCHAR(20) DEFAULT 'hard'
    CHECK (dependency_kind IN ('hard', 'soft')),

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

-- ============================================================
-- Consolidated P0 contract alignment (folded from 056/065/066/067/068/084)
-- ============================================================

CREATE TABLE IF NOT EXISTS issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  source_type VARCHAR(60) NOT NULL
    CHECK (source_type IN ('manual', 'risk_converted', 'risk_auto_escalated', 'obstacle_escalated', 'condition_expired', 'source_deleted')),
  source_id UUID,
  chain_id UUID,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  priority INTEGER NOT NULL DEFAULT 50,
  pending_manual_close BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  closed_reason VARCHAR(100),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_issues_source
  ON issues (source_id, source_type)
  WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_issues_chain_id
  ON issues (chain_id)
  WHERE chain_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_issues_project
  ON issues (project_id);
CREATE INDEX IF NOT EXISTS idx_issues_task
  ON issues (task_id)
  WHERE task_id IS NOT NULL;

DROP TRIGGER IF EXISTS issues_updated_at ON issues;
CREATE TRIGGER issues_updated_at
  BEFORE UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS participant_units (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  unit_name TEXT NOT NULL,
  unit_type TEXT NOT NULL,
  contact_name TEXT,
  contact_role TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_participant_units_project_id
  ON participant_units(project_id);
CREATE INDEX IF NOT EXISTS idx_participant_units_unit_name
  ON participant_units(unit_name);
CREATE INDEX IF NOT EXISTS idx_participant_units_unit_type
  ON participant_units(unit_type);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS participant_unit_id UUID REFERENCES participant_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_participant_unit_id
  ON tasks(participant_unit_id);

ALTER TABLE acceptance_plans
  ADD COLUMN IF NOT EXISTS participant_unit_id UUID REFERENCES participant_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_acceptance_plans_participant_unit_id
  ON acceptance_plans(participant_unit_id);

ALTER TABLE task_progress_snapshots
  ADD COLUMN IF NOT EXISTS event_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS event_source VARCHAR(50);

UPDATE task_progress_snapshots
SET
  event_type = COALESCE(event_type, 'task_update'),
  event_source = COALESCE(event_source, CASE WHEN is_auto_generated THEN 'system_auto' ELSE 'manual' END)
WHERE event_type IS NULL
   OR event_source IS NULL;

-- Consolidated post-057 schema alignment block (2026-04-16)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS operation_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  username TEXT,
  project_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  method TEXT,
  path TEXT,
  status_code INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  request_body JSONB,
  detail JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS operation_logs
  ADD COLUMN IF NOT EXISTS project_id TEXT,
  ADD COLUMN IF NOT EXISTS resource_type TEXT,
  ADD COLUMN IF NOT EXISTS resource_id TEXT,
  ADD COLUMN IF NOT EXISTS method TEXT,
  ADD COLUMN IF NOT EXISTS path TEXT,
  ADD COLUMN IF NOT EXISTS status_code INTEGER,
  ADD COLUMN IF NOT EXISTS request_body JSONB,
  ADD COLUMN IF NOT EXISTS detail JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_operation_logs_user_id ON operation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_operation_logs_project_id ON operation_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_operation_logs_action ON operation_logs(action);
CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at ON operation_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS change_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  entity_type VARCHAR(60) NOT NULL
    CHECK (entity_type IN (
      'task',
      'risk',
      'issue',
      'delay_request',
      'milestone',
      'monthly_plan',
      'baseline',
      'task_condition',
      'task_obstacle'
    )),
  entity_id UUID NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  change_reason TEXT,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  change_source VARCHAR(40) NOT NULL DEFAULT 'manual_adjusted'
    CHECK (change_source IN (
      'system_auto',
      'manual_adjusted',
      'admin_force',
      'approval',
      'monthly_plan_correction',
      'baseline_revision'
    ))
);

CREATE INDEX IF NOT EXISTS idx_change_logs_entity ON change_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_change_logs_project ON change_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_change_logs_changed_at ON change_logs(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_logs_changed_by ON change_logs(changed_by)
  WHERE changed_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS task_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'closed', 'revising', 'pending_realign', 'archived')),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  source_type VARCHAR(30) NOT NULL DEFAULT 'current_schedule'
    CHECK (source_type IN ('manual', 'current_schedule', 'imported_file', 'carryover')),
  source_version_id UUID,
  source_version_label TEXT,
  effective_from DATE,
  effective_to DATE,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, version)
);

CREATE TABLE IF NOT EXISTS task_baseline_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  baseline_version_id UUID NOT NULL REFERENCES task_baselines(id) ON DELETE CASCADE,
  parent_item_id UUID REFERENCES task_baseline_items(id) ON DELETE SET NULL,
  source_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  source_milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  planned_start_date DATE,
  planned_end_date DATE,
  target_progress NUMERIC(6,2),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_milestone BOOLEAN DEFAULT FALSE,
  is_critical BOOLEAN DEFAULT FALSE,
  is_baseline_critical BOOLEAN NOT NULL DEFAULT FALSE,
  mapping_status VARCHAR(20) NOT NULL DEFAULT 'mapped'
    CHECK (mapping_status IN ('mapped', 'pending', 'missing', 'merged')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monthly_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'closed', 'revising', 'pending_realign')),
  month VARCHAR(7) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  baseline_version_id UUID REFERENCES task_baselines(id) ON DELETE SET NULL,
  source_version_id UUID,
  source_version_label TEXT,
  closeout_at TIMESTAMPTZ,
  carryover_item_count INTEGER DEFAULT 0,
  data_confidence_score NUMERIC(5,2),
  data_confidence_flag TEXT,
  data_confidence_note TEXT,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, month, version)
);

CREATE TABLE IF NOT EXISTS monthly_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  monthly_plan_version_id UUID NOT NULL REFERENCES monthly_plans(id) ON DELETE CASCADE,
  baseline_item_id UUID REFERENCES task_baseline_items(id) ON DELETE SET NULL,
  carryover_from_item_id UUID REFERENCES monthly_plan_items(id) ON DELETE SET NULL,
  source_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  planned_start_date DATE,
  planned_end_date DATE,
  target_progress NUMERIC(6,2),
  current_progress NUMERIC(6,2),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_milestone BOOLEAN DEFAULT FALSE,
  is_critical BOOLEAN DEFAULT FALSE,
  commitment_status VARCHAR(20) NOT NULL DEFAULT 'planned'
    CHECK (commitment_status IN ('planned', 'carried_over', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS planning_draft_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  draft_type VARCHAR(20) NOT NULL
    CHECK (draft_type IN ('baseline', 'monthly_plan')),
  resource_id UUID NOT NULL,
  locked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lock_expires_at TIMESTAMPTZ NOT NULL,
  reminder_sent_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  released_by UUID REFERENCES users(id) ON DELETE SET NULL,
  release_reason VARCHAR(30)
    CHECK (release_reason IN ('timeout', 'force_unlock', 'manual_release')),
  is_locked BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, draft_type, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_task_baselines_project_id ON task_baselines(project_id);
CREATE INDEX IF NOT EXISTS idx_task_baselines_status ON task_baselines(status);
CREATE INDEX IF NOT EXISTS idx_task_baseline_items_baseline_version_id ON task_baseline_items(baseline_version_id);
CREATE INDEX IF NOT EXISTS idx_task_baseline_items_project_id ON task_baseline_items(project_id);
CREATE INDEX IF NOT EXISTS idx_monthly_plans_project_id ON monthly_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_monthly_plans_month ON monthly_plans(month);
CREATE INDEX IF NOT EXISTS idx_monthly_plan_items_plan_version_id ON monthly_plan_items(monthly_plan_version_id);
CREATE INDEX IF NOT EXISTS idx_monthly_plan_items_project_id ON monthly_plan_items(project_id);
CREATE INDEX IF NOT EXISTS idx_planning_draft_locks_project_id ON planning_draft_locks(project_id);
CREATE INDEX IF NOT EXISTS idx_planning_draft_locks_expiry ON planning_draft_locks(is_locked, lock_expires_at);
CREATE INDEX IF NOT EXISTS idx_planning_draft_locks_resource_id ON planning_draft_locks(resource_id);

CREATE TABLE IF NOT EXISTS planning_governance_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  state_key TEXT NOT NULL UNIQUE,
  category VARCHAR(30) NOT NULL
    CHECK (category IN ('closeout', 'reorder', 'ad_hoc')),
  kind VARCHAR(60) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'resolved')),
  severity VARCHAR(20) NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  threshold_day INTEGER,
  dashboard_signal BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB,
  source_entity_type VARCHAR(50),
  source_entity_id TEXT,
  active_from TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planning_governance_states_project_id ON planning_governance_states(project_id);
CREATE INDEX IF NOT EXISTS idx_planning_governance_states_status ON planning_governance_states(status);
CREATE INDEX IF NOT EXISTS idx_planning_governance_states_category ON planning_governance_states(category);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS baseline_item_id UUID REFERENCES task_baseline_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monthly_plan_item_id UUID REFERENCES monthly_plan_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_baseline_item_id ON tasks(baseline_item_id);
CREATE INDEX IF NOT EXISTS idx_tasks_monthly_plan_item_id ON tasks(monthly_plan_item_id);

ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS baseline_date DATE,
  ADD COLUMN IF NOT EXISTS current_plan_date DATE,
  ADD COLUMN IF NOT EXISTS actual_date DATE;

CREATE INDEX IF NOT EXISTS idx_milestones_baseline_date ON milestones(baseline_date);
CREATE INDEX IF NOT EXISTS idx_milestones_current_plan_date ON milestones(current_plan_date);
CREATE INDEX IF NOT EXISTS idx_milestones_actual_date ON milestones(actual_date);

-- Legacy delay_requests table retired: final schema must not create it.




ALTER TABLE task_progress_snapshots
  ADD COLUMN IF NOT EXISTS event_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS event_source VARCHAR(50),
  ADD COLUMN IF NOT EXISTS status VARCHAR(40),
  ADD COLUMN IF NOT EXISTS conditions_met_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conditions_total_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS obstacles_active_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_auto_generated BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS baseline_version_id UUID REFERENCES task_baselines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monthly_plan_version_id UUID REFERENCES monthly_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS baseline_item_id UUID REFERENCES task_baseline_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monthly_plan_item_id UUID REFERENCES monthly_plan_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS planning_source_type VARCHAR(30) DEFAULT 'execution'
    CHECK (planning_source_type IN ('baseline', 'monthly_plan', 'current_schedule', 'execution')),
  ADD COLUMN IF NOT EXISTS planning_source_version_id UUID,
  ADD COLUMN IF NOT EXISTS planning_source_item_id UUID;

UPDATE task_progress_snapshots
SET
  event_type = COALESCE(event_type, 'task_update'),
  event_source = COALESCE(event_source, CASE WHEN is_auto_generated THEN 'system_auto' ELSE 'manual' END),
  conditions_met_count = COALESCE(conditions_met_count, 0),
  conditions_total_count = COALESCE(conditions_total_count, 0),
  obstacles_active_count = COALESCE(obstacles_active_count, 0),
  planning_source_type = COALESCE(planning_source_type, 'execution')
WHERE event_type IS NULL
   OR event_source IS NULL
   OR conditions_met_count IS NULL
   OR conditions_total_count IS NULL
   OR obstacles_active_count IS NULL
   OR planning_source_type IS NULL;

ALTER TABLE acceptance_plans
  ADD COLUMN IF NOT EXISTS building_id TEXT,
  ADD COLUMN IF NOT EXISTS scope_level TEXT,
  ADD COLUMN IF NOT EXISTS catalog_id UUID,
  ADD COLUMN IF NOT EXISTS type_id TEXT,
  ADD COLUMN IF NOT EXISTS type_name TEXT,
  ADD COLUMN IF NOT EXISTS phase TEXT,
  ADD COLUMN IF NOT EXISTS phase_order INTEGER,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER,
  ADD COLUMN IF NOT EXISTS parallel_group_id TEXT,
  ADD COLUMN IF NOT EXISTS position JSONB,
  ADD COLUMN IF NOT EXISTS depends_on JSONB,
  ADD COLUMN IF NOT EXISTS depended_by JSONB;

CREATE TABLE IF NOT EXISTS acceptance_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  catalog_code TEXT,
  catalog_name TEXT NOT NULL,
  phase_code TEXT,
  scope_level TEXT,
  planned_finish_date DATE,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_acceptance_catalog_project_code
  ON acceptance_catalog(project_id, catalog_code)
  WHERE catalog_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_acceptance_catalog_project_id
  ON acceptance_catalog(project_id);

CREATE TABLE IF NOT EXISTS acceptance_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  source_plan_id UUID NOT NULL REFERENCES acceptance_plans(id) ON DELETE CASCADE,
  target_plan_id UUID NOT NULL REFERENCES acceptance_plans(id) ON DELETE CASCADE,
  dependency_kind TEXT NOT NULL DEFAULT 'hard'
    CHECK (dependency_kind IN ('hard', 'soft')),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acceptance_dependencies_project_id
  ON acceptance_dependencies(project_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_dependencies_source_plan_id
  ON acceptance_dependencies(source_plan_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_dependencies_target_plan_id
  ON acceptance_dependencies(target_plan_id);

CREATE TABLE IF NOT EXISTS acceptance_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  plan_id UUID NOT NULL REFERENCES acceptance_plans(id) ON DELETE CASCADE,
  requirement_type TEXT NOT NULL,
  source_entity_type TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  is_satisfied BOOLEAN NOT NULL DEFAULT FALSE,
  drawing_package_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE acceptance_requirements
  ADD COLUMN IF NOT EXISTS drawing_package_id UUID;

CREATE INDEX IF NOT EXISTS idx_acceptance_requirements_project_id
  ON acceptance_requirements(project_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_requirements_plan_id
  ON acceptance_requirements(plan_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_requirements_drawing_package_id
  ON acceptance_requirements(drawing_package_id);

ALTER TABLE acceptance_records
  ADD COLUMN IF NOT EXISTS project_id UUID,
  ADD COLUMN IF NOT EXISTS plan_id UUID,
  ADD COLUMN IF NOT EXISTS record_type TEXT,
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS operator TEXT,
  ADD COLUMN IF NOT EXISTS attachments JSONB;

CREATE INDEX IF NOT EXISTS idx_acceptance_records_project_id
  ON acceptance_records(project_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_records_plan_id
  ON acceptance_records(plan_id);

CREATE INDEX IF NOT EXISTS idx_acceptance_plans_catalog_id
  ON acceptance_plans(catalog_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_acceptance_plans_catalog_id'
  ) THEN
    EXECUTE '
      ALTER TABLE acceptance_plans
      ADD CONSTRAINT fk_acceptance_plans_catalog_id
      FOREIGN KEY (catalog_id)
      REFERENCES acceptance_catalog(id)
      ON DELETE RESTRICT
      ON UPDATE CASCADE
    ';
  END IF;
END $$;

ALTER TABLE task_conditions
  ADD COLUMN IF NOT EXISTS drawing_package_id UUID NULL,
  ADD COLUMN IF NOT EXISTS drawing_package_code TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_task_conditions_drawing_package_id
  ON task_conditions(drawing_package_id);
CREATE INDEX IF NOT EXISTS idx_task_conditions_drawing_package_code
  ON task_conditions(drawing_package_code);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_task_conditions_drawing_package_id'
  ) THEN
    EXECUTE '
      ALTER TABLE task_conditions
      ADD CONSTRAINT fk_task_conditions_drawing_package_id
      FOREIGN KEY (drawing_package_id)
      REFERENCES drawing_packages(id)
      ON DELETE SET NULL
    ';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS certificate_work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_code VARCHAR(64),
  item_name VARCHAR(200) NOT NULL,
  item_stage VARCHAR(32) NOT NULL DEFAULT '璧勬枡鍑嗗'
    CHECK (item_stage IN ('璧勬枡鍑嗗', '鍐呴儴鎶ュ', '澶栭儴鎶ユ壒', '鎵瑰棰嗚瘉')),
  status VARCHAR(40) NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'preparing_documents',
      'internal_review',
      'external_submission',
      'supplement_required',
      'approved',
      'issued',
      'expired',
      'voided'
    )),
  planned_finish_date DATE,
  actual_finish_date DATE,
  approving_authority VARCHAR(100),
  is_shared BOOLEAN DEFAULT FALSE,
  next_action TEXT,
  next_action_due_date DATE,
  is_blocked BOOLEAN DEFAULT FALSE,
  block_reason TEXT,
  sort_order INTEGER DEFAULT 0,
  notes TEXT,
  latest_record_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS certificate_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  predecessor_type VARCHAR(20) NOT NULL
    CHECK (predecessor_type IN ('certificate', 'work_item')),
  predecessor_id UUID NOT NULL,
  successor_type VARCHAR(20) NOT NULL
    CHECK (successor_type IN ('certificate', 'work_item')),
  successor_id UUID NOT NULL,
  dependency_kind VARCHAR(20) NOT NULL DEFAULT 'hard'
    CHECK (dependency_kind IN ('hard', 'soft')),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, predecessor_type, predecessor_id, successor_type, successor_id, dependency_kind)
);

CREATE INDEX IF NOT EXISTS idx_certificate_work_items_project
  ON certificate_work_items(project_id);
CREATE INDEX IF NOT EXISTS idx_certificate_work_items_stage
  ON certificate_work_items(project_id, item_stage);
CREATE INDEX IF NOT EXISTS idx_certificate_work_items_status
  ON certificate_work_items(project_id, status);
CREATE INDEX IF NOT EXISTS idx_certificate_dependencies_project
  ON certificate_dependencies(project_id);
CREATE INDEX IF NOT EXISTS idx_certificate_dependencies_predecessor
  ON certificate_dependencies(project_id, predecessor_type, predecessor_id);
CREATE INDEX IF NOT EXISTS idx_certificate_dependencies_successor
  ON certificate_dependencies(project_id, successor_type, successor_id);

CREATE OR REPLACE FUNCTION update_certificate_work_items_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_certificate_work_items_updated_at ON certificate_work_items;
CREATE TRIGGER update_certificate_work_items_updated_at
  BEFORE UPDATE ON certificate_work_items
  FOR EACH ROW
  EXECUTE FUNCTION update_certificate_work_items_timestamp();

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

CREATE TABLE IF NOT EXISTS task_critical_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  mode VARCHAR(32) NOT NULL CHECK (mode IN ('manual_attention', 'manual_insert')),
  anchor_type VARCHAR(16) CHECK (anchor_type IN ('before', 'after', 'between')),
  left_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  right_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT task_critical_overrides_unique_task_mode UNIQUE (project_id, task_id, mode),
  CONSTRAINT task_critical_overrides_manual_insert_anchor_check CHECK (
    mode <> 'manual_insert'
    OR anchor_type IS NOT NULL
  ),
  CONSTRAINT task_critical_overrides_manual_insert_anchor_ref_check CHECK (
    mode <> 'manual_insert'
    OR left_task_id IS NOT NULL
    OR right_task_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_task_critical_overrides_project_id
  ON task_critical_overrides(project_id);
CREATE INDEX IF NOT EXISTS idx_task_critical_overrides_task_id
  ON task_critical_overrides(task_id);

INSERT INTO task_critical_overrides (
  id,
  project_id,
  task_id,
  mode,
  anchor_type,
  left_task_id,
  right_task_id,
  reason,
  created_by,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  t.project_id,
  t.id,
  'manual_attention',
  NULL,
  NULL,
  NULL,
  'migrated from tasks.is_critical',
  NULL,
  NOW(),
  NOW()
FROM tasks t
WHERE t.is_critical = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM task_critical_overrides o
    WHERE o.project_id = t.project_id
      AND o.task_id = t.id
      AND o.mode = 'manual_attention'
  );

-- Final cleanup: 延期申请审批流已从计划模型移除，初始化脚本最终态不保留旧表/旧函数/旧字段。
DO $$
BEGIN
  IF to_regclass('public.tasks') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trigger_record_task_delay ON public.tasks;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.record_task_delay_history() CASCADE;
DROP FUNCTION IF EXISTS public.approve_delay_request_atomic(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.reject_delay_request_atomic(UUID, UUID) CASCADE;

ALTER TABLE IF EXISTS public.notifications
  DROP COLUMN IF EXISTS delay_request_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_daily_snapshot'
      AND column_name = 'active_delay_requests'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'project_daily_snapshot'
        AND column_name = 'active_delayed_tasks'
    ) THEN
      ALTER TABLE public.project_daily_snapshot
        RENAME COLUMN active_delay_requests TO active_delayed_tasks;
    ELSE
      UPDATE public.project_daily_snapshot
      SET active_delayed_tasks = COALESCE(active_delayed_tasks, active_delay_requests)
      WHERE active_delayed_tasks IS NULL
        AND active_delay_requests IS NOT NULL;
      ALTER TABLE public.project_daily_snapshot
        DROP COLUMN active_delay_requests;
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS public.delay_requests CASCADE;
DROP TABLE IF EXISTS public.task_delay_history CASCADE;

CREATE TABLE IF NOT EXISTS warning_acknowledgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID NULL REFERENCES tasks(id) ON DELETE CASCADE,
  warning_type VARCHAR(50) NOT NULL,
  warning_signature VARCHAR(255) NOT NULL,
  acked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_warning_acknowledgments_user_signature
  ON warning_acknowledgments(user_id, warning_signature);
CREATE INDEX IF NOT EXISTS idx_warning_acknowledgments_project
  ON warning_acknowledgments(project_id, user_id);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS chain_id UUID,
  ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated_to_risk_id UUID,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_escalated BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_source TEXT;

ALTER TABLE task_obstacles
  ADD COLUMN IF NOT EXISTS severity_escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS severity_manually_overridden BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE task_baseline_items
  ADD COLUMN IF NOT EXISTS is_baseline_critical BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_task_baseline_items_baseline_critical
  ON task_baseline_items (baseline_version_id, is_baseline_critical);

CREATE INDEX IF NOT EXISTS idx_notifications_warning_chain_id
  ON notifications(chain_id)
  WHERE chain_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_warning_source_signature
  ON notifications(source_entity_type, source_entity_id)
  WHERE source_entity_type = 'warning';
CREATE INDEX IF NOT EXISTS idx_notifications_warning_status
  ON notifications(status, source_entity_type)
  WHERE source_entity_type = 'warning';

CREATE TABLE IF NOT EXISTS drawing_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  package_code TEXT NOT NULL,
  package_name TEXT NOT NULL,
  discipline_type TEXT NOT NULL,
  document_purpose TEXT NOT NULL DEFAULT '鏂藉伐鎵ц',
  status TEXT NOT NULL DEFAULT 'pending',
  requires_review BOOLEAN NOT NULL DEFAULT FALSE,
  review_mode TEXT NOT NULL DEFAULT 'none',
  review_basis TEXT,
  completeness_ratio NUMERIC(5, 2) NOT NULL DEFAULT 0,
  missing_required_count INT NOT NULL DEFAULT 0,
  current_version_drawing_id UUID,
  has_change BOOLEAN NOT NULL DEFAULT FALSE,
  schedule_impact_flag BOOLEAN NOT NULL DEFAULT FALSE,
  is_ready_for_construction BOOLEAN NOT NULL DEFAULT FALSE,
  is_ready_for_acceptance BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, package_code)
);

CREATE TABLE IF NOT EXISTS drawing_package_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES drawing_packages(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  current_drawing_id UUID,
  current_version TEXT,
  status TEXT NOT NULL DEFAULT 'missing',
  notes TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (package_id, item_code)
);

CREATE TABLE IF NOT EXISTS drawing_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES drawing_packages(id) ON DELETE CASCADE,
  drawing_id UUID NOT NULL REFERENCES construction_drawings(id) ON DELETE CASCADE,
  version_no TEXT NOT NULL,
  previous_version_id UUID REFERENCES drawing_versions(id) ON DELETE SET NULL,
  is_current_version BOOLEAN NOT NULL DEFAULT FALSE,
  change_reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (drawing_id, version_no)
);

CREATE TABLE IF NOT EXISTS drawing_review_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  package_code TEXT,
  discipline_type TEXT,
  document_purpose TEXT,
  default_review_mode TEXT NOT NULL DEFAULT 'none',
  review_basis TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE construction_drawings
  ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES drawing_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS package_code TEXT,
  ADD COLUMN IF NOT EXISTS package_name TEXT,
  ADD COLUMN IF NOT EXISTS discipline_type TEXT,
  ADD COLUMN IF NOT EXISTS document_purpose TEXT DEFAULT '鏂藉伐鎵ц',
  ADD COLUMN IF NOT EXISTS drawing_code TEXT,
  ADD COLUMN IF NOT EXISTS version_no TEXT,
  ADD COLUMN IF NOT EXISTS is_current_version BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS review_mode TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS review_basis TEXT,
  ADD COLUMN IF NOT EXISTS has_change BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS change_reason TEXT,
  ADD COLUMN IF NOT EXISTS schedule_impact_flag BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_ready_for_construction BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_ready_for_acceptance BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_drawing_packages_project ON drawing_packages(project_id);
CREATE INDEX IF NOT EXISTS idx_drawing_packages_code ON drawing_packages(project_id, package_code);
CREATE INDEX IF NOT EXISTS idx_drawing_package_items_package ON drawing_package_items(package_id);
CREATE INDEX IF NOT EXISTS idx_drawing_versions_package ON drawing_versions(package_id);
CREATE INDEX IF NOT EXISTS idx_drawing_versions_project ON drawing_versions(project_id);
CREATE INDEX IF NOT EXISTS idx_drawing_review_rules_project ON drawing_review_rules(project_id);
CREATE INDEX IF NOT EXISTS idx_drawing_review_rules_active ON drawing_review_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_construction_drawings_package ON construction_drawings(project_id, package_code);
CREATE INDEX IF NOT EXISTS idx_construction_drawings_current_version ON construction_drawings(package_id, is_current_version);

CREATE OR REPLACE FUNCTION update_drawing_packages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_drawing_packages_updated_at ON drawing_packages;
CREATE TRIGGER update_drawing_packages_updated_at
  BEFORE UPDATE ON drawing_packages
  FOR EACH ROW
  EXECUTE FUNCTION update_drawing_packages_updated_at();

CREATE OR REPLACE FUNCTION update_drawing_package_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_drawing_package_items_updated_at ON drawing_package_items;
CREATE TRIGGER update_drawing_package_items_updated_at
  BEFORE UPDATE ON drawing_package_items
  FOR EACH ROW
  EXECUTE FUNCTION update_drawing_package_items_updated_at();

CREATE OR REPLACE FUNCTION update_drawing_versions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_drawing_versions_updated_at ON drawing_versions;
CREATE TRIGGER update_drawing_versions_updated_at
  BEFORE UPDATE ON drawing_versions
  FOR EACH ROW
  EXECUTE FUNCTION update_drawing_versions_updated_at();

CREATE OR REPLACE FUNCTION update_drawing_review_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_drawing_review_rules_updated_at ON drawing_review_rules;
CREATE TRIGGER update_drawing_review_rules_updated_at
  BEFORE UPDATE ON drawing_review_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_drawing_review_rules_updated_at();

INSERT INTO drawing_review_rules (
  id,
  project_id,
  package_code,
  discipline_type,
  document_purpose,
  default_review_mode,
  review_basis,
  is_active,
  created_at,
  updated_at
)
VALUES
  (gen_random_uuid(), NULL, 'fire-review', '娑堥槻', '閫佸鎶ユ壒', 'mandatory', '娑堥槻涓撻」鍖呴粯璁ゅ繀瀹?, TRUE, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'civil-defense-review', '浜洪槻', '閫佸鎶ユ壒', 'mandatory', '浜洪槻涓撻」鍖呴粯璁ゅ繀瀹?, TRUE, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'completion-archive', '绔ｅ伐褰掓。', '绔ｅ伐褰掓。', 'manual_confirm', '绔ｅ伐褰掓。鍖呴渶瑕佷汉宸ョ‘璁?, TRUE, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'architecture-construction', '寤虹瓚', '鏂藉伐鎵ц', 'none', '甯歌鏂藉伐鎵ц鍖呴粯璁や笉閫佸', TRUE, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'structure-construction', '缁撴瀯', '鏂藉伐鎵ц', 'none', '甯歌鏂藉伐鎵ц鍖呴粯璁や笉閫佸', TRUE, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'water-construction', '缁欐帓姘?, '鏂藉伐鎵ц', 'none', '甯歌鏂藉伐鎵ц鍖呴粯璁や笉閫佸', TRUE, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'hvac-construction', '鏆栭€?, '鏂藉伐鎵ц', 'none', '甯歌鏂藉伐鎵ц鍖呴粯璁や笉閫佸', TRUE, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'electrical-construction', '鐢垫皵', '鏂藉伐鎵ц', 'none', '甯歌鏂藉伐鎵ц鍖呴粯璁や笉閫佸', TRUE, NOW(), NOW())
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_acceptance_requirements_drawing_package_id'
  ) THEN
    EXECUTE '
      ALTER TABLE acceptance_requirements
      ADD CONSTRAINT fk_acceptance_requirements_drawing_package_id
      FOREIGN KEY (drawing_package_id)
      REFERENCES drawing_packages(id)
      ON DELETE SET NULL
    ';
  END IF;
END $$;

-- P7 compatibility cleanup reconciliation
UPDATE acceptance_plans
SET status = CASE
  WHEN status IN ('pending', '寰呭惎鍔?, '寰呴獙鏀?) THEN 'not_started'
  WHEN status IN ('鍑嗗涓?) THEN 'preparing'
  WHEN status IN ('宸茬敵鎶?) THEN 'submitted'
  WHEN status IN ('in_progress', '楠屾敹涓?) THEN 'in_acceptance'
  WHEN status IN ('failed', 'needs_revision', '鏁存敼涓?, '鏈€氳繃', '闇€琛ュ厖') THEN 'rectification'
  WHEN status IN ('宸查€氳繃') THEN 'passed'
  WHEN status IN ('宸插妗?) THEN 'recorded'
  ELSE status
END
WHERE status IN ('pending', 'in_progress', 'failed', 'needs_revision', '寰呭惎鍔?, '鍑嗗涓?, '宸茬敵鎶?, '楠屾敹涓?, '鏁存敼涓?, '宸查€氳繃', '宸插妗?, '寰呴獙鏀?, '鏈€氳繃', '闇€琛ュ厖');

UPDATE acceptance_nodes
SET status = CASE
  WHEN status IN ('pending', '寰呭惎鍔?, '寰呴獙鏀?) THEN 'not_started'
  WHEN status IN ('鍑嗗涓?) THEN 'preparing'
  WHEN status IN ('宸茬敵鎶?) THEN 'submitted'
  WHEN status IN ('in_progress', '楠屾敹涓?) THEN 'in_acceptance'
  WHEN status IN ('failed', 'needs_revision', '鏁存敼涓?, '鏈€氳繃', '闇€琛ュ厖') THEN 'rectification'
  WHEN status IN ('宸查€氳繃') THEN 'passed'
  WHEN status IN ('宸插妗?) THEN 'recorded'
  ELSE status
END
WHERE status IN ('pending', 'in_progress', 'failed', 'needs_revision', '寰呭惎鍔?, '鍑嗗涓?, '宸茬敵鎶?, '楠屾敹涓?, '鏁存敼涓?, '宸查€氳繃', '宸插妗?, '寰呴獙鏀?, '鏈€氳繃', '闇€琛ュ厖');

ALTER TABLE IF EXISTS acceptance_plans DROP COLUMN IF EXISTS depends_on;
ALTER TABLE IF EXISTS acceptance_plans DROP CONSTRAINT IF EXISTS acceptance_plans_status_check_p7;
ALTER TABLE IF EXISTS acceptance_plans
  ADD CONSTRAINT acceptance_plans_status_check_p7
  CHECK (status IN ('draft', 'preparing', 'ready_to_submit', 'submitted', 'inspecting', 'rectifying', 'passed', 'archived'));

ALTER TABLE IF EXISTS acceptance_nodes DROP CONSTRAINT IF EXISTS acceptance_nodes_status_check_p7;
ALTER TABLE IF EXISTS acceptance_nodes
  ADD CONSTRAINT acceptance_nodes_status_check_p7
  CHECK (status IN ('draft', 'preparing', 'ready_to_submit', 'submitted', 'inspecting', 'rectifying', 'passed', 'archived'));

UPDATE task_obstacles SET status = '宸茶В鍐? WHERE status = '鏃犳硶瑙ｅ喅';
ALTER TABLE IF EXISTS task_obstacles DROP CONSTRAINT IF EXISTS task_obstacles_status_check_p7;
ALTER TABLE IF EXISTS task_obstacles
  ADD CONSTRAINT task_obstacles_status_check_p7
  CHECK (status IN ('寰呭鐞?, '澶勭悊涓?, '宸茶В鍐?));

INSERT INTO task_critical_overrides (
  id,
  project_id,
  task_id,
  mode,
  anchor_type,
  left_task_id,
  right_task_id,
  reason,
  created_by,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  t.project_id,
  t.id,
  'manual_attention',
  NULL,
  NULL,
  NULL,
  'migrated from legacy is_critical flag',
  NULL,
  COALESCE(t.updated_at, t.created_at, NOW()),
  COALESCE(t.updated_at, t.created_at, NOW())
FROM tasks t
WHERE COALESCE(t.is_critical, FALSE) = TRUE
  AND t.project_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM task_critical_overrides o
    WHERE o.project_id = t.project_id
      AND o.task_id = t.id
      AND o.mode = 'manual_attention'
  );

-- ============================================================
-- 120_create_engineering_objects.sql — v1.4.1 Engineering objects master data
-- ============================================================
CREATE TABLE IF NOT EXISTS engineering_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL
    CHECK (object_type IN ('phase','section','building','basement','floor','physical_zone','functional_area')),
  object_code TEXT NOT NULL,
  object_name TEXT NOT NULL,
  parent_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  path TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive')),
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_ref_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, object_type, object_code)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_engineering_objects_root_active_name
  ON engineering_objects (project_id, object_name)
  WHERE parent_id IS NULL AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_engineering_objects_child_active_name
  ON engineering_objects (project_id, parent_id, object_name)
  WHERE parent_id IS NOT NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_engineering_objects_project_type_status
  ON engineering_objects (project_id, object_type, status);

CREATE INDEX IF NOT EXISTS idx_engineering_objects_project_parent_sort
  ON engineering_objects (project_id, parent_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_engineering_objects_project_path
  ON engineering_objects (project_id, path);

DROP FUNCTION IF EXISTS public.update_engineering_objects_updated_at() CASCADE;
CREATE FUNCTION public.update_engineering_objects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_engineering_objects_updated_at ON engineering_objects;
CREATE TRIGGER trigger_update_engineering_objects_updated_at
  BEFORE UPDATE ON engineering_objects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_engineering_objects_updated_at();

ALTER TABLE engineering_objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engineering_objects_select_policy ON engineering_objects;
CREATE POLICY engineering_objects_select_policy ON engineering_objects
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = engineering_objects.project_id
        AND pm.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'company_admin'
    )
    OR
    (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS engineering_objects_insert_policy ON engineering_objects;
CREATE POLICY engineering_objects_insert_policy ON engineering_objects
  FOR INSERT
  WITH CHECK (
    (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS engineering_objects_update_policy ON engineering_objects;
CREATE POLICY engineering_objects_update_policy ON engineering_objects
  FOR UPDATE
  USING (
    (SELECT current_setting('role', true) = 'service_role')
  )
  WITH CHECK (
    (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS engineering_objects_delete_policy ON engineering_objects;
CREATE POLICY engineering_objects_delete_policy ON engineering_objects
  FOR DELETE
  USING (
    (SELECT current_setting('role', true) = 'service_role')
  );

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS engineering_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS phase_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS section_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS building_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS floor_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS basement_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS physical_zone_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS functional_area_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_engineering_object_id ON tasks(engineering_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_phase_object_id ON tasks(phase_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_section_object_id ON tasks(section_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_building_object_id ON tasks(building_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_floor_object_id ON tasks(floor_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_basement_object_id ON tasks(basement_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_physical_zone_object_id ON tasks(physical_zone_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_functional_area_object_id ON tasks(functional_area_object_id);

ALTER TABLE acceptance_plans
  ADD COLUMN IF NOT EXISTS building_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_acceptance_plans_building_object_id
  ON acceptance_plans(building_object_id);

-- ============================================================
-- 121_add_wbs_engineering_categories.sql
-- ============================================================

-- ============================================================
-- 1. Engineering categories (WBS work classification tree)
-- ============================================================
CREATE TABLE IF NOT EXISTS engineering_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES engineering_categories(id) ON DELETE SET NULL,
  category_name TEXT NOT NULL,
  category_type TEXT NOT NULL
    CHECK (category_type IN ('division','sub_division','item_work','process','activity_step','custom')),
  category_level INTEGER NOT NULL DEFAULT 1,
  category_path TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Same-parent enabled name uniqueness (handles both project=NULL and project=value)
CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_system_enabled_name
  ON engineering_categories (category_name)
  WHERE project_id IS NULL AND parent_id IS NULL AND enabled = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_project_root_enabled_name
  ON engineering_categories (project_id, category_name)
  WHERE project_id IS NOT NULL AND parent_id IS NULL AND enabled = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_project_child_enabled_name
  ON engineering_categories (project_id, parent_id, category_name)
  WHERE project_id IS NOT NULL AND parent_id IS NOT NULL AND enabled = true;

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_eng_cat_project_type
  ON engineering_categories (project_id, category_type) WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eng_cat_system_type
  ON engineering_categories (category_type) WHERE project_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_eng_cat_project_parent_sort
  ON engineering_categories (project_id, parent_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_eng_cat_path
  ON engineering_categories (category_path);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_engineering_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_engineering_categories_updated_at ON engineering_categories;
CREATE TRIGGER trigger_update_engineering_categories_updated_at
  BEFORE UPDATE ON engineering_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_engineering_categories_updated_at();

-- RLS
ALTER TABLE engineering_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engineering_categories_select_policy ON engineering_categories;
CREATE POLICY engineering_categories_select_policy ON engineering_categories
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = engineering_categories.project_id
        AND pm.user_id = auth.uid()
    )
    OR engineering_categories.project_id IS NULL
    OR
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'company_admin'
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS engineering_categories_insert_policy ON engineering_categories;
CREATE POLICY engineering_categories_insert_policy ON engineering_categories
  FOR INSERT WITH CHECK (
    (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS engineering_categories_update_policy ON engineering_categories;
CREATE POLICY engineering_categories_update_policy ON engineering_categories
  FOR UPDATE USING ((SELECT current_setting('role', true) = 'service_role'))
  WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

DROP POLICY IF EXISTS engineering_categories_delete_policy ON engineering_categories;
CREATE POLICY engineering_categories_delete_policy ON engineering_categories
  FOR DELETE USING ((SELECT current_setting('role', true) = 'service_role'));

-- ============================================================
-- 2. WBS semantic columns on tasks
-- ============================================================
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS engineering_category_id UUID REFERENCES engineering_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wbs_node_type TEXT,
  ADD COLUMN IF NOT EXISTS wbs_path TEXT,
  ADD COLUMN IF NOT EXISTS is_leaf BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_wbs_summary BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_executable BOOLEAN,
  ADD COLUMN IF NOT EXISTS standard_work_code TEXT,
  ADD COLUMN IF NOT EXISTS standard_work_name TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_engineering_category_id ON tasks(engineering_category_id);
CREATE INDEX IF NOT EXISTS idx_tasks_wbs_node_type ON tasks(project_id, wbs_node_type);
CREATE INDEX IF NOT EXISTS idx_tasks_is_executable ON tasks(project_id, is_executable) WHERE is_executable = true;

-- ============================================================
-- 3. WBS semantic snapshot columns on task_baseline_items
-- ============================================================
ALTER TABLE task_baseline_items
  ADD COLUMN IF NOT EXISTS engineering_category_id UUID,
  ADD COLUMN IF NOT EXISTS wbs_node_type TEXT,
  ADD COLUMN IF NOT EXISTS wbs_path TEXT,
  ADD COLUMN IF NOT EXISTS is_wbs_summary BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_executable BOOLEAN,
  ADD COLUMN IF NOT EXISTS standard_work_code TEXT,
  ADD COLUMN IF NOT EXISTS standard_work_name TEXT,
  ADD COLUMN IF NOT EXISTS scope_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS wbs_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS task_fact_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS task_code_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS status_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_source TEXT NOT NULL DEFAULT 'current_execution_fact',
  ADD COLUMN IF NOT EXISTS snapshot_captured_at TIMESTAMPTZ;

-- ============================================================
-- 4. WBS semantic snapshot columns on monthly_plan_items
-- ============================================================
ALTER TABLE monthly_plan_items
  ADD COLUMN IF NOT EXISTS engineering_category_id UUID,
  ADD COLUMN IF NOT EXISTS wbs_node_type TEXT,
  ADD COLUMN IF NOT EXISTS wbs_path TEXT,
  ADD COLUMN IF NOT EXISTS is_wbs_summary BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_executable BOOLEAN,
  ADD COLUMN IF NOT EXISTS standard_work_code TEXT,
  ADD COLUMN IF NOT EXISTS standard_work_name TEXT,
  ADD COLUMN IF NOT EXISTS scope_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS wbs_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS task_fact_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS task_code_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS status_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_source TEXT NOT NULL DEFAULT 'baseline_commitment_snapshot',
  ADD COLUMN IF NOT EXISTS snapshot_captured_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_task_baseline_items_snapshot_source
  ON task_baseline_items(project_id, snapshot_source);
CREATE INDEX IF NOT EXISTS idx_monthly_plan_items_snapshot_source
  ON monthly_plan_items(project_id, snapshot_source);
CREATE INDEX IF NOT EXISTS idx_task_baseline_items_scope_snapshot
  ON task_baseline_items USING GIN (scope_snapshot);
CREATE INDEX IF NOT EXISTS idx_monthly_plan_items_scope_snapshot
  ON monthly_plan_items USING GIN (scope_snapshot);


-- ============================================================
-- 122_create_construction_task_standard_model.sql
-- ============================================================

-- ============================================================
-- 0. Pre-flight: detect existing task_dependencies structure
-- ============================================================
DO $$
DECLARE
  has_predecessor_col BOOLEAN;
  has_task_id_col BOOLEAN;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'task_dependencies'
  ) THEN
    -- Check column structure
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'task_dependencies'
        AND column_name = 'predecessor_id'
    ) INTO has_predecessor_col;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'task_dependencies'
        AND column_name = 'task_id'
    ) INTO has_task_id_col;

    -- If old structure (predecessor_id without task_id), rename to v1.4.3 standard
    IF has_predecessor_col AND NOT has_task_id_col THEN
      ALTER TABLE public.task_dependencies RENAME COLUMN predecessor_id TO task_id;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'task_dependencies'
          AND column_name = 'successor_id'
      ) THEN
        ALTER TABLE public.task_dependencies RENAME COLUMN successor_id TO dependency_task_id;
      END IF;
      RAISE NOTICE 'task_dependencies migrated from predecessor/successor to task_id/dependency_task_id';
    END IF;
  END IF;
END $$;

-- ============================================================
-- 1. Task dependencies standard table
-- ============================================================
CREATE TABLE IF NOT EXISTS task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dependency_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'FS'
    CHECK (dependency_type IN ('FS','SS','FF','SF')),
  lag_days INTEGER NOT NULL DEFAULT 0,
  required_for_start BOOLEAN NOT NULL DEFAULT true,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_ref_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT task_dependencies_not_self CHECK (task_id <> dependency_task_id)
);

-- Add constraint if not exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_dependencies_not_self'
  ) THEN
    ALTER TABLE task_dependencies ADD CONSTRAINT task_dependencies_not_self CHECK (task_id <> dependency_task_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_task_dependencies_unique
  ON task_dependencies(project_id, task_id, dependency_task_id, dependency_type);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_task
  ON task_dependencies(project_id, task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_dependency
  ON task_dependencies(project_id, dependency_task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_required
  ON task_dependencies(project_id, required_for_start);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_source
  ON task_dependencies(project_id, source_type);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_task_dependencies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_task_dependencies_updated_at ON task_dependencies;
CREATE TRIGGER trigger_update_task_dependencies_updated_at
  BEFORE UPDATE ON task_dependencies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_task_dependencies_updated_at();

-- RLS
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_dependencies_select_policy ON task_dependencies;
CREATE POLICY task_dependencies_select_policy ON task_dependencies
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = task_dependencies.project_id
        AND pm.user_id = auth.uid()
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS task_dependencies_insert_policy ON task_dependencies;
CREATE POLICY task_dependencies_insert_policy ON task_dependencies
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = task_dependencies.project_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'editor')
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS task_dependencies_update_policy ON task_dependencies;
CREATE POLICY task_dependencies_update_policy ON task_dependencies
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = task_dependencies.project_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'editor')
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS task_dependencies_delete_policy ON task_dependencies;
CREATE POLICY task_dependencies_delete_policy ON task_dependencies
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = task_dependencies.project_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'editor')
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

-- ============================================================
-- 2. Task standard fields
-- ============================================================
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS task_code TEXT,
  ADD COLUMN IF NOT EXISTS task_code_version TEXT,
  ADD COLUMN IF NOT EXISTS progress_method TEXT NOT NULL DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS planned_quantity NUMERIC,
  ADD COLUMN IF NOT EXISTS completed_quantity NUMERIC,
  ADD COLUMN IF NOT EXISTS quantity_unit TEXT,
  ADD COLUMN IF NOT EXISTS progress_weight NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS completion_rule TEXT NOT NULL DEFAULT 'progress_100',
  ADD COLUMN IF NOT EXISTS drawing_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS material_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acceptance_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quality_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS standard_task_metadata JSONB NOT NULL DEFAULT '{}';

-- Constraint: progress_method check (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_progress_method_check') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_progress_method_check
      CHECK (progress_method IN ('percent','quantity','milestone','manual_weighted'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_completion_rule_check') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_completion_rule_check
      CHECK (completion_rule IN ('progress_100','quantity_completed','acceptance_passed','manual_confirmed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_progress_weight_positive_check') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_progress_weight_positive_check
      CHECK (progress_weight > 0);
  END IF;
END $$;

-- task_code unique per project
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_project_task_code
  ON tasks(project_id, task_code)
  WHERE task_code IS NOT NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_project_executable
  ON tasks(project_id, is_executable, status);
CREATE INDEX IF NOT EXISTS idx_tasks_task_code
  ON tasks(task_code) WHERE task_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_progress_method
  ON tasks(project_id, progress_method);

-- ============================================================
-- 3. Backfill defaults for existing tasks
-- ============================================================
UPDATE tasks
SET
  progress_method = COALESCE(progress_method, 'percent'),
  completion_rule = COALESCE(completion_rule, 'progress_100'),
  progress_weight = COALESCE(progress_weight, 1),
  standard_task_metadata = COALESCE(standard_task_metadata, '{}'::jsonb)
WHERE progress_method IS NULL OR completion_rule IS NULL OR progress_weight IS NULL OR standard_task_metadata IS NULL;



-- 121a_add_engineering_categories_standard_fields.sql

ALTER TABLE engineering_categories
  ADD COLUMN IF NOT EXISTS standard_work_code TEXT,
  ADD COLUMN IF NOT EXISTS standard_work_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_project_enabled_name
  ON engineering_categories (project_id, COALESCE(parent_id::text, '_root_'), category_name)
  WHERE enabled = true;


-- 122 trigger: same-project validation for task_dependencies
-- Same-project trigger: ensure task_id and dependency_task_id match project_id
CREATE OR REPLACE FUNCTION public.check_task_dependencies_same_project()
RETURNS TRIGGER AS $$
DECLARE
  task_project UUID;
  dep_project UUID;
BEGIN
  SELECT project_id INTO task_project FROM tasks WHERE id = NEW.task_id;
  SELECT project_id INTO dep_project FROM tasks WHERE id = NEW.dependency_task_id;
  IF task_project IS NULL OR dep_project IS NULL THEN
    RAISE EXCEPTION 'Task or dependency task not found';
  END IF;
  IF task_project != dep_project THEN
    RAISE EXCEPTION 'task_id (%) and dependency_task_id (%) belong to different projects', NEW.task_id, NEW.dependency_task_id;
  END IF;
  IF NEW.project_id IS NULL THEN
    NEW.project_id = task_project;
  ELSIF NEW.project_id != task_project THEN
    RAISE EXCEPTION 'project_id mismatch: task % belongs to project %, not %', NEW.task_id, task_project, NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_task_dependencies_same_project ON task_dependencies;
CREATE TRIGGER trigger_check_task_dependencies_same_project
  BEFORE INSERT OR UPDATE ON task_dependencies
  FOR EACH ROW
  EXECUTE FUNCTION public.check_task_dependencies_same_project();


-- 122 replace_task_dependencies RPC
-- Atomic replace_task_dependencies RPC: delete all old + insert all new in one transaction
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
  new_row task_dependencies;
  dep_ids UUID[];
BEGIN
  -- Delete old
  DELETE FROM task_dependencies WHERE task_id = p_task_id;

  -- Insert new
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
    -- rows are returned after the cache sync below
  END LOOP;

  -- Sync tasks.dependencies cache
  SELECT array_agg(dependency_task_id) INTO dep_ids
    FROM task_dependencies WHERE task_id = p_task_id;
  UPDATE tasks SET dependencies = COALESCE(dep_ids, '{}') WHERE id = p_task_id;

  RETURN QUERY SELECT * FROM task_dependencies WHERE task_id = p_task_id;
END;
$$;


-- 123_create_task_code_rules.sql

-- ============================================================
-- 1. projects: project_code
-- ============================================================
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_code TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_code_generated_at TIMESTAMPTZ;
CREATE SEQUENCE IF NOT EXISTS project_code_seq START WITH 1 INCREMENT BY 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_project_code
  ON projects(project_code) WHERE project_code IS NOT NULL;

-- ============================================================
-- 2. tasks: task_code_rule_id / task_code_generated_at
-- ============================================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_code_rule_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_code_generated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tasks_task_code_rule_id
  ON tasks(task_code_rule_id) WHERE task_code_rule_id IS NOT NULL;

-- ============================================================
-- 3. engineering_categories: standard_work_code idempotent confirm
-- ============================================================
ALTER TABLE engineering_categories ADD COLUMN IF NOT EXISTS standard_work_code TEXT;
ALTER TABLE engineering_categories ADD COLUMN IF NOT EXISTS standard_work_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_system_standard_work_code
  ON engineering_categories(standard_work_code)
  WHERE project_id IS NULL AND standard_work_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_project_standard_work_code
  ON engineering_categories(project_id, standard_work_code)
  WHERE project_id IS NOT NULL AND standard_work_code IS NOT NULL;

-- ============================================================
-- 4. project_task_code_rules
-- ============================================================
CREATE TABLE IF NOT EXISTS project_task_code_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL DEFAULT '默认任务编码规则',
  rule_version TEXT NOT NULL DEFAULT 'v1',
  delimiter TEXT NOT NULL DEFAULT '-',
  sequence_length INTEGER NOT NULL DEFAULT 3,
  include_project BOOLEAN NOT NULL DEFAULT true,
  include_phase BOOLEAN NOT NULL DEFAULT true,
  include_section BOOLEAN NOT NULL DEFAULT true,
  include_building BOOLEAN NOT NULL DEFAULT true,
  include_floor BOOLEAN NOT NULL DEFAULT true,
  include_zone BOOLEAN NOT NULL DEFAULT true,
  include_professional BOOLEAN NOT NULL DEFAULT true,
  include_work_code BOOLEAN NOT NULL DEFAULT true,
  enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_task_code_rules_enabled
  ON project_task_code_rules(project_id) WHERE enabled = true;

ALTER TABLE project_task_code_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_task_code_rules_select_policy ON project_task_code_rules;
CREATE POLICY project_task_code_rules_select_policy ON project_task_code_rules
  FOR SELECT USING ((SELECT current_setting('role', true) = 'service_role'));
DROP POLICY IF EXISTS project_task_code_rules_write_policy ON project_task_code_rules;
CREATE POLICY project_task_code_rules_write_policy ON project_task_code_rules
  FOR ALL USING ((SELECT current_setting('role', true) = 'service_role'))
  WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

-- ============================================================
-- 5. task_code_sequences
-- ============================================================
CREATE TABLE IF NOT EXISTS task_code_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES project_task_code_rules(id) ON DELETE CASCADE,
  sequence_key TEXT NOT NULL,
  current_value INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, rule_id, sequence_key)
);

ALTER TABLE task_code_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_code_sequences_policy ON task_code_sequences;
CREATE POLICY task_code_sequences_policy ON task_code_sequences
  FOR ALL USING ((SELECT current_setting('role', true) = 'service_role'))
  WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

-- ============================================================
-- 6. task_code_history
-- ============================================================
CREATE TABLE IF NOT EXISTS task_code_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  old_task_code TEXT,
  new_task_code TEXT NOT NULL,
  change_reason TEXT NOT NULL,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_task_code_history_task_id
  ON task_code_history(task_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_code_history_project_id
  ON task_code_history(project_id, changed_at DESC);

ALTER TABLE task_code_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_code_history_select_policy ON task_code_history;
CREATE POLICY task_code_history_select_policy ON task_code_history
  FOR SELECT USING ((SELECT current_setting('role', true) = 'service_role'));
DROP POLICY IF EXISTS task_code_history_write_policy ON task_code_history;
CREATE POLICY task_code_history_write_policy ON task_code_history
  FOR INSERT WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

-- ============================================================
-- 7. FK: tasks.task_code_rule_id -> project_task_code_rules
-- ============================================================
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_task_code_rule_id_fkey;
ALTER TABLE tasks ADD CONSTRAINT tasks_task_code_rule_id_fkey
  FOREIGN KEY (task_code_rule_id) REFERENCES project_task_code_rules(id) ON DELETE SET NULL;


-- 124_create_status_dictionary_system.sql

-- ============================================================
-- 1. status_dictionary_versions (created first for FK references)
-- ============================================================
CREATE TABLE IF NOT EXISTS status_dictionary_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_key TEXT NOT NULL UNIQUE,
  version_name TEXT NOT NULL,
  change_reason TEXT NOT NULL,
  content_hash TEXT,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

-- Bootstrap the current version
INSERT INTO status_dictionary_versions (version_key, version_name, change_reason)
VALUES ('v1.4.5', 'v1.4.5 Initial Status Dictionary', 'System bootstrap')
ON CONFLICT (version_key) DO NOTHING;

-- ============================================================
-- 2. status_domains
-- ============================================================
CREATE TABLE IF NOT EXISTS status_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_key TEXT NOT NULL UNIQUE,
  domain_name TEXT NOT NULL,
  domain_group TEXT NOT NULL,
  status_kind TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status_kind IN ('lifecycle','derived','stage','activation','adjacent','technical'))
);

-- Bootstrap core domains
INSERT INTO status_domains (domain_key, domain_name, domain_group, status_kind) VALUES
  ('task.lifecycle', '任务生命周期', 'task', 'lifecycle'),
  ('task.business_status', '任务业务状态', 'task', 'derived'),
  ('task.lag_status', '任务滞后状态', 'task', 'derived'),
  ('task.due_status', '任务到期状态', 'task', 'derived'),
  ('baseline.lifecycle', '项目基线生命周期', 'planning', 'lifecycle'),
  ('monthly_plan.lifecycle', '月度计划生命周期', 'planning', 'lifecycle'),
  ('milestone.lifecycle', '里程碑生命周期', 'milestone', 'lifecycle'),
  ('condition.lifecycle', '条件生命周期', 'condition', 'lifecycle'),
  ('obstacle.lifecycle', '阻碍生命周期', 'obstacle', 'lifecycle'),
  ('risk.lifecycle', '风险生命周期', 'risk', 'lifecycle'),
  ('issue.lifecycle', '问题生命周期', 'issue', 'lifecycle'),
  ('warning.lifecycle', '预警生命周期', 'warning', 'lifecycle'),
  ('notification.lifecycle', '通知生命周期', 'notification', 'lifecycle'),
  ('acceptance.lifecycle', '验收生命周期', 'acceptance', 'lifecycle'),
  ('certificate.lifecycle', '证照生命周期', 'certificate', 'lifecycle'),
  ('certificate.stage', '证照阶段', 'certificate', 'stage'),
  ('drawing.lifecycle', '图纸生命周期', 'drawing', 'lifecycle'),
  ('drawing.review_status', '图纸审查状态', 'drawing', 'derived'),
  ('project.lifecycle', '项目生命周期', 'project', 'lifecycle'),
  ('project.phase', '项目阶段', 'project', 'stage'),
  ('project.health', '项目健康状态', 'project', 'derived'),
  ('material.derived_status', '材料派生状态', 'material', 'derived'),
  ('wbs_template.lifecycle', 'WBS模板生命周期', 'template', 'lifecycle'),
  ('engineering_object.activation', '工程对象启停', 'master_data', 'activation'),
  ('engineering_category.activation', '工程分类启停', 'master_data', 'activation'),
  ('invitation.lifecycle', '邀请生命周期', 'collaboration', 'lifecycle'),
  ('data_quality.finding_status', '数据质量发现状态', 'governance', 'lifecycle'),
  ('data_quality.confidence_flag', '数据可信度', 'governance', 'adjacent'),
  ('task_completion.efficiency_status', '任务完成效率', 'task', 'derived'),
  ('progress_deviation.row_status', '进度偏差行状态', 'report', 'derived'),
  ('delay_signal.derived_status', '延期信号派生', 'task', 'derived')
ON CONFLICT (domain_key) DO NOTHING;

-- ============================================================
-- 3. status_values
-- ============================================================
CREATE TABLE IF NOT EXISTS status_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_key TEXT NOT NULL REFERENCES status_domains(domain_key) ON DELETE CASCADE,
  status_key TEXT NOT NULL,
  status_label TEXT NOT NULL,
  status_label_short TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_initial BOOLEAN NOT NULL DEFAULT false,
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  visual_tone TEXT,
  semantic_tone TEXT,
  dictionary_version TEXT NOT NULL DEFAULT 'v1.4.5',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deprecated_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain_key, status_key)
);

-- Bootstrap core status values
INSERT INTO status_values (domain_key, status_key, status_label, sort_order, is_initial, is_terminal, visual_tone, semantic_tone) VALUES
  ('task.lifecycle', 'todo', '待办', 1, false, false, 'slate', 'open'),
  ('task.lifecycle', 'pending', '待定', 2, true, false, 'slate', 'open'),
  ('task.lifecycle', 'in_progress', '进行中', 3, false, false, 'blue', 'active'),
  ('task.lifecycle', 'blocked', '受阻', 4, false, false, 'amber', 'blocked'),
  ('task.lifecycle', 'completed', '已完成', 5, false, true, 'green', 'closed'),
  ('task.lifecycle', 'cancelled', '已取消', 6, false, true, 'slate', 'closed'),
  ('risk.lifecycle', 'identified', '已识别', 1, true, false, 'amber', 'open'),
  ('risk.lifecycle', 'mitigating', '缓解中', 2, false, false, 'blue', 'active'),
  ('risk.lifecycle', 'closed', '已关闭', 3, false, true, 'green', 'closed'),
  ('issue.lifecycle', 'open', '未解决', 1, true, false, 'red', 'open'),
  ('issue.lifecycle', 'investigating', '调查中', 2, false, false, 'amber', 'active'),
  ('issue.lifecycle', 'resolved', '已解决', 3, false, false, 'blue', 'active'),
  ('issue.lifecycle', 'closed', '已关闭', 4, false, true, 'green', 'closed'),
  ('condition.lifecycle', 'open', '待满足', 1, true, false, 'slate', 'open'),
  ('condition.lifecycle', 'met', '已满足', 2, false, false, 'blue', 'active'),
  ('condition.lifecycle', 'confirmed', '已确认', 3, false, true, 'green', 'closed'),
  ('condition.lifecycle', 'blocked', '受阻', 4, false, false, 'amber', 'blocked'),
  ('condition.lifecycle', 'closed', '已关闭', 5, false, true, 'green', 'closed'),
  ('obstacle.lifecycle', 'open', '待处理', 1, true, false, 'amber', 'open'),
  ('obstacle.lifecycle', 'resolving', '处理中', 2, false, false, 'blue', 'active'),
  ('obstacle.lifecycle', 'resolved', '已解决', 3, false, true, 'green', 'closed'),
  ('obstacle.lifecycle', 'closed', '已关闭', 4, false, true, 'green', 'closed'),
  ('obstacle.lifecycle', 'unresolvable', '无法解决', 5, false, true, 'red', 'blocked'),
  ('acceptance.lifecycle', 'draft', '草稿', 1, true, false, 'slate', 'open'),
  ('acceptance.lifecycle', 'preparing', '准备中', 2, false, false, 'blue', 'active'),
  ('acceptance.lifecycle', 'ready_to_submit', '待报验', 3, false, false, 'amber', 'active'),
  ('acceptance.lifecycle', 'submitted', '已报验', 4, false, false, 'amber', 'active'),
  ('acceptance.lifecycle', 'inspecting', '验收中', 5, false, false, 'blue', 'active'),
  ('acceptance.lifecycle', 'rectifying', '整改中', 6, false, false, 'red', 'blocked'),
  ('acceptance.lifecycle', 'passed', '已通过', 7, false, true, 'green', 'closed'),
  ('acceptance.lifecycle', 'archived', '已归档', 8, false, true, 'green', 'closed'),
  ('project.lifecycle', 'not_started', '未开始', 1, true, false, 'slate', 'open'),
  ('project.lifecycle', 'in_progress', '进行中', 2, false, false, 'blue', 'active'),
  ('project.lifecycle', 'completed', '已完成', 3, false, true, 'green', 'closed'),
  ('project.lifecycle', 'paused', '已暂停', 4, false, false, 'amber', 'blocked'),
  ('project.health', 'healthy', '健康', 1, false, false, 'green', 'positive'),
  ('project.health', 'warning', '亚健康', 2, false, false, 'amber', 'caution'),
  ('project.health', 'critical', '预警', 3, false, false, 'red', 'negative'),
  ('project.health', 'danger', '危险', 4, false, false, 'red', 'negative')
ON CONFLICT (domain_key, status_key) DO NOTHING;

-- ============================================================
-- 4. status_aliases
-- ============================================================
CREATE TABLE IF NOT EXISTS status_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_key TEXT NOT NULL REFERENCES status_domains(domain_key) ON DELETE CASCADE,
  alias_value TEXT NOT NULL,
  status_key TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'legacy',
  dictionary_version TEXT NOT NULL DEFAULT 'v1.4.5',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deprecated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain_key, alias_value)
);

-- Add FK to status_values
ALTER TABLE status_aliases DROP CONSTRAINT IF EXISTS status_aliases_status_key_fkey;
ALTER TABLE status_aliases ADD CONSTRAINT status_aliases_status_key_fkey
  FOREIGN KEY (domain_key, status_key) REFERENCES status_values(domain_key, status_key) ON DELETE CASCADE;

-- Bootstrap legacy aliases
INSERT INTO status_aliases (domain_key, alias_value, status_key, source_type) VALUES
  ('task.lifecycle', 'not_started', 'todo', 'legacy'),
  ('task.lifecycle', '未开始', 'todo', 'legacy'),
  ('task.lifecycle', '进行中', 'in_progress', 'legacy'),
  ('task.lifecycle', '已完成', 'completed', 'legacy'),
  ('task.lifecycle', 'done', 'completed', 'legacy'),
  ('task.lifecycle', 'delayed', 'blocked', 'legacy'),
  ('task.lifecycle', 'on_hold', 'blocked', 'legacy'),
  ('task.lifecycle', '已取消', 'cancelled', 'legacy'),
  ('task.lifecycle', 'voided', 'cancelled', 'legacy'),
  ('task.lifecycle', 'archived', 'cancelled', 'legacy'),
  ('task.lifecycle', 'deleted', 'cancelled', 'legacy'),
  ('project.lifecycle', '未开始', 'not_started', 'legacy'),
  ('project.lifecycle', '进行中', 'in_progress', 'legacy'),
  ('project.lifecycle', '已完成', 'completed', 'legacy'),
  ('project.lifecycle', '已暂停', 'paused', 'legacy')
ON CONFLICT (domain_key, alias_value) DO NOTHING;

-- ============================================================
-- 5. status_transitions
-- ============================================================
CREATE TABLE IF NOT EXISTS status_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_key TEXT NOT NULL REFERENCES status_domains(domain_key) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  event_key TEXT,
  actor_scope TEXT NOT NULL DEFAULT 'system_or_user',
  guard_key TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  dictionary_version TEXT NOT NULL DEFAULT 'v1.4.5',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deprecated_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FK to status_values
ALTER TABLE status_transitions DROP CONSTRAINT IF EXISTS status_transitions_from_status_fkey;
ALTER TABLE status_transitions ADD CONSTRAINT status_transitions_from_status_fkey
  FOREIGN KEY (domain_key, from_status) REFERENCES status_values(domain_key, status_key) ON DELETE CASCADE;
ALTER TABLE status_transitions DROP CONSTRAINT IF EXISTS status_transitions_to_status_fkey;
ALTER TABLE status_transitions ADD CONSTRAINT status_transitions_to_status_fkey
  FOREIGN KEY (domain_key, to_status) REFERENCES status_values(domain_key, status_key) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_status_transitions_domain_from_to_event
  ON status_transitions(domain_key, from_status, to_status, COALESCE(event_key, ''));

-- Bootstrap task transitions
INSERT INTO status_transitions (domain_key, from_status, to_status) VALUES
  ('task.lifecycle', 'pending', 'todo'),
  ('task.lifecycle', 'todo', 'in_progress'),
  ('task.lifecycle', 'pending', 'in_progress'),
  ('task.lifecycle', 'in_progress', 'blocked'),
  ('task.lifecycle', 'in_progress', 'completed'),
  ('task.lifecycle', 'blocked', 'in_progress'),
  ('task.lifecycle', 'todo', 'cancelled'),
  ('task.lifecycle', 'pending', 'cancelled'),
  ('task.lifecycle', 'in_progress', 'cancelled'),
  ('task.lifecycle', 'blocked', 'cancelled')
ON CONFLICT (domain_key, from_status, to_status, COALESCE(event_key, '')) DO NOTHING;

-- Bootstrap risk transitions
INSERT INTO status_transitions (domain_key, from_status, to_status) VALUES
  ('risk.lifecycle', 'identified', 'mitigating'),
  ('risk.lifecycle', 'mitigating', 'closed'),
  ('risk.lifecycle', 'closed', 'identified')
ON CONFLICT (domain_key, from_status, to_status, COALESCE(event_key, '')) DO NOTHING;

-- Bootstrap issue transitions
INSERT INTO status_transitions (domain_key, from_status, to_status) VALUES
  ('issue.lifecycle', 'open', 'investigating'),
  ('issue.lifecycle', 'investigating', 'resolved'),
  ('issue.lifecycle', 'resolved', 'closed'),
  ('issue.lifecycle', 'resolved', 'investigating')
ON CONFLICT (domain_key, from_status, to_status, COALESCE(event_key, '')) DO NOTHING;

-- ============================================================
-- 6. status_derivation_rules
-- ============================================================
CREATE TABLE IF NOT EXISTS status_derivation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_key TEXT NOT NULL REFERENCES status_domains(domain_key) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  rule_order INTEGER NOT NULL DEFAULT 0,
  output_status TEXT NOT NULL,
  rule_description TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  dictionary_version TEXT NOT NULL DEFAULT 'v1.4.5',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deprecated_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain_key, rule_key)
);

ALTER TABLE status_derivation_rules DROP CONSTRAINT IF EXISTS status_derivation_rules_output_status_fkey;
ALTER TABLE status_derivation_rules ADD CONSTRAINT status_derivation_rules_output_status_fkey
  FOREIGN KEY (domain_key, output_status) REFERENCES status_values(domain_key, status_key) ON DELETE CASCADE;

-- ============================================================
-- 7. RLS on all status dictionary tables
-- ============================================================
ALTER TABLE status_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_derivation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_dictionary_versions ENABLE ROW LEVEL SECURITY;

-- All status tables: read for anyone, write for service_role only
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['status_domains','status_values','status_transitions','status_aliases','status_derivation_rules','status_dictionary_versions'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_read_policy ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_read_policy ON %I FOR SELECT USING (true)', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_write_policy ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_write_policy ON %I FOR ALL USING ((SELECT current_setting(''role'', true) = ''service_role'')) WITH CHECK ((SELECT current_setting(''role'', true) = ''service_role''))', tbl, tbl);
  END LOOP;
END $$;



-- 125_create_data_lineage_mapping_system.sql

-- ============================================================
-- 1. data_lineage_entity_types
-- ============================================================
CREATE TABLE IF NOT EXISTS data_lineage_entity_types (
  entity_type TEXT PRIMARY KEY,
  entity_name TEXT NOT NULL,
  entity_group TEXT NOT NULL,
  table_name TEXT,
  id_column TEXT NOT NULL DEFAULT 'id',
  project_id_column TEXT DEFAULT 'project_id',
  is_project_scoped BOOLEAN NOT NULL DEFAULT true,
  is_global_reference BOOLEAN NOT NULL DEFAULT false,
  is_business_lineage_allowed BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NOT (is_project_scoped AND is_global_reference))
);

-- Bootstrap entity types
INSERT INTO data_lineage_entity_types (entity_type, entity_name, entity_group, table_name, is_project_scoped, is_global_reference) VALUES
  ('wbs_template', 'WBS模板', 'planning', 'wbs_templates', false, true),
  ('wbs_template_node', 'WBS模板节点', 'planning', null, false, true),
  ('task_baseline', '项目基线', 'planning', 'task_baselines', true, false),
  ('task_baseline_item', '项目基线行', 'planning', 'task_baseline_items', true, false),
  ('monthly_plan', '月度计划', 'planning', 'monthly_plans', true, false),
  ('monthly_plan_item', '月度计划行', 'planning', 'monthly_plan_items', true, false),
  ('task', '施工任务', 'task', 'tasks', true, false),
  ('task_dependency', '任务依赖', 'task', 'task_dependencies', true, false),
  ('task_condition', '前置条件', 'task', 'task_conditions', true, false),
  ('task_obstacle', '阻碍事项', 'task', 'task_obstacles', true, false),
  ('milestone', '里程碑', 'milestone', 'milestones', true, false),
  ('risk', '风险', 'risk', 'risks', true, false),
  ('issue', '问题', 'issue', 'issues', true, false),
  ('warning', '预警', 'warning', 'warnings', true, false),
  ('notification', '通知', 'notification', 'notifications', true, false),
  ('acceptance_plan', '验收计划', 'acceptance', 'acceptance_plans', true, false),
  ('acceptance_dependency', '验收依赖', 'acceptance', 'acceptance_dependencies', true, false),
  ('acceptance_requirement', '验收条件', 'acceptance', 'acceptance_requirements', true, false),
  ('construction_drawing', '施工图纸', 'drawing', 'construction_drawings', true, false),
  ('drawing_package', '图纸包', 'drawing', 'drawing_packages', true, false),
  ('drawing_version', '图纸版本', 'drawing', 'drawing_versions', true, false),
  ('certificate', '证照', 'certificate', 'pre_milestones', true, false),
  ('certificate_work_item', '证照工作项', 'certificate', 'certificate_work_items', true, false),
  ('certificate_dependency', '证照依赖', 'certificate', 'certificate_dependencies', true, false),
  ('pre_milestone', '前置里程碑', 'certificate', 'pre_milestones', true, false),
  ('engineering_object', '工程对象', 'master_data', 'engineering_objects', true, false),
  ('engineering_category', '工程分类', 'master_data', 'engineering_categories', true, false),
  ('project_material', '材料', 'material', 'project_materials', true, false),
  ('change_log', '变更日志', 'governance', 'change_logs', true, false),
  ('data_quality_finding', '数据质量发现', 'governance', 'data_quality_findings', true, false),
  ('project_daily_snapshot', '项目日报', 'bi', 'project_daily_snapshot', true, false),
  ('task_progress_snapshot', '进度快照', 'task', 'task_progress_snapshots', true, false),
  ('standard_process', '标准工序', 'reference', 'standard_processes', false, true),
  ('acceptance_catalog', '验收目录', 'reference', 'acceptance_catalog', false, true),
  ('import_batch', '导入批次', 'import', null, true, false),
  ('external_record', '外部记录', 'external', null, false, true),
  ('task_progress_snapshot', '进度快照', 'task', 'task_progress_snapshots', true, false),
  ('task_timeline_event', '任务时间轴事件', 'task', 'task_timeline_events', true, false),
  ('task_milestone', '任务里程碑关联', 'task', 'task_milestones', true, false),
  ('task_critical_override', '关键路径人工干预', 'task', 'task_critical_overrides', true, false),
  ('task_preceding_relation', '任务前置关系', 'task', 'task_preceding_relations', true, false),
  ('acceptance_record', '验收记录', 'acceptance', 'acceptance_records', true, false),
  ('acceptance_catalog', '验收目录参考', 'reference', 'acceptance_catalog', false, true),
  ('drawing_review_rule', '图纸审查规则', 'drawing', 'drawing_review_rules', true, false),
  ('drawing_package_item', '图纸包明细', 'drawing', 'drawing_package_items', true, false),
  ('pre_milestone_condition', '前置里程碑条件', 'certificate', 'pre_milestone_conditions', true, false),
  ('pre_milestone_dependency', '前置里程碑依赖', 'certificate', 'pre_milestone_dependencies', true, false),
  ('certificate_approval', '证照审批历史', 'certificate', 'certificate_approvals', true, false),
  ('responsibility_watchlist', '责任预警清单', 'governance', 'responsibility_watchlist', true, false),
  ('weekly_digest', '周报', 'report', 'weekly_digests', true, false),
  ('risk_statistics', '风险统计快照', 'risk', 'risk_statistics', true, false),
  ('planning_governance_signal', '计划治理信号', 'planning', 'planning_governance', true, false),
  ('data_confidence_snapshot', '数据可信度快照', 'governance', 'data_confidence_snapshots', true, false),
  ('wbs_structure', '历史WBS结构', 'compat', 'wbs_structure', true, false),
  ('wbs_task_link', '历史WBS任务关联', 'compat', 'wbs_task_links', true, false),
  ('standard_process', '标准工序参考', 'reference', 'standard_processes', false, true)
ON CONFLICT (entity_type) DO NOTHING;

-- Technical objects: lineage not allowed
INSERT INTO data_lineage_entity_types (entity_type, entity_name, entity_group, is_business_lineage_allowed, is_project_scoped) VALUES
  ('operation_log', '操作日志', 'technical', false, false),
  ('task_lock', '任务锁', 'technical', false, false),
  ('planning_draft_lock', '计划草稿锁', 'technical', false, false),
  ('job_execution_log', '任务执行日志', 'technical', false, false),
  ('trigger_execution_log', '触发器执行日志', 'technical', false, false)
ON CONFLICT (entity_type) DO NOTHING;

-- ============================================================
-- 2. data_lineage_relation_rules
-- ============================================================
CREATE TABLE IF NOT EXISTS data_lineage_relation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity_type TEXT NOT NULL REFERENCES data_lineage_entity_types(entity_type),
  relation_type TEXT NOT NULL,
  target_entity_type TEXT NOT NULL REFERENCES data_lineage_entity_types(entity_type),
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_entity_type, relation_type, target_entity_type)
);

-- Bootstrap core relation rules
INSERT INTO data_lineage_relation_rules (source_entity_type, relation_type, target_entity_type) VALUES
  ('wbs_template_node', 'generates', 'task_baseline_item'),
  ('wbs_template_node', 'generates', 'task'),
  ('task_baseline_item', 'derives', 'monthly_plan_item'),
  ('monthly_plan_item', 'derives', 'task'),
  ('monthly_plan_item', 'carries_over_to', 'monthly_plan_item'),
  ('task', 'splits_into', 'task'),
  ('task', 'merged_from', 'task'),
  ('task', 'replaced_by', 'task'),
  ('import_batch', 'contains', 'task'),
  ('task', 'generates', 'task_baseline_item'),
  ('task', 'carries_over_to', 'monthly_plan_item'),
  ('risk', 'escalates_to', 'issue'),
  ('warning', 'escalates_to', 'risk'),
  ('task_obstacle', 'escalates_to', 'issue'),
  ('task_condition', 'blocks', 'task'),
  ('task_dependency', 'depends_on', 'task'),
  ('acceptance_plan', 'validates', 'task'),
  ('acceptance_dependency', 'depends_on', 'acceptance_plan'),
  ('construction_drawing', 'supports', 'task'),
  ('drawing_version', 'versions', 'construction_drawing'),
  ('project_material', 'supplies', 'task'),
  ('certificate', 'validates', 'milestone'),
  ('certificate_dependency', 'depends_on', 'certificate')
ON CONFLICT (source_entity_type, relation_type, target_entity_type) DO NOTHING;

-- ============================================================
-- 3. data_lineage_links
-- ============================================================
CREATE TABLE IF NOT EXISTS data_lineage_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  source_entity_type TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  target_entity_type TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  batch_ref TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lineage_links_project ON data_lineage_links(project_id);
CREATE INDEX IF NOT EXISTS idx_lineage_links_source ON data_lineage_links(source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_lineage_links_target ON data_lineage_links(target_entity_type, target_entity_id);
CREATE INDEX IF NOT EXISTS idx_lineage_links_batch ON data_lineage_links(batch_ref) WHERE batch_ref IS NOT NULL;

ALTER TABLE data_lineage_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS data_lineage_links_read_policy ON data_lineage_links;
CREATE POLICY data_lineage_links_read_policy ON data_lineage_links
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = data_lineage_links.project_id AND pm.user_id = auth.uid())
    OR (SELECT current_setting('role', true) = 'service_role')
  );
DROP POLICY IF EXISTS data_lineage_links_write_policy ON data_lineage_links;
CREATE POLICY data_lineage_links_write_policy ON data_lineage_links
  FOR INSERT WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

-- ============================================================
-- 4. AI Governance boundary (v1.4.6 §11)
-- AI tools may READ lineage for context, but must NOT directly write
-- lineage_links, tasks, or any production data. AI output is limited to
-- explanation, suggestion, and repair drafts only.
-- ============================================================
INSERT INTO data_lineage_entity_types (entity_type, entity_name, entity_group, is_business_lineage_allowed, is_project_scoped) VALUES
  ('ai_suggestion', 'AI建议草案', 'governance', false, false),
  ('ai_repair_draft', 'AI修复草案', 'governance', false, false),
  ('ai_context_query', 'AI上下文查询', 'governance', false, false)
ON CONFLICT (entity_type) DO NOTHING;

INSERT INTO data_lineage_relation_rules (source_entity_type, relation_type, target_entity_type) VALUES
  ('ai_context_query', 'reads', 'task'),
  ('ai_suggestion', 'suggests', 'task'),
  ('ai_repair_draft', 'drafts_fix_for', 'task')
ON CONFLICT (source_entity_type, relation_type, target_entity_type) DO NOTHING;


-- 126_complete_data_lineage_system.sql

-- ============================================================
-- 0. data_lineage_batches — track lineage batch operations
-- ============================================================
CREATE TABLE IF NOT EXISTS data_lineage_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  batch_type TEXT NOT NULL,
  link_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_data_lineage_batches_project ON data_lineage_batches(project_id, created_at DESC);

-- ============================================================
-- 1. data_import_batches — track import operations
-- ============================================================
CREATE TABLE IF NOT EXISTS data_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  import_type TEXT NOT NULL DEFAULT 'task_import',
  file_name TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  mapping_status TEXT NOT NULL DEFAULT 'pending',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_data_import_batches_project ON data_import_batches(project_id, created_at DESC);

-- ============================================================
-- 2. import_rows — per-row import tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS data_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES data_import_batches(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  target_entity_type TEXT NOT NULL DEFAULT 'task',
  target_entity_id UUID,
  source_data JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_import_rows_batch ON data_import_rows(batch_id);
CREATE INDEX IF NOT EXISTS idx_data_import_rows_target ON data_import_rows(target_entity_type, target_entity_id);

-- ============================================================
-- 3. lineage_events — who/when changed lineage
-- ============================================================
CREATE TABLE IF NOT EXISTS data_lineage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  link_id UUID REFERENCES data_lineage_links(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_data_lineage_events_project ON data_lineage_events(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_data_lineage_events_link ON data_lineage_events(link_id) WHERE link_id IS NOT NULL;

-- ============================================================
-- 4. Add mapping_status / confidence to data_lineage_links
-- ============================================================
ALTER TABLE data_lineage_links ADD COLUMN IF NOT EXISTS mapping_status TEXT;
ALTER TABLE data_lineage_links ADD COLUMN IF NOT EXISTS confidence REAL;

-- ============================================================
-- 4.1. Append-only trigger: data_lineage_events rejects UPDATE/DELETE
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_lineage_events_append_only()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'data_lineage_events is append-only: % not allowed', TG_OP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_lineage_events_append_only ON data_lineage_events;
CREATE TRIGGER trigger_lineage_events_append_only
  BEFORE UPDATE OR DELETE ON data_lineage_events
  FOR EACH ROW
  EXECUTE FUNCTION public.check_lineage_events_append_only();

-- Idempotency: unique active pair on data_lineage_links (one active link per source-target-type combination)
CREATE UNIQUE INDEX IF NOT EXISTS uq_data_lineage_links_active_pair
  ON data_lineage_links(source_entity_type, source_entity_id, relation_type, target_entity_type, target_entity_id);

-- Data completeness: mapping_status check
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'data_lineage_links_mapping_check') THEN
    ALTER TABLE data_lineage_links ADD CONSTRAINT data_lineage_links_mapping_check
      CHECK (mapping_status IS NULL OR mapping_status IN ('mapped', 'pending', 'broken', 'orphan', 'deprecated'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'data_lineage_links_confidence_check') THEN
    ALTER TABLE data_lineage_links ADD CONSTRAINT data_lineage_links_confidence_check
      CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));
  END IF;
END $$;

-- Idempotency key for data_lineage_batches
CREATE UNIQUE INDEX IF NOT EXISTS uq_data_lineage_batches_idempotent
  ON data_lineage_batches(project_id, batch_type, COALESCE(metadata->>'source_ref', ''));

-- ============================================================
-- 5. RLS on new tables
-- ============================================================
ALTER TABLE data_lineage_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_lineage_events ENABLE ROW LEVEL SECURITY;

-- Read policies
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['data_lineage_batches','data_import_batches','data_import_rows','data_lineage_events'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_read_policy ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_read_policy ON %I FOR SELECT USING (
      EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = %I.project_id AND pm.user_id = auth.uid())
      OR (SELECT current_setting(''role'', true) = ''service_role'')
    )', tbl, tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_write_policy ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_write_policy ON %I FOR INSERT WITH CHECK ((SELECT current_setting(''role'', true) = ''service_role''))', tbl, tbl);
  END LOOP;
END $$;



-- 128_create_project_entity_links.sql

CREATE TABLE IF NOT EXISTS project_entity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_entity_type TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  target_entity_type TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  relation_strength TEXT NOT NULL DEFAULT 'explicit',
  status TEXT NOT NULL DEFAULT 'active',
  source_ref_field TEXT,
  display_snapshot JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Constraints (idempotent via DO $$)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_entity_links_source_type_check') THEN
    ALTER TABLE project_entity_links ADD CONSTRAINT project_entity_links_source_type_check
      CHECK (source_entity_type IN ('drawing_package','construction_drawing','pre_milestone','certificate_work_item','acceptance_plan'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_entity_links_target_type_check') THEN
    ALTER TABLE project_entity_links ADD CONSTRAINT project_entity_links_target_type_check
      CHECK (target_entity_type IN ('task','task_condition','acceptance_requirement','pre_milestone','certificate_work_item'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_entity_links_relation_type_check') THEN
    ALTER TABLE project_entity_links ADD CONSTRAINT project_entity_links_relation_type_check
      CHECK (relation_type IN ('satisfies_condition','satisfies_acceptance_requirement','covers_task','references_certificate','blocks_task_start'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_entity_links_relation_strength_check') THEN
    ALTER TABLE project_entity_links ADD CONSTRAINT project_entity_links_relation_strength_check
      CHECK (relation_strength IN ('explicit','system_inferred','legacy_mapped'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_entity_links_status_check') THEN
    ALTER TABLE project_entity_links ADD CONSTRAINT project_entity_links_status_check
      CHECK (status IN ('active','inactive'));
  END IF;
END $$;

-- Unique active link
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_entity_links_unique_active
  ON project_entity_links(project_id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relation_type)
  WHERE status = 'active';

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_project_entity_links_source
  ON project_entity_links(project_id, source_entity_type, source_entity_id, status);
CREATE INDEX IF NOT EXISTS idx_project_entity_links_target
  ON project_entity_links(project_id, target_entity_type, target_entity_id, status);

-- RLS
ALTER TABLE project_entity_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_entity_links_read_policy ON project_entity_links;
CREATE POLICY project_entity_links_read_policy ON project_entity_links FOR SELECT
  USING (EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = project_entity_links.project_id AND pm.user_id = auth.uid())
    OR (SELECT current_setting('role', true) = 'service_role'));
DROP POLICY IF EXISTS project_entity_links_write_policy ON project_entity_links;
CREATE POLICY project_entity_links_write_policy ON project_entity_links FOR INSERT
  WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

-- Projection columns on task_conditions for v1.4.11 linkage
ALTER TABLE task_conditions
  ADD COLUMN IF NOT EXISTS source_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS source_entity_id TEXT,
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason TEXT,
  ADD COLUMN IF NOT EXISTS review_source_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS review_source_entity_id TEXT,
  ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ;

-- Projection columns on acceptance_requirements for v1.4.11 linkage
ALTER TABLE acceptance_requirements
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason TEXT,
  ADD COLUMN IF NOT EXISTS review_source_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS review_source_entity_id TEXT,
  ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_project_entity_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_project_entity_links_updated_at ON project_entity_links;
CREATE TRIGGER trigger_update_project_entity_links_updated_at
  BEFORE UPDATE ON project_entity_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_project_entity_links_updated_at();


-- 127_plan_truth_snapshot_boundaries.sql

-- Baseline rows are total-control commitment snapshots. They must preserve
-- the task facts used at generation/publish time instead of drifting with tasks.
ALTER TABLE task_baseline_items
  ADD COLUMN IF NOT EXISTS scope_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS wbs_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS task_fact_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS task_code_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS status_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_source TEXT NOT NULL DEFAULT 'current_execution_fact',
  ADD COLUMN IF NOT EXISTS snapshot_captured_at TIMESTAMPTZ;

-- Monthly plan rows are monthly commitment snapshots. They either inherit a
-- baseline snapshot or capture current execution facts when generated directly.
ALTER TABLE monthly_plan_items
  ADD COLUMN IF NOT EXISTS scope_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS wbs_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS task_fact_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS task_code_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS status_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_source TEXT NOT NULL DEFAULT 'baseline_commitment_snapshot',
  ADD COLUMN IF NOT EXISTS snapshot_captured_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_task_baseline_items_snapshot_source
  ON task_baseline_items(project_id, snapshot_source);

CREATE INDEX IF NOT EXISTS idx_monthly_plan_items_snapshot_source
  ON monthly_plan_items(project_id, snapshot_source);

CREATE INDEX IF NOT EXISTS idx_task_baseline_items_scope_snapshot
  ON task_baseline_items USING GIN (scope_snapshot);

CREATE INDEX IF NOT EXISTS idx_monthly_plan_items_scope_snapshot
  ON monthly_plan_items USING GIN (scope_snapshot);

-- Ensure the current migration's physical rules contain the plan snapshot links
-- used by v1.4.7 generation boundaries.
INSERT INTO data_lineage_relation_rules (source_entity_type, relation_type, target_entity_type)
VALUES
  ('task', 'generates', 'task_baseline_item'),
  ('task_baseline_item', 'derives', 'monthly_plan_item'),
  ('monthly_plan_item', 'carries_over_to', 'monthly_plan_item'),
  ('task', 'carries_over_to', 'monthly_plan_item')
ON CONFLICT (source_entity_type, relation_type, target_entity_type) DO NOTHING;


-- 129_v147_v1410_plan_governance_completion.sql

-- ============================================================
-- v1.4.7: Plan governance columns
-- ============================================================
ALTER TABLE task_baselines
  ADD COLUMN IF NOT EXISTS superseded_by_id UUID REFERENCES task_baselines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS publish_reason TEXT,
  ADD COLUMN IF NOT EXISTS governance_metadata JSONB NOT NULL DEFAULT '{}';

ALTER TABLE monthly_plans
  ADD COLUMN IF NOT EXISTS source_mode TEXT,
  ADD COLUMN IF NOT EXISTS generation_cutoff_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_snapshot_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_by_id UUID REFERENCES monthly_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS temporary_without_baseline BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS governance_metadata JSONB NOT NULL DEFAULT '{}';

ALTER TABLE monthly_plan_items
  ADD COLUMN IF NOT EXISTS manual_override_fields JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS generation_metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_generated_at TIMESTAMPTZ;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS planning_governance_metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_schedule_change_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_progress_snapshot_at TIMESTAMPTZ;

-- v1.4.7: Monthly plan status check + source_mode check
ALTER TABLE monthly_plans DROP CONSTRAINT IF EXISTS monthly_plans_status_check;
DO $$ BEGIN
  ALTER TABLE monthly_plans ADD CONSTRAINT monthly_plans_status_check
    CHECK (status IN ('draft','confirmed','closed','revising','pending_realign','archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE monthly_plans DROP CONSTRAINT IF EXISTS monthly_plans_source_mode_check;
DO $$ BEGIN
  ALTER TABLE monthly_plans ADD CONSTRAINT monthly_plans_source_mode_check
    CHECK (source_mode IS NULL OR source_mode IN ('baseline','schedule','mixed','manual','imported'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_plans_current_confirmed
  ON monthly_plans(project_id, month) WHERE status = 'confirmed';

-- ============================================================
-- v1.4.8: task_dependencies hardening
-- ============================================================
ALTER TABLE task_dependencies
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS inference_confidence TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS inference_reason TEXT,
  ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_satisfied BOOLEAN;

DO $$ BEGIN
  ALTER TABLE task_dependencies ADD CONSTRAINT task_dependencies_status_check
    CHECK (status IN ('active','inactive','archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE task_dependencies ADD CONSTRAINT task_dependencies_inference_confidence_check
    CHECK (inference_confidence IN ('high','medium','low'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Replace full unique index with active-only unique
DROP INDEX IF EXISTS uq_task_dependencies_unique;
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_dependencies_active_unique
  ON task_dependencies(project_id, task_id, dependency_task_id, dependency_type)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_task_dependencies_status ON task_dependencies(project_id, status);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_confidence ON task_dependencies(project_id, inference_confidence);

-- ============================================================
-- v1.4.8: task_conditions hardening
-- ============================================================
ALTER TABLE task_conditions
  ADD COLUMN IF NOT EXISTS condition_code TEXT,
  ADD COLUMN IF NOT EXISTS required_for_start BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS blocking_level TEXT NOT NULL DEFAULT 'soft',
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_ref_id UUID,
  ADD COLUMN IF NOT EXISTS inference_confidence TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS inference_reason TEXT,
  ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS governance_metadata JSONB NOT NULL DEFAULT '{}';

DO $$ BEGIN
  ALTER TABLE task_conditions ADD CONSTRAINT task_conditions_blocking_level_check
    CHECK (blocking_level IN ('hard','soft','info'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE task_conditions ADD CONSTRAINT task_conditions_inference_confidence_check
    CHECK (inference_confidence IN ('high','medium','low'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_task_conditions_constraint ON task_conditions(project_id, blocking_level, is_satisfied);
CREATE INDEX IF NOT EXISTS idx_task_conditions_confidence ON task_conditions(project_id, inference_confidence);

-- ============================================================
-- v1.4.8: task_obstacles hardening
-- ============================================================
ALTER TABLE task_obstacles
  ADD COLUMN IF NOT EXISTS obstacle_code TEXT,
  ADD COLUMN IF NOT EXISTS impact_level TEXT NOT NULL DEFAULT 'partial',
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_ref_id UUID,
  ADD COLUMN IF NOT EXISTS inference_confidence TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS inference_reason TEXT,
  ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS governance_metadata JSONB NOT NULL DEFAULT '{}';

DO $$ BEGIN
  ALTER TABLE task_obstacles ADD CONSTRAINT task_obstacles_impact_level_check
    CHECK (impact_level IN ('none','partial','severe','blocked'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE task_obstacles ADD CONSTRAINT task_obstacles_inference_confidence_check
    CHECK (inference_confidence IN ('high','medium','low'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_task_obstacles_constraint ON task_obstacles(project_id, impact_level, is_resolved);
CREATE INDEX IF NOT EXISTS idx_task_obstacles_confidence ON task_obstacles(project_id, inference_confidence);

-- ============================================================
-- v1.4.9: Milestone key node snapshots
-- ============================================================
CREATE TABLE IF NOT EXISTS project_key_node_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  baseline_version_id UUID REFERENCES task_baselines(id) ON DELETE SET NULL,
  monthly_plan_id UUID REFERENCES monthly_plans(id) ON DELETE SET NULL,
  snapshot_type TEXT NOT NULL DEFAULT 'generated',
  key_node_type TEXT NOT NULL DEFAULT 'milestone',
  source_task_ids UUID[] NOT NULL DEFAULT '{}',
  display_label TEXT NOT NULL,
  planned_date TIMESTAMPTZ,
  actual_date TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_key_node_snapshots_project ON project_key_node_snapshots(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_key_node_snapshots_baseline ON project_key_node_snapshots(baseline_version_id);
CREATE INDEX IF NOT EXISTS idx_key_node_snapshots_monthly ON project_key_node_snapshots(monthly_plan_id);

-- v1.4.9: tasks milestone indexes
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS key_node_type TEXT;
CREATE INDEX IF NOT EXISTS idx_tasks_project_milestones ON tasks(project_id, is_milestone, status);
CREATE INDEX IF NOT EXISTS idx_tasks_milestone_id ON tasks(milestone_id) WHERE milestone_id IS NOT NULL;

-- 130_reconcile_milestone_task_authority.sql
-- v1.4.9: Milestones are tasks.is_milestone=true rows.
-- Remove old FK to milestones table, enforce self-referencing within tasks.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS fk_tasks_milestone_id;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_milestone_id_fkey;

CREATE OR REPLACE FUNCTION public.check_task_milestone_reference()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.milestone_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.milestone_id IS NOT DISTINCT FROM NEW.milestone_id THEN
    RETURN NEW;
  END IF;
  IF NEW.milestone_id = NEW.id THEN
    RAISE EXCEPTION 'Task cannot reference itself as milestone: %', NEW.id;
  END IF;
  PERFORM 1 FROM tasks
    WHERE id = NEW.milestone_id
      AND project_id = NEW.project_id
      AND is_milestone = true
      AND status != 'cancelled'
    LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'milestone_id must reference a same-project active milestone task: %', NEW.milestone_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_task_milestone_reference ON tasks;
CREATE TRIGGER trigger_check_task_milestone_reference
  BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW
  WHEN (NEW.milestone_id IS NOT NULL)
  EXECUTE FUNCTION public.check_task_milestone_reference();

CREATE OR REPLACE FUNCTION public.cleanup_milestone_references_on_cancel()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.is_milestone = true THEN
    UPDATE tasks SET milestone_id = NULL WHERE milestone_id = OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cleanup_milestone_refs ON tasks;
CREATE TRIGGER trigger_cleanup_milestone_refs
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_milestone_references_on_cancel();
-- ============================================================
-- v1.4.10: participant_units hardening
-- ============================================================
ALTER TABLE participant_units
  ADD COLUMN IF NOT EXISTS unit_code TEXT,
  ADD COLUMN IF NOT EXISTS unit_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS governance_metadata JSONB NOT NULL DEFAULT '{}';

DO $$ BEGIN
  ALTER TABLE participant_units ADD CONSTRAINT participant_units_unit_status_check
    CHECK (unit_status IN ('active','inactive','archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_participant_units_project_status ON participant_units(project_id, unit_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_participant_units_project_name_active_unique
  ON participant_units(project_id, unit_name) WHERE unit_status = 'active';

-- v1.4.10: task_conditions participant_unit reference
ALTER TABLE task_conditions ADD COLUMN IF NOT EXISTS participant_unit_id UUID;
CREATE INDEX IF NOT EXISTS idx_task_conditions_participant_unit_id ON task_conditions(participant_unit_id);



-- 131_v147_v1411_closure_fixups.sql`n-- Final closure fixups for v1.4.7-v1.4.11 implementation boundaries.`n`n
-- v1.4.8 task constraint cache on current task facts.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS ready_for_start BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dependency_status TEXT NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS condition_status TEXT NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS obstacle_status TEXT NOT NULL DEFAULT 'clear',
  ADD COLUMN IF NOT EXISTS progress_impact_level TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS blocked_for_progress BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS readiness_summary JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS constraint_evaluated_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_dependency_status_check
    CHECK (dependency_status IN ('satisfied','blocking','not_applicable'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_condition_status_check
    CHECK (condition_status IN ('satisfied','blocking','not_applicable'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_obstacle_status_check
    CHECK (obstacle_status IN ('clear','warning','partial_impact','blocked','not_applicable'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_progress_impact_level_check
    CHECK (progress_impact_level IN ('none','warning','partial','blocked'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_constraint_status
  ON tasks(project_id, ready_for_start, progress_impact_level, blocked_for_progress);

ALTER TABLE task_obstacles
  ADD COLUMN IF NOT EXISTS progress_impact_level TEXT NOT NULL DEFAULT 'warning',
  ADD COLUMN IF NOT EXISTS blocking_scope TEXT NOT NULL DEFAULT 'progress',
  ADD COLUMN IF NOT EXISTS blocking_level TEXT NOT NULL DEFAULT 'warning';

DO $$ BEGIN
  ALTER TABLE task_obstacles ADD CONSTRAINT task_obstacles_progress_impact_level_check
    CHECK (progress_impact_level IN ('none','warning','partial','blocked'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE task_obstacles ADD CONSTRAINT task_obstacles_blocking_scope_check
    CHECK (blocking_scope IN ('none','start','progress','finish'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE task_obstacles ADD CONSTRAINT task_obstacles_blocking_level_check
    CHECK (blocking_level IN ('info','warning','partial','blocked'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS task_constraint_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  ready_for_start BOOLEAN NOT NULL DEFAULT true,
  dependency_status TEXT NOT NULL DEFAULT 'not_applicable',
  condition_status TEXT NOT NULL DEFAULT 'not_applicable',
  obstacle_status TEXT NOT NULL DEFAULT 'clear',
  progress_impact_level TEXT NOT NULL DEFAULT 'none',
  blocked_for_progress BOOLEAN NOT NULL DEFAULT false,
  readiness_summary JSONB NOT NULL DEFAULT '{}',
  source_event_type TEXT NOT NULL,
  source_event_key TEXT NOT NULL,
  calculation_version TEXT NOT NULL DEFAULT 'v1.4.8',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_constraint_snapshots_event_key
  ON task_constraint_snapshots(source_event_key);
CREATE INDEX IF NOT EXISTS idx_task_constraint_snapshots_task
  ON task_constraint_snapshots(project_id, task_id, created_at DESC);

-- v1.4.10 participant unit lifecycle vocabulary used by ordinary selectors.
ALTER TABLE participant_units DROP CONSTRAINT IF EXISTS participant_units_unit_status_check;
ALTER TABLE participant_units
  ADD CONSTRAINT participant_units_unit_status_check
  CHECK (unit_status IN ('active','disabled','archived'));

-- Included from 132_project_entity_link_delete_guards.sql
-- 132_project_entity_link_delete_guards.sql
-- v1.4.11 closure: protect source facts and retire target links on delete.

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_delete_active_project_entity_links()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_entity_type TEXT := TG_ARGV[0];
  v_active_count INTEGER := 0;
BEGIN
  SELECT COUNT(*)
    INTO v_active_count
    FROM public.project_entity_links
   WHERE project_id = OLD.project_id
     AND status = 'active'
     AND (
       (source_entity_type = v_entity_type AND source_entity_id = OLD.id::TEXT)
       OR (target_entity_type = v_entity_type AND target_entity_id = OLD.id::TEXT)
     );

  IF v_active_count > 0 THEN
    RAISE EXCEPTION
      'Cannot delete % % while active project_entity_links exist',
      v_entity_type,
      OLD.id
      USING ERRCODE = '23503';
  END IF;

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_target_project_entity_links_before_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_entity_type TEXT := TG_ARGV[0];
BEGIN
  UPDATE public.project_entity_links
     SET status = 'inactive',
         updated_at = NOW()
   WHERE project_id = OLD.project_id
     AND target_entity_type = v_entity_type
     AND target_entity_id = OLD.id::TEXT
     AND status = 'active';

  RETURN OLD;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.drawing_packages') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS prevent_delete_drawing_packages_active_links ON public.drawing_packages;
    CREATE TRIGGER prevent_delete_drawing_packages_active_links
      BEFORE DELETE ON public.drawing_packages
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_delete_active_project_entity_links('drawing_package');
  END IF;

  IF to_regclass('public.construction_drawings') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS prevent_delete_construction_drawings_active_links ON public.construction_drawings;
    CREATE TRIGGER prevent_delete_construction_drawings_active_links
      BEFORE DELETE ON public.construction_drawings
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_delete_active_project_entity_links('construction_drawing');
  END IF;

  IF to_regclass('public.pre_milestones') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS prevent_delete_pre_milestones_active_links ON public.pre_milestones;
    CREATE TRIGGER prevent_delete_pre_milestones_active_links
      BEFORE DELETE ON public.pre_milestones
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_delete_active_project_entity_links('pre_milestone');
  END IF;

  IF to_regclass('public.certificate_work_items') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS prevent_delete_certificate_work_items_active_links ON public.certificate_work_items;
    CREATE TRIGGER prevent_delete_certificate_work_items_active_links
      BEFORE DELETE ON public.certificate_work_items
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_delete_active_project_entity_links('certificate_work_item');
  END IF;

  IF to_regclass('public.acceptance_plans') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS prevent_delete_acceptance_plans_active_links ON public.acceptance_plans;
    CREATE TRIGGER prevent_delete_acceptance_plans_active_links
      BEFORE DELETE ON public.acceptance_plans
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_delete_active_project_entity_links('acceptance_plan');
  END IF;

  IF to_regclass('public.tasks') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS deactivate_task_project_entity_links_before_delete ON public.tasks;
    CREATE TRIGGER deactivate_task_project_entity_links_before_delete
      BEFORE DELETE ON public.tasks
      FOR EACH ROW
      EXECUTE FUNCTION public.deactivate_target_project_entity_links_before_delete('task');
  END IF;

  IF to_regclass('public.task_conditions') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS deactivate_task_condition_project_entity_links_before_delete ON public.task_conditions;
    CREATE TRIGGER deactivate_task_condition_project_entity_links_before_delete
      BEFORE DELETE ON public.task_conditions
      FOR EACH ROW
      EXECUTE FUNCTION public.deactivate_target_project_entity_links_before_delete('task_condition');
  END IF;

  IF to_regclass('public.acceptance_requirements') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS deactivate_acceptance_requirement_project_entity_links_before_delete ON public.acceptance_requirements;
    CREATE TRIGGER deactivate_acceptance_requirement_project_entity_links_before_delete
      BEFORE DELETE ON public.acceptance_requirements
      FOR EACH ROW
      EXECUTE FUNCTION public.deactivate_target_project_entity_links_before_delete('acceptance_requirement');
  END IF;
END $$;

COMMIT;

-- v1.4 final legacy-object closeout for deprecated bootstrap snapshots.
-- Supported bootstrap uses CLEAN_MIGRATION_V4.sql; this tail only makes accidental
-- execution of an older snapshot converge to the canonical final schema.
BEGIN;

DROP TABLE IF EXISTS public.task_milestones;
DROP TABLE IF EXISTS public.milestones;
DROP TABLE IF EXISTS public.warnings;
DROP TABLE IF EXISTS public.project_scope_dimensions;
DROP TABLE IF EXISTS public.scope_dimensions;
DROP TABLE IF EXISTS public.ai_duration_estimates;
DROP TABLE IF EXISTS public.wbs_task_links;
DROP TABLE IF EXISTS public.wbs_structure;

ALTER TABLE IF EXISTS public.users
  DROP COLUMN IF EXISTS role,
  DROP COLUMN IF EXISTS device_id;

ALTER TABLE IF EXISTS public.tasks
  DROP COLUMN IF EXISTS phase_id,
  DROP COLUMN IF EXISTS preceding_task_id,
  DROP COLUMN IF EXISTS responsible_unit,
  DROP COLUMN IF EXISTS assignee_unit;

ALTER TABLE IF EXISTS public.task_conditions
  DROP COLUMN IF EXISTS responsible_unit;

ALTER TABLE IF EXISTS public.acceptance_plans
  DROP COLUMN IF EXISTS task_id,
  DROP COLUMN IF EXISTS responsible_unit;

UPDATE public.project_members
SET permission_level = CASE
  WHEN permission_level = 'owner' THEN 'owner'
  ELSE 'editor'
END
WHERE permission_level IS NULL
   OR permission_level NOT IN ('owner', 'editor');

ALTER TABLE public.project_members
  ALTER COLUMN permission_level SET DEFAULT 'editor',
  ALTER COLUMN permission_level SET NOT NULL,
  DROP COLUMN IF EXISTS role;

ALTER TABLE public.project_members
  DROP CONSTRAINT IF EXISTS project_members_permission_level_check;
ALTER TABLE public.project_members
  ADD CONSTRAINT project_members_permission_level_check
    CHECK (permission_level IN ('owner', 'editor'));

UPDATE public.project_invitations
SET permission_level = 'editor'
WHERE permission_level IS NULL
   OR permission_level <> 'editor';

ALTER TABLE public.project_invitations
  ALTER COLUMN permission_level SET DEFAULT 'editor',
  ALTER COLUMN permission_level SET NOT NULL;

ALTER TABLE public.project_invitations
  DROP CONSTRAINT IF EXISTS project_invitations_permission_level_check;
ALTER TABLE public.project_invitations
  ADD CONSTRAINT project_invitations_permission_level_check
    CHECK (permission_level = 'editor');

NOTIFY pgrst, 'reload schema';

COMMIT;
