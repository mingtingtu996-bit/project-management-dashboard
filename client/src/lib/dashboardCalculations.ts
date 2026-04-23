import { Task, Risk, Milestone } from '@/lib/types';
import { calculateHealthScore as calculateHealthScoreUnified, calculateHealthDetails, HealthDetails as HealthDetailsUnified } from './healthScore';

interface DashboardData {
  healthScore: number;
  healthTrend: 'up' | 'down' | 'stable';
  riskStats: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
  milestoneStats: {
    completed: number;
    total: number;
    upcoming: number;
    overdue: number;
    completionRate: number;
  };
  taskStats: {
    total: number;
    completed: number;
    inProgress: number;
    delayed: number;
    completionRate: number;
  };
  recentRisks: Risk[];
  upcomingMilestones: Milestone[];
  lastUpdated: string;
}

// 检查任务是否延期
export const isTaskDelayed = (task: Task): boolean => {
  if (!task.end_date || task.progress === 100) return false;
  
  const endDate = new Date(task.end_date);
  const today = new Date();
  return endDate < today;
};

// 检查里程碑是否即将到期
export const isMilestoneUpcoming = (milestone: Milestone): boolean => {
  if (milestone.status === 'completed') return false;
  
  const dueDate = new Date(milestone.target_date || '');
  const today = new Date();
  const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
  
  return diffDays >= 0 && diffDays <= 7; // 7天内到期
};

// 检查里程碑是否已延期
export const isMilestoneOverdue = (milestone: Milestone): boolean => {
  if (milestone.status === 'completed') return false;
  
  const dueDate = new Date(milestone.target_date || '');
  const today = new Date();
  return dueDate < today;
};

// 健康度明细接口 - 复用 healthScore.ts 中的定义
export type HealthDetails = HealthDetailsUnified;

// 计算项目健康度 - 统一使用 healthScore.ts 中的算法
export const calculateHealthScore = (
  tasks: Task[],
  risks: Risk[],
  milestones: Milestone[],
  delayDays: number = 0  // 延期天数，从task_delay_history表获取
): { score: number; details: HealthDetails } => {
  // 转换为统一的参数格式
  const params = {
    completedTasks: tasks.filter(t => t.status === 'completed').length,
    completedMilestones: milestones.filter(m => m.status === 'completed').length,
    totalDelayDays: delayDays,
    risks: risks.map(r => ({
      level: r.level || 'medium',
      status: r.status as string | undefined
    }))
  };

  // 使用统一的计算函数
  const details = calculateHealthDetails(params);

  return {
    score: details.totalScore,
    details
  };
};

// 计算健康度趋势
export const calculateHealthTrend = (
  currentScore: number,
  previousScore?: number
): 'up' | 'down' | 'stable' => {
  if (!previousScore) return 'stable';
  
  const difference = currentScore - previousScore;
  if (difference > 2) return 'up';
  if (difference < -2) return 'down';
  return 'stable';
};

// 计算风险统计
export const calculateRiskStats = (risks: Risk[]) => {
  return {
    critical: risks.filter(r => r.level === 'critical').length,
    high: risks.filter(r => r.level === 'high').length,
    medium: risks.filter(r => r.level === 'medium').length,
    low: risks.filter(r => r.level === 'low').length,
    total: risks.length
  };
};

// 计算里程碑统计
export const calculateMilestoneStats = (milestones: Milestone[]) => {
  const completed = milestones.filter(m => m.status === 'completed').length;
  const total = milestones.length;
  const upcoming = milestones.filter(isMilestoneUpcoming).length;
  const overdue = milestones.filter(isMilestoneOverdue).length;
  
  return {
    completed,
    total,
    upcoming,
    overdue,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
  };
};

// 计算任务统计
export const calculateTaskStats = (tasks: Task[]) => {
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;
  const delayed = tasks.filter(isTaskDelayed).length;
  
  return {
    total,
    completed,
    inProgress,
    delayed,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
  };
};

// 获取最近风险（按等级排序）
export const getRecentRisks = (risks: Risk[], limit = 5): Risk[] => {
  return [...risks]
    .sort((a, b) => {
      // 按等级排序：critical > high > medium > low
      const levelOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      const levelDiff = (levelOrder[a.level || 'low'] || 3) - (levelOrder[b.level || 'low'] || 3);
      if (levelDiff !== 0) return levelDiff;
      
      // 按创建时间排序
      const aTime = new Date(a.created_at || 0).getTime();
      const bTime = new Date(b.created_at || 0).getTime();
      return bTime - aTime;
    })
    .slice(0, limit);
};

// 获取即将到期的里程碑
export const getUpcomingMilestones = (milestones: Milestone[], limit = 5): Milestone[] => {
  return [...milestones]
    .filter(m => m.status !== 'completed')
    .sort((a, b) => {
      const aDate = new Date(a.target_date || '');
      const bDate = new Date(b.target_date || '');
      return aDate.getTime() - bDate.getTime();
    })
    .slice(0, limit);
};

