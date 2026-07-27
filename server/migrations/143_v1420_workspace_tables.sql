-- 143_v1420_workspace_tables.sql
-- v1.4.20: Demo projects + company/project invitations + join requests

BEGIN;

CREATE TABLE IF NOT EXISTS demo_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  project_type TEXT,
  thumbnail_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES users(id),
  recipient_email TEXT,
  recipient_user_id UUID REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'regular',
  status TEXT NOT NULL DEFAULT 'pending',
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_invite_recipient
  ON company_invitations(recipient_user_id, status);

CREATE TABLE IF NOT EXISTS project_direct_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES users(id),
  recipient_user_id UUID REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'editor',
  status TEXT NOT NULL DEFAULT 'pending',
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_direct_invite
  ON project_direct_invitations(recipient_user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS company_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_join_request
  ON company_join_requests(company_id, user_id, status)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS project_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_join_request
  ON project_join_requests(project_id, user_id, status)
  WHERE status = 'pending';

-- Seed demo projects
INSERT INTO demo_projects (name, description, project_type, sort_order) VALUES
  ('住宅小区综合项目', '典型住宅建筑工程示例', 'residential', 1),
  ('商业综合体项目', '商业建筑全生命周期示例', 'commercial', 2),
  ('工业厂房项目', '工业建筑施工管理示例', 'industrial', 3)
ON CONFLICT DO NOTHING;
COMMIT;
