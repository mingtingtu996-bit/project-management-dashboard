-- Migration 036: Fix acceptance_plans status constraint
-- Date: 2026-03-30
-- Problem: status field has CHECK constraint with Chinese values, but frontend sends English values
-- Fix: Drop CHECK constraint to allow both Chinese and English status values

-- Step 1: Drop the CHECK constraint on status column
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  -- Find the CHECK constraint on status column
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  INNER JOIN pg_class rel ON rel.oid = con.conrelid
  INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE rel.relname = 'acceptance_plans'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%status%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE acceptance_plans DROP CONSTRAINT IF EXISTS ' || quote_ident(constraint_name);
    RAISE NOTICE 'Dropped constraint: %', constraint_name;
  ELSE
    RAISE NOTICE 'No CHECK constraint on status found, skipping.';
  END IF;
END $$;

-- Step 2: Add comment explaining valid status values
COMMENT ON COLUMN acceptance_plans.status IS '验收状态：待验收(pending)/验收中(in_progress)/已通过(passed)/未通过(failed) 或中文值';

-- Step 3: Migrate existing English status values to Chinese (if any)
UPDATE acceptance_plans
SET status = CASE status
  WHEN 'pending' THEN '待验收'
  WHEN 'in_progress' THEN '验收中'
  WHEN 'passed' THEN '已通过'
  WHEN 'failed' THEN '未通过'
  ELSE status
END
WHERE status IN ('pending', 'in_progress', 'passed', 'failed');

-- Output migration result
DO $$
DECLARE
  total_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM acceptance_plans;
  RAISE NOTICE 'Migration 036 complete: % total records, status constraint removed', total_count;
END $$;
