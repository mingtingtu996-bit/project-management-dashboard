-- Verification: Check if task_conditions and task_obstacles tables exist

-- Check table structure
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name IN ('task_conditions', 'task_obstacles')
ORDER BY table_name, ordinal_position;

-- Check indexes
SELECT 
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('task_conditions', 'task_obstacles');

-- Check RLS policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename IN ('task_conditions', 'task_obstacles');
