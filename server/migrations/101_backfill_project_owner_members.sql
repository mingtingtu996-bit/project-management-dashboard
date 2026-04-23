-- Backfill and normalize owner memberships for project team management.

UPDATE public.project_members AS pm
SET permission_level = 'owner',
    is_active = TRUE,
    joined_at = COALESCE(pm.joined_at, NOW()),
    last_activity = COALESCE(pm.last_activity, NOW())
FROM public.projects AS p
WHERE p.owner_id IS NOT NULL
  AND pm.project_id = p.id
  AND pm.user_id = p.owner_id;

INSERT INTO public.project_members (
  id,
  project_id,
  user_id,
  permission_level,
  joined_at,
  is_active,
  last_activity
)
SELECT
  gen_random_uuid(),
  p.id,
  p.owner_id,
  'owner',
  NOW(),
  TRUE,
  NOW()
FROM public.projects AS p
WHERE p.owner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.project_members AS pm
    WHERE pm.project_id = p.id
      AND pm.user_id = p.owner_id
  );
