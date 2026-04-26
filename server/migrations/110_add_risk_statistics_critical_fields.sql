-- Add critical risk counters to risk_statistics

ALTER TABLE risk_statistics
  ADD COLUMN IF NOT EXISTS critical_risk_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_critical_risks integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resolved_critical_risks integer NOT NULL DEFAULT 0;
