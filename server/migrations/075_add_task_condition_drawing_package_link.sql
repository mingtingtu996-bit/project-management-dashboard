ALTER TABLE task_conditions
  ADD COLUMN IF NOT EXISTS drawing_package_id UUID NULL,
  ADD COLUMN IF NOT EXISTS drawing_package_code TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_task_conditions_drawing_package_id
  ON task_conditions (drawing_package_id);

CREATE INDEX IF NOT EXISTS idx_task_conditions_drawing_package_code
  ON task_conditions (drawing_package_code);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_task_conditions_drawing_package_id'
  ) THEN
    ALTER TABLE task_conditions
      ADD CONSTRAINT fk_task_conditions_drawing_package_id
      FOREIGN KEY (drawing_package_id)
      REFERENCES drawing_packages(id)
      ON DELETE SET NULL;
  END IF;
END
$$;
