-- 056: create issues domain table

CREATE TABLE IF NOT EXISTS issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  source_type VARCHAR(60) NOT NULL
    CHECK (
      source_type IN (
        'manual',
        'risk_converted',
        'risk_auto_escalated',
        'obstacle_escalated',
        'condition_expired',
        'source_deleted'
      )
    ),
  source_id UUID,
  chain_id UUID,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  priority INTEGER NOT NULL DEFAULT 50,
  pending_manual_close BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  closed_reason VARCHAR(100),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_issues_source
  ON issues (source_id, source_type)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_issues_chain_id
  ON issues (chain_id)
  WHERE chain_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_issues_project
  ON issues (project_id);

CREATE INDEX IF NOT EXISTS idx_issues_task
  ON issues (task_id)
  WHERE task_id IS NOT NULL;

CREATE OR REPLACE FUNCTION update_issues_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS issues_updated_at ON issues;
CREATE TRIGGER issues_updated_at
  BEFORE UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION update_issues_updated_at();
