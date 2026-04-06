// 在 Supabase 中创建测试任务
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 环境变量未设置');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTestData() {
  const { data: projects, error: projErr } = await supabase
    .from('projects')
    .select('id, name')
    .limit(1);

  if (projErr || !projects || projects.length === 0) {
    console.error('❌ 没有找到项目:', projErr?.message);
    return;
  }

  const project = projects[0];
  console.log('📁 项目:', project.name);

  const now = new Date().toISOString();
  const tasks = [
    {
      id: require('crypto').randomUUID(),
      project_id: project.id,
      title: '基础工程施工',
      description: '完成场地平整和基础开挖',
      status: 'in_progress',
      priority: 'high',
      progress: 30,
      start_date: '2026-03-01',
      end_date: '2026-04-30',
      wbs_code: '1.1',
      wbs_level: 1,
      is_critical: true,
      is_milestone: false,
      specialty_type: '土建工程',
      reference_duration: 60,
      planned_start_date: '2026-03-01',
      planned_end_date: '2026-04-30',
      actual_start_date: '2026-03-01',
      actual_end_date: null,
      planned_duration: 60,
      assignee_name: '张三',
      assignee_unit: '施工部',
      assignee_type: 'person',
      task_type: 'task',
      sort_order: 1,
      version: 1,
      created_at: now,
      updated_at: now,
    },
    {
      id: require('crypto').randomUUID(),
      project_id: project.id,
      title: '地下室结构施工',
      description: '地下室钢筋绑扎和混凝土浇筑',
      status: 'pending',
      priority: 'high',
      progress: 0,
      start_date: '2026-05-01',
      end_date: '2026-07-31',
      wbs_code: '1.2',
      wbs_level: 1,
      is_critical: true,
      is_milestone: false,
      specialty_type: '结构工程',
      reference_duration: 92,
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-07-31',
      actual_start_date: null,
      actual_end_date: null,
      planned_duration: 92,
      assignee_name: '李四',
      assignee_unit: '施工部',
      assignee_type: 'person',
      task_type: 'task',
      sort_order: 2,
      version: 1,
      created_at: now,
      updated_at: now,
    },
    {
      id: require('crypto').randomUUID(),
      project_id: project.id,
      title: '主体结构封顶',
      description: '主体结构完成封顶节点',
      status: 'pending',
      priority: 'medium',
      progress: 0,
      start_date: '2026-08-01',
      end_date: '2026-09-30',
      wbs_code: '1.3',
      wbs_level: 1,
      is_critical: false,
      is_milestone: true,
      specialty_type: null,
      reference_duration: 61,
      planned_start_date: '2026-08-01',
      planned_end_date: '2026-09-30',
      actual_start_date: null,
      actual_end_date: null,
      planned_duration: 61,
      assignee_name: null,
      assignee_unit: null,
      assignee_type: 'person',
      task_type: 'milestone',
      sort_order: 3,
      version: 1,
      created_at: now,
      updated_at: now,
    },
  ];

  console.log('\n📝 创建', tasks.length, '个测试任务...');

  for (const task of tasks) {
    const { error: insertErr } = await supabase.from('tasks').insert(task);
    if (insertErr) {
      console.error('  ❌', task.title, '-', insertErr.message);
    } else {
      console.log('  ✅', task.title, '- v1');
    }
  }

  const { count } = await supabase.from('tasks').select('*', { count: 'exact', head: true });
  console.log('\n✅ 完成！tasks 表现有', count, '条记录');
}

createTestData().catch(console.error);
