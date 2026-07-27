-- 144_v1420_multi_company_isolation_followups.sql
-- v1.4.20: follow-up guards for multi-company workspace isolation

BEGIN;

-- Company workspaces need explicit discovery and join-policy fields. Earlier
-- company-space migrations only had status, while the workspace API already
-- writes these fields for new companies.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS discoverability TEXT NOT NULL DEFAULT 'invite_only',
  ADD COLUMN IF NOT EXISTS join_policy TEXT NOT NULL DEFAULT 'approval_required';

UPDATE companies
   SET is_active = CASE
     WHEN status = 'inactive' THEN false
     ELSE COALESCE(is_active, true)
   END;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_discoverability_check'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT companies_discoverability_check
      CHECK (discoverability IN ('public', 'searchable', 'invite_only', 'hidden'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_join_policy_check'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT companies_join_policy_check
      CHECK (join_policy IN ('open', 'approval_required', 'invite_only'));
  END IF;
END $$;

-- Company-level reminder preferences have project_id = NULL, so they need a
-- company-aware uniqueness guard separate from project-level preferences.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reminder_pref_user_company_global
  ON reminder_preferences(user_id, company_id)
  WHERE project_id IS NULL;

-- Workspace invitation / join-request tables must carry the same company
-- boundary as projects, otherwise cross-company workbench actions can collide.
ALTER TABLE project_direct_invitations
  ADD COLUMN IF NOT EXISTS company_id UUID NULL REFERENCES companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE project_direct_invitations pdi
   SET company_id = p.company_id
  FROM projects p
 WHERE pdi.project_id = p.id
   AND pdi.company_id IS NULL;

ALTER TABLE project_direct_invitations
  ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE project_join_requests
  ADD COLUMN IF NOT EXISTS company_id UUID NULL REFERENCES companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE project_join_requests pjr
   SET company_id = p.company_id
  FROM projects p
 WHERE pjr.project_id = p.id
   AND pjr.company_id IS NULL;

ALTER TABLE project_join_requests
  ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE company_join_requests
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE project_invitations
  ADD COLUMN IF NOT EXISTS company_id UUID NULL REFERENCES companies(id) ON DELETE CASCADE;

UPDATE project_invitations pi
   SET company_id = p.company_id
  FROM projects p
 WHERE pi.project_id = p.id
   AND pi.company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_project_direct_invite_company
  ON project_direct_invitations(company_id, recipient_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_join_requests_company
  ON project_join_requests(company_id, project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_invitations_company
  ON project_invitations(company_id, project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_companies_discovery
  ON companies(is_active, discoverability, name);

COMMIT;
