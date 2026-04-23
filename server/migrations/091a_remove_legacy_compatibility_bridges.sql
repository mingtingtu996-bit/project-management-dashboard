UPDATE public.acceptance_plans
SET status = CASE
  WHEN status IN ('pending', 'not_started', U&'\8349\7A3F', U&'\5F85\542F\52A8', U&'\5F85\9A8C\6536', U&'\672A\542F\52A8') THEN 'draft'
  WHEN status = U&'\51C6\5907\4E2D' THEN 'preparing'
  WHEN status IN ('ready', U&'\5F85\7533\62A5') THEN 'ready_to_submit'
  WHEN status = U&'\5DF2\7533\62A5' THEN 'submitted'
  WHEN status IN ('in_progress', 'in_acceptance', U&'\9A8C\6536\4E2D') THEN 'inspecting'
  WHEN status IN ('failed', 'needs_revision', 'rectification', U&'\6574\6539\4E2D', U&'\8865\6B63\4E2D', U&'\672A\901A\8FC7', U&'\9700\8865\5145') THEN 'rectifying'
  WHEN status = U&'\5DF2\901A\8FC7' THEN 'passed'
  WHEN status IN ('recorded', U&'\5DF2\5907\6848', U&'\5DF2\5F52\6863', U&'\5DF2\5173\95ED') THEN 'archived'
  ELSE status
END
WHERE status IN (
  'pending',
  'not_started',
  'ready',
  'in_progress',
  'in_acceptance',
  'failed',
  'needs_revision',
  'rectification',
  U&'\8349\7A3F',
  U&'\5F85\542F\52A8',
  U&'\51C6\5907\4E2D',
  U&'\5F85\7533\62A5',
  U&'\5DF2\7533\62A5',
  U&'\9A8C\6536\4E2D',
  U&'\6574\6539\4E2D',
  U&'\8865\6B63\4E2D',
  U&'\5DF2\901A\8FC7',
  U&'\5DF2\5907\6848',
  U&'\5DF2\5F52\6863',
  U&'\5DF2\5173\95ED',
  U&'\5F85\9A8C\6536',
  U&'\672A\542F\52A8',
  U&'\672A\901A\8FC7',
  U&'\9700\8865\5145'
);

UPDATE public.acceptance_nodes
SET status = CASE
  WHEN status IN ('pending', 'not_started', U&'\8349\7A3F', U&'\5F85\542F\52A8', U&'\5F85\9A8C\6536', U&'\672A\542F\52A8') THEN 'draft'
  WHEN status = U&'\51C6\5907\4E2D' THEN 'preparing'
  WHEN status IN ('ready', U&'\5F85\7533\62A5') THEN 'ready_to_submit'
  WHEN status = U&'\5DF2\7533\62A5' THEN 'submitted'
  WHEN status IN ('in_progress', 'in_acceptance', U&'\9A8C\6536\4E2D') THEN 'inspecting'
  WHEN status IN ('failed', 'needs_revision', 'rectification', U&'\6574\6539\4E2D', U&'\8865\6B63\4E2D', U&'\672A\901A\8FC7', U&'\9700\8865\5145') THEN 'rectifying'
  WHEN status = U&'\5DF2\901A\8FC7' THEN 'passed'
  WHEN status IN ('recorded', U&'\5DF2\5907\6848', U&'\5DF2\5F52\6863', U&'\5DF2\5173\95ED') THEN 'archived'
  ELSE status
END
WHERE status IN (
  'pending',
  'not_started',
  'ready',
  'in_progress',
  'in_acceptance',
  'failed',
  'needs_revision',
  'rectification',
  U&'\8349\7A3F',
  U&'\5F85\542F\52A8',
  U&'\51C6\5907\4E2D',
  U&'\5F85\7533\62A5',
  U&'\5DF2\7533\62A5',
  U&'\9A8C\6536\4E2D',
  U&'\6574\6539\4E2D',
  U&'\8865\6B63\4E2D',
  U&'\5DF2\901A\8FC7',
  U&'\5DF2\5907\6848',
  U&'\5DF2\5F52\6863',
  U&'\5DF2\5173\95ED',
  U&'\5F85\9A8C\6536',
  U&'\672A\542F\52A8',
  U&'\672A\901A\8FC7',
  U&'\9700\8865\5145'
);

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'acceptance_plans'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.acceptance_plans DROP CONSTRAINT IF EXISTS %I', rec.conname);
  END LOOP;
END $$;

ALTER TABLE public.acceptance_plans
  ADD CONSTRAINT acceptance_plans_status_check_p7
  CHECK (status IN ('draft', 'preparing', 'ready_to_submit', 'submitted', 'inspecting', 'rectifying', 'passed', 'archived'));

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'acceptance_nodes'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.acceptance_nodes DROP CONSTRAINT IF EXISTS %I', rec.conname);
  END LOOP;
END $$;

ALTER TABLE public.acceptance_nodes
  ADD CONSTRAINT acceptance_nodes_status_check_p7
  CHECK (status IN ('draft', 'preparing', 'ready_to_submit', 'submitted', 'inspecting', 'rectifying', 'passed', 'archived'));

ALTER TABLE public.acceptance_plans
  DROP COLUMN IF EXISTS depends_on;

UPDATE public.task_obstacles
SET status = U&'\5DF2\89E3\51B3'
WHERE status = U&'\65E0\6CD5\89E3\51B3';

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'task_obstacles'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.task_obstacles DROP CONSTRAINT IF EXISTS %I', rec.conname);
  END LOOP;
END $$;

ALTER TABLE public.task_obstacles
  ADD CONSTRAINT task_obstacles_status_check_p7
  CHECK (status IN (U&'\5F85\5904\7406', U&'\5904\7406\4E2D', U&'\5DF2\89E3\51B3'));

INSERT INTO public.task_critical_overrides (
  id,
  project_id,
  task_id,
  mode,
  anchor_type,
  left_task_id,
  right_task_id,
  reason,
  created_by,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  t.project_id,
  t.id,
  'manual_attention',
  NULL,
  NULL,
  NULL,
  'migrated from legacy is_critical flag',
  NULL,
  COALESCE(t.updated_at, t.created_at, NOW()),
  COALESCE(t.updated_at, t.created_at, NOW())
FROM public.tasks t
WHERE COALESCE(t.is_critical, FALSE) = TRUE
  AND t.project_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.task_critical_overrides o
    WHERE o.project_id = t.project_id
      AND o.task_id = t.id
      AND o.mode = 'manual_attention'
  );

NOTIFY pgrst, 'reload schema';
