-- Require users who receive an administrator-issued temporary password to rotate it.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.password_reset_required IS
  'True after an administrator password reset; cleared only by a successful authenticated password change.';
