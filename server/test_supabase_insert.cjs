// 直接测试 Supabase tasks 表插入，返回真实错误
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 环境变量未设置!');
  console.error('SUPABASE_URL:', supabaseUrl ? '已设置' : '❌ 未设置');
  console.error('SUPABASE_KEY:', supabaseKey ? '已设置' : '❌ 未设置');
  process.exit(1);
}

console.log('✅ 环境变量已加载');
console.log('SUPABASE_URL:', supabaseUrl.slice(0, 35) + '...');

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  // 1. 获取一个项目
  console.log('\n[1] 获取测试项目...');
  const { data: projects, error: projErr } = await supabase.from('projects').select('id, name');
  if (projErr) { console.error('❌', projErr); return; }
  if (!projects?.length) { console.error('❌ projects 表为空'); return; }
  const project = projects[0];
  console.log('   项目:', project.name, 'id:', project.id);

  // 2. 尝试最小化插入
  console.log('\n[2] 尝试最小化插入（只填必填字段）...');
  const minimalTask = {
    project_id: project.id,
    title: '诊断测试-' + Date.now(),
    status: 'todo',
    priority: 'medium',
    progress: 0,
    version: 1,
  };
  
  const { data: result1, error: err1 } = await supabase
    .from('tasks')
    .insert(minimalTask)
    .select()
    .single();

  if (err1) {
    console.error('❌ 最小插入失败:');
    console.error('   message:', err1.message);
    console.error('   code:', err1.code);
    console.error('   details:', JSON.stringify(err1.details));
    console.error('   hint:', err1.hint);
  } else {
    console.log('✅ 最小插入成功! id:', result1.id);
    // 清理
    await supabase.from('tasks').delete().eq('id', result1.id);
    console.log('   清理完成');
  }

  // 3. 尝试完整字段插入
  console.log('\n[3] 尝试完整字段插入...');
  const fullTask = {
    project_id: project.id,
    title: '完整诊断测试-' + Date.now(),
    status: 'todo',
    priority: 'medium',
    progress: 0,
    version: 1,
    start_date: new Date().toISOString(),
    end_date: new Date(Date.now() + 7 * 86400000).toISOString(),
    planned_start_date: new Date().toISOString(),
    planned_end_date: new Date(Date.now() + 7 * 86400000).toISOString(),
    planned_duration: 7,
    standard_duration: 10,
    ai_adjusted_duration: 8,
    dependencies: [],
  };

  const { data: result2, error: err2 } = await supabase
    .from('tasks')
    .insert(fullTask)
    .select()
    .single();

  if (err2) {
    console.error('❌ 完整插入失败:');
    console.error('   message:', err2.message);
    console.error('   code:', err2.code);
    console.error('   details:', JSON.stringify(err2.details));
    console.error('   hint:', err2.hint);
  } else {
    console.log('✅ 完整插入成功! id:', result2.id);
    await supabase.from('tasks').delete().eq('id', result2.id);
    console.log('   清理完成');
  }

  // 4. 检查 tasks 表实际列
  console.log('\n[4] 检查 tasks 表实际列...');
  try {
    const { data: sample, error: sampleErr } = await supabase
      .from('tasks')
      .select('*')
      .limit(1);
    if (sampleErr) {
      console.error('❌ tasks 表查询失败:', sampleErr.message);
    } else {
      console.log('✅ tasks 表可查询');
    }
  } catch(e) {
    console.error('❌ tasks 表访问异常:', e.message);
  }

  // 5. 通过 HTTP API 测试创建
  console.log('\n[5] 通过 HTTP API 测试创建...');
  const http = require('http');
  const payload = JSON.stringify({
    project_id: project.id,
    title: 'HTTP诊断-' + Date.now(),
    status: 'todo',
    priority: 'medium',
    progress: 0,
  });

  const req = http.request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/tasks',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`   HTTP ${res.statusCode}`);
      try {
        const json = JSON.parse(data);
        console.log('   响应:', JSON.stringify(json, null, 2));
      } catch(e) {
        console.log('   原始响应:', data.slice(0, 200));
      }
    });
  });
  req.on('error', e => console.error('   HTTP 请求失败:', e.message));
  req.write(payload);
  req.end();
}

run().catch(console.error);
