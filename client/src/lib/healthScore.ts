/**
 * 健康度计算工具函数
 * 
 * 统一算法（加减分模型）：
 * 健康分 = 基础分(50) 
 *        + 任务完成分(+2分/任务) 
 *        + 里程碑奖分(+5分/里程碑) 
 *        - 延期惩罚分(-1分/天) 
 *        - 风险惩罚分(critical/high=-10, medium=-5, low=-2)
 * 
 * 档位: ≥80健康, 60-79亚健康, 40-59预警, <40危险
 * 
 * 注意：此算法与 dashboardCalculations.ts 中的 calculateHealthScore 保持一致
 */

// ── 健康度颜色常量（与 Tailwind 语义色一致，集中管理）────────────────────────
import { CHART_SERIES } from './chartPalette'

const HEALTH_COLORS = {
  excellent: { bg: 'bg-emerald-500', text: 'text-emerald-600', color: CHART_SERIES.success },
  good:      { bg: 'bg-blue-500',    text: 'text-blue-600',    color: CHART_SERIES.primary },
  warning:   { bg: 'bg-amber-500',   text: 'text-amber-600',   color: CHART_SERIES.warning },
  critical:  { bg: 'bg-red-500',     text: 'text-red-600',     color: CHART_SERIES.danger },
} as const

export interface HealthScoreParams {
  completedTasks: number;
  completedMilestones: number;
  totalDelayDays: number;
  risks: { level: string; status?: string }[];
}

export interface HealthDetails {
  baseScore: number;           // 基础分 (50)
  taskCompletionScore: number; // 任务完成分 (+2分/任务)
  milestoneBonusScore: number; // 里程碑奖分 (+5分/里程碑)
  delayPenaltyScore: number;   // 延期惩罚分 (-1分/天)
  riskPenaltyScore: number;    // 风险惩罚分 (高=-10/中=-5/低=-2)
  totalScore: number;          // 总分
  healthStatus: 'excellent' | 'good' | 'warning' | 'critical'; // 健康状态
}

/**
 * 计算健康度分数（简化版，只返回分数）
 */
export function calculateHealthScore(params: HealthScoreParams): number {
  const details = calculateHealthDetails(params);
  return details.totalScore;
}

/**
 * 计算健康度详情（完整版，返回详细分数构成）
 */
export function calculateHealthDetails(params: HealthScoreParams): HealthDetails {
  const { completedTasks, completedMilestones, totalDelayDays, risks } = params;
  
  // 1. 基础分 (50分起始)
  const baseScore = 50;

  // 2. 任务完成分 (+2分/任务)
  const taskCompletionScore = completedTasks * 2;

  // 3. 里程碑奖分 (+5分/里程碑)
  const milestoneBonusScore = completedMilestones * 5;

  // 4. 延期惩罚分 (-1分/天，上限-30分，避免测试数据导致分数为0)
  // 注意：延期惩罚只计算"已完成但实际延期"的任务
  // 对于"进行中但截止日期已过"的任务，视为进度落后，不计入延期惩罚
  const delayPenaltyScore = -Math.min(Math.abs(totalDelayDays), 30);

  // 5. 风险惩罚分 (critical/high=-10, medium=-5, low=-2)
  // 已解决/已缓解的风险不计入惩罚
  const riskPenaltyScore = risks.reduce((total, r) => {
    const status = r.status?.toLowerCase();
    if (status === 'mitigated' || status === 'closed' || status === 'resolved' || status === '已解决') {
      return total;
    }
    switch (r.level) {
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
  }, 0);

  // 计算总分
  const totalScore = Math.max(0, Math.min(100, 
    baseScore + taskCompletionScore + milestoneBonusScore + delayPenaltyScore + riskPenaltyScore
  ));

  // 确定健康状态
  let healthStatus: HealthDetails['healthStatus'];
  if (totalScore >= 80) {
    healthStatus = 'excellent';
  } else if (totalScore >= 60) {
    healthStatus = 'good';
  } else if (totalScore >= 40) {
    healthStatus = 'warning';
  } else {
    healthStatus = 'critical';
  }

  return {
    baseScore,
    taskCompletionScore,
    milestoneBonusScore,
    delayPenaltyScore,
    riskPenaltyScore,
    totalScore,
    healthStatus
  };
}

/**
 * 健康度 → 颜色/标签
 */
export function getHealthLevel(score: number): { 
  bg: string; 
  text: string; 
  label: string;
  color: string;
} {
  if (score >= 80) return { ...HEALTH_COLORS.excellent, label: '健康' };
  if (score >= 60) return { ...HEALTH_COLORS.good, label: '亚健康' };
  if (score >= 40) return { ...HEALTH_COLORS.warning, label: '预警' };
  return { ...HEALTH_COLORS.critical, label: '危险' };
}

/**
 * 健康度 → 热力图背景色
 */
export function getHealthHeatmapBg(score: number): string {
  if (score >= 80) return 'bg-emerald-100 hover:bg-emerald-200';
  if (score >= 60) return 'bg-blue-100 hover:bg-blue-200';
  if (score >= 40) return 'bg-amber-100 hover:bg-amber-200';
  return 'bg-red-100 hover:bg-red-200';
}

/**
 * 计算延期天数
 */
export function calculateDelayDays(endDate: string | Date, referenceDate: Date = new Date()): number {
  const endTime = new Date(endDate).getTime();
  const refTime = referenceDate.getTime();
  
  if (endTime >= refTime) return 0;
  
  return Math.ceil((refTime - endTime) / (1000 * 60 * 60 * 24));
}
