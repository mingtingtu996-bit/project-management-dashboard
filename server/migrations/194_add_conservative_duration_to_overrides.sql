-- 194_add_conservative_duration_to_overrides.sql
-- Keep manual duration overrides symmetric with the E1 P50/P80 reference output.

BEGIN;

ALTER TABLE duration_suggestion_overrides
  ADD COLUMN IF NOT EXISTS conservative_duration_days INT;

UPDATE duration_suggestion_overrides
SET conservative_duration_days = recommended_duration_days
WHERE conservative_duration_days IS NULL;

COMMIT;
