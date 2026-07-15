-- Reconcile legacy responsible_unit display column before participant_unit_id backfill.
-- The column remains legacy/display-only; participant_unit_id is the governed owner field.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS responsible_unit TEXT;

UPDATE public.tasks
   SET responsible_unit = NULLIF(BTRIM(assignee_unit), '')
 WHERE responsible_unit IS NULL
   AND NULLIF(BTRIM(assignee_unit), '') IS NOT NULL;
