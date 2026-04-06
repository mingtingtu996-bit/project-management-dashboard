import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';

function loadEnv(filePath: string) {
  const content = readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

const envPath = resolve('C:/Users/jjj64/WorkBuddy/20260318232610/server/.env');
loadEnv(envPath);

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';

async function check() {
  console.log('=== 检查 RLS 策略 ===\n');
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 使用 ANON_KEY 测试
  const anonKey = process.env.SUPABASE_ANON_KEY || '';
  const anonClient = createClient(supabaseUrl, anonKey);

  const projectId = '2f72d68c-5173-4edf-a86b-b48396f8d5f3';
  const userId = '9e4a5570-0032-43bd-8f17-0bc415a1eb70';
  const taskId = '8a98e3fd-5097-420e-a97d-e57a0749905e';

  // 尝试用 SERVICE_KEY 插入
  console.log('1. 使用 SERVICE_KEY 插入 task_conditions:');
  const { data: insertData, error: insertError } = await supabase
    .from('task_conditions')
    .insert({
      id: uuidv4(),
      task_id: taskId,
      project_id: projectId,
      name: '测试条件-RLS检查',
      condition_type: '人员',
      description: 'RLS测试',
      is_satisfied: false,
      created_by: userId
    })
    .select()
    .single();

  if (insertError) {
    console.log(`   插入失败: ${insertError.message}`);
  } else {
    console.log(`   插入成功: ${insertData.id}`);
    // 删除测试数据
    await supabase.from('task_conditions').delete().eq('id', insertData.id);
  }

  // 尝试用 ANON_KEY 查询
  console.log('\n2. 使用 ANON_KEY 查询 task_conditions:');
  const { data: anonData, error: anonError } = await anonClient
    .from('task_conditions')
    .select('*')
    .eq('project_id', projectId)
    .limit(5);

  if (anonError) {
    console.log(`   查询失败: ${anonError.message}`);
  } else {
    console.log(`   查询成功，找到 ${anonData?.length || 0} 条记录`);
  }
}

check();
