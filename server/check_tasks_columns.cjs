// 检查 Supabase tasks 表各字段是否存在
// 策略：逐列 SELECT，如果列不存在会返回错误
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 环境变量未设置');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const fieldsToCheck = [
  'id', 'project_id', 'title', 'status', 'progress', 'start_date', 'end_date',
  // 新增字段
  'planned_start_date', 'planned_end_date',
  'actual_start_date', 'actual_end_date',
  'planned_duration', 'standard_duration', 'ai_adjusted_duration',
  'wbs_code', 'wbs_level', 'milestone_level', 'is_milestone', 'is_critical'
];

async function checkField(field) {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select(field)
      .limit(1);
    if (error && error.code === 'PGRST116') {
      return { field, exists: false, error: '列不存在' };
    }
    if (error) {
      return { field, exists: false, error: error.message };
    }
    return { field, exists: true, error: null };
  } catch (e) {
    return { field, exists: false, error: e.message };
  }
}

async function checkAllFields() {
  console.log('🔍 开始检查 tasks 表字段...\n');

  const { data, error } = await supabase
    .from('tasks')
    .select('id')
    .limit(1);

  if (error) {
    console.error('❌ tasks 表查询失败:', error.message);
    console.log('   错误代码:', error.code);
    if (error.code === '42P01') {
      console.error('   tasks 表不存在！');
    }
    return;
  }

  console.log('✅ tasks 表存在\n');

  const results = [];
  for (const field of fieldsToCheck) {
    const result = await checkField(field);
    results.push(result);
    process.stdout.write('.');
  }
  console.log('\n');

  console.log('📋 字段检查结果:');
  console.log('─'.repeat(45));
  results.forEach(r => {
    console.log(`  ${r.exists ? '✅' : '❌'} ${r.field.padEnd(25)} ${r.exists ? '存在' : r.error}`);
  });

  const missing = results.filter(r => !r.exists);
  if (missing.length > 0) {
    console.log('\n⚠️  以下字段不存在于 Supabase tasks 表:');
    missing.forEach(m => console.log('   ❌', m.field));
    console.log('\n💡 这就是 GanttView 保存失败的原因！');
  } else {
    console.log('\n✅ 所有字段都存在！保存失败是其他原因');
  }
}

checkAllFields().catch(console.error);
