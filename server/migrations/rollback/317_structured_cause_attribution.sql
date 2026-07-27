BEGIN;

DROP TABLE IF EXISTS public.structured_cause_attributions;
DROP FUNCTION IF EXISTS public.ensure_structured_cause_attribution_tenant();

NOTIFY pgrst, 'reload schema';

COMMIT;
