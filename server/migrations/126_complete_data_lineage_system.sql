-- 126_complete_data_lineage_system.sql
-- v1.4.6 (completion): batches, import tracking, confidence, relation validation

BEGIN;

-- ============================================================
-- 0. data_lineage_batches — track lineage batch operations
-- ============================================================
CREATE TABLE IF NOT EXISTS data_lineage_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  batch_type TEXT NOT NULL,
  link_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_data_lineage_batches_project ON data_lineage_batches(project_id, created_at DESC);

-- ============================================================
-- 1. data_import_batches — track import operations
-- ============================================================
CREATE TABLE IF NOT EXISTS data_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  import_type TEXT NOT NULL DEFAULT 'task_import',
  file_name TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  mapping_status TEXT NOT NULL DEFAULT 'pending',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_data_import_batches_project ON data_import_batches(project_id, created_at DESC);

-- ============================================================
-- 2. import_rows — per-row import tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS data_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES data_import_batches(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  target_entity_type TEXT NOT NULL DEFAULT 'task',
  target_entity_id UUID,
  source_data JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_import_rows_batch ON data_import_rows(batch_id);
CREATE INDEX IF NOT EXISTS idx_data_import_rows_target ON data_import_rows(target_entity_type, target_entity_id);

-- ============================================================
-- 3. lineage_events — who/when changed lineage
-- ============================================================
CREATE TABLE IF NOT EXISTS data_lineage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  link_id UUID REFERENCES data_lineage_links(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_data_lineage_events_project ON data_lineage_events(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_data_lineage_events_link ON data_lineage_events(link_id) WHERE link_id IS NOT NULL;

-- ============================================================
-- 4. Add mapping_status / confidence to data_lineage_links
-- ============================================================
ALTER TABLE data_lineage_links ADD COLUMN IF NOT EXISTS mapping_status TEXT;
UPDATE data_lineage_links
SET mapping_status = CASE
  WHEN mapping_status IN ('mapped', 'pending', 'broken', 'orphan', 'deprecated') THEN
    CASE mapping_status
      WHEN 'mapped' THEN 'active'
      WHEN 'pending' THEN 'unresolved'
      WHEN 'broken' THEN 'conflict'
      WHEN 'orphan' THEN 'unresolved'
      WHEN 'deprecated' THEN 'superseded'
    END
  WHEN mapping_status IS NULL THEN 'active'
  ELSE mapping_status
END;
ALTER TABLE data_lineage_links ALTER COLUMN mapping_status SET DEFAULT 'active';
ALTER TABLE data_lineage_links ALTER COLUMN mapping_status SET NOT NULL;
ALTER TABLE data_lineage_links ADD COLUMN IF NOT EXISTS confidence REAL;

-- ============================================================
-- 4.1. Append-only trigger: data_lineage_events rejects UPDATE/DELETE
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_lineage_events_append_only()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'data_lineage_events is append-only: % not allowed', TG_OP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_lineage_events_append_only ON data_lineage_events;
CREATE TRIGGER trigger_lineage_events_append_only
  BEFORE UPDATE OR DELETE ON data_lineage_events
  FOR EACH ROW
  EXECUTE FUNCTION public.check_lineage_events_append_only();

-- Idempotency: unique active pair on data_lineage_links (only constrains active rows)
DROP INDEX IF EXISTS uq_data_lineage_links_active_pair;
CREATE UNIQUE INDEX IF NOT EXISTS uq_data_lineage_links_active_pair
  ON data_lineage_links(source_entity_type, source_entity_id, relation_type, target_entity_type, target_entity_id)
  WHERE mapping_status = 'active';

-- Data completeness: mapping_status check
DO $$
BEGIN
  ALTER TABLE data_lineage_links DROP CONSTRAINT IF EXISTS data_lineage_links_mapping_check;
  ALTER TABLE data_lineage_links ADD CONSTRAINT data_lineage_links_mapping_check
    CHECK (mapping_status IN ('active', 'superseded', 'unresolved', 'conflict', 'ignored'));
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'data_lineage_links_confidence_check') THEN
    ALTER TABLE data_lineage_links ADD CONSTRAINT data_lineage_links_confidence_check
      CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));
  END IF;
END $$;

-- Real idempotency key for data_lineage_batches
ALTER TABLE data_lineage_batches ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
DROP INDEX IF EXISTS uq_data_lineage_batches_idempotent;
CREATE UNIQUE INDEX IF NOT EXISTS uq_data_lineage_batches_idempotent
  ON data_lineage_batches(project_id, batch_type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ============================================================
-- 5. RLS on new tables
-- ============================================================
ALTER TABLE data_lineage_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_lineage_events ENABLE ROW LEVEL SECURITY;

-- Read policies
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['data_lineage_batches','data_import_batches','data_import_rows','data_lineage_events'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_read_policy ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_read_policy ON %I FOR SELECT USING (
      EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = %I.project_id AND pm.user_id = auth.uid())
      OR (SELECT current_setting(''role'', true) = ''service_role'')
    )', tbl, tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_write_policy ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_write_policy ON %I FOR INSERT WITH CHECK ((SELECT current_setting(''role'', true) = ''service_role''))', tbl, tbl);
  END LOOP;
END $$;

COMMIT;
