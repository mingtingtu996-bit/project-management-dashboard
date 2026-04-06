/**
 * 项目健康度服务
 * 负责计算项目健康度分数、状态，并维护月度历史快照
 */

import { supabase } from './dbService.js';

// 健康度状态枚举（与数据库 check constraint 保持一致）
export type HealthStatus = '健康' | '亚健康' | '预警' | '危险';

// 健康度明细接口
export interface HealthDetails {
  baseScore: number;            // 基础分 (50)
  taskCompletionScore: number;  // 任务完成分 (+2分/任务)
  milestoneBonusScore: number;  // 里程碑奖分 (+5分/里程碑)
  delayPenaltyScore: number;    // 延期惩罚分 (-1分/天)
  riskPenaltyScore: number;     // 风险惩罚分 (高=-10/中=-5/低=-2)
  totalScore: number;           // 总分
  healthStatus: HealthStatus;   // 健康状态
}

// 健康度计算结果接口
export interface HealthScoreResult {
  score: number;
  details: HealthDetails;
}

// 月度快照结果接口
export interface HealthSnapshotResult {
  recorded: number;
  failed: number;
  period: string;
}

export function getHealthHistoryPeriod(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 计算项目健康度分数和状态
 * @param projectId 项目ID
 * @returns 健康度计算结果
 */
export async function calculateProjectHealth(projectId: string): Promise<HealthScoreResult> {
  // 1. 基础分 (50分起始)
  const baseScore = 50;

  // 2. 获取任务数据并计算任务完成分 (+2分/任务)
  const { data: tasks } = await supabase
    .from('tasks')
    .select('status')
    .eq('project_id', projectId);

  const completedTasks = tasks?.filter(t => t.status === 'completed').length || 0;
  const taskCompletionScore = completedTasks * 2;

  // 3. 获取里程碑数据并计算里程碑奖分 (+5分/里程碑)
  const { data: milestones } = await supabase
    .from('milestones')
    .select('status')
    .eq('project_id', projectId);

  const completedMilestones = milestones?.filter(m => m.status === 'completed').length || 0;
  const milestoneBonusScore = completedMilestones * 5;

  // 4. 获取延期天数并计算延期惩罚分 (-1分/天)
  const { data: delayHistory } = await supabase
    .from('task_delay_history')
    .select('delay_days')
    .eq('project_id', projectId);

  const delayDays = delayHistory?.reduce((sum, d) => sum + (d.delay_days || 0), 0) || 0;
  const delayPenaltyScore = -Math.abs(delayDays) * 1;

  // 5. 获取风险数据并计算风险惩罚分 (高=-10/中=-5/低=-2)
  const { data: risks } = await supabase
    .from('risks')
    .select('level, status')
    .eq('project_id', projectId);

  const riskPenaltyScore = risks?.reduce((total, risk) => {
    if (risk.status === 'closed') return total; // 已关闭的风险不计惩罚
    switch (risk.level) {
      case 'critical':
      case 'high':
        return total - 10;
      case 'medium':
        return total - 5;
      case 'low':
        return total - 2;
      default:
        return total;
    }
  }, 0) || 0;

  // 6. 计算总分
  const totalScore = baseScore + taskCompletionScore + milestoneBonusScore + delayPenaltyScore + riskPenaltyScore;
  const clampedScore = Math.max(0, Math.min(100, totalScore));

  // 7. 确定健康状态 (UI设计稿4档)
  let healthStatus: HealthStatus;
  if (clampedScore >= 80) {
    healthStatus = '健康';
  } else if (clampedScore >= 60) {
    healthStatus = '亚健康';
  } else if (clampedScore >= 40) {
    healthStatus = '预警';
  } else {
    healthStatus = '危险';
  }

  const details: HealthDetails = {
    baseScore,
    taskCompletionScore,
    milestoneBonusScore,
    delayPenaltyScore,
    riskPenaltyScore,
    totalScore: clampedScore,
    healthStatus,
  };

  return {
    score: clampedScore,
    details,
  };
}

/**
 * 更新项目的健康度分数和状态到数据库
 * @param projectId 项目ID
 * @returns 更新结果
 */
export async function updateProjectHealth(projectId: string): Promise<HealthScoreResult> {
  // 1. 计算健康度
  const healthResult = await calculateProjectHealth(projectId);

  // 2. 更新到数据库
  const { error } = await supabase
    .from('projects')
    .update({
      health_score: healthResult.score,
      health_status: healthResult.details.healthStatus,
    })
    .eq('id', projectId);

  if (error) {
    throw new Error(`更新项目健康度失败: ${error.message}`);
  }

  console.log(`项目 ${projectId} 健康度已更新: ${healthResult.score}分 (${healthResult.details.healthStatus})`);

  return healthResult;
}

/**
 * 批量更新所有项目的健康度
 * @returns 更新的项目数量
 */
export async function updateAllProjectsHealth(): Promise<number> {
  // 1. 获取所有项目
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id');

  if (error) {
    throw new Error(`获取项目列表失败: ${error.message}`);
  }

  if (!projects || projects.length === 0) {
    console.log('没有找到需要更新的项目');
    return 0;
  }

  // 2. 逐个更新项目健康度
  let updatedCount = 0;
  for (const project of projects) {
    try {
      await updateProjectHealth(project.id);
      updatedCount++;
    } catch (error) {
      console.error(`更新项目 ${project.id} 健康度失败:`, error);
    }
  }

  console.log(`成功更新 ${updatedCount}/${projects.length} 个项目的健康度`);
  return updatedCount;
}

/**
 * 记录当前所有活跃项目的健康度月度快照
 * @param period 周期（格式 YYYY-MM），默认取当前月份
 */
export async function recordProjectHealthSnapshots(period = getHealthHistoryPeriod()): Promise<HealthSnapshotResult> {
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, name')
    .eq('status', 'active');

  if (error) {
    throw new Error(`获取活跃项目列表失败: ${error.message}`);
  }

  if (!projects || projects.length === 0) {
    console.log('没有活跃项目需要记录健康度快照');
    return { recorded: 0, failed: 0, period };
  }

  let recorded = 0;
  let failed = 0;

  for (const project of projects) {
    try {
      const healthResult = await calculateProjectHealth(project.id);
      const { error: upsertError } = await supabase
        .from('project_health_history')
        .upsert({
          project_id: project.id,
          health_score: healthResult.score,
          health_status: healthResult.details.healthStatus,
          period,
          details: healthResult.details,
          recorded_at: new Date().toISOString(),
        }, { onConflict: 'project_id,period' });

      if (upsertError) {
        throw upsertError;
      }

      recorded++;
    } catch (error) {
      failed++;
      console.warn(`记录项目 ${project.name ?? project.id} 健康度快照失败:`, error);
    }
  }

  console.log(`健康度月快照记录完成：成功 ${recorded} 个，失败 ${failed} 个，周期 ${period}`);

  return {
    recorded,
    failed,
    period,
  };
}
