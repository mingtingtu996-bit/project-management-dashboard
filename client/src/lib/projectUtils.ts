/**
 * 项目工具函数库
 * 
 * 提供项目相关的通用工具函数，供多个组件复用
 * 
 * @module
 */

import type { Project } from './supabase';

/**
 * 计算剩余天数
 * 
 * @param plannedEndDate - 计划结束日期
 * @returns 剩余天数（负数表示已延期）
 * 
 * @example
 * ```typescript
 * const days = getRemainingDays('2026-12-31');
 * console.log(days); // 剩余天数，Infinity 表示无结束日期
 * ```
 */
export function getRemainingDays(plannedEndDate: string | null | undefined): number {
  if (!plannedEndDate) return Infinity;
  return Math.ceil((new Date(plannedEndDate).getTime() - Date.now()) / 86400000);
}

/**
 * 按剩余天数排序
 * 
 * @param items - 包含项目信息的对象数组
 * @returns 按剩余天数升序排序的数组
 * 
 * @example
 * ```typescript
 * const sorted = sortByRemainingDays(projectStats);
 * ```
 */
export function sortByRemainingDays<T extends { project: { planned_end_date?: string | null } }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const dA = getRemainingDays(a.project.planned_end_date);
    const dB = getRemainingDays(b.project.planned_end_date);
    return dA - dB;
  });
}

/**
 * 项目名取首字缩写（最多2字）
 * 
 * @param name - 项目名称
 * @returns 缩写字符串（最多2个字符）
 * 
 * @example
 * ```typescript
 * const abbr = getProjectAbbr('万科城市花园'); // '万科'
 * const abbr = getProjectAbbr('ABC Project'); // 'AB'
 * ```
 */
export function getProjectAbbr(name: string): string {
  const chars = name.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
  if (!chars) return '?';
  // 中文取前2字，英文取前2字母大写
  if (/[\u4e00-\u9fa5]/.test(chars[0])) {
    return chars.slice(0, 2);
  }
  return chars.slice(0, 2).toUpperCase();
}

/**
 * 色块背景色轮转（按索引）
 */
const COLOR_POOL = [
  'bg-blue-500', 'bg-purple-500', 'bg-indigo-500',
  'bg-teal-500', 'bg-cyan-500', 'bg-violet-500',
  'bg-rose-500', 'bg-orange-500',
];

/**
 * 获取项目颜色（按索引轮转）
 * 
 * @param idx - 索引
 * @returns Tailwind CSS 背景色类
 * 
 * @example
 * ```typescript
 * const color = getProjectColor(0); // 'bg-blue-500'
 * const color = getProjectColor(8); // 'bg-blue-500' (循环)
 * ```
 */
export function getProjectColor(idx: number): string {
  return COLOR_POOL[idx % COLOR_POOL.length];
}

/**
 * 项目阶段类型
 */
export type ProjectStage = 'pre' | 'construction' | 'acceptance';

/**
 * 项目阶段信息
 */
export interface ProjectStageInfo {
  stage: ProjectStage;
  label: string;
}

/**
 * 计算项目阶段
 * 
 * @param project - 项目对象
 * @returns 阶段信息对象
 * 
 * @example
 * ```typescript
 * const stage = getProjectStage(project);
 * console.log(stage.label); // '前期' | '施工' | '验收'
 * ```
 */
export function getProjectStage(project: Project): ProjectStageInfo {
  // 验收阶段：已完工
  if (project.actual_end_date) {
    return { stage: 'acceptance', label: '验收' };
  }
  
  // 施工阶段：已开工但未完工
  if (project.actual_start_date) {
    return { stage: 'construction', label: '施工' };
  }
  
  // 前期阶段：未开工
  return { stage: 'pre', label: '前期' };
}

/**
 * 剩余天数计算结果
 */
export interface RemainingDaysResult {
  days: number;
  isOverdue: boolean;
}

/**
 * 计算项目剩余天数
 * 
 * @param project - 项目对象
 * @returns 剩余天数和是否延期
 * 
 * @example
 * ```typescript
 * const result = calcProjectRemainingDays(project);
 * console.log(result.days, result.isOverdue);
 * ```
 */
export function calcProjectRemainingDays(project: Project): RemainingDaysResult {
  if (!project.planned_end_date) return { days: 0, isOverdue: false };
  
  const endDate = new Date(project.planned_end_date);
  const now = new Date();
  const diffTime = endDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return { days: Math.abs(diffDays), isOverdue: diffDays < 0 };
}

/**
 * 状态标签配置
 */
export const STATUS_LABELS: Record<string, { text: string; cls: string }> = {
  active: { text: '进行中', cls: 'bg-blue-50 text-blue-600' },
  completed: { text: '已完成', cls: 'bg-emerald-50 text-emerald-600' },
  archived: { text: '已归档', cls: 'bg-gray-100 text-gray-500' },
};

/**
 * 阶段标签样式
 */
export const STAGE_STYLES: Record<ProjectStage, string> = {
  pre: 'bg-gray-100 text-gray-500',
  construction: 'bg-blue-50 text-blue-600',
  acceptance: 'bg-emerald-50 text-emerald-600',
};
