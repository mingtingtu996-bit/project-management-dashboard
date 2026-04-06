import { useState, useEffect } from 'react';
import { getTaskDisplayStatus, isCompletedTask } from '@/lib/dashboardStatus';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Clock, AlertCircle, ChevronRight, User, Building2, Calendar, Filter } from 'lucide-react';
import { Link } from 'react-router-dom';

// 原始任务数据结构（来自API或localStorage）
interface RawTask {
  id: string
  title?: string
  name?: string
  status: string
  progress?: number
  assignee?: string
  assignee_name?: string
  assignee_unit?: string
  end_date?: string
  planned_end_date?: string
  project_id?: string
  updated_at?: string
}

interface Task {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'blocked' | 'completed';
  progress: number;
  assignee?: string;
  assignee_unit?: string;
  end_date?: string;
  days_until_due: number | null;
  due_status: 'overdue' | 'urgent' | 'approaching' | 'normal';
  due_label: string;
  due_color: string;
  // UI设计V4: 添加更新时间用于筛选
  updated_at?: string;
}

// 统计信息
interface TaskStats {
  total: number;
  overdue: number;
  urgent: number;
  approaching: number;
  normal: number;
}

// UI设计V4: 筛选类型
type FilterType = 'all' | '7days' | 'overdue' | 'urgent';

// 类型别名，兼容旧代码引用
type TaskWithDue = Task;

interface RecentTasksCardProps {
  projectId: string;
  tasks?: RawTask[];
  onViewAll?: () => void;
}

