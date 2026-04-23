BEGIN;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS participant_unit_id UUID REFERENCES participant_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_participant_unit_id
  ON tasks(participant_unit_id);

UPDATE tasks t
SET participant_unit_id = pu.id
FROM participant_units pu
WHERE t.participant_unit_id IS NULL
  AND pu.unit_name = COALESCE(NULLIF(BTRIM(t.responsible_unit), ''), NULLIF(BTRIM(t.assignee_unit), ''));

COMMIT;
