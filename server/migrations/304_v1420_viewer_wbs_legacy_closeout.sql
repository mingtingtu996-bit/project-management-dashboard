-- v1.4.20 final closeout for retired project viewer access and the duplicated
-- WBS persistence path. Canonical WBS nodes live in public.tasks.

BEGIN;

LOCK TABLE public.project_members IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.project_invitations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.project_direct_invitations IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO public.change_action_types (
  action_type,
  action_name,
  action_group,
  entity_type,
  requires_approval,
  requires_reason,
  user_visible,
  metadata
)
VALUES (
  'legacy_project_access_retired',
  'Retired legacy project access',
  'migration',
  NULL,
  FALSE,
  FALSE,
  FALSE,
  jsonb_build_object('migration', '304_v1420_viewer_wbs_legacy_closeout.sql')
)
ON CONFLICT (action_type) DO NOTHING;

-- Keep a durable before-image before deleting viewer members, normalizing the
-- former admin alias, or removing the compatibility role column.
INSERT INTO public.change_logs (
  id,
  project_id,
  entity_type,
  entity_id,
  field_name,
  old_value,
  new_value,
  change_reason,
  changed_at,
  change_source,
  action_type,
  action_group,
  before_snapshot,
  after_snapshot,
  metadata,
  visibility,
  retention_policy
)
SELECT
  gen_random_uuid(),
  member.project_id,
  'project_member',
  member.id,
  'permission_level',
  COALESCE(member.permission_level, member.role),
  CASE
    WHEN LOWER(COALESCE(member.permission_level, '')) = 'viewer'
      OR LOWER(COALESCE(member.role, '')) = 'viewer'
      OR (member.permission_level IS NULL AND COALESCE(member.is_active, TRUE) = FALSE)
      THEN 'deleted'
    WHEN LOWER(COALESCE(member.permission_level, member.role, '')) = 'admin'
      THEN 'owner'
    ELSE member.permission_level
  END,
  'v1.4.20 removed viewer membership and the project_members.role compatibility column',
  NOW(),
  'backfill',
  'legacy_project_access_retired',
  'migration',
  to_jsonb(member),
  jsonb_build_object('canonical_roles', jsonb_build_array('owner', 'editor')),
  jsonb_build_object(
    'migration', '304_v1420_viewer_wbs_legacy_closeout.sql',
    'restorable_from_before_snapshot', TRUE
  ),
  'internal',
  'project_lifecycle'
FROM public.project_members member
WHERE LOWER(COALESCE(member.permission_level, '')) IN ('viewer', 'admin')
   OR LOWER(COALESCE(member.role, '')) IN ('viewer', 'admin')
   OR member.permission_level IS NULL;

UPDATE public.project_members
SET permission_level = CASE
  WHEN LOWER(role) = 'admin' THEN 'owner'
  ELSE LOWER(role)
END
WHERE permission_level IS NULL
  AND LOWER(COALESCE(role, '')) IN ('owner', 'editor', 'admin');

UPDATE public.project_members
SET permission_level = 'owner'
WHERE LOWER(COALESCE(permission_level, '')) = 'admin';

DELETE FROM public.project_members
WHERE LOWER(COALESCE(permission_level, '')) = 'viewer'
   OR LOWER(COALESCE(role, '')) = 'viewer'
   OR (permission_level IS NULL AND COALESCE(is_active, TRUE) = FALSE);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.project_members
    WHERE permission_level IS NULL
       OR LOWER(permission_level) NOT IN ('owner', 'editor')
  ) THEN
    RAISE EXCEPTION 'migration 304 blocked: project_members contains a non-canonical permission';
  END IF;
END
$$;

