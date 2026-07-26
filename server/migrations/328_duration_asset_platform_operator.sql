BEGIN;

-- BEGIN MIGRATION 328
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_platform_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_platform_role_check
  CHECK (platform_role IN ('none', 'commercial_operator', 'duration_governance_operator'));
-- END MIGRATION 328

NOTIFY pgrst, 'reload schema';

COMMIT;