// 计算完整的Dashboard数据
export const calculateDashboardData = (
  tasks: Task[],
  risks: Risk[],
  milestones: Milestone[],
  previousHealthScore?: number
): DashboardData => {
  const healthResult = calculateHealthScore(tasks, risks, milestones);
  const healthScore = healthResult.score;
  const healthTrend = calculateHealthTrend(healthScore, previousHealthScore);
  
  const riskStats = calculateRiskStats(risks);
  const milestoneStats = calculateMilestoneStats(milestones);
  const taskStats = calculateTaskStats(tasks);
  
  const recentRisks = getRecentRisks(risks);
  const upcomingMilestones = getUpcomingMilestones(milestones);

  return {
    healthScore,
    healthTrend,
    riskStats,
    milestoneStats,
    taskStats,
    recentRisks,
    upcomingMilestones,
    lastUpdated: new Date().toLocaleString('zh-CN')
  };
};

// WBS模板数据（简化的房地产WBS结构）
export const WBSTemplates = {
  'software_project': {
    name: '软件项目模板',
    levels: ['项目', '模块', '任务'],
    description: '适合软件开发项目的WBS结构',
    structure: [
      {
        name: '需求分析',
        children: [
          { name: '需求收集', estimatedDuration: 5 },
          { name: '需求评审', estimatedDuration: 2 },
          { name: '需求文档', estimatedDuration: 3 }
        ]
      },
      {
        name: '设计阶段',
        children: [
          { name: 'UI设计', estimatedDuration: 7 },
          { name: '架构设计', estimatedDuration: 5 },
          { name: '数据库设计', estimatedDuration: 3 }
        ]
      },
      {
        name: '开发阶段',
        children: [
          { name: '前端开发', estimatedDuration: 15 },
          { name: '后端开发', estimatedDuration: 20 },
          { name: '测试开发', estimatedDuration: 10 }
        ]
      },
      {
        name: '测试阶段',
        children: [
          { name: '单元测试', estimatedDuration: 5 },
          { name: '集成测试', estimatedDuration: 7 },
          { name: '用户验收测试', estimatedDuration: 3 }
        ]
      }
    ]
  },
  'marketing_campaign': {
    name: '营销活动模板',
    levels: ['活动', '渠道', '任务'],
    description: '适合市场营销活动的WBS结构',
    structure: [
      {
        name: '策划阶段',
        children: [
          { name: '目标设定', estimatedDuration: 3 },
          { name: '预算规划', estimatedDuration: 2 },
          { name: '方案设计', estimatedDuration: 5 }
        ]
      },
      {
        name: '执行阶段',
        children: [
          { name: '内容制作', estimatedDuration: 10 },
          { name: '渠道投放', estimatedDuration: 7 },
          { name: '推广执行', estimatedDuration: 15 }
        ]
      },
      {
        name: '评估阶段',
        children: [
          { name: '数据收集', estimatedDuration: 3 },
          { name: '效果分析', estimatedDuration: 2 },
          { name: '总结报告', estimatedDuration: 2 }
        ]
      }
    ]
  },
  'real_estate_project': {
    name: '房地产项目模板',
    levels: ['阶段', '专项', '工序'],
    description: '基于房地产工程管理系统的WBS结构',
    structure: [
      {
        name: '前期证照阶段',
        children: [
          { name: '土地获取', estimatedDuration: 30 },
          { name: '立项审批', estimatedDuration: 15 },
          { name: '用地规划', estimatedDuration: 20 },
          { name: '工程规划', estimatedDuration: 25 }
        ]
      },
      {
        name: '施工阶段',
        children: [
          { name: '地基基础', estimatedDuration: 45 },
          { name: '主体结构', estimatedDuration: 120 },
          { name: '建筑装饰', estimatedDuration: 60 },
          { name: '安装工程', estimatedDuration: 45 }
        ]
      },
      {
        name: '验收阶段',
        children: [
          { name: '工程预验收', estimatedDuration: 7 },
          { name: '竣工验收', estimatedDuration: 15 },
          { name: '交付备案', estimatedDuration: 10 }
        ]
      }
    ]
  }
};

// 生成WBS结构
export const generateWBSStructure = (
  templateId: keyof typeof WBSTemplates,
  projectId: string,
  startDate: Date
): Partial<Task>[] => {
  const template = WBSTemplates[templateId];
  if (!template) return [];

  const tasks: Partial<Task>[] = [];
  let currentDate = new Date(startDate);

  // 生成父级任务
  template.structure.forEach((phase, phaseIndex) => {
    const parentTask: Partial<Task> = {
      project_id: projectId,
      title: phase.name,
      start_date: currentDate.toISOString(),
      status: 'todo',
      priority: 'medium'
    };

    tasks.push(parentTask);

    // 生成子级任务
    phase.children.forEach((child, childIndex) => {
      const childTask: Partial<Task> = {
        project_id: projectId,
        title: child.name,
        start_date: currentDate.toISOString(),
        end_date: new Date(
          currentDate.getTime() + child.estimatedDuration * 24 * 60 * 60 * 1000
        ).toISOString(),
        status: 'todo',
        priority: 'medium',
        // 这里需要在实际使用时设置parent_task_id
      };

      tasks.push(childTask);
      currentDate = new Date(childTask.end_date!);
    });

    // 阶段间留出缓冲时间
    currentDate = new Date(currentDate.getTime() + 2 * 24 * 60 * 60 * 1000);
  });

  return tasks;
};