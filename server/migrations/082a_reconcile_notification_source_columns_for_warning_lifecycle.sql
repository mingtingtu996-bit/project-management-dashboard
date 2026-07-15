-- Reconcile notification source/status columns before warning lifecycle indexes use them.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS source_entity_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS source_entity_id TEXT,
  ADD COLUMN IF NOT EXISTS status VARCHAR(30);

UPDATE public.notifications
SET
  source_entity_type = COALESCE(source_entity_type, target_type),
  source_entity_id = COALESCE(source_entity_id, target_id::text),
  status = COALESCE(status, CASE WHEN COALESCE(is_read, FALSE) THEN 'read' ELSE 'unread' END)
WHERE source_entity_type IS NULL
   OR source_entity_id IS NULL
   OR status IS NULL;
