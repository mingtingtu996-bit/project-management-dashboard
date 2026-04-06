-- Migration 033: Fix acceptance_plans type constraints
-- 
-- 背景：acceptance_type 字段原来有 NOT NULL + CHECK 白名单约束，
--       只允许固定8种类型，不支持自定义验收类型。
--       用户需求：验收类型不止8种，应该可以自由命名，只有验收名称是必须的。
--
-- 修改内容：
-- 1. 去掉 acceptance_type 的 NOT NULL 约束
-- 2. 去掉 acceptance_type 的 CHECK 白名单约束
-- 3. 添加 type_id 字段（varchar）支持新的分类标识
-- 4. 添加 type_name 字段（varchar）存储类型显示名称
-- 5. 添加 type_color 字段（varchar）存储类型颜色
-- 6. 将历史数据的 acceptance_type 迁移到兼容格式

-- Step 1: 删除旧的 CHECK 约束（PostgreSQL 需要先知道约束名）
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  -- 查找 acceptance_type 的 CHECK 约束
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  INNER JOIN pg_class rel ON rel.oid = con.conrelid
  INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE rel.relname = 'acceptance_plans'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%acceptance_type%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE acceptance_plans DROP CONSTRAINT IF EXISTS ' || quote_ident(constraint_name);
    RAISE NOTICE 'Dropped constraint: %', constraint_name;
  ELSE
    RAISE NOTICE 'No CHECK constraint on acceptance_type found, skipping.';
  END IF;
END $$;

-- Step 2: 修改 acceptance_type 为可空（允许不填类型）
ALTER TABLE acceptance_plans
  ALTER COLUMN acceptance_type DROP NOT NULL;

-- Step 3: 添加新字段（如果不存在）
ALTER TABLE acceptance_plans
  ADD COLUMN IF NOT EXISTS type_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS type_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS type_color VARCHAR(50),
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Step 4: 将历史 acceptance_type 值映射到 type_id（向后兼容）
UPDATE acceptance_plans
SET
  type_id = CASE acceptance_type
    WHEN '竣工' THEN 'completion'
    WHEN '消防' THEN 'fire'
    WHEN '环保' THEN 'environment'
    WHEN '规划' THEN 'planning'
    WHEN '节能' THEN 'energy'
    WHEN '分部' THEN 'sub_unit'
    WHEN '分项' THEN 'sub_item'
    WHEN '智能' THEN 'smart'
    WHEN '其他' THEN 'other'
    ELSE 'custom'
  END,
  type_name = COALESCE(type_name, acceptance_type)
WHERE acceptance_type IS NOT NULL AND type_id IS NULL;

-- 输出迁移结果
DO $$
DECLARE
  total_count INTEGER;
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM acceptance_plans;
  SELECT COUNT(*) INTO migrated_count FROM acceptance_plans WHERE type_id IS NOT NULL;
  RAISE NOTICE 'Migration 033 complete: % total records, % records migrated with type_id', total_count, migrated_count;
END $$;
