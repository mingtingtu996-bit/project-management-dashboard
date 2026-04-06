// 测试 task update 接口 - 模拟 GanttView 的 PUT 请求
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 环境变量未设置');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testUpdate() {
  // 找一个存在的任务
  const { data: tasks, error: listErr } = await supabase
    .from('tasks')
    .select('id, title, version, start_date, end_date, status')
    .limit(1);

  if (listErr || !tasks || tasks.length === 0) {
    console.log('没有找到任务:', listErr?.message || '空表');
    return;
  }

  const task = tasks[0];
  console.log('测试更新任务:', task.id, '-', task.title);
  console.log('当前 version:', task.version);

  // 模拟 GanttView 的更新数据
  const updateData = {
    title: task.title,
    description: null,
    status: 'in_progress',
    priority: 'medium',
    start_date: task.start_date,
    end_date: task.end_date,
    progress: 10,
    assignee: null,
    assignee_unit: null,
    updated_at: new Date().toISOString(),
    specialty_type: null,
    reference_duration: undefined,
    version: task.version || 1,
  };

  console.log('\n发送更新数据:');
  console.log(JSON.stringify(updateData, null, 2));

  // 直接测试 Supabase UPDATE
  const { data: updated, error: updateErr } = await supabase
    .from('tasks')
    .update({ ...updateData, version: (task.version || 1) + 1, updated_at: new Date().toISOString() })
    .eq('id', task.id)
    .select()
    .single();

  if (updateErr) {
    console.error('\n❌ UPDATE 失败:', updateErr.message);
    console.error('错误代码:', updateErr.code);
    console.error('错误详情:', JSON.stringify(updateErr.details, null, 2));
  } else {
    console.log('\n✅ UPDATE 成功');
    console.log('新 version:', updated.version);
  }
}

testUpdate().catch(console.error);
