-- 146_v1420_legacy_viewer_cleanup.sql
-- v1.4.20: remove legacy project viewer compatibility from live data.

BEGIN;

-- Project members only support owner/editor. Legacy viewer rows are no longer
-- formal project members, so keep the audit row but make it inactive.
UPDATE public.project_members
SET is_active = FALSE,
    permission_level = NULL
WHERE LOWER(COALESCE(permission_level, '')) = 'viewer';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_members'
      AND column_name = 'role'
  ) THEN
    UPDATE public.project_members
    SET is_active = FALSE,
        role = 'editor'
    WHERE LOWER(COALESCE(role, '')) = 'viewer';
  END IF;
END $$;

-- Do not promote old viewer invitations to editor. Revoke pending/active
-- legacy invitations so they cannot create write-capable access.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_invitations'
      AND column_name = 'status'
  ) THEN
    UPDATE public.project_invitations
    SET status = 'revoked'
    WHERE LOWER(COALESCE(permission_level, '')) = 'viewer'
      AND status IN ('active', 'pending');
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_invitations'
      AND column_name = 'is_revoked'
  ) THEN
    UPDATE public.project_invitations
    SET is_revoked = TRUE
    WHERE LOWER(COALESCE(permission_level, '')) = 'viewer'
      AND COALESCE(is_revoked, FALSE) = FALSE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_invitations'
      AND column_name = 'role'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'project_invitations'
        AND column_name = 'status'
    ) THEN
      UPDATE public.project_invitations
      SET status = 'revoked'
      WHERE LOWER(COALESCE(role, '')) = 'viewer'
        AND status IN ('active', 'pending');
    ELSIF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'project_invitations'
        AND column_name = 'is_revoked'
    ) THEN
      UPDATE public.project_invitations
      SET is_revoked = TRUE
      WHERE LOWER(COALESCE(role, '')) = 'viewer'
        AND COALESCE(is_revoked, FALSE) = FALSE;
    END IF;
  END IF;
END $$;

ALTER TABLE public.project_direct_invitations
  ALTER COLUMN role SET DEFAULT 'editor';

UPDATE public.project_direct_invitations
SET status = 'revoked'
WHERE LOWER(COALESCE(role, '')) = 'viewer'
  AND status = 'pending';

COMMIT;
