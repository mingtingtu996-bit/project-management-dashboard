ALTER TABLE acceptance_requirements
  ADD COLUMN IF NOT EXISTS drawing_package_id UUID NULL;

UPDATE acceptance_requirements ar
SET drawing_package_id = dp.id
FROM drawing_packages dp
WHERE ar.drawing_package_id IS NULL
  AND ar.project_id = dp.project_id
  AND (
    (ar.source_entity_type = 'drawing_package' AND ar.source_entity_id = dp.id)
    OR EXISTS (
      SELECT 1
      FROM construction_drawings cd
      WHERE cd.id = ar.source_entity_id
        AND ar.source_entity_type = 'drawing'
        AND cd.package_id = dp.id
    )
  );

CREATE INDEX IF NOT EXISTS idx_acceptance_requirements_drawing_package_id
  ON acceptance_requirements (drawing_package_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_acceptance_requirements_drawing_package_id'
  ) THEN
    ALTER TABLE acceptance_requirements
      ADD CONSTRAINT fk_acceptance_requirements_drawing_package_id
      FOREIGN KEY (drawing_package_id)
      REFERENCES drawing_packages(id)
      ON DELETE SET NULL;
  END IF;
END
$$;
