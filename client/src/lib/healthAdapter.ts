/**
 * 健康度适配器 - 统一健康度计算入口
 * 
 * 解决 CompanyCockpit.tsx 和 Dashboard.tsx 中健康度计算逻辑重复的问题
 * 作为唯一的数据转换层，统一处理不同数据源的健康度计算
 * 
 * @module
 */

import { calculateHealthScore, calculateHealthDetails, type HealthScoreParams, type HealthDetails } from './healthScore';
import type { Task, Risk, Milestone } from './localDb';

/**
 * 原始任务数据（可能来自不同数据源）
 */
export interface RawTask {
  id?: string;
  name?: string;
  title?: string;
  status?: string;
  progress?: number;
  end_date?: string | null;
  planned_end_date?: string | null;
  [key: string]: any;
}

/**
 * 原始风险数据
 */
export interface RawRisk {
  id?: string;
  level?: string;
  status?: string;
  title?: string;
  description?: string;
  [key: string]: any;
}

/**
 * 原始里程碑数据
 */
export interface RawMilestone {
  id?: string;
  name?: string;
  title?: string;
  status?: string;
  target_date?: string | null;
  planned_end_date?: string | null;
  [key: string]: any;
}

/**
 * 计算健康度 - 统一入口（简化版，只返回分数）
 * 
 * @param tasks - 任务列表（支持多种格式）
 * @param risks - 风险列表
 * @param milestones - 里程碑列表
 * @returns 健康度分数 (0-100)
 * 
 * @example
 * ```typescript
 * const score = calcHealthAdapter(tasks, risks, milestones);
 * ```
 */
export function calcHealthAdapter(
  tasks: RawTask[] | Task[],
  risks: RawRisk[] | Risk[],
  milestones: RawMilestone[] | Milestone[]
): number {
  const params = convertToHealthParams(tasks, risks, milestones);
  return calculateHealthScore(params);
}

/**
 * 计算健康度详情 - 统一入口（完整版）
 * 
 * @param tasks - 任务列表
 * @param risks - 风险列表
 * @param milestones - 里程碑列表
 * @returns 健康度详情对象
 * 
 * @example
 * ```typescript
 * const details = calcHealthDetailsAdapter(tasks, risks, milestones);
 * console.log(details.totalScore, details.healthStatus);
 * ```
 */
export function calcHealthDetailsAdapter(
  tasks: RawTask[] | Task[],
  risks: RawRisk[] | Risk[],
  milestones: RawMilestone[] | Milestone[]
): HealthDetails {
  const params = convertToHealthParams(tasks, risks, milestones);
  return calculateHealthDetails(params);
}

/**
 * 内部函数：将各种原始数据格式转换为 HealthScoreParams
 */
function convertToHealthParams(
  tasks: RawTask[] | Task[],
  risks: RawRisk[] | Risk[],
  milestones: RawMilestone[] | Milestone[]
): HealthScoreParams {
  // 1. 计算已完成任务数
  const completedTasks = tasks.filter(t => {
    const status = t.status?.toLowerCase();
    const progress = t.progress || 0;
    return status === 'completed' || 
           status === '已完成' || 
           progress === 100;
  }).length;

  // 2. 计算已完成里程碑数
  const completedMilestones = milestones.filter(m => {
    const status = m.status?.toLowerCase();
    return status === 'completed' || status === '已完成';
  }).length;

  // 3. 计算延期天数
  // 注意：延期惩罚只计算"已完成但实际延期"的任务
  // 对于"进行中但截止日期已过"的任务，视为进度落后，不计入延期惩罚
  // 只有已完成的任务才计算延期天数（基于实际完成日期与计划日期的差值）
  const now = new Date();
  let totalDelayDays = 0;
  tasks.forEach(t => {
    const status = t.status?.toLowerCase();
    const progress = t.progress || 0;
    
    // 只有"已完成"状态的任务才计入延期
    if (status === 'completed' || status === '已完成' || progress === 100) {
      // 计算实际完成日期与计划日期的差值
      const actualDate = t.actual_date || t.end_date; // 实际完成日期
      const plannedDate = t.planned_end_date || t.end_date; // 计划完成日期
      
      if (actualDate && plannedDate) {
        const actualTime = new Date(actualDate).getTime();
        const plannedTime = new Date(plannedDate).getTime();
        if (actualTime > plannedTime) {
          totalDelayDays += Math.ceil((actualTime - plannedTime) / (1000 * 60 * 60 * 24));
        }
      }
    }
  });

  // 4. 转换风险数据格式
  const mappedRisks = risks.map(r => ({
    level: r.level || 'medium',
    status: r.status
  }));

  return {
    completedTasks,
    completedMilestones,
    totalDelayDays,
    risks: mappedRisks
  };
}

/**
 * 健康度 → 颜色/标签（统一接口）
 * 
 * @param score - 健康度分数
 * @returns 颜色、文字样式和标签
 * 
 * @example
 * ```typescript
 * const { bg, text, label } = getHealthLevelAdapter(85);
 * // { bg: 'bg-emerald-500', text: 'text-emerald-600', label: '健康' }
 * ```
 */
export function getHealthLevelAdapter(score: number): {
  bg: string;
  text: string;
  label: string;
  color: string;
} {
  if (score >= 80) return { 
    bg: 'bg-emerald-500', 
    text: 'text-emerald-600', 
    label: '健康',
    color: '#10b981'
  };
  if (score >= 60) return { 
    bg: 'bg-blue-500', 
    text: 'text-blue-600', 
    label: '亚健康',
    color: '#3b82f6'
  };
  if (score >= 40) return { 
    bg: 'bg-amber-500', 
    text: 'text-amber-600', 
    label: '预警',
    color: '#f59e0b'
  };
  return { 
    bg: 'bg-red-500', 
    text: 'text-red-600', 
    label: '危险',
    color: '#ef4444'
  };
}

/**
 * 健康度 → 热力图背景色
 * 
 * @param score - 健康度分数
 * @returns Tailwind CSS 背景色类
 */
export function getHealthHeatmapBgAdapter(score: number): string {
  if (score >= 80) return 'bg-emerald-100 hover:bg-emerald-200';
  if (score >= 60) return 'bg-blue-100 hover:bg-blue-200';
  if (score >= 40) return 'bg-amber-100 hover:bg-amber-200';
  return 'bg-red-100 hover:bg-red-200';
}

/**
 * 健康度 → 文字颜色类
 * 
 * @param score - 健康度分数
 * @returns Tailwind CSS 文字色类
 */
export function getHealthTextClassAdapter(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-blue-600';
  if (score >= 40) return 'text-amber-600';
  return 'text-red-600';
}

// 重新导出原始函数，保持兼容性
export { calculateHealthScore, calculateHealthDetails, type HealthScoreParams, type HealthDetails };
