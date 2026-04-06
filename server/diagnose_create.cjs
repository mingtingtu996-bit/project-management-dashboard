// 诊断：直接测试 Supabase POST /api/tasks 的真实错误
const https = require('https');

const API_BASE = 'https://service-xxxxxxxx-0-0-0-xxxxxxxx-0.bj.tencentyun.com';

// 读取 .env
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '../../.env');
let supabaseUrl = '', supabaseKey = '';

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    if (line.startsWith('SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim().replace(/"/g, '');
    if (line.startsWith('SUPABASE_SERVICE_KEY=')) supabaseKey = line.split('=')[1].trim().replace(/"/g, '');
    if (line.startsWith('SUPABASE_ANON_KEY=')) { if (!supabaseKey) supabaseKey = line.split('=')[1].trim().replace(/"/g, ''); }
  }
}

console.log('=== 诊断开始 ===');
console.log('SUPABASE_URL:', supabaseUrl ? supabaseUrl.slice(0, 30) + '...' : 'NOT SET');

// 读取 projects 获取一个 project_id
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('\n[1] 读取 projects...');
  const { data: projects, error: projErr } = await supabase.from('projects').select('id, name');
  if (projErr) { console.error('读取 projects 失败:', projErr); return; }
  if (!projects || projects.length === 0) { console.error('projects 表为空!'); return; }
  const projectId = projects[0].id;
  console.log('  project_id:', projectId);

  console.log('\n[2] 检查 tasks 表结构...');
  const { data: tasksSample, error: tasksErr } = await supabase
    .from('tasks')
    .select('*')
    .limit(1);
  if (tasksErr) {
    console.error('  tasks 表查询失败:', tasksErr);
    console.error('  错误代码:', tasksErr.code);
    console.error('  错误详情:', tasksErr.details);
    console.error('  提示:', tasksErr.hint);
  } else {
    console.log('  tasks 表可访问，样本数:', tasksSample?.length);
  }

  console.log('\n[3] 尝试插入一条测试任务...');
  const testTask = {
    project_id: projectId,
    title: '诊断测试任务-' + Date.now(),
    status: 'todo',
    priority: 'medium',
    progress: 0,
    version: 1,
  };
  const { data: insertData, error: insertErr } = await supabase
    .from('tasks')
    .insert(testTask)
    .select()
    .single();

  if (insertErr) {
    console.error('  ❌ 插入失败!');
    console.error('  错误消息:', insertErr.message);
    console.error('  错误代码:', insertErr.code);
    console.error('  错误详情:', insertErr.details);
    console.error('  提示:', insertErr.hint);
  } else {
    console.log('  ✅ 插入成功! task_id:', insertData.id);
    // 删除测试任务
    await supabase.from('tasks').delete().eq('id', insertData.id);
    console.log('  测试任务已清理');
  }

  console.log('\n[4] 尝试通过 API 创建任务...');
  const apiPayload = {
    project_id: projectId,
    title: 'API诊断测试任务-' + Date.now(),
    status: 'todo',
    priority: 'medium',
    progress: 0,
  };

  try {
    const response = await fetch(`${API_BASE}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiPayload),
    });
    const json = await response.json();
    console.log(`  HTTP ${response.status}`);
    console.log('  响应:', JSON.stringify(json, null, 2));
  } catch (e) {
    console.error('  API 请求失败:', e.message);
  }
}

run().catch(console.error);
