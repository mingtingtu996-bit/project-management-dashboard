-- ============================================================
-- Supabase RPC 函数：execute_sql
-- 用于支持后端路由中的原始 SQL 执行（仅限 SELECT 查询）
-- 在 Supabase 控制台 > SQL Editor 中执行此文件
-- ============================================================

-- 删除旧版本（如果存在）
DROP FUNCTION IF EXISTS public.execute_sql(text, jsonb);
DROP FUNCTION IF EXISTS public.execute_sql(text, anyarray);

-- 创建新版本：支持参数数组
CREATE OR REPLACE FUNCTION public.execute_sql(
  sql   text,
  params jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  param_values text[];
  i integer;
  dynamic_sql text;
BEGIN
  -- 将 jsonb 数组转换为 text 数组用于参数绑定
  SELECT array_agg(elem::text)
  INTO param_values
  FROM jsonb_array_elements(params) AS elem;

  -- 执行动态 SQL，返回 JSON 结果集
  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || sql || ') t'
    INTO result
    USING VARIADIC coalesce(param_values, ARRAY[]::text[]);

  RETURN coalesce(result, '[]'::jsonb);
END;
$$;

-- 授予权限
GRANT EXECUTE ON FUNCTION public.execute_sql(text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.execute_sql(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_sql(text, jsonb) TO service_role;
