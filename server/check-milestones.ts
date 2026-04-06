/**
 * 检查数据库中的里程碑数据是否有重复 ID
 */
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

loadEnv(resolve('./.env'));

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function main() {
  // 查询所有 is_milestone=true 的任务
  const { data: milestones, error } = await supabase
    .from('tasks')
    .select('id, title, milestone_level, parent_id, is_milestone, description')
    .eq('is_milestone', true)
    .order('milestone_level')
    .order('milestone_order');

  if (error) {
    console.error('查询失败:', error.message);
    return;
  }

  console.log('\n=== 里程碑数据 ===');
  console.log('总数:', milestones?.length || 0);
  
  // 检查重复 ID
  const idCounts: Record<string, number> = {};
  milestones?.forEach(m => {
    idCounts[m.id] = (idCounts[m.id] || 0) + 1;
  });
  
  const duplicates = Object.entries(idCounts).filter(([, count]) => count > 1);
  if (duplicates.length > 0) {
    console.log('\n⚠️ 发现重复 ID:');
    duplicates.forEach(([id, count]) => {
      const dupMilestones = milestones?.filter(m => m.id === id);
      console.log('  ID:', id, '出现', count, '次');
      dupMilestones?.forEach(m => console.log('   -', m.title, '(level:', m.milestone_level, ')'));
    });
  } else {
    console.log('\n✅ 无重复 ID');
  }

  // 列出所有里程碑
  console.log('\n里程碑列表:');
  milestones?.forEach(m => {
    console.log('  [' + m.id.substring(0, 8) + '...]', m.title, '| level:', m.milestone_level, '| parent:', m.parent_id || 'null', '| desc:', m.description);
  });
}

main().catch(console.error);
