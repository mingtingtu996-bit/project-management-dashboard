-- v1.4.23.1 auth/session live schema repair:
-- authentication now fails closed when users.status or users.deleted_at is
-- missing, so production databases must carry these guard columns explicitly.

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

UPDATE public.users
SET status = 'active'
WHERE status IS NULL
   OR BTRIM(status) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'users_status_check'
       AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_status_check
      CHECK (status IN ('active', 'inactive', 'disabled', 'archived'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_active_session_guard
  ON public.users(id, auth_token_version)
  WHERE status = 'active' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_username_active_session_guard
  ON public.users(username)
  WHERE status = 'active' AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
