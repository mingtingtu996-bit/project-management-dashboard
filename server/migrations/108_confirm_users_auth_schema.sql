-- 108: make auth user columns explicit so auth routes do not probe schema at runtime.

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS global_role TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.users
SET global_role = CASE
  WHEN COALESCE(NULLIF(TRIM(global_role), ''), '') = '' AND role IN ('owner', 'admin') THEN 'company_admin'
  WHEN COALESCE(NULLIF(TRIM(global_role), ''), '') = '' THEN 'regular'
  WHEN global_role = 'company_admin' THEN 'company_admin'
  ELSE 'regular'
END
WHERE global_role IS NULL
   OR TRIM(global_role) = ''
   OR global_role NOT IN ('company_admin', 'regular');

UPDATE public.users
SET updated_at = COALESCE(updated_at, last_active, joined_at, NOW())
WHERE updated_at IS NULL;

ALTER TABLE public.users
  ALTER COLUMN global_role SET DEFAULT 'regular',
  ALTER COLUMN global_role SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_global_role_check'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_global_role_check
      CHECK (global_role IN ('company_admin', 'regular'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_global_role ON public.users(global_role);

COMMIT;