export default function RecentTasksCard({ projectId, tasks: sourceTasks, onViewAll }: RecentTasksCardProps) {

  const [tasks, setTasks] = useState<TaskWithDue[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<TaskWithDue[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // UI设计V4: 添加筛选状态
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  useEffect(() => {
    fetchPendingTasks(sourceTasks);
  }, [projectId, sourceTasks]);


  // UI设计V4: 筛选任务
  useEffect(() => {
    if (!tasks.length) {
      setFilteredTasks([]);
      return;
    }

    let filtered = [...tasks];

    switch (activeFilter) {
      case '7days':
        // 最近7天内截止的任务
        filtered = tasks.filter(t => {
          if (t.days_until_due === null) return false;
          return t.days_until_due >= 0 && t.days_until_due <= 7;
        });
        break;
      case 'overdue':
        filtered = tasks.filter(t => t.due_status === 'overdue');
        break;
      case 'urgent':
        filtered = tasks.filter(t => t.due_status === 'urgent' || t.due_status === 'overdue');
        break;
      default:
        filtered = tasks;
    }

    setFilteredTasks(filtered);
  }, [tasks, activeFilter]);

  const fetchPendingTasks = async (prefetchedTasks?: RawTask[]) => {
    try {
      setLoading(true);
      setError(null);

      let rawTasks: RawTask[] = [];

      if (prefetchedTasks !== undefined) {
        rawTasks = prefetchedTasks.filter((t) => t.project_id === projectId || !t.project_id);
      } else {
        // 优先从 Express API 获取；失败时降级到 localStorage
        try {
          const res = await fetch(`/api/tasks?projectId=${projectId}&limit=20`);
          if (res.ok) {
            const result = await res.json();
            if (result.success) rawTasks = result.data || [];
            else throw new Error(result?.error?.message || '获取任务失败');
          } else {
            throw new Error(`HTTP ${res.status}`);
          }
        } catch {
          // 降级：从 localStorage 读取
          const stored = localStorage.getItem('pm_tasks');
          const allTasks: RawTask[] = stored ? JSON.parse(stored) : [];
          rawTasks = allTasks.filter((t) => t.project_id === projectId);
        }
      }

      const today = new Date().toISOString().split('T')[0];

      // 只显示未完成的任务，按到期紧迫度排序
      const pendingTasks = rawTasks
        .filter((t) => !isCompletedTask(t))
        .map((t): TaskWithDue => {
          const rawEndDate = t.planned_end_date || t.end_date;
          const endDate = rawEndDate ? rawEndDate.split('T')[0] : null;
          let days_until_due: number | null = null;
          let due_status: TaskWithDue['due_status'] = 'normal';
          let due_label = '';
          let due_color = '';

          if (endDate) {
            const diff = Math.ceil(
              (new Date(endDate).getTime() - new Date(today).getTime()) / 86400000
            );
            days_until_due = diff;
            if (diff < 0) {
              due_status = 'overdue';
              due_label = `已延期 ${Math.abs(diff)} 天`;
              due_color = 'text-red-600';
            } else if (diff === 0) {
              due_status = 'urgent';
              due_label = '今天截止';
              due_color = 'text-amber-600';
            } else if (diff <= 3) {
              due_status = 'urgent';
              due_label = `${diff} 天后截止`;
              due_color = 'text-amber-600';
            } else if (diff <= 7) {
              due_status = 'approaching';
              due_label = `${diff} 天后截止`;
              due_color = 'text-blue-600';
            }
          }

          return {
            id: t.id,
            title: t.title || t.name || '（无标题）',
            status: getTaskDisplayStatus(t),
            progress: t.progress ?? 0,
            assignee: t.assignee_name || t.assignee,
            assignee_unit: t.assignee_unit,
            end_date: endDate || undefined,
            days_until_due,
            due_status,
            due_label,
            due_color,
            updated_at: t.updated_at
          };
        })
        .sort((a, b) => {
          const order = { overdue: 0, urgent: 1, approaching: 2, normal: 3 };
          return order[a.due_status] - order[b.due_status];
        })
        .slice(0, 10);

      const overdue = pendingTasks.filter(t => t.due_status === 'overdue').length;
      const urgent = pendingTasks.filter(t => t.due_status === 'urgent').length;
      const approaching = pendingTasks.filter(t => t.due_status === 'approaching').length;
      const normal = pendingTasks.filter(t => t.due_status === 'normal').length;

      setTasks(pendingTasks);
      setFilteredTasks(pendingTasks);
      setStats({ total: pendingTasks.length, overdue, urgent, approaching, normal });
    } catch (err: unknown) {
      if (import.meta.env.DEV) console.error('获取待完成任务失败:', err);
      setError(err instanceof Error ? err.message : '获取任务失败');
    } finally {
      setLoading(false);
    }
  };


  // 获取状态图标
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'blocked':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'in_progress':
        return <Clock className="h-4 w-4 text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  // 获取状态标签
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return '已完成';
      case 'blocked':
        return '受阻';
      case 'in_progress':
        return '进行中';
      default:
        return '待开始';
    }
  };

  // 获取状态颜色类
  const getStatusColorClass = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'blocked':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'in_progress':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      default:
        return 'bg-gray-50 text-gray-600 border-gray-200';
    }
  };

  // 获取到期状态颜色
  const getDueColorClass = (dueStatus: string) => {
    switch (dueStatus) {
      case 'overdue':
        return 'bg-red-100 text-red-700';
      case 'urgent':
        return 'bg-amber-100 text-amber-700';
      case 'approaching':
        return 'bg-blue-100 text-blue-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  // 获取左侧边框颜色（根据优先级）
  const getBorderColorClass = (dueStatus: string) => {
    switch (dueStatus) {
      case 'overdue':
        return 'border-l-red-500';
      case 'urgent':
        return 'border-l-amber-500';
      case 'approaching':
        return 'border-l-blue-500';
      default:
        return 'border-l-gray-300';
    }
  };

  // 获取进度条颜色
  const getProgressColorClass = (dueStatus: string) => {
    switch (dueStatus) {
      case 'overdue':
        return 'bg-red-500';
      case 'urgent':
        return 'bg-amber-500';
      case 'approaching':
        return 'bg-blue-500';
      default:
        return 'bg-emerald-500';
    }
  };

  // UI设计V4: 筛选按钮
  const FilterButton = ({ type, label, count }: { type: FilterType; label: string; count?: number }) => (
    <button
      onClick={() => setActiveFilter(type)}
      className={`px-2.5 py-1 text-xs font-medium rounded-full transition-all ${
        activeFilter === type
          ? 'bg-blue-500 text-white shadow-sm'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className={`ml-1 ${activeFilter === type ? 'text-blue-100' : 'text-gray-400'}`}>
          {count}
        </span>
      )}
    </button>
  );

  // 空状态
  if (!loading && !error && tasks.length === 0) {
    return (
      <Card className="rounded-xl border border-gray-200 shadow-sm bg-white hover:shadow-md hover:ring-1 ring-blue-100 transition-all h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-gray-700">最近待完成任务</CardTitle>
          <Link
            to={`/projects/${projectId}/gantt`}
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center"
          >
              查看全部
              <ChevronRight className="h-3 w-3 ml-1" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-3">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <p className="text-sm font-medium text-gray-700">太棒了！</p>
            <p className="text-xs text-gray-400 mt-1">暂无待完成任务</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl border border-gray-200 shadow-sm bg-white hover:shadow-md hover:ring-1 ring-blue-100 transition-all h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-gray-700">最近待完成任务</CardTitle>
          <Link
            to={projectId ? `/projects/${projectId}/gantt` : '/company'}
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center"
          >
            查看全部
            <ChevronRight className="h-3 w-3 ml-1" />
          </Link>
        </div>
        
        {/* UI设计V4: 筛选标签 */}
        {stats && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Filter className="h-3 w-3 text-gray-400" />
            <FilterButton type="all" label="全部" count={stats.total} />
            <FilterButton type="7days" label="7天内" count={stats.overdue + stats.urgent} />
            <FilterButton type="overdue" label="已延期" count={stats.overdue} />
            <FilterButton type="urgent" label="紧急" count={stats.overdue + stats.urgent} />
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* 统计概览 */}
          {stats && (
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-3">
                {stats.overdue > 0 && (
                  <span className="flex items-center text-red-600">
                    <span className="w-2 h-2 rounded-full bg-red-500 mr-1" />
                    已延期 {stats.overdue}
                  </span>
                )}
                {stats.urgent > 0 && (
                  <span className="flex items-center text-amber-600">
                    <span className="w-2 h-2 rounded-full bg-amber-500 mr-1" />
                    紧急 {stats.urgent}
                  </span>
                )}
                {stats.approaching > 0 && (
                  <span className="flex items-center text-blue-600">
                    <span className="w-2 h-2 rounded-full bg-blue-500 mr-1" />
                    即将到期 {stats.approaching}
                  </span>
                )}
                {stats.normal > 0 && (
                  <span className="flex items-center text-gray-500">
                    <span className="w-2 h-2 rounded-full bg-gray-400 mr-1" />
                    正常 {stats.normal}
                  </span>
                )}
              </div>
              <span className="text-gray-400">共 {filteredTasks.length} 个</span>
            </div>
          )}

          {/* 任务列表 */}
          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {loading ? (
              // 骨架屏
              <>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-3 bg-gray-50 rounded-lg animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-gray-200 rounded w-1/2" />
                  </div>
                ))}
              </>
            ) : error ? (
              <div className="text-center py-4">
                <p className="text-xs text-red-600">{error}</p>
                <button
                  onClick={fetchPendingTasks}
                  className="text-xs text-blue-600 mt-2 hover:underline"
                >
                  重试
                </button>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <Filter className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-xs">该筛选条件下无任务</p>
              </div>
            ) : (
              filteredTasks.slice(0, 5).map((task) => (
                <Link
                  key={task.id}
                  to={projectId ? `/projects/${projectId}/gantt?task=${task.id}` : `/company`}
                  className={`block p-3 bg-white border border-gray-100 rounded-xl hover:shadow-sm transition-shadow border-l-4 ${getBorderColorClass(
                    task.due_status
                  )}`}
                >
                  <div className="flex items-start justify-between">
                    {/* 左侧：任务信息 */}
                    <div className="flex-1 min-w-0">
                      {/* 任务标题 */}
                      <h4 className="text-sm font-medium text-gray-900 truncate">
                        {task.title}
                      </h4>

                      {/* 责任人 + 单位 */}
                      <div className="flex items-center mt-1 text-xs text-gray-400">
                        {task.assignee && (
                          <span className="flex items-center mr-3">
                            <User className="h-3 w-3 mr-1" />
                            {task.assignee}
                          </span>
                        )}
                        {task.assignee_unit && (
                          <span className="flex items-center">
                            <Building2 className="h-3 w-3 mr-1" />
                            {task.assignee_unit}
                          </span>
                        )}
                      </div>

                      {/* 进度条 */}
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-gray-400">进度</span>
                          <span className="font-medium text-gray-700">{task.progress}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${getProgressColorClass(task.due_status)}`}
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* 右侧：状态标签 */}
                    <div className="flex flex-col items-end space-y-1 ml-3">
                      {/* 到期标签 */}
                      {task.due_label && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${getDueColorClass(
                            task.due_status
                          )}`}
                        >
                          {task.due_label}
                        </span>
                      )}

                      {/* 状态标签 */}
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs border flex items-center ${getStatusColorClass(
                          task.status
                        )}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-current" />
                        {getStatusLabel(task.status)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>

          {/* 底部提示 */}
          {!loading && !error && stats && (
            <div className="text-xs text-gray-400 pt-2 border-t border-gray-100">
              {stats.overdue > 0 ? (
                <p className="text-red-600 flex items-center">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  有 {stats.overdue} 个任务已延期，需要尽快处理
                </p>
              ) : stats.urgent > 0 ? (
                <p className="text-amber-600 flex items-center">
                  <Clock className="h-3 w-3 mr-1" />
                  有 {stats.urgent} 个任务即将到期
                </p>
              ) : (
                <p className="text-emerald-600 flex items-center">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  任务进度正常
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
