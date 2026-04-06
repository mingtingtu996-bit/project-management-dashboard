import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';

interface MilestoneItem {
  id: string;
  name: string;
  dueDate: string;
  status: 'completed' | 'pending' | 'delayed';
  progress?: number;
  projectId: string;
  assignee?: string;
  relatedTasks?: number;
  onTimeRate?: number;
}

interface DashboardMilestoneCardProps {
  completed: number;
  total: number;
  upcoming: number;
  overdue: number;
  recentMilestones: MilestoneItem[];
  onViewAll?: () => void;
}

export default function DashboardMilestoneCard({
  completed,
  total,
  recentMilestones,
  onViewAll
}: DashboardMilestoneCardProps) {
  const [expanded, setExpanded] = useState(false);
  // 同时兼容 /projects/:id/dashboard 和 /projects/:projectId/... 两种路由格式
  const params = useParams<{ id?: string; projectId?: string }>();
  const urlProjectId = params.id || params.projectId || '';
  const projectId = recentMilestones[0]?.projectId || urlProjectId || '';

  // 计算剩余天数
  const getDaysRemaining = (dueDate: string): { text: string; isOverdue: boolean; isUrgent: boolean } => {
    if (!dueDate || dueDate === '' || dueDate === 'Invalid Date') {
      return { text: '未设置', isOverdue: false, isUrgent: false };
    }
    
    const due = new Date(dueDate);
    if (isNaN(due.getTime())) {
      return { text: '日期无效', isOverdue: false, isUrgent: false };
    }
    
    const today = new Date();
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { text: '已延期', isOverdue: true, isUrgent: false };
    if (diffDays === 0) return { text: '今天', isOverdue: false, isUrgent: true };
    if (diffDays === 1) return { text: '明天', isOverdue: false, isUrgent: true };
    if (diffDays <= 3) return { text: `${diffDays}天后`, isOverdue: false, isUrgent: true };
    return { text: `${diffDays}天后`, isOverdue: false, isUrgent: false };
  };

  // 找到最近的未完成里程碑作为"下一节点"
  const nextMilestone = recentMilestones
    .filter(m => m.status !== 'completed')
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];

  const remaining = nextMilestone ? getDaysRemaining(nextMilestone.dueDate) : null;

  return (
    <Card className="rounded-xl border border-gray-200 shadow-sm bg-white hover:shadow-md hover:ring-1 ring-blue-100 transition-all h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-gray-700">里程碑追踪</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-blue-600 font-medium">{completed}/{total}</span>
            <button 
              onClick={() => setExpanded(!expanded)}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* UI设计V4: 下一节点高亮卡片 - 蓝色左边框 */}
          {nextMilestone && remaining ? (
            <>
              <div className="p-3 border-l-4 border-blue-500 bg-blue-50 rounded-r">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-medium text-gray-800">下一节点</span>
                  {remaining.isOverdue ? (
                    <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">已延期</span>
                  ) : remaining.isUrgent ? (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">{remaining.text}</span>
                  ) : (
                    <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs">{remaining.text}</span>
                  )}
                </div>
                <p className="text-sm font-medium text-blue-700">{nextMilestone.name}</p>
              </div>

              {/* UI设计V4: 详细信息列表 - 仅展开时显示 */}
              {expanded && (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>责任人/单位</span>
                    <span className="font-medium">
                      {nextMilestone.assignee || '未分配'} 
                      <span className="text-gray-400"> / 待分配</span>
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>关联任务</span>
                    <span className="font-medium">{nextMilestone.relatedTasks || 0}项</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>准时率</span>
                    <span className="font-medium text-green-600">
                      {nextMilestone.onTimeRate !== undefined && nextMilestone.onTimeRate !== null
                        ? `${nextMilestone.onTimeRate}%`
                        : '-'}
                    </span>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* 没有下一节点时显示完成状态 */
            <div className="p-3 border-l-4 border-green-500 bg-green-50 rounded-r">
              <div className="flex justify-between items-start mb-1">
                <span className="font-medium text-gray-800">下一节点</span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs">已完成</span>
              </div>
              <p className="text-sm font-medium text-green-700">所有里程碑已完成</p>
            </div>
          )}

          {/* UI设计V4: 蓝色按钮 - 仅展开时显示 */}
          {expanded && (
            <div className="pt-2">
              <Link 
                to={projectId ? `/projects/${projectId}/milestones` : '/milestones'}
                className="w-full flex items-center justify-center px-3 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition-colors"
                onClick={onViewAll}
              >
                查看里程碑详情
                <ChevronRight className="h-4 w-4 ml-1" />
              </Link>
            </div>
          )}

          {/* 展开后的更多里程碑列表 */}
          {expanded && recentMilestones.length > 1 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <h4 className="text-xs font-medium text-gray-500 mb-3">后续里程碑</h4>
              <div className="space-y-2">
                {recentMilestones
                  .filter(m => m.status !== 'completed')
                  .slice(1, 4) // 显示接下来的3个里程碑
                  .map((milestone, idx) => {
                    const remaining = getDaysRemaining(milestone.dueDate);
                    return (
                      <div 
                        key={milestone.id} 
                        className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 flex items-center justify-center bg-gray-200 rounded-full text-xs text-gray-600">
                            {idx + 2}
                          </span>
                          <span className="text-gray-700 truncate max-w-[120px]">{milestone.name}</span>
                        </div>
                        {remaining && (
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            remaining.isOverdue ? 'bg-red-100 text-red-700' :
                            remaining.isUrgent ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {remaining.text}
                          </span>
                        )}
                      </div>
                    );
                  })}
                {recentMilestones.filter(m => m.status !== 'completed').length <= 1 && (
                  <div className="text-center py-4 text-gray-400 text-sm">
                    暂无更多未完成的里程碑
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
