-- 检查 tasks 表的结构
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'tasks'
ORDER BY ordinal_position;
