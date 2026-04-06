-- Migration 027: Add missing columns to wbs_templates
-- Date: 2026-03-29
-- Problem: wbs_templates table missing columns expected by frontend code:
--   status, is_public, is_builtin, usage_count, category, tags,
--   node_count, reference_days, template_data
-- These columns are used in WBSTemplates.tsx filter logic and mapTemplateFields().
-- Without them, Supabase returns null for all fields, causing ALL templates
-- to be filtered out (matchStatus always = 'disabled').

-- 1. Add status column (the root cause of all templates being filtered out)
ALTER TABLE wbs_templates ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published'
  CHECK (status IN ('draft', 'published', 'disabled'));

-- 2. Sync status from is_default (is_default=true -> 'draft', else 'published')
UPDATE wbs_templates SET status = CASE
  WHEN is_default = TRUE THEN 'draft'
  ELSE 'published'
END WHERE status IS NULL;

-- 3. Add missing metadata columns
ALTER TABLE wbs_templates ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE;
ALTER TABLE wbs_templates ADD COLUMN IF NOT EXISTS is_builtin BOOLEAN DEFAULT FALSE;
ALTER TABLE wbs_templates ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0;
ALTER TABLE wbs_templates ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE wbs_templates ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE wbs_templates ADD COLUMN IF NOT EXISTS node_count INTEGER DEFAULT 0;
ALTER TABLE wbs_templates ADD COLUMN IF NOT EXISTS reference_days INTEGER;
ALTER TABLE wbs_templates ADD COLUMN IF NOT EXISTS template_data JSONB;

-- 4. Populate node_count from wbs_nodes array length (for nodes with "children")
UPDATE wbs_templates SET node_count = (
  SELECT COALESCE(jsonb_array_length(wbs_nodes), 0) + (
    SELECT COALESCE(SUM(jsonb_array_length(j->'children')), 0)
    FROM jsonb_array_elements(wbs_nodes) AS j
    WHERE j->'children' IS NOT NULL
  )
) WHERE node_count = 0 AND wbs_nodes IS NOT NULL;

-- 5. Sync template_data = wbs_nodes for any rows that have wbs_nodes but no template_data
UPDATE wbs_templates SET template_data = wbs_nodes
  WHERE template_data IS NULL AND wbs_nodes IS NOT NULL;

-- 6. Update RLS policy to also check status != 'disabled' (in addition to deleted_at)
DROP POLICY IF EXISTS "wbs_templates_select_policy" ON wbs_templates;
CREATE POLICY "wbs_templates_select_policy" ON wbs_templates FOR SELECT
    USING (deleted_at IS NULL AND (status != 'disabled' OR status IS NULL));
