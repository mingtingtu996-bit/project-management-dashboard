-- 142_v1420_permission_role_system.sql
-- v1.4.20: Permission role + collaboration system foundation

BEGIN;

-- ============================================================
-- Company members table (cross-project membership)
-- ============================================================
CREATE TABLE IF NOT EXISTS company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  permission_level TEXT NOT NULL DEFAULT 'regular',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_member
  ON company_members(company_id, user_id);

CREATE INDEX IF NOT EXISTS idx_company_member_user
  ON company_members(user_id);

-- ============================================================
-- Project member role enhancements
-- ============================================================
ALTER TABLE project_invitations
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- ============================================================
-- Permission role lookup tables
-- ============================================================
CREATE TABLE IF NOT EXISTS permission_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO permission_roles (role_key, label, description, is_default, sort_order) VALUES
  ('project_owner', '项目负责人', '完整项目管理权限', false, 1),
  ('project_editor', '编辑者', '可编辑项目业务数据', true, 2),
  ('company_admin', '公司管理员', '公司级管理权限', false, 4)
ON CONFLICT (role_key) DO NOTHING;

-- ============================================================
-- Company-level workspace member management
-- ============================================================
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

COMMIT;
