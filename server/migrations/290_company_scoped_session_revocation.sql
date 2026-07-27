ALTER TABLE public.company_members
  ADD COLUMN IF NOT EXISTS session_revoked_at TIMESTAMPTZ;

COMMENT ON COLUMN public.company_members.session_revoked_at IS
  'Reject JWTs issued at or before this timestamp only when accessing this company scope.';