-- Invitation rows are historical records. Revoke every legacy viewer grant,
-- preserve its before-image, then normalize the now-inert role value so the
-- database can enforce the canonical domain.
INSERT INTO public.change_logs (
  id,
  project_id,
  entity_type,
  entity_id,
  field_name,
  old_value,
  new_value,
  change_reason,
  changed_at,
  change_source,
  action_type,
  action_group,
  before_snapshot,
  after_snapshot,
  metadata,
  visibility,
  retention_policy
)
SELECT
  gen_random_uuid(),
  invitation.project_id,
  'project_invitation',
  invitation.id,
  'permission_level',
  invitation.permission_level,
  'editor (revoked)',
  'v1.4.20 revoked the retired viewer invitation grant',
  NOW(),
  'backfill',
  'legacy_project_access_retired',
  'migration',
  to_jsonb(invitation),
  to_jsonb(invitation) || jsonb_build_object('permission_level', 'editor', 'is_revoked', TRUE),
  jsonb_build_object(
    'migration', '304_v1420_viewer_wbs_legacy_closeout.sql',
    'invitation_kind', 'code',
    'restorable_from_before_snapshot', TRUE
  ),
  'internal',
  'project_lifecycle'
FROM public.project_invitations invitation
WHERE LOWER(COALESCE(invitation.permission_level, '')) = 'viewer';

UPDATE public.project_invitations
SET permission_level = 'editor',
    is_revoked = TRUE
WHERE LOWER(COALESCE(permission_level, '')) = 'viewer';

INSERT INTO public.change_logs (
  id,
  project_id,
  entity_type,
  entity_id,
  field_name,
  old_value,
  new_value,
  change_reason,
  changed_at,
  change_source,
  action_type,
  action_group,
  before_snapshot,
  after_snapshot,
  metadata,
  visibility,
  retention_policy
)
SELECT
  gen_random_uuid(),
  invitation.project_id,
  'project_direct_invitation',
  invitation.id,
  'role',
  invitation.role,
  'editor (revoked)',
  'v1.4.20 revoked the retired direct viewer invitation grant',
  NOW(),
  'backfill',
  'legacy_project_access_retired',
  'migration',
  to_jsonb(invitation),
  to_jsonb(invitation) || jsonb_build_object('role', 'editor', 'status', 'revoked'),
  jsonb_build_object(
    'migration', '304_v1420_viewer_wbs_legacy_closeout.sql',
    'invitation_kind', 'direct',
    'restorable_from_before_snapshot', TRUE
  ),
  'internal',
  'project_lifecycle'
FROM public.project_direct_invitations invitation
WHERE LOWER(COALESCE(invitation.role, '')) = 'viewer';

UPDATE public.project_direct_invitations
SET role = 'editor',
    status = 'revoked'
WHERE LOWER(COALESCE(role, '')) = 'viewer';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.project_invitations
    WHERE permission_level IS NULL
       OR LOWER(permission_level) <> 'editor'
  ) THEN
    RAISE EXCEPTION 'migration 304 blocked: project_invitations contains a non-editor permission';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_direct_invitations
    WHERE role IS NULL
       OR LOWER(role) <> 'editor'
  ) THEN
    RAISE EXCEPTION 'migration 304 blocked: project_direct_invitations contains a non-editor role';
  END IF;
END
$$;

DROP INDEX IF EXISTS public.idx_project_members_role;

ALTER TABLE public.project_members
  DROP CONSTRAINT IF EXISTS project_members_permission_level_check;
ALTER TABLE public.project_members
  ALTER COLUMN permission_level SET DEFAULT 'editor',
  ALTER COLUMN permission_level SET NOT NULL,
  ADD CONSTRAINT project_members_permission_level_check
    CHECK (permission_level IN ('owner', 'editor'));
ALTER TABLE public.project_members
  DROP COLUMN IF EXISTS role;

ALTER TABLE public.project_invitations
  DROP CONSTRAINT IF EXISTS project_invitations_permission_level_check;
ALTER TABLE public.project_invitations
  ALTER COLUMN permission_level SET DEFAULT 'editor',
  ALTER COLUMN permission_level SET NOT NULL,
  ADD CONSTRAINT project_invitations_permission_level_check
    CHECK (permission_level = 'editor');

ALTER TABLE public.project_direct_invitations
  DROP CONSTRAINT IF EXISTS project_direct_invitations_role_check;
ALTER TABLE public.project_direct_invitations
  ALTER COLUMN role SET DEFAULT 'editor',
  ALTER COLUMN role SET NOT NULL,
  ADD CONSTRAINT project_direct_invitations_role_check
    CHECK (role = 'editor');

