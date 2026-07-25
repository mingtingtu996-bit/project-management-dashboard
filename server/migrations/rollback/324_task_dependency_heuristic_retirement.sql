UPDATE public.task_dependencies
SET status = 'active',
    metadata = metadata - 'formalDependencyRetirement',
    updated_at = NOW()
WHERE status = 'inactive'
  AND metadata #>> '{formalDependencyRetirement,migration}' = '324_task_dependency_heuristic_retirement'
  AND metadata #>> '{formalDependencyRetirement,previousStatus}' = 'active';
