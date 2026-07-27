-- WARNING: this rollback reopens the Supabase Advisor finding by restoring
-- PUBLIC execute access to the commercial trigger functions.

BEGIN;

GRANT EXECUTE ON FUNCTION public.workbuddy_initialize_company_commercial() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.workbuddy_meter_company_projects() TO PUBLIC;

NOTIFY pgrst, 'reload schema';

COMMIT;
