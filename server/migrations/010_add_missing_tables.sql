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
('risk.alert.thresholds', '{"critical": 7, "high": 14, "medium": 7}', 'json', 'risk_alert', '风险预警阈值配置', TRUE),
('risk.consecutive.lag.weeks', '{"high": 2, "medium": 1}', 'json', 'risk_alert', '连续滞后周数阈值', TRUE),
('obstacle.timeout.days', '{"warning": 3, "critical": 7, "severe": 14}', 'json', 'risk_alert', '阻碍超时天数阈值', TRUE),
('dialog.frequency.defaults', '{"daily_max": 3, "cooldown_minutes": 60}', 'json', 'dialog_frequency', '弹窗频率默认配置', TRUE),
('ai.duration.confidence.min', '{"value": 0.6}', 'json', 'ai', 'AI工期预测最小置信度', TRUE)
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
DROP POLICY IF EXISTS "task_progress_history_select_policy" ON task_progress_history;
CREATE POLICY "task_progress_history_select_policy" ON task_progress_history FOR SELECT
    USING (EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_progress_history.task_id AND t.deleted_at IS NULL));

DROP POLICY IF EXISTS "task_progress_history_insert_policy" ON task_progress_history;
CREATE POLICY "task_progress_history_insert_policy" ON task_progress_history FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "task_progress_history_update_policy" ON task_progress_history;
CREATE POLICY "task_progress_history_update_policy" ON task_progress_history FOR UPDATE
    USING (auth.uid() IS NOT NULL);

-- RLS Policies for acceptance_records
DROP POLICY IF EXISTS "acceptance_records_select_policy" ON acceptance_records;
CREATE POLICY "acceptance_records_select_policy" ON acceptance_records FOR SELECT
    USING (EXISTS (SELECT 1 FROM acceptance_plans ap WHERE ap.id = acceptance_records.acceptance_plan_id AND ap.deleted_at IS NULL));

DROP POLICY IF EXISTS "acceptance_records_insert_policy" ON acceptance_records;
CREATE POLICY "acceptance_records_insert_policy" ON acceptance_records FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "acceptance_records_update_policy" ON acceptance_records;
CREATE POLICY "acceptance_records_update_policy" ON acceptance_records FOR UPDATE
    USING (auth.uid() IS NOT NULL);

-- RLS Policies for system_settings (read-only for regular users)
DROP POLICY IF EXISTS "system_settings_select_policy" ON system_settings;
CREATE POLICY "system_settings_select_policy" ON system_settings FOR SELECT
    USING (TRUE);

DROP POLICY IF EXISTS "system_settings_insert_policy" ON system_settings;
CREATE POLICY "system_settings_insert_policy" ON system_settings FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "system_settings_update_policy" ON system_settings;
CREATE POLICY "system_settings_update_policy" ON system_settings FOR UPDATE
    USING (auth.uid() IS NOT NULL);

-- RLS Policies for notifications
DROP POLICY IF EXISTS "notifications_select_policy" ON notifications;
CREATE POLICY "notifications_select_policy" ON notifications FOR SELECT
    USING (user_id = auth.uid() OR is_system = TRUE);

DROP POLICY IF EXISTS "notifications_insert_policy" ON notifications;
CREATE POLICY "notifications_insert_policy" ON notifications FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "notifications_update_policy" ON notifications;
CREATE POLICY "notifications_update_policy" ON notifications FOR UPDATE
    USING (user_id = auth.uid());
