-- v1.4.22.5: forecast scoped runtime assets need explicit scope-exception
-- approval evidence before a company/project-only publication can satisfy the
-- live self-learning completion gate.

COMMENT ON COLUMN public.algorithm_learnable_parameter_runtime_publications.release_package IS
  'Release package JSON. Forecast scoped runtime assets must carry scopeExceptionApprovalId and scopeExceptionApprovalStatus=approved; otherwise v1.4.22.5 treats company/project-only forecast learning as forecast_scope_exception_approval_required and not ready.';