-- No WBS compatibility row or lineage link may be discarded implicitly.
DO $$
DECLARE
  lineage_link_count BIGINT;
  project_link_count BIGINT;
  external_fk_count BIGINT;
  relation_row_count BIGINT;
BEGIN
  SELECT count(*)
  INTO lineage_link_count
  FROM public.data_lineage_links
  WHERE source_entity_type IN ('wbs_structure', 'wbs_task_link', 'task_milestone')
     OR target_entity_type IN ('wbs_structure', 'wbs_task_link', 'task_milestone');

  SELECT count(*)
  INTO project_link_count
  FROM public.project_entity_links
  WHERE source_entity_type IN ('wbs_structure', 'wbs_task_link', 'task_milestone')
     OR target_entity_type IN ('wbs_structure', 'wbs_task_link', 'task_milestone');

  IF lineage_link_count > 0 OR project_link_count > 0 THEN
    RAISE EXCEPTION
      'migration 304 blocked: retired WBS/task_milestone lineage still has links (lineage %, project %)',
      lineage_link_count,
      project_link_count;
  END IF;

  IF to_regclass('public.wbs_task_links') IS NOT NULL THEN
    SELECT count(*) INTO relation_row_count FROM public.wbs_task_links;
    IF relation_row_count <> 0 THEN
      RAISE EXCEPTION 'migration 304 blocked: public.wbs_task_links contains % rows', relation_row_count;
    END IF;
  END IF;

  IF to_regclass('public.wbs_structure') IS NOT NULL THEN
    SELECT count(*) INTO relation_row_count FROM public.wbs_structure;
    IF relation_row_count <> 0 THEN
      RAISE EXCEPTION 'migration 304 blocked: public.wbs_structure contains % rows', relation_row_count;
    END IF;
  END IF;

  SELECT count(*)
  INTO external_fk_count
  FROM pg_constraint constraint_record
  WHERE constraint_record.contype = 'f'
    AND constraint_record.confrelid IN (
      COALESCE(to_regclass('public.wbs_structure'), 0::oid),
      COALESCE(to_regclass('public.wbs_task_links'), 0::oid)
    )
    AND constraint_record.conrelid NOT IN (
      COALESCE(to_regclass('public.wbs_structure'), 0::oid),
      COALESCE(to_regclass('public.wbs_task_links'), 0::oid)
    );

  IF external_fk_count > 0 THEN
    RAISE EXCEPTION 'migration 304 blocked: retired WBS tables still have % external foreign keys', external_fk_count;
  END IF;
END
$$;

DELETE FROM public.data_lineage_relation_rules
WHERE source_entity_type IN ('wbs_structure', 'wbs_task_link', 'task_milestone')
   OR target_entity_type IN ('wbs_structure', 'wbs_task_link', 'task_milestone');

UPDATE public.data_lineage_entity_types
SET table_name = 'tasks',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'canonical_relation', 'tasks',
      'canonical_filter', jsonb_build_object('is_milestone', TRUE),
      'legacy_mapping_retired_by', '304_v1420_viewer_wbs_legacy_closeout.sql'
    ),
    updated_at = NOW()
WHERE entity_type = 'milestone';

UPDATE public.data_lineage_entity_types
SET table_name = 'notifications',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'canonical_relation', 'notifications',
      'canonical_filter', jsonb_build_object('source_entity_type', 'warning'),
      'legacy_mapping_retired_by', '304_v1420_viewer_wbs_legacy_closeout.sql'
    ),
    updated_at = NOW()
WHERE entity_type = 'warning';

UPDATE public.data_lineage_entity_types
SET table_name = 'planning_governance_states',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'canonical_relation', 'planning_governance_states',
      'legacy_mapping_retired_by', '304_v1420_viewer_wbs_legacy_closeout.sql'
    ),
    updated_at = NOW()
WHERE entity_type = 'planning_governance_signal';

DELETE FROM public.data_lineage_entity_types
WHERE entity_type IN ('wbs_structure', 'wbs_task_link', 'task_milestone');

DROP TABLE IF EXISTS public.wbs_task_links;
DROP TABLE IF EXISTS public.wbs_structure;

NOTIFY pgrst, 'reload schema';

COMMIT;
