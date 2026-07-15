-- v1.4.22.5: bind forecast residual overlay runtime consumption to a publication artifact.
-- This column is lineage evidence for runtime consumer observations; it does not turn
-- residual overlays into task, baseline, monthly plan, seed, or fact writers.

ALTER TABLE public.duration_forecast_residual_overlays
  ADD COLUMN IF NOT EXISTS publication_key TEXT NULL;

UPDATE public.duration_forecast_residual_overlays
   SET publication_key = CASE
     WHEN overlay_key LIKE 'forecast_residual_overlay_runtime:%' THEN overlay_key
     ELSE 'forecast_residual_overlay_runtime:' || overlay_key
   END
 WHERE publication_key IS NULL
   AND overlay_key IS NOT NULL
   AND runtime_publication_status IN ('canary', 'published');

CREATE INDEX IF NOT EXISTS idx_duration_forecast_residual_overlays_publication_key
  ON public.duration_forecast_residual_overlays(publication_key)
  WHERE publication_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_duration_forecast_residual_overlay_publication_key()
RETURNS trigger AS $$
BEGIN
  IF NEW.publication_key IS NULL AND NEW.overlay_key IS NOT NULL THEN
    NEW.publication_key := CASE
      WHEN NEW.overlay_key LIKE 'forecast_residual_overlay_runtime:%' THEN NEW.overlay_key
      ELSE 'forecast_residual_overlay_runtime:' || NEW.overlay_key
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_duration_forecast_residual_overlay_publication_key
  ON public.duration_forecast_residual_overlays;
CREATE TRIGGER trg_set_duration_forecast_residual_overlay_publication_key
  BEFORE INSERT OR UPDATE OF overlay_key, publication_key
  ON public.duration_forecast_residual_overlays
  FOR EACH ROW
  EXECUTE FUNCTION public.set_duration_forecast_residual_overlay_publication_key();

COMMENT ON COLUMN public.duration_forecast_residual_overlays.publication_key IS
  'v1.4.22.5 runtime publication lineage for forecast_residual_overlay consumer observations; not a business fact or seed writer.';
