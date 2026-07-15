-- The commercial-metering policy was created after the public helper RPC
-- lockdown. Authenticated users can read this table, so the policy must use
-- the private helper that is executable by authenticated database roles.

BEGIN;

DROP POLICY IF EXISTS company_commercial_metering_select_policy
  ON public.company_commercial_metering;

CREATE POLICY company_commercial_metering_select_policy
  ON public.company_commercial_metering
  FOR SELECT
  USING (
    workbuddy_private.is_active_company_member(company_id, ARRAY['company_admin']::TEXT[])
    OR current_user = 'workbuddy_runtime'
  );

COMMIT;
