-- 141_v1419_health_snapshot_fields.sql
-- v1.4.19: Project health + deviation system -- daily snapshot hardening

BEGIN;

ALTER TABLE public.project_daily_snapshot
  ADD COLUMN IF NOT EXISTS business_health_score INTEGER,
  ADD COLUMN IF NOT EXISTS health_confidence_score INTEGER,
  ADD COLUMN IF NOT EXISTS health_confidence_flag TEXT,
  ADD COLUMN IF NOT EXISTS health_basis JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS deviation_summary JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS health_caliber_version TEXT,
  ADD COLUMN IF NOT EXISTS deviation_caliber_version TEXT;

UPDATE public.project_daily_snapshot
  SET health_caliber_version = COALESCE(health_caliber_version, 'legacy'),
      deviation_caliber_version = COALESCE(deviation_caliber_version, 'legacy')
  WHERE health_caliber_version IS NULL OR deviation_caliber_version IS NULL;

ALTER TABLE public.project_daily_snapshot
  ALTER COLUMN health_caliber_version SET DEFAULT 'v1.4.19',
  ALTER COLUMN deviation_caliber_version SET DEFAULT 'v1.4.19';

-- Constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_daily_snapshot_health_confidence_flag_check'
  ) THEN
    ALTER TABLE public.project_daily_snapshot
      ADD CONSTRAINT project_daily_snapshot_health_confidence_flag_check
      CHECK (health_confidence_flag IS NULL OR health_confidence_flag IN ('high', 'medium', 'low', 'unavailable'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_daily_snapshot_business_health_score_check'
  ) THEN
    ALTER TABLE public.project_daily_snapshot
      ADD CONSTRAINT project_daily_snapshot_business_health_score_check
      CHECK (business_health_score IS NULL OR (business_health_score >= 0 AND business_health_score <= 100));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_daily_snapshot_health_confidence_score_check'
  ) THEN
    ALTER TABLE public.project_daily_snapshot
      ADD CONSTRAINT project_daily_snapshot_health_confidence_score_check
      CHECK (health_confidence_score IS NULL OR (health_confidence_score >= 0 AND health_confidence_score <= 100));
  END IF;
END $$;

COMMIT;
