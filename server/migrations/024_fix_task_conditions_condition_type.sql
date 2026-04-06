-- 024_fix_task_conditions_condition_type.sql
-- G1 (P0): 修复 task_conditions.condition_type CHECK 约束
-- 前端 CONDITION_TYPES 英文键: material/personnel/weather/design-change/preceding/other
-- 旧 DB CHECK 只允许中文: 图纸/材料/人员/设备/其他
-- 执行时间: 2026-03-29

-- 方案: 先删除旧 CHECK 约束，再添加新约束
-- 注意: 已有数据中的中文值会保留（不会自动转换）

-- 1. 移除旧 CHECK 约束
ALTER TABLE task_conditions DROP CONSTRAINT IF EXISTS task_conditions_condition_type_check;

-- 2. 添加新 CHECK 约束（覆盖前端所有6种类型 + 兼容旧中文值）
ALTER TABLE task_conditions ADD CONSTRAINT task_conditions_condition_type_check
  CHECK (
    condition_type IN (
      'material',
      'personnel',
      'weather',
      'design-change',  -- 前端: { value: 'design-change', label: '设计变更' }
      'preceding',
      'other',
      -- 兼容旧数据中的中文类型名（已存在的记录不会报错）
      '图纸',
      '材料',
      '人员',
      '设备',
      '其他'
    )
  );

-- 3. 备注: 已有数据如包含旧中文类型名，可选择性迁移
-- SELECT DISTINCT condition_type FROM task_conditions;
-- UPDATE task_conditions SET condition_type = 'material' WHERE condition_type = '图纸';
