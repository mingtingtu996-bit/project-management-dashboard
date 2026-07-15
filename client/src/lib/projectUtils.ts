/**
 * 项目工具函数库
 * 
 * 提供项目相关的通用工具函数，供多个组件复用
 * 
 * @module
 */

import type { Project } from './supabase';

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
  'bg-blue-600', 'bg-teal-500', 'bg-sky-500',
  'bg-emerald-500', 'bg-cyan-500', 'bg-amber-500',
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
 * const color = getProjectColor(0); // 'bg-blue-600'
 * const color = getProjectColor(8); // 'bg-blue-600' (循环)
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
 * 状态标签配置
 */
export const STATUS_LABELS: Record<string, { text: string; cls: string }> = {
  active: { text: '进行中', cls: 'bg-blue-50 text-blue-600' },
  completed: { text: '已完成', cls: 'bg-emerald-50 text-emerald-600' },
  archived: { text: '已归档', cls: 'bg-slate-100 text-slate-500' },
};

/**
 * 阶段标签样式
 */
export const STAGE_STYLES: Record<ProjectStage, string> = {
  pre: 'bg-slate-100 text-slate-500',
  construction: 'bg-blue-50 text-blue-600',
  acceptance: 'bg-emerald-50 text-emerald-600',
};
