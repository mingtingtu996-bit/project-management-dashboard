import { useState, useEffect } from 'react';
import { DashboardApiService } from '@/services/dashboardApi';
import { Calendar, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';

interface CountdownItem {
  projectId: string;
  projectName: string;
  plannedEnd: string;
  daysLeft: number;
  status: string;
}

export function DeliveryCountdown() {
  const [countdowns, setCountdowns] = useState<CountdownItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [daysFilter, setDaysFilter] = useState(90); // 默认90天

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const data = await DashboardApiService.getUpcomingDeliveries(daysFilter);
        setCountdowns(data);
      } catch (error) {
        console.error('加载交付倒计时失败:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [daysFilter]);

  const getUrgencyLevel = (days: number) => {
    if (days <= 30) return { level: 'critical', color: 'red', icon: AlertCircle, text: '紧急' };
    if (days <= 60) return { level: 'warning', color: 'yellow', icon: Clock, text: '重要' };
    return { level: 'normal', color: 'blue', icon: Calendar, text: '一般' };
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 skeleton-block rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-40 skeleton-block rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">交付倒计时</h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>筛选:</span>
            <select
              value={daysFilter}
              onChange={(e) => setDaysFilter(Number(e.target.value))}
              className="px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={30}>30天内</option>
              <option value={60}>60天内</option>
              <option value={90}>90天内</option>
            </select>
          </div>
          <div className="text-sm text-gray-500">
            共 {countdowns.length} 个项目
          </div>
        </div>
      </div>

      {countdowns.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-gray-50">
          <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-green-500" />
          <p className="text-lg font-medium text-gray-700">未来{daysFilter}天无需交付项目</p>
          <p className="text-sm text-gray-500 mt-2">所有项目都在正常推进</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {countdowns.map((item) => {
            const urgency = getUrgencyLevel(item.daysLeft);
            const UrgencyIcon = urgency.icon;

            return (
              <div
                key={item.projectId}
                className={`border rounded-xl p-4 transition-all hover:shadow-md ${
                  urgency.level === 'critical'
                    ? 'border-red-300 bg-red-50'
                    : urgency.level === 'warning'
                    ? 'border-yellow-300 bg-yellow-50'
                    : 'border-blue-300 bg-blue-50'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <UrgencyIcon className={`h-5 w-5 text-${urgency.color}-600`} />
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        urgency.level === 'critical'
                          ? 'bg-red-100 text-red-700'
                          : urgency.level === 'warning'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {urgency.text}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {item.status === 'in_progress' ? '进行中' : '未开始'}
                  </span>
                </div>

                <h3 className="font-semibold text-gray-900 mb-2">{item.projectName}</h3>

                <div className="text-sm text-gray-600 mb-3">
                  计划交付: {new Date(item.plannedEnd).toLocaleDateString('zh-CN')}
                </div>

                <div className="text-center py-3 bg-white rounded-xl">
                  <div
                    className={`text-4xl font-bold ${
                      urgency.level === 'critical'
                        ? 'text-red-600'
                        : urgency.level === 'warning'
                        ? 'text-yellow-600'
                        : 'text-blue-600'
                    }`}
                  >
                    {item.daysLeft}
                  </div>
                  <div
                    className={`text-sm mt-1 ${
                      urgency.level === 'critical'
                        ? 'text-red-600'
                        : urgency.level === 'warning'
                        ? 'text-yellow-600'
                        : 'text-blue-600'
                    }`}
                  >
                    天后交付
                  </div>
                </div>

                {item.daysLeft <= 30 && (
                  <div className="mt-3 text-xs text-red-600 bg-red-100 px-2 py-1 rounded text-center">
                    ⚠️ 剩余时间紧张,需要加快进度
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 图例说明 */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span className="text-gray-700">紧急 (≤30天)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <span className="text-gray-700">重要 (31-60天)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span className="text-gray-700">一般 (61-90天)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
