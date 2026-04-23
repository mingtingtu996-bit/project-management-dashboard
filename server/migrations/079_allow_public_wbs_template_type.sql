-- Migration 079: allow public-building WBS template presets
-- Purpose:
--   Keep the live table constraint aligned with the newer built-in engineering templates.
-- Notes:
--   Preserve the legacy 市政 type for backward compatibility with older records.

ALTER TABLE wbs_templates
DROP CONSTRAINT IF EXISTS wbs_templates_template_type_check;

ALTER TABLE wbs_templates
ADD CONSTRAINT wbs_templates_template_type_check
CHECK (template_type IN ('住宅', '商业', '工业', '公共建筑', '市政'));
