import React from 'react';
import { 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  ChevronRight,
  Calendar,
  Users,
  TrendingUp,
  MoreHorizontal,
  Plus,
  Filter,
  Search,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

// 优化后的设计预览页面
export default function DesignPreview() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* 页面头部 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">计划编制工作台</h1>
              <p className="text-sm text-slate-500 mt-0.5">项目任务规划与进度跟踪</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="搜索任务..." 
                  className="pl-9 pr-4 py-2 w-64 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
              </div>
              <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                <Filter className="w-4 h-4" />
                筛选
              </button>
              <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
                <Plus className="w-4 h-4" />
                新建任务
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="p-6">
        {/* 统计卡片区 - 优化后的布局 */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard 
            title="总任务数" 
            value={156} 
            change={12} 
            changeType="increase"
            icon={<CheckCircle2 className="w-5 h-5 text-blue-600" />}
            bgColor="bg-blue-50"
          />
          <StatCard 
            title="进行中" 
            value={42} 
            change={5} 
            changeType="increase"
            icon={<Clock className="w-5 h-5 text-amber-600" />}
            bgColor="bg-amber-50"
          />
          <StatCard 
            title="已完成" 
            value={98} 
            change={8} 
            changeType="increase"
            icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
            bgColor="bg-emerald-50"
          />
          <StatCard 
            title="逾期任务" 
            value={16} 
            change={3} 
            changeType="decrease"
            icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
            bgColor="bg-red-50"
          />
        </div>

        {/* 任务列表区 - 优化后的表格设计，修复数字重叠 */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* 表格头部 */}
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">任务列表</h2>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>共 156 项任务</span>
              </div>
            </div>
          </div>

          {/* 表格 - 优化后的列宽分配，防止数字重叠 */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-3 px-6 text-xs font-medium text-slate-500 uppercase tracking-wider w-[40%]">任务名称</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider w-[12%]">负责人</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider w-[12%]">截止日期</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider w-[10%]">进度</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider w-[10%]">工时</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider w-[10%]">状态</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider w-[6%]">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <TaskRow 
                  name="系统架构设计文档编写"
                  assignee="张三"
                  dueDate="2024-03-15"
                  progress={85}
                  hours={120}
                  status="进行中"
                  level={0}
                />
                <TaskRow 
                  name="需求分析与确认"
                  assignee="李四"
                  dueDate="2024-03-10"
                  progress={100}
                  hours={40}
                  status="已完成"
                  level={1}
                />
                <TaskRow 
                  name="技术方案评审"
                  assignee="王五"
                  dueDate="2024-03-20"
                  progress={60}
                  hours={24}
                  status="进行中"
                  level={1}
                />
                <TaskRow 
                  name="数据库设计与优化"
                  assignee="赵六"
                  dueDate="2024-03-08"
                  progress={30}
                  hours={80}
                  status="逾期"
                  level={0}
                />
                <TaskRow 
                  name="前端页面开发"
                  assignee="钱七"
                  dueDate="2024-03-25"
                  progress={45}
                  hours={160}
                  status="进行中"
                  level={0}
                />
                <TaskRow 
                  name="登录模块实现"
                  assignee="孙八"
                  dueDate="2024-03-18"
                  progress={100}
                  hours={32}
                  status="已完成"
                  level={1}
                />
                <TaskRow 
                  name="用户管理模块"
                  assignee="周九"
                  dueDate="2024-03-22"
                  progress={70}
                  hours={48}
                  status="进行中"
                  level={1}
                />
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">显示 1-10 共 156 条</span>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 text-sm text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors">上一页</button>
                <button className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded-md">1</button>
                <button className="px-3 py-1.5 text-sm text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors">2</button>
                <button className="px-3 py-1.5 text-sm text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors">3</button>
                <button className="px-3 py-1.5 text-sm text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors">下一页</button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// 统计卡片组件
function StatCard({ 
  title, 
  value, 
  change, 
  changeType, 
  icon, 
  bgColor 
}: { 
  title: string; 
  value: number; 
  change: number; 
  changeType: 'increase' | 'decrease';
  icon: React.ReactNode;
  bgColor: string;
}) {
  const isPositive = changeType === 'increase';
  
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className={`p-2.5 rounded-lg ${bgColor}`}>
          {icon}
        </div>
        <div className={`flex items-center gap-1 text-xs font-medium ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
          {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
          {change}
        </div>
      </div>
      <div className="mt-4">
        <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
        <p className="text-sm text-slate-500 mt-1">{title}</p>
      </div>
    </div>
  );
}

// 任务行组件 - 优化后防止数字重叠
function TaskRow({ 
  name, 
  assignee, 
  dueDate, 
  progress, 
  hours, 
  status,
  level 
}: { 
  name: string; 
  assignee: string; 
  dueDate: string; 
  progress: number; 
  hours: number;
  status: '进行中' | '已完成' | '逾期' | '未开始';
  level: number;
}) {
  const statusConfig = {
    '进行中': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    '已完成': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    '逾期': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
    '未开始': { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
  };

  const config = statusConfig[status];
  const isOverdue = status === '逾期';

  return (
    <tr className="hover:bg-slate-50/50 transition-colors group">
      {/* 任务名称 - 带层级缩进 */}
      <td className="py-3.5 px-6">
        <div className="flex items-center gap-2" style={{ paddingLeft: `${level * 20}px` }}>
          {level > 0 && (
            <span className="w-4 h-4 flex items-center justify-center">
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </span>
          )}
          <span className={`text-sm font-medium truncate max-w-[300px] ${isOverdue ? 'text-red-700' : 'text-slate-900'}`}>
            {name}
          </span>
        </div>
      </td>
      
      {/* 负责人 */}
      <td className="py-3.5 px-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
            {assignee[0]}
          </div>
          <span className="text-sm text-slate-700 truncate">{assignee}</span>
        </div>
      </td>
      
      {/* 截止日期 */}
      <td className="py-3.5 px-4">
        <div className="flex items-center gap-1.5">
          <Calendar className={`w-3.5 h-3.5 flex-shrink-0 ${isOverdue ? 'text-red-500' : 'text-slate-400'}`} />
          <span className={`text-sm tabular-nums ${isOverdue ? 'text-red-600 font-medium' : 'text-slate-600'}`}>
            {dueDate}
          </span>
        </div>
      </td>
      
      {/* 进度 - 修复数字重叠，使用固定宽度 */}
      <td className="py-3.5 px-4">
        <div className="flex items-center justify-center gap-2">
          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
            <div 
              className={`h-full rounded-full transition-all ${
                progress === 100 ? 'bg-emerald-500' : 
                progress >= 60 ? 'bg-blue-500' : 
                'bg-amber-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-sm font-medium text-slate-700 tabular-nums w-10 text-right flex-shrink-0">
            {progress}%
          </span>
        </div>
      </td>
      
      {/* 工时 - 修复数字重叠，使用固定宽度 */}
      <td className="py-3.5 px-4 text-center">
        <span className="text-sm text-slate-600 tabular-nums inline-block min-w-[40px]">
          {hours}h
        </span>
      </td>
      
      {/* 状态标签 */}
      <td className="py-3.5 px-4 text-center">
        <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full border ${config.bg} ${config.text} ${config.border}`}>
          {status}
        </span>
      </td>
      
      {/* 操作按钮 */}
      <td className="py-3.5 px-4 text-center">
        <button className="p-1.5 rounded-md hover:bg-slate-100 transition-colors opacity-0 group-hover:opacity-100">
          <MoreHorizontal className="w-4 h-4 text-slate-500" />
        </button>
      </td>
    </tr>
  );
}
