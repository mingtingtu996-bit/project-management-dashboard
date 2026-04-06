/**
 * ProjectCard 组件
 * 
 * 项目卡片组件，展示单个项目的概览信息
 * 
 * @module
 */

import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Trash2, Edit3, Clock, ArrowRight } from 'lucide-react';
import type { Project, Task, Risk, Milestone } from '@/lib/supabase';
import {
  getHealthLevelAdapter,
  getHealthTextClassAdapter,
} from '@/lib/healthAdapter';
import { getProjectAbbr, getProjectColor, getProjectStage, calcProjectRemainingDays } from '@/lib/projectUtils';

/** 项目统计数据 */
interface ProjectStats {
  project: Project;
  tasks: Task[];
  risks: Risk[];
  milestones: Milestone[];
  health: number;
  taskCount: number;
  completedCount: number;
  delayedCount: number;
  issueCount: number;
  pendingMilestones: number;
}

/** 项目卡片属性 */
interface ProjectCardProps {
  stats: ProjectStats;
  colorIdx: number;
  rank?: number;
  onDelete?: (project: Project, e: React.MouseEvent) => void;
}

/** 项目阶段 */
type ProjectStage = 'pre' | 'construction' | 'acceptance';

// 工具函数已从 @/lib/projectUtils.ts 导入

/** 健康度 → 颜色 token */
function healthColor(score: number): { bg: string; text: string; label: string } {
  const level = getHealthLevelAdapter(score);
  return { bg: level.bg, text: level.text, label: level.label };
}

/**
 * 项目卡片组件
 */
export const ProjectCard = memo(function ProjectCard({ 
  stats, 
  colorIdx, 
  rank,
  onDelete 
}: ProjectCardProps) {
  const { project, health, taskCount, completedCount, delayedCount } = stats;
  const hc = healthColor(health);
  const progress = taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0;
  const color = getProjectColor(colorIdx);
  const stage = getProjectStage(project);
  const remaining = calcProjectRemainingDays(project);

  const statusLabel: Record<string, { text: string; cls: string }> = {
    active: { text: '进行中', cls: 'bg-blue-50 text-blue-600' },
    completed: { text: '已完成', cls: 'bg-emerald-50 text-emerald-600' },
    archived: { text: '已归档', cls: 'bg-gray-100 text-gray-500' },
  };
  const st = statusLabel[project.status] ?? statusLabel['active'];

  // 排名角标
  const rankBadge = rank && rank <= 3 ? (
    <span className={`absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${
      rank === 1 ? 'bg-yellow-400 text-yellow-900' :
      rank === 2 ? 'bg-gray-300 text-gray-700' :
      'bg-orange-300 text-orange-800'
    }`}>
      {rank}
    </span>
  ) : null;

  // 阶段标签样式
  const stageStyles = {
    pre: 'bg-gray-100 text-gray-500',
    construction: 'bg-blue-50 text-blue-600',
    acceptance: 'bg-emerald-50 text-emerald-600',
  };

  // 剩余天数样式
  const remainingStyle = remaining.isOverdue 
    ? 'text-red-600 bg-red-50' 
    : remaining.days <= 7 
      ? 'text-amber-600 bg-amber-50' 
      : 'text-gray-500 bg-gray-50';

  return (
    <div className="card-v4 !p-5 cursor-pointer h-full flex flex-col relative group">
      {/* 排名角标 */}
      {rankBadge}
      
      {/* 下拉菜单 */}
      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreVertical className="h-4 w-4 text-gray-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); window.location.href = `/projects/${project.id}/dashboard`; }}>
              <Edit3 className="h-4 w-4 mr-2" />
              查看详情
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => onDelete?.(project, e)} className="text-red-600 focus:text-red-600">
              <Trash2 className="h-4 w-4 mr-2" />
              删除项目
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Link to={`/projects/${project.id}/dashboard`} className="flex-1 flex flex-col">
        {/* 卡头 */}
        <div className="flex items-start gap-3 mb-4 pr-8">
          {/* 色块缩写 */}
          <div className={`${color} w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0`}>
            {getProjectAbbr(project.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900 truncate">{project.name}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${st.cls}`}>{st.text}</span>
            </div>
            {project.description && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">{project.description}</p>
            )}
          </div>
        </div>

        {/* 阶段标签 */}
        <div className="flex items-center gap-2 mb-3">
          {(['pre', 'construction', 'acceptance'] as const).map((s) => (
            <span 
              key={s}
              className={`text-xs px-2 py-0.5 rounded-full ${
                stage.stage === s ? stageStyles[s] : 'bg-gray-50 text-gray-300'
              }`}
            >
              {s === 'pre' ? '前期' : s === 'construction' ? '施工' : '验收'}
            </span>
          ))}
        </div>

        {/* 健康度圆点 */}
        <div className="flex items-center gap-1.5 mb-3">
          <div className={`w-3 h-3 rounded-full ${hc.bg}`} title={`健康度: ${hc.label}`} />
        </div>

        {/* 进度条 */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>任务进度</span>
            <span>{completedCount}/{taskCount}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* 底部信息：剩余天数 */}
        <div className="flex items-center gap-2 flex-wrap mt-auto pt-3 border-t border-gray-100">
          {/* 剩余天数 */}
          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${remainingStyle}`}>
            <Clock className="h-3 w-3" />
            {remaining.isOverdue ? `延期${remaining.days}天` : `剩余${remaining.days}天`}
          </span>
        </div>

        {/* 进入箭头 */}
        <div className="flex justify-end mt-3 pt-2 border-t border-gray-50">
          <span className="text-xs text-blue-500 flex items-center gap-1 hover:gap-2 transition-all">
            进入项目 <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </Link>
    </div>
  );
});

export default ProjectCard;
