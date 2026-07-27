-- v1.4.22.1 §4.3.1: Company project template library
CREATE TABLE IF NOT EXISTS company_project_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  source_project_id UUID,
  business_type TEXT NOT NULL,
  business_subtype TEXT,
  method_variant_codes JSONB NOT NULL DEFAULT '[]',
  geographic_context JSONB NOT NULL DEFAULT '[]',
  project_features JSONB NOT NULL DEFAULT '{}',
  scope_tree_snapshot JSONB NOT NULL DEFAULT '[]',
  default_detail_level TEXT NOT NULL DEFAULT 'standard' CHECK (default_detail_level IN ('overview','standard','detailed')),
  snapshot JSONB NOT NULL,
  version_history JSONB NOT NULL DEFAULT '[]',
  usage_count INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_project_templates_active_name
  ON company_project_templates(company_id, name)
  WHERE deleted_at IS NULL;
