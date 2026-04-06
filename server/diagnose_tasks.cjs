// 完整诊断：检查所有相关表的记录数和数据状态
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 环境变量未设置');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAllTables() {
  const tables = [
    'projects',
    'tasks',
    'milestones',
    'risks',
    'task_conditions',
    'task_obstacles',
    'task_delay_history',
    'task_completion_reports',
    'wbs_templates',
    'wbs_nodes',
    'pre_milestones',
    'acceptance_plans',
    'project_members'
  ];

  console.log('📊 Supabase 数据库各表记录数统计\n');
  console.log('─'.repeat(45));

  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.log(`  ❌ ${table.padEnd(25)} 错误: ${error.message}`);
    } else {
      console.log(`  ${count === 0 ? '⚠️ ' : '✅ '}${table.padEnd(25)} ${(count ?? 0).toString().padStart(4)} 条`);
    }
  }

  console.log('─'.repeat(45));

  // 特别检查：获取 projects 表第一条数据看版本
  const { data: projects, error: projErr } = await supabase
    .from('projects')
    .select('id, name, version')
    .limit(2);

  if (projects && projects.length > 0) {
    console.log('\n📋 projects 示例:');
    projects.forEach(p => console.log(`  - ${p.name} | id=${p.id.slice(0,8)}... | v=${p.version}`));

    // 检查该项目下是否有 tasks
    const pid = projects[0].id;
    const { count: taskCount, error: taskErr } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', pid);

    console.log(`\n  该项目下 tasks 数量: ${taskCount ?? 0}`, taskErr ? `(${taskErr.message})` : '');
  } else {
    console.log('\n⚠️  projects 表无数据');
  }

  // 诊断结论
  console.log('\n📋 诊断结论:');
  const { count: tCount } = await supabase.from('tasks').select('*', { count: 'exact', head: true });
  if (tCount === 0) {
    console.log('  ❌ tasks 表为空 → GanttView 无任务可显示/编辑');
    console.log('  ❌ PUT /api/tasks/:id → getTasks()返回[] → getTask(id)返回null');
    console.log('  ❌ → throw Error("VERSION_MISMATCH") → 500 错误');
    console.log('\n💡 解决方案: 需要创建示例数据，或从腾讯云MySQL同步数据到Supabase');
  }
}

checkAllTables().catch(console.error);
