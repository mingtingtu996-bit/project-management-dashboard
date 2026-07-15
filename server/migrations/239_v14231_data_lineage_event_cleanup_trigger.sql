-- v1.4.23.1 C-18.L09 follow-up: keep lineage events immutable to UPDATE, but
-- allow backend-governed physical cleanup DELETEs. RLS and table grants still
-- decide who may delete rows.

BEGIN;

CREATE OR REPLACE FUNCTION public.check_lineage_events_append_only()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'data_lineage_events is append-only: % not allowed', TG_OP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_lineage_events_append_only ON public.data_lineage_events;
CREATE TRIGGER trigger_lineage_events_append_only
  BEFORE UPDATE ON public.data_lineage_events
  FOR EACH ROW
  EXECUTE FUNCTION public.check_lineage_events_append_only();

COMMIT;
