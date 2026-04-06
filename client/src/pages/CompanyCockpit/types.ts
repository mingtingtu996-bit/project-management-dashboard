/**
 * CompanyCockpit 公司驾驶舱共享类型
 *
 * 此文件定义公司驾驶舱各子组件共享的数据类型，
 * 避免在 CompanyCockpit.tsx、MilestoneSection.tsx 等文件中重复定义。
 */

import type { Project, Task, Risk, Milestone } from '@/lib/supabase';

/**
 * 单个项目的汇总统计数据（用于公司驾驶舱展示）
 */
export interface ProjectStats {
  /** 项目基础信息 */
  project: Project;
  /** 该项目下所有任务 */
  tasks: Task[];
  /** 该项目下所有风险 */
  risks: Risk[];
  /** 该项目下所有里程碑 */
  milestones: Milestone[];
  /** 健康度分数 (0-100) */
  health: number;
  /** 任务总数 */
  taskCount: number;
  /** 已完成任务数 */
  completedCount: number;
  /** 延期任务数 */
  delayedCount: number;
  /** 高/严重风险数 */
  issueCount: number;
  /** 待完成里程碑数 */
  pendingMilestones: number;
}
