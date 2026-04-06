-- Migration 011: Add missing tables phase 2 (phases, wbs_template_nodes, dialog_frequency)
-- Date: 2026-03-23

-- 1. Create phases table (分期表)
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

-- 2. Create wbs_template_nodes table (WBS模板节点表)
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

-- 3. Create dialog_frequency_control table (弹窗频率控制表)
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

-- 4. Create dialog_frequency_settings table (弹窗频率配置表)
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
DROP POLICY IF EXISTS "phases_select_policy" ON phases;
CREATE POLICY "phases_select_policy" ON phases FOR SELECT
    USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = phases.project_id AND p.deleted_at IS NULL));

DROP POLICY IF EXISTS "phases_insert_policy" ON phases;
CREATE POLICY "phases_insert_policy" ON phases FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "phases_update_policy" ON phases;
CREATE POLICY "phases_update_policy" ON phases FOR UPDATE
    USING (auth.uid() IS NOT NULL);

-- RLS Policies for wbs_template_nodes
DROP POLICY IF EXISTS "wbs_template_nodes_select_policy" ON wbs_template_nodes;
CREATE POLICY "wbs_template_nodes_select_policy" ON wbs_template_nodes FOR SELECT
    USING (EXISTS (SELECT 1 FROM wbs_templates wt WHERE wt.id = wbs_template_nodes.template_id AND wt.deleted_at IS NULL));

DROP POLICY IF EXISTS "wbs_template_nodes_insert_policy" ON wbs_template_nodes;
CREATE POLICY "wbs_template_nodes_insert_policy" ON wbs_template_nodes FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "wbs_template_nodes_update_policy" ON wbs_template_nodes;
CREATE POLICY "wbs_template_nodes_update_policy" ON wbs_template_nodes FOR UPDATE
    USING (auth.uid() IS NOT NULL);

-- RLS Policies for dialog_frequency_control
DROP POLICY IF EXISTS "dialog_frequency_control_select_policy" ON dialog_frequency_control;
CREATE POLICY "dialog_frequency_control_select_policy" ON dialog_frequency_control FOR SELECT
    USING (user_id::text = auth.uid()::text OR user_id IS NULL);

DROP POLICY IF EXISTS "dialog_frequency_control_insert_policy" ON dialog_frequency_control;
CREATE POLICY "dialog_frequency_control_insert_policy" ON dialog_frequency_control FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "dialog_frequency_control_update_policy" ON dialog_frequency_control;
CREATE POLICY "dialog_frequency_control_update_policy" ON dialog_frequency_control FOR UPDATE
    USING (auth.uid() IS NOT NULL);

-- RLS Policies for dialog_frequency_settings (read-only for regular users)
DROP POLICY IF EXISTS "dialog_frequency_settings_select_policy" ON dialog_frequency_settings;
CREATE POLICY "dialog_frequency_settings_select_policy" ON dialog_frequency_settings FOR SELECT
    USING (TRUE);

DROP POLICY IF EXISTS "dialog_frequency_settings_insert_policy" ON dialog_frequency_settings;
CREATE POLICY "dialog_frequency_settings_insert_policy" ON dialog_frequency_settings FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "dialog_frequency_settings_update_policy" ON dialog_frequency_settings;
CREATE POLICY "dialog_frequency_settings_update_policy" ON dialog_frequency_settings FOR UPDATE
    USING (auth.uid() IS NOT NULL);
