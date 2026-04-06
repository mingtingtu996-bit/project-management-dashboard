import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

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
  console.log('=== 检查 project_members 表 ===\n');
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 检查 project_members 表
  const { data: members, error } = await supabase
    .from('project_members')
    .select('*')
    .limit(10);

  if (error) {
    console.log('project_members 表查询错误:', error);
  } else {
    console.log(`找到 ${members?.length || 0} 条记录:`);
    members?.forEach(m => {
      console.log(`  - ${JSON.stringify(m)}`);
    });
  }

  // 检查表结构
  console.log('\n=== 检查表结构 ===');
  // 尝试直接查询
  const { data: sample } = await supabase
    .from('project_members')
    .select()
    .limit(1);
  if (sample && sample.length > 0) {
    console.log('project_members 表字段:', Object.keys(sample[0]));
  } else {
    console.log('project_members 表为空或不存在');
  }

  // 检查 tasks 表
  console.log('\n=== 检查 tasks 表结构 ===');
  const { data: taskSample } = await supabase
    .from('tasks')
    .select()
    .limit(1);
  if (taskSample && taskSample.length > 0) {
    console.log('tasks 表字段:', Object.keys(taskSample[0]));
  }

  // 检查 task_conditions 表
  console.log('\n=== 检查 task_conditions 表 ===');
  const { data: condData, error: condError } = await supabase
    .from('task_conditions')
    .select('*')
    .limit(5);

  if (condError) {
    console.log('task_conditions 表错误:', condError);
  } else {
    console.log(`找到 ${condData?.length || 0} 条条件记录`);
    if (condData && condData.length > 0) {
      console.log('字段:', Object.keys(condData[0]));
    }
  }
}

check();
