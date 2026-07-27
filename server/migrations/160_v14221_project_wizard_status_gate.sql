-- v1.4.22.1: project wizard draft status gate.
-- 草稿项目需要 status='wizard_drafting'，提交完成后回到既有项目生命周期口径“进行中”。

BEGIN;

ALTER TABLE IF EXISTS public.projects
  DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE IF EXISTS public.projects
  ADD CONSTRAINT projects_status_check
  CHECK (status IN ('未开始', '进行中', '已完成', '已暂停', 'wizard_drafting'));

INSERT INTO status_values (
  domain_key,
  status_key,
  status_label,
  sort_order,
  is_initial,
  is_terminal,
  visual_tone,
  semantic_tone
) VALUES (
  'project.lifecycle',
  'wizard_drafting',
  '向导草稿',
  0,
  true,
  false,
  'slate',
  'open'
) ON CONFLICT (domain_key, status_key) DO NOTHING;

INSERT INTO status_aliases (domain_key, alias_value, status_key, source_type) VALUES
  ('project.lifecycle', 'wizard_drafting', 'wizard_drafting', 'system'),
  ('project.lifecycle', '向导草稿', 'wizard_drafting', 'legacy')
ON CONFLICT (domain_key, alias_value) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
