-- v1.4.23.1 follow-up: keep global data-lineage reference tables readable
-- only through an explicit authenticated identity predicate.
--
-- These two tables are global rule/reference catalogs, so they do not have a
-- company_id/project_id tenant column. The live RLS diagnostic still requires
-- a visible auth/tenant predicate instead of an unconditional read predicate.

BEGIN;

DROP POLICY IF EXISTS data_lineage_entity_types_authenticated_read_policy
  ON public.data_lineage_entity_types;
CREATE POLICY data_lineage_entity_types_authenticated_read_policy
  ON public.data_lineage_entity_types
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS data_lineage_relation_rules_authenticated_read_policy
  ON public.data_lineage_relation_rules;
CREATE POLICY data_lineage_relation_rules_authenticated_read_policy
  ON public.data_lineage_relation_rules
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

NOTIFY pgrst, 'reload schema';

COMMIT;
