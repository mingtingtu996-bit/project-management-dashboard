import { useState, useEffect } from 'react';
import { DashboardApiService, MilestoneSummary } from '@/services/dashboardApi';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export function MilestonesSummaryTable() {
  const [milestones, setMilestones] = useState<MilestoneSummary[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const data = await DashboardApiService.getMilestonesSummary();
        setMilestones(data);
      } catch (error) {
        console.error('加载里程碑失败:', error);
        setError('加载里程碑数据失败,请重试');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const filteredMilestones = filter === 'all'
    ? milestones
    : milestones.filter(m => m.status === filter);

  const getDeviationColor = (days: number) => {
    if (days < 0) return 'text-green-600';
    if (days <= 7) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getDeviationText = (days: number) => {
    if (days < 0) return '提前';
    if (days === 0) return '准时';
    return '延期';
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="border rounded-xl p-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 mb-3">
              <div className="h-4 flex-1 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-600">
        <AlertCircle className="h-12 w-12 mx-auto mb-3" />
        <p>{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-3 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
        >
          重新加载
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">跨项目里程碑汇总</h2>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部</option>
            <option value="completed">已完成</option>
            <option value="in_progress">进行中</option>
            <option value="pending">未开始</option>
          </select>
          <div className="text-sm text-gray-500">
            共 {filteredMilestones.length} 个里程碑
          </div>
        </div>
      </div>

      {filteredMilestones.length === 0 ? (
        <div className="text-center py-8 text-gray-500 border rounded-xl">
          <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-emerald-500" />
          <p>暂无里程碑数据</p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full border-collapse">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3 text-sm font-semibold text-gray-700">项目名称</th>
                <th className="text-left p-3 text-sm font-semibold text-gray-700">里程碑</th>
                <th className="text-left p-3 text-sm font-semibold text-gray-700">计划完成</th>
                <th className="text-left p-3 text-sm font-semibold text-gray-700">实际完成</th>
                <th className="text-left p-3 text-sm font-semibold text-gray-700">偏差</th>
                <th className="text-left p-3 text-sm font-semibold text-gray-700">状态</th>
              </tr>
            </thead>
            <tbody>
              {filteredMilestones.map((milestone) => (
                <tr
                  key={milestone.milestoneId}
                  className="border-b hover:bg-gray-50 transition-colors"
                >
                  <td className="p-3 font-medium text-sm">{milestone.projectName}</td>
                  <td className="p-3 text-sm">{milestone.milestoneName}</td>
                  <td className="p-3 text-sm">{milestone.plannedEnd}</td>
                  <td className="p-3 text-sm">
                    {milestone.actualEnd || <span className="text-gray-400">-</span>}
                  </td>
                  <td className={`p-3 text-sm font-medium ${getDeviationColor(milestone.deviationDays)}`}>
                    {getDeviationText(milestone.deviationDays)} {Math.abs(milestone.deviationDays)}天
                  </td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        milestone.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-700'
                          : milestone.status === 'in_progress'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {milestone.status === 'completed'
                        ? '已完成'
                        : milestone.status === 'in_progress'
                        ? '进行中'
                        : '未开始'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
