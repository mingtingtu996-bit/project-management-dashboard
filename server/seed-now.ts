/**
 * 种子数据脚本 - 使用正确的字段名
 */
import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function seed() {
  console.log('=== 开始插入种子数据 ===\n');
  
  // 获取项目ID
  const { data: projects } = await supabase.from('projects').select('id').eq('name', '城市中心广场项目（二期）');
  if (!projects || projects.length === 0) {
    console.error('未找到项目!');
    return;
  }
  const projectId = projects[0].id;
  console.log('项目ID:', projectId);

  // 1. 创建里程碑 (使用正确的字段: target_date)
  const milestones = [
    { project_id: projectId, title: '项目立项', target_date: '2026-01-15', status: 'completed', completed_at: '2026-01-14', description: '种子数据' },
    { project_id: projectId, title: '设计阶段', target_date: '2026-03-15', status: 'in_progress', description: '种子数据' },
    { project_id: projectId, title: '施工准备', target_date: '2026-04-30', status: 'pending', description: '种子数据' },
  ];
  
  const result1 = await supabase.from('milestones').insert(milestones).select();
  console.log('里程碑插入:', result1.error ? '失败 - ' + result1.error.message : '成功(' + result1.data?.length + '条)');
  
  if (result1.error) return;
  
  // 2. 创建任务 (tasks表没有milestone_id，只有基本字段)
  const tasks = [
    { project_id: projectId, title: '可行性研究报告', status: 'completed', progress: 100, start_date: '2026-01-01', end_date: '2026-01-10', description: '种子数据' },
    { project_id: projectId, title: '投资估算审批', status: 'completed', progress: 100, start_date: '2026-01-11', end_date: '2026-01-15', description: '种子数据' },
    { project_id: projectId, title: '方案设计', status: 'in_progress', progress: 60, start_date: '2026-01-16', end_date: '2026-02-15', description: '种子数据' },
    { project_id: projectId, title: '施工图设计', status: 'pending', progress: 0, start_date: '2026-02-16', end_date: '2026-03-15', description: '种子数据' },
    { project_id: projectId, title: '设计审查', status: 'in_progress', progress: 30, start_date: '2026-02-20', end_date: '2026-03-10', description: '种子数据' },
  ];
  
  const result2 = await supabase.from('tasks').insert(tasks).select();
  console.log('任务插入:', result2.error ? '失败 - ' + result2.error.message : '成功(' + result2.data?.length + '条)');
  
  // 3. 创建风险 (使用正确的字段)
  const risks = [
    { project_id: projectId, title: '设计院人员变更', level: 'medium', status: 'identified', probability: 50, impact: 50, mitigation: '协调备用设计人员', description: '种子数据' },
    { project_id: projectId, title: '材料价格波动', level: 'low', status: 'identified', probability: 30, impact: 40, mitigation: '提前锁定供应商', description: '种子数据' },
  ];
  
  const result3 = await supabase.from('risks').insert(risks).select();
  console.log('风险插入:', result3.error ? '失败 - ' + result3.error.message : '成功(' + result3.data?.length + '条)');
  
  console.log('\n=== 种子数据插入完成 ===');
}

seed().catch(console.error);
