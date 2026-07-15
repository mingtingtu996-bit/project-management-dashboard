-- v1.4.23.1 learnable-parameter runtime single-active publication guard.
--
-- Publishing a new scoped parameter value must supersede older active rows.
-- This partial unique index prevents two published/canary rows for the same
-- parameter, owner, scope and target surface from coexisting.

CREATE UNIQUE INDEX IF NOT EXISTS uq_algorithm_learnable_parameter_runtime_active_scope
  ON public.algorithm_learnable_parameter_runtime_publications (
    parameter_key,
    COALESCE(owner_algorithm, ''),
    scope_level,
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
    target_surface
  )
  WHERE publication_status IN ('published', 'canary');
