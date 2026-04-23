BEGIN;

-- H-D5: strengthen acceptance catalog referential integrity without deleting historical data.
-- 1) Null out orphan catalog references first so the FK can be added safely.
-- 2) Add a restrictive FK so catalog deletion is blocked while referenced by acceptance_plans.
-- 3) Keep the runtime CATALOG_IN_USE guard as a business-friendly layer above the DB constraint.

UPDATE acceptance_plans ap
SET catalog_id = NULL
WHERE catalog_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM acceptance_catalog ac
    WHERE ac.id = ap.catalog_id
  );

CREATE INDEX IF NOT EXISTS idx_acceptance_plans_catalog_id
  ON acceptance_plans(catalog_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_acceptance_plans_catalog_id'
  ) THEN
    EXECUTE '
      ALTER TABLE acceptance_plans
      ADD CONSTRAINT fk_acceptance_plans_catalog_id
      FOREIGN KEY (catalog_id)
      REFERENCES acceptance_catalog(id)
      ON DELETE RESTRICT
      ON UPDATE CASCADE
    ';
  END IF;
END $$;

COMMIT;
