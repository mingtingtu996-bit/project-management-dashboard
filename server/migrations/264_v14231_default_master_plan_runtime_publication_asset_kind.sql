-- v1.4.23.1 default master-plan runtime publication asset-kind closeout.
-- This only extends the governed WBS template runtime publication discriminator.
-- It does not write wbs_templates, wbs_template_nodes, tasks, task_baselines,
-- task_dependencies, or algorithm seed runtime.

BEGIN;

ALTER TABLE public.wbs_template_runtime_publications
  DROP CONSTRAINT IF EXISTS wbs_template_runtime_publications_asset_kind_check;

ALTER TABLE public.wbs_template_runtime_publications
  ADD CONSTRAINT wbs_template_runtime_publications_asset_kind_check
  CHECK (asset_kind IN ('special_work_duration_seed', 'wbs_reference_days', 'default_master_plan'));

COMMENT ON CONSTRAINT wbs_template_runtime_publications_asset_kind_check
  ON public.wbs_template_runtime_publications IS
  'Allows governed WBS template runtime assets, including default master-plan accepted baseline runtime publication; does not write wbs_templates, wbs_template_nodes, tasks, task_baselines, task_dependencies, or algorithm seed runtime.';

COMMENT ON TABLE public.wbs_template_runtime_publications IS
  'v1.4.22.3 governed WBS template runtime publications, extended by v1.4.23.1 for default master-plan accepted baseline runtime publication. This table is the runtime publication/audit boundary and does not write wbs_templates, wbs_template_nodes, tasks, task_baselines, task_dependencies, or algorithm seed runtime.';

NOTIFY pgrst, 'reload schema';

COMMIT;
