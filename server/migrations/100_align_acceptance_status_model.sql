-- Align acceptance runtime status constraints with the canonical v2 model.
-- Runtime routes/types already use: draft / preparing / ready_to_submit /
-- submitted / inspecting / rectifying / passed / archived.

ALTER TABLE IF EXISTS public.acceptance_plans
  DROP CONSTRAINT IF EXISTS acceptance_plans_status_check_p7;

ALTER TABLE IF EXISTS public.acceptance_nodes
  DROP CONSTRAINT IF EXISTS acceptance_nodes_status_check_p7;

UPDATE public.acceptance_plans
SET status = CASE status
  WHEN 'not_started' THEN 'draft'
  WHEN 'in_acceptance' THEN 'inspecting'
  WHEN 'rectification' THEN 'rectifying'
  WHEN 'recorded' THEN 'archived'
  ELSE status
END
WHERE status IN ('not_started', 'in_acceptance', 'rectification', 'recorded');

UPDATE public.acceptance_nodes
SET status = CASE status
  WHEN 'not_started' THEN 'draft'
  WHEN 'in_acceptance' THEN 'inspecting'
  WHEN 'rectification' THEN 'rectifying'
  WHEN 'recorded' THEN 'archived'
  ELSE status
END
WHERE status IN ('not_started', 'in_acceptance', 'rectification', 'recorded');

ALTER TABLE IF EXISTS public.acceptance_plans
  ADD CONSTRAINT acceptance_plans_status_check_p7
  CHECK (status IN (
    'draft',
    'preparing',
    'ready_to_submit',
    'submitted',
    'inspecting',
    'rectifying',
    'passed',
    'archived'
  ));

ALTER TABLE IF EXISTS public.acceptance_nodes
  ADD CONSTRAINT acceptance_nodes_status_check_p7
  CHECK (status IN (
    'draft',
    'preparing',
    'ready_to_submit',
    'submitted',
    'inspecting',
    'rectifying',
    'passed',
    'archived'
  ));

NOTIFY pgrst, 'reload schema';
