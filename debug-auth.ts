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
  console.log('=== 调试权限检查 ===\n');
  const supabase = createClient(supabaseUrl, supabaseKey);

  const projectId = '2f72d68c-5173-4edf-a86b-b48396f8d5f3';
  const userId = '9e4a5570-0032-43bd-8f17-0bc415a1eb70';

  // 检查项目成员
  console.log('1. 检查 project_members:');
  const { data: member, error: mErr } = await supabase
    .from('project_members')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('is_active', true);

  console.log(`   找到 ${member?.length || 0} 条记录`);
  if (member && member.length > 0) {
    console.log(`   记录: ${JSON.stringify(member[0])}`);
    console.log(`   is_active 类型: ${typeof member[0].is_active}, 值: ${member[0].is_active}`);
  }
  if (mErr) console.log(`   错误: ${mErr.message}`);

  // 直接用 IN 查询
  console.log('\n2. 使用 IN 查询 permission_level:');
  const { data: member2, error: mErr2 } = await supabase
    .from('project_members')
    .select('permission_level')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('permission_level', ['owner', 'editor', 'admin']);

  console.log(`   找到 ${member2?.length || 0} 条记录`);
  if (mErr2) console.log(`   错误: ${mErr2.message}`);

  // 检查项目所有者
  console.log('\n3. 检查 projects.owner_id:');
  const { data: project, error: pErr } = await supabase
    .from('projects')
    .select('owner_id')
    .eq('id', projectId);

  console.log(`   找到 ${project?.length || 0} 条记录`);
  if (project && project.length > 0) {
    console.log(`   owner_id: ${project[0].owner_id}`);
    console.log(`   是否匹配: ${project[0].owner_id === userId}`);
  }
  if (pErr) console.log(`   错误: ${pErr.message}`);
}

check();
