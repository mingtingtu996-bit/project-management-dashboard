BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS global_role TEXT;

UPDATE public.users
SET global_role = CASE
  WHEN COALESCE(NULLIF(TRIM(global_role), ''), '') = '' AND role IN ('owner', 'admin') THEN 'company_admin'
  WHEN COALESCE(NULLIF(TRIM(global_role), ''), '') = '' THEN 'regular'
  ELSE global_role
END
WHERE global_role IS NULL
   OR TRIM(global_role) = '';

UPDATE public.users
SET global_role = CASE
  WHEN global_role = 'company_admin' THEN 'company_admin'
  ELSE 'regular'
END
WHERE global_role IS NOT NULL;

ALTER TABLE public.users
  ALTER COLUMN global_role SET DEFAULT 'regular';

ALTER TABLE public.users
  ALTER COLUMN global_role SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_global_role_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_global_role_check
      CHECK (global_role IN ('company_admin', 'regular'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_global_role ON public.users(global_role);

COMMIT;
