-- Manual rollback for migration 304. Stop application writes before running.
-- Migration 304 only drops empty WBS tables; no WBS row restoration is needed.

BEGIN;

ALTER TABLE public.project_members
  DROP CONSTRAINT IF EXISTS project_members_permission_level_check,
  ALTER COLUMN permission_level DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS role VARCHAR(20);

ALTER TABLE public.project_invitations
  DROP CONSTRAINT IF EXISTS project_invitations_permission_level_check,
  ALTER COLUMN permission_level DROP NOT NULL;

ALTER TABLE public.project_direct_invitations
  DROP CONSTRAINT IF EXISTS project_direct_invitations_role_check;

UPDATE public.project_members
SET role = permission_level
WHERE role IS NULL;

CREATE INDEX IF NOT EXISTS idx_project_members_role
  ON public.project_members(project_id, role)
  WHERE role IS NOT NULL;

INSERT INTO public.project_members (
  id,
  project_id,
  user_id,
  invitation_code_id,
  permission_level,
  joined_at,
  last_activity,
  is_active,
  role
)
SELECT
  log.entity_id,
  (log.before_snapshot ->> 'project_id')::uuid,
  (log.before_snapshot ->> 'user_id')::uuid,
  NULLIF(log.before_snapshot ->> 'invitation_code_id', '')::uuid,
  NULLIF(log.before_snapshot ->> 'permission_level', ''),
  NULLIF(log.before_snapshot ->> 'joined_at', '')::timestamp,
  NULLIF(log.before_snapshot ->> 'last_activity', '')::timestamp,
  COALESCE((log.before_snapshot ->> 'is_active')::boolean, TRUE),
  NULLIF(log.before_snapshot ->> 'role', '')
FROM public.change_logs log
WHERE log.entity_type = 'project_member'
  AND log.metadata ->> 'migration' = '304_v1420_viewer_wbs_legacy_closeout.sql'
ON CONFLICT (id) DO NOTHING;

UPDATE public.project_invitations invitation
SET permission_level = log.before_snapshot ->> 'permission_level',
    is_revoked = COALESCE((log.before_snapshot ->> 'is_revoked')::boolean, FALSE)
FROM public.change_logs log
WHERE log.entity_type = 'project_invitation'
  AND log.metadata ->> 'migration' = '304_v1420_viewer_wbs_legacy_closeout.sql'
  AND invitation.id = log.entity_id;

UPDATE public.project_direct_invitations invitation
SET role = log.before_snapshot ->> 'role',
    status = log.before_snapshot ->> 'status'
FROM public.change_logs log
WHERE log.entity_type = 'project_direct_invitation'
  AND log.metadata ->> 'migration' = '304_v1420_viewer_wbs_legacy_closeout.sql'
  AND invitation.id = log.entity_id;

CREATE EXTENSION IF NOT EXISTS ltree;

CREATE TABLE IF NOT EXISTS public.wbs_structure (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.wbs_structure(id) ON DELETE CASCADE,
  wbs_code VARCHAR(100) NOT NULL,
  wbs_path LTREE NOT NULL,
  wbs_level INTEGER NOT NULL CHECK (wbs_level >= 0 AND wbs_level <= 4),
  node_name VARCHAR(200) NOT NULL,
  node_code VARCHAR(50),
  node_type TEXT,
  description TEXT,
  level INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20),
  planned_start_date DATE,
  planned_end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  responsible_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  properties JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.wbs_task_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wbs_node_id UUID NOT NULL REFERENCES public.wbs_structure(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  link_type VARCHAR(20) DEFAULT 'subtask'
    CHECK (link_type IN ('subtask', 'milestone', 'delivery', 'dependency')),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (wbs_node_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_wbs_structure_project ON public.wbs_structure(project_id);
CREATE INDEX IF NOT EXISTS idx_wbs_structure_parent ON public.wbs_structure(parent_id);
CREATE INDEX IF NOT EXISTS idx_wbs_structure_wbs_path ON public.wbs_structure USING GIST(wbs_path);
CREATE INDEX IF NOT EXISTS idx_wbs_structure_wbs_code ON public.wbs_structure(wbs_code);
CREATE INDEX IF NOT EXISTS idx_wbs_task_links_wbs ON public.wbs_task_links(wbs_node_id);
CREATE INDEX IF NOT EXISTS idx_wbs_task_links_task ON public.wbs_task_links(task_id);

ALTER TABLE public.wbs_structure ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wbs_task_links ENABLE ROW LEVEL SECURITY;

INSERT INTO public.data_lineage_entity_types (
  entity_type,
  entity_name,
  entity_group,
  table_name,
  is_project_scoped,
  is_global_reference
)
VALUES
  ('wbs_structure', 'Historical WBS structure', 'compat', 'wbs_structure', TRUE, FALSE),
  ('wbs_task_link', 'Historical WBS task link', 'compat', 'wbs_task_links', TRUE, FALSE),
  ('task_milestone', 'Historical task milestone link', 'compat', 'task_milestones', TRUE, FALSE)
ON CONFLICT (entity_type) DO UPDATE
SET table_name = EXCLUDED.table_name,
    entity_group = EXCLUDED.entity_group,
    updated_at = NOW();

NOTIFY pgrst, 'reload schema';

COMMIT;
