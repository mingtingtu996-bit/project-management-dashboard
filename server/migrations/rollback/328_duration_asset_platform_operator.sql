BEGIN;

UPDATE public.users
SET platform_role = 'none'
WHERE platform_role = 'duration_governance_operator';

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_platform_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_platform_role_check
  CHECK (platform_role IN ('none', 'commercial_operator'));

NOTIFY pgrst, 'reload schema';

COMMIT;
