BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_token_version INTEGER NOT NULL DEFAULT 0;

UPDATE public.users
SET auth_token_version = 0
WHERE auth_token_version IS NULL;

ALTER TABLE public.users
  ALTER COLUMN auth_token_version SET DEFAULT 0,
  ALTER COLUMN auth_token_version SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'users_auth_token_version_non_negative'
       AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_auth_token_version_non_negative
      CHECK (auth_token_version >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_auth_token_version
  ON public.users(auth_token_version);

COMMIT;
