// 检查 tasks 表数据量和前几条记录
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 环境变量未设置');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  // 获取 tasks 表总数
  const { count, error: countErr } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true });

  console.log('tasks 表总记录数:', count ?? 0, countErr ? `(${countErr.message})` : '');

  // 获取几条示例数据
  const { data: tasks, error: tasksErr } = await supabase
    .from('tasks')
    .select('id, title, status, progress, version, start_date, end_date, planned_start_date, planned_end_date, actual_start_date, actual_end_date')
    .limit(5);

  if (tasksErr) {
    console.error('查询失败:', tasksErr.message);
    return;
  }

  if (!tasks || tasks.length === 0) {
    console.log('\n⚠️  tasks 表为空！GanttView 无数据可显示/编辑');
    console.log('💡 这是保存失败的根本原因');
  } else {
    console.log('\n前', tasks.length, '条任务:');
    tasks.forEach(t => {
      console.log(`  - ${t.title} | status=${t.status} | v=${t.version}`);
    });
  }
}

check().catch(console.error);
