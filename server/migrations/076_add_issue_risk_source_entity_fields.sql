ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS source_entity_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS source_entity_id TEXT;

ALTER TABLE risks
  ADD COLUMN IF NOT EXISTS source_entity_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS source_entity_id TEXT;

CREATE INDEX IF NOT EXISTS idx_issues_source_entity
  ON issues(source_entity_type, source_entity_id);

CREATE INDEX IF NOT EXISTS idx_risks_source_entity
  ON risks(source_entity_type, source_entity_id);
