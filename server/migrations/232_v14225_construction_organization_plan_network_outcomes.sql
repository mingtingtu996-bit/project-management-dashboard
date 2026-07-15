-- v1.4.22.5: allow construction-organization plan-network runtime publications
-- to produce canonical read-side plan-network outcomes without creating a
-- parallel construction-organization outcome table.

ALTER TABLE public.duration_plan_network_outcomes
  DROP CONSTRAINT IF EXISTS duration_plan_network_outcomes_asset_key_check;

ALTER TABLE public.duration_plan_network_outcomes
  ADD CONSTRAINT duration_plan_network_outcomes_asset_key_check
  CHECK (asset_key IN (
    'special_work_duration_seed',
    'wbs_reference_days',
    'dependency_rule_candidate',
    'critical_path_rule_candidate',
    'construction_organization_plan_network'
  ));

COMMENT ON CONSTRAINT duration_plan_network_outcomes_asset_key_check
  ON public.duration_plan_network_outcomes IS
  'Allowed learnable plan-network outcome asset keys. construction_organization_plan_network rows are read-side saved-network outcomes for controlled construction-organization plan-network publications, not runtime writers or fact writers.';

NOTIFY pgrst, 'reload schema';
