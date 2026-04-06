import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';

interface RiskTrendData {
  date: string;
  newRisks: number;
  resolvedRisks: number;
  totalRisks: number;
  highRiskCount: number;
  mediumRiskCount: number;
  lowRiskCount: number;
}

interface RiskTrendSummary {
  trend: RiskTrendData[];
  summary: {
    totalNewRisks: number;
    totalResolvedRisks: number;
    currentTotalRisks: number;
    riskChangeRate: number;
  };
}

interface RiskTrendChartProps {
  defaultExpanded?: boolean;
}

export default function RiskTrendChart({ defaultExpanded = false }: RiskTrendChartProps) {
  const { currentProject } = useProject();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<RiskTrendSummary | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    if (currentProject && isExpanded) {
      fetchTrendData();
    }
  }, [currentProject, isExpanded, days]);

  const fetchTrendData = async () => {
    if (!currentProject) return;
    
    setLoading(true);
    try {
      const response = await fetch(
        `/api/risk-statistics/trend?projectId=${currentProject.id}&days=${days}`
      );
      const result = await response.json();
      
      if (result.success) {
        setData(result.data);
      }
    } catch (error) {
      console.error('获取风险趋势失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 格式化日期显示
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  // 计算图表数据
  const getChartData = () => {
    if (!data?.trend?.length) return null;

    const maxTotal = Math.max(...data.trend.map(t => t.totalRisks), 1);
    const maxNew = Math.max(...data.trend.map(t => t.newRisks), 1);
    const maxResolved = Math.max(...data.trend.map(t => t.resolvedRisks), 1);

    return {
      maxTotal,
      maxNew,
      maxResolved,
      chartHeight: 160
    };
  };

  const chartData = getChartData();

  // 获取变化趋势图标
  const getTrendIcon = (rate: number) => {
    if (rate > 0) return <TrendingUp className="h-4 w-4 text-red-500" />;
    if (rate < 0) return <TrendingDown className="h-4 w-4 text-green-500" />;
    return <Minus className="h-4 w-4 text-gray-400" />;
  };

  // 获取变化率颜色
  const getTrendColor = (rate: number) => {
    if (rate > 0) return 'text-red-600';
    if (rate < 0) return 'text-green-600';
    return 'text-gray-500';
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base font-semibold">风险趋势分析</CardTitle>
            {data && (
              <div className="flex items-center gap-1 text-sm">
                {getTrendIcon(data.summary.riskChangeRate)}
                <span className={getTrendColor(data.summary.riskChangeRate)}>
                  {data.summary.riskChangeRate > 0 ? '+' : ''}{data.summary.riskChangeRate}%
                </span>
                <span className="text-gray-400 text-xs">({days}天)</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isExpanded && (
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                {[7, 14, 30].map((d) => (
                  <Button
                    key={d}
                    variant={days === d ? 'default' : 'ghost'}
                    size="sm"
                    className={`h-7 text-xs ${days === d ? '' : 'hover:bg-gray-200'}`}
                    onClick={() => setDays(d)}
                  >
                    {d}天
                  </Button>
                ))}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-500">加载中...</span>
            </div>
          ) : !data?.trend?.length ? (
            <div className="text-center py-8 text-gray-500">
              <p>暂无趋势数据</p>
              <p className="text-sm text-gray-400 mt-1">系统将自动收集每日风险统计数据</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 统计摘要 */}
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">
                    {data.summary.totalNewRisks}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">新增风险</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {data.summary.totalResolvedRisks}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">已处理</div>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {data.summary.currentTotalRisks}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">当前存量</div>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">
                    {data.trend[data.trend.length - 1]?.highRiskCount || 0}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">高风险</div>
                </div>
              </div>

              {/* 趋势图表 */}
              {chartData && (
                <div className="space-y-4">
                  {/* 存量趋势 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">风险存量趋势</span>
                      <span className="text-xs text-gray-400">单位: 个</span>
                    </div>
                    <div className="relative h-40 bg-gray-50 rounded-xl p-4">
                      {/* Y轴标签 */}
                      <div className="absolute left-2 top-4 bottom-8 flex flex-col justify-between text-xs text-gray-400">
                        <span>{chartData.maxTotal}</span>
                        <span>{Math.round(chartData.maxTotal / 2)}</span>
                        <span>0</span>
                      </div>

                      {/* 柱状图 */}
                      <div className="flex items-end justify-between h-full ml-8 pb-6 gap-1">
                        {data.trend.map((item, index) => {
                          const height = (item.totalRisks / chartData.maxTotal) * 100;
                          const isLatest = index === data.trend.length - 1;
                          return (
                            <div
                              key={item.date}
                              className="flex-1 flex flex-col items-center justify-end"
                            >
                              <div
                                className={`w-full max-w-8 rounded-t transition-all duration-300 ${
                                  isLatest ? 'bg-blue-500' : 'bg-blue-300'
                                }`}
                                style={{ height: `${Math.max(height, 4)}%` }}
                                title={`${item.date}: ${item.totalRisks}个风险`}
                              />
                              {index % Math.ceil(data.trend.length / 10) === 0 && (
                                <span className="text-xs text-gray-400 mt-1">
                                  {formatDate(item.date)}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* 新增/处理对比 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">新增 vs 处理</span>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-3 bg-red-400 rounded"></span>
                          新增
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-3 bg-green-400 rounded"></span>
                          处理
                        </span>
                      </div>
                    </div>
                    <div className="relative h-32 bg-gray-50 rounded-xl p-4">
                      <div className="flex items-end justify-between h-full pb-6 gap-1">
                        {data.trend.map((item) => {
                          const newHeight = (item.newRisks / Math.max(chartData.maxNew, 1)) * 100;
                          const resolvedHeight = (item.resolvedRisks / Math.max(chartData.maxResolved, 1)) * 100;
                          return (
                            <div
                              key={item.date}
                              className="flex-1 flex items-end justify-center gap-0.5"
                            >
                              <div
                                className="w-2 bg-red-400 rounded-t"
                                style={{ height: `${Math.max(newHeight, 2)}%` }}
                                title={`新增: ${item.newRisks}`}
                              />
                              <div
                                className="w-2 bg-green-400 rounded-t"
                                style={{ height: `${Math.max(resolvedHeight, 2)}%` }}
                                title={`处理: ${item.resolvedRisks}`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* 风险全览 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">风险全览</span>
                      <span className="text-xs text-gray-400">按里程碑分组</span>
                    </div>
                    {data.trend.length > 0 && (
                      <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                        {(() => {
                          const latest = data.trend[data.trend.length - 1];
                          const total = latest.highRiskCount + latest.mediumRiskCount + latest.lowRiskCount || 1;
                          return (
                            <>
                              <div className="flex-1">
                                <div className="flex h-4 rounded-full overflow-hidden">
                                  <div
                                    className="bg-red-500"
                                    style={{ width: `${(latest.highRiskCount / total) * 100}%` }}
                                  />
                                  <div
                                    className="bg-orange-400"
                                    style={{ width: `${(latest.mediumRiskCount / total) * 100}%` }}
                                  />
                                  <div
                                    className="bg-blue-400"
                                    style={{ width: `${(latest.lowRiskCount / total) * 100}%` }}
                                  />
                                </div>
                              </div>
                              <div className="flex items-center gap-3 text-xs">
                                <span className="flex items-center gap-1">
                                  <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                                  高 {latest.highRiskCount}
                                </span>
                                <span className="flex items-center gap-1">
                                  <span className="w-2 h-2 bg-orange-400 rounded-full"></span>
                                  中 {latest.mediumRiskCount}
                                </span>
                                <span className="flex items-center gap-1">
                                  <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                                  低 {latest.lowRiskCount}
                                </span>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
