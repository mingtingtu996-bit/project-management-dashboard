/**
 * 深度检查 milestoneTree 构建过程
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
  // 获取所有任务（用于对比）
  const { data: allTasks, error } = await supabase
    .from('tasks')
    .select('id, title, is_milestone, milestone_level, milestone_order, parent_id, status')
    .eq('project_id', (await supabase.from('projects').select('id').limit(1).single()).data?.id);

  if (error) {
    console.error('查询失败:', error.message);
    return;
  }

  // 检查所有 milestone（is_milestone=true）
  const milestones = allTasks?.filter(t => t.is_milestone) || [];
  
  console.log('\n=== 数据统计 ===');
  console.log('总任务数:', allTasks?.length || 0);
  console.log('里程碑数:', milestones.length);

  // 检查是否有任何重复
  const allIds = allTasks?.map(t => t.id) || [];
  const idSet = new Set(allIds);
  console.log('\n总ID数:', allIds.length, '| 唯一ID数:', idSet.size);
  
  if (allIds.length !== idSet.size) {
    console.log('⚠️ 存在重复ID!');
    const duplicates = allIds.filter((id, idx) => allIds.indexOf(id) !== idx);
    console.log('重复ID:', duplicates);
  }

  // 模拟前端 milestoneTree 构建
  console.log('\n=== 模拟 milestoneTree 构建 ===');
  
  // Step 1: 排序
  const sorted = [...milestones].sort((a, b) => {
    const la = a.milestone_level ?? 1;
    const lb = b.milestone_level ?? 1;
    if (la !== lb) return la - lb;
    return (a.milestone_order ?? 0) - (b.milestone_order ?? 0);
  });
  console.log('排序后:', sorted.map(s => s.title).join(', '));

  // Step 2: 建立映射
  const map: Record<string, any> = {};
  sorted.forEach(t => {
    if (map[t.id]) {
      console.log('⚠️ 映射冲突! ID:', t.id, '已存在:', map[t.id].title, '新值:', t.title);
    }
    map[t.id] = { ...t, children: [] };
  });
  console.log('映射大小:', Object.keys(map).length);

  // Step 3: 构建树
  const roots: any[] = [];
  sorted.forEach(t => {
    if (t.parent_id && map[t.parent_id]) {
      map[t.parent_id].children.push(map[t.id]);
      console.log('  添加子节点:', t.title, '-> 父节点:', map[t.parent_id].title);
    } else {
      roots.push(map[t.id]);
    }
  });

  console.log('\n根节点数:', roots.length);
  console.log('总渲染节点数:', countNodes(roots));

  // 模拟前端 statusFilteredTree 和 filteredMilestoneTree
  console.log('\n=== 模拟过滤 ===');
  console.log('statusFilteredTree:', roots.length, '个根节点');
  console.log('filteredMilestoneTree:', roots.length, '个根节点');
  
  // 最终渲染的节点
  const renderNodes = roots.map(node => {
    // 这里模拟第 1106-1108 行的 filter + map
    return node;
  });
  console.log('最终渲染:', renderNodes.length, '个顶层节点');
  
  // 检查是否有重复 ID
  const allRenderIds: string[] = [];
  collectIds(roots, allRenderIds);
  console.log('所有渲染节点ID数:', allRenderIds.length, '| 唯一:', new Set(allRenderIds).size);
  
  const renderDuplicates = allRenderIds.filter((id, idx) => allRenderIds.indexOf(id) !== idx);
  if (renderDuplicates.length > 0) {
    console.log('⚠️ 渲染时存在重复ID!');
    console.log('重复ID:', renderDuplicates);
  } else {
    console.log('✅ 所有渲染节点ID唯一');
  }
}

function countNodes(nodes: any[]): number {
  let count = nodes.length;
  for (const node of nodes) {
    if (node.children?.length) {
      count += countNodes(node.children);
    }
  }
  return count;
}

function collectIds(nodes: any[], ids: string[]) {
  for (const node of nodes) {
    ids.push(node.id);
    if (node.children?.length) {
      collectIds(node.children, ids);
    }
  }
}

main().catch(console.error);
