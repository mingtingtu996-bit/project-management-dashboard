import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, './server/.env') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

async function check() {
  console.log('=== 检查项目健康度数据 ===\n');

  const supabase = createClient(supabaseUrl, supabaseKey);

  // 查询所有项目
  const { data: projects, error: projError } = await supabase
    .from('projects')
    .select('id, name, health_score, health_status')
    .limit(10);

  if (projError) {
    console.error('查询项目错误:', projError);
    return;
  }

  console.log(`找到 ${projects?.length || 0} 个项目:`);
  projects?.forEach(p => {
    console.log(`  - ${p.name} (${p.id})`);
    console.log(`    health_score: ${p.health_score}, health_status: ${p.health_status}`);
  });

  if (projects && projects.length > 0) {
    const projectId = projects[0].id;

    // 查询任务数量
    const { count: taskCount } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);

    const { data: completedTasks } = await supabase
      .from('tasks')
      .select('id, name, status, progress')
      .eq('project_id', projectId)
      .eq('status', 'completed');

    console.log(`\n任务数据 (项目: ${projects[0].name}):`);
    console.log(`  总数: ${taskCount || 0}`);
    console.log(`  已完成: ${completedTasks?.length || 0}`);
    if (completedTasks) {
      completedTasks.forEach(t => {
        console.log(`    - ${t.name}: status=${t.status}, progress=${t.progress}`);
      });
    }

    // 查询里程碑
    const { count: milestoneCount } = await supabase
      .from('milestones')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);

    const { data: completedMilestones } = await supabase
      .from('milestones')
      .select('id, name, status')
      .eq('project_id', projectId)
      .eq('status', 'completed');

    console.log(`\n里程碑数据:`);
    console.log(`  总数: ${milestoneCount || 0}`);
    console.log(`  已完成: ${completedMilestones?.length || 0}`);

    // 查询风险
    const { count: riskCount } = await supabase
      .from('risks')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);

    const { data: risks } = await supabase
      .from('risks')
      .select('id, title, level, status')
      .eq('project_id', projectId);

    console.log(`\n风险数据:`);
    console.log(`  总数: ${riskCount || 0}`);
    if (risks) {
      risks.forEach(r => {
        console.log(`    - ${r.title}: level=${r.level}, status=${r.status}`);
      });
    }

    // 手动计算健康度
    console.log(`\n=== 手动计算健康度 ===`);
    const baseScore = 50;
    const taskScore = (completedTasks?.length || 0) * 2;
    const milestoneScore = (completedMilestones?.length || 0) * 5;
    const activeRisks = risks?.filter(r => r.status !== 'mitigated' && r.status !== 'closed') || [];
    let riskPenalty = 0;
    activeRisks.forEach(r => {
      if (r.level === 'critical' || r.level === 'high') riskPenalty -= 10;
      else if (r.level === 'medium') riskPenalty -= 5;
      else if (r.level === 'low') riskPenalty -= 2;
    });

    const calculatedScore = Math.max(0, Math.min(100, baseScore + taskScore + milestoneScore + riskPenalty));

    console.log(`  基础分: ${baseScore}`);
    console.log(`  任务完成分: ${taskScore} (+2分/任务 × ${completedTasks?.length || 0}个)`);
    console.log(`  里程碑奖分: ${milestoneScore} (+5分/里程碑 × ${completedMilestones?.length || 0}个)`);
    console.log(`  风险惩罚分: ${riskPenalty} (${activeRisks.length}个活跃风险)`);
    console.log(`  计算结果: ${calculatedScore}`);
    console.log(`  数据库存储: ${projects[0].health_score}`);
  }
}

check();
