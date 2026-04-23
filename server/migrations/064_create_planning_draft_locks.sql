BEGIN;

CREATE TABLE IF NOT EXISTS planning_draft_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  draft_type VARCHAR(20) NOT NULL
    CHECK (draft_type IN ('baseline', 'monthly_plan')),
  resource_id UUID NOT NULL,
  locked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lock_expires_at TIMESTAMPTZ NOT NULL,
  reminder_sent_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  released_by UUID REFERENCES users(id) ON DELETE SET NULL,
  release_reason VARCHAR(30)
    CHECK (release_reason IN ('timeout', 'force_unlock', 'manual_release')),
  is_locked BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, draft_type, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_planning_draft_locks_project_id ON planning_draft_locks(project_id);
CREATE INDEX IF NOT EXISTS idx_planning_draft_locks_expiry ON planning_draft_locks(is_locked, lock_expires_at);
CREATE INDEX IF NOT EXISTS idx_planning_draft_locks_resource_id ON planning_draft_locks(resource_id);

COMMIT;
