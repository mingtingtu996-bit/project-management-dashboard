// 测试 Dashboard API
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function testAPI() {
  console.log('=== 测试 Dashboard 相关 API ===\n');
  
  // 获取项目ID
  const { data: projects } = await supabase.from('projects').select('id').eq('name', '城市中心广场项目（二期）');
  if (!projects || projects.length === 0) {
    console.error('未找到项目!');
    return;
  }
  const projectId = projects[0].id;
  console.log('项目ID:', projectId);

  // 测试 tasks API
  const { data: tasks } = await supabase.from('tasks').select('*').eq('project_id', projectId);
  console.log('\nTasks API 返回:', tasks.length, '条');
  if (tasks.length > 0) {
    console.log('已完成任务:', tasks.filter(t => t.status === 'completed').length);
  }

  // 测试 milestones API
  const { data: milestones } = await supabase.from('milestones').select('*').eq('project_id', projectId);
  console.log('\nMilestones API 返回:', milestones.length, '条');
  if (milestones.length > 0) {
    console.log('已完成里程碑:', milestones.filter(m => m.status === 'completed').length);
  }

  // 测试 risks API
  const { data: risks } = await supabase.from('risks').select('*').eq('project_id', projectId);
  console.log('\nRisks API 返回:', risks.length, '条');
  if (risks.length > 0) {
    console.log('风险列表:', risks.map(r => `${r.title}(${r.level})`).join(', '));
  }

  // 计算健康度
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const completedMilestones = milestones.filter(m => m.status === 'completed').length;
  const riskPenalty = risks.reduce((total, r) => {
    if (r.status === 'closed') return total;
    switch (r.level) {
      case 'critical': case 'high': return total - 10;
      case 'medium': return total - 5;
      case 'low': return total - 2;
      default: return total;
    }
  }, 0);
  
  const healthScore = 50 + completedTasks * 2 + completedMilestones * 5 + riskPenalty;
  console.log('\n=== 健康度计算 ===');
  console.log('基础分: 50');
  console.log('任务完成分: +', completedTasks * 2);
  console.log('里程碑奖分: +', completedMilestones * 5);
  console.log('风险惩罚: ', riskPenalty);
  console.log('总分:', Math.max(0, Math.min(100, healthScore)));
}

testAPI().catch(console.error);
