import { Card, CardContent } from '@/components/ui/card';
import { LoadingState } from '@/components/ui/loading-state';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { useCountUp } from '@/hooks/useCountUp';
import { getHealthLevel, type HealthDetails } from '@/lib/healthScore';

// 进度详情数据类型
interface ProgressDetails {
  overall: {
    currentProgress: number;
    targetProgress: number;
    progressDeviation: number;
  };
  dataConfidence: {
    completionRate: number;
    updateTimeliness: number;
    entityType: 'tasks' | 'risks' | 'milestones';
    totalItems: number;
    timelinessDays: number;
  };
  buildingProgress: Array<{
    id: string;
    name: string;
    code: string;
    progress: number;
    status: string;
  }>;
  hasRealData: boolean;
  entityType: 'tasks' | 'risks' | 'milestones';
}

interface DashboardHealthCardProps {
  healthScore: number;
  trend: 'up' | 'down' | 'stable';
  details: string;
  lastUpdated?: string;
  healthDetails?: HealthDetails;
  onViewHeatmap?: () => void;
  projectId?: string;
}

export default function DashboardHealthCard({
  healthScore,
  trend,
  details,
  lastUpdated = '刚刚更新',
  healthDetails,
  onViewHeatmap,
  projectId
}: DashboardHealthCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [progressDetails, setProgressDetails] = useState<ProgressDetails | null>(null);
  const [loading, setLoading] = useState(false);

  const colors = getHealthLevel(healthScore);
  const animScore = useCountUp(Math.round(healthScore), { duration: 1000, delay: 0 });

  // 5维度数据 - 与UI设计文件一致（含基础分）- 使用useMemo缓存
  const dimensions = useMemo(() => healthDetails ? [
    { name: '基础分', score: healthDetails.baseScore ?? 50, isPositive: true, isBase: true },
    { name: '任务完成', score: healthDetails.taskCompletionScore, isPositive: true, isBase: false },
    { name: '延期惩罚', score: healthDetails.delayPenaltyScore, isPositive: false, isBase: false },
    { name: '风险惩罚', score: healthDetails.riskPenaltyScore, isPositive: false, isBase: false },
    { name: '里程碑奖', score: healthDetails.milestoneBonusScore, isPositive: true, isBase: false },
  ] : [
    { name: '基础分', score: 50, isPositive: true, isBase: true },
    { name: '任务完成', score: Math.round(healthScore * 0.4), isPositive: true, isBase: false },
    { name: '延期惩罚', score: -Math.round((100 - healthScore) * 0.3), isPositive: false, isBase: false },
    { name: '风险惩罚', score: -Math.round((100 - healthScore) * 0.2), isPositive: false, isBase: false },
    { name: '里程碑奖', score: Math.round(healthScore * 0.1), isPositive: true, isBase: false },
  ], [healthDetails, healthScore]);

  // 计算进度条宽度（基于最大可能值进行归一化）
  const getProgressWidth = (score: number) => {
    const maxValue = 50; // 假设最大可能值是50
    return Math.min(Math.abs(score) / maxValue * 100, 100);
  };

  // 获取进度详情数据
  useEffect(() => {
    if (expanded && projectId && !progressDetails) {
      setLoading(true);
      fetch(`/api/dashboard/progress-details?projectId=${projectId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setProgressDetails(data.data);
          }
        })
        .catch(err => console.error('获取进度详情失败:', err))
        .finally(() => setLoading(false));
    }
  }, [expanded, projectId, progressDetails]);

  // 获取进度条颜色 - 使用useMemo缓存
  const getProgressColor = useMemo(() => (progress: number) => {
    if (progress >= 80) return 'bg-emerald-500';
    if (progress >= 60) return 'bg-blue-500';
    if (progress >= 40) return 'bg-amber-500';
    return 'bg-red-500';
  }, []);

  // 获取进度文字颜色 - 使用useMemo缓存
  const getProgressTextColor = useMemo(() => (progress: number) => {
    if (progress >= 80) return 'text-emerald-600';
    if (progress >= 60) return 'text-blue-600';
    if (progress >= 40) return 'text-amber-600';
    return 'text-red-600';
  }, []);

  return (
    <Card variant="metric" className="h-full">
      <CardContent className="p-5">
        {/* 头部：标题 + 展开箭头 */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">项目健康度</h3>
          <button 
            onClick={() => setExpanded(!expanded)}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            {expanded ? (
              <ChevronUp className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-400" />
            )}
          </button>
        </div>

        {/* 大数字 + 状态标签 + 趋势 */}
        <div className="flex flex-col items-center mb-6">
          <span className={`text-6xl font-bold ${colors.text}`}>{animScore}</span>
          <div className="flex items-center gap-2 mt-2">
            <span className={`px-3 py-1 text-sm font-medium rounded-full ${colors.bg.replace('bg-', 'bg-').replace('500', '50')} ${colors.text}`}>
              {colors.label}
            </span>
            {trend === 'up' && (
              <span className="flex items-center gap-0.5 text-xs text-emerald-600 font-medium">
                <TrendingUp className="h-3.5 w-3.5" />
                上升
              </span>
            )}
            {trend === 'down' && (
              <span className="flex items-center gap-0.5 text-xs text-red-500 font-medium">
                <TrendingDown className="h-3.5 w-3.5" />
                下降
              </span>
            )}
            {trend === 'stable' && (
              <span className="flex items-center gap-0.5 text-xs text-gray-400 font-medium">
                <Minus className="h-3.5 w-3.5" />
                持平
              </span>
            )}
          </div>
        </div>

        {/* 5维度进度条 - 仅展开时显示 */}
        {expanded && (
          <div className="space-y-3 mb-6">
            {dimensions.map((dim, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <span className={`w-20 text-sm flex-shrink-0 ${dim.isBase ? 'text-gray-400' : 'text-gray-600'}`}>{dim.name}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-700 ${
                      dim.isBase ? 'bg-gray-300' :
                      dim.isPositive ? 'bg-emerald-500' : 'bg-red-400'
                    }`}
                    style={{ width: `${getProgressWidth(dim.score)}%` }}
                  />
                </div>
                <span className={`w-14 text-right font-semibold text-sm ${
                  dim.isBase ? 'text-gray-400' :
                  dim.isPositive ? 'text-emerald-600' : 'text-red-500'
                }`}>
                  {dim.isBase ? dim.score : (dim.score > 0 ? `+${dim.score}` : dim.score)}
                  {dim.isBase && <span className="text-[10px] font-normal ml-0.5">固定</span>}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 展开详情 */}
        {expanded && (
          <div className="space-y-3">
            {loading ? (
              <LoadingState
                label="健康度加载中"
                description=""
                className="min-h-24 py-4"
              />
            ) : progressDetails ? (
              <>
                {/* 整体进度 - 绿色背景 */}
                <div className="bg-emerald-50 rounded-xl p-4">
                  <h4 className="text-emerald-700 font-semibold mb-3">整体进度</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">当前进度</span>
                      <span className="font-medium text-gray-900">{progressDetails.overall.currentProgress}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">目标进度</span>
                      <span className="font-medium text-gray-900">{progressDetails.overall.targetProgress}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">进度偏差</span>
                      <span className={`font-medium ${progressDetails.overall.progressDeviation >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {progressDetails.overall.progressDeviation >= 0 ? '+' : ''}{progressDetails.overall.progressDeviation}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* 数据置信度 - 蓝色背景 */}
                <div className="bg-blue-50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-blue-700 font-semibold">数据置信度</h4>
                    <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full">
                      {progressDetails.entityType === 'tasks' && '任务'}
                      {progressDetails.entityType === 'risks' && '风险'}
                      {progressDetails.entityType === 'milestones' && '里程碑'}
                      · {progressDetails.dataConfidence.totalItems}条
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">填报完整度</span>
                      <span className="font-medium text-gray-900">{progressDetails.dataConfidence.completionRate}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">更新及时性</span>
                      <span className="font-medium text-gray-900">{progressDetails.dataConfidence.updateTimeliness}%</span>
                      <span className="text-xs text-gray-400 ml-1">({progressDetails.dataConfidence.timelinessDays}天内)</span>
                    </div>
                  </div>
                </div>

                {/* 分项进度 - 紫色背景 */}
                <div className="bg-purple-50 rounded-xl p-4">
                  <h4 className="text-purple-700 font-semibold mb-3">分项进度</h4>
                  {progressDetails.buildingProgress.length > 0 ? (
                    <div className="space-y-3">
                      {progressDetails.buildingProgress.map((building) => (
                        <div key={building.id} className="flex items-center gap-3">
                          <span className="w-20 text-sm text-gray-600 flex-shrink-0">{building.name}</span>
                          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${getProgressColor(building.progress)}`} 
                              style={{ width: `${building.progress}%` }} 
                            />
                          </div>
                          <span className={`text-sm font-medium ${getProgressTextColor(building.progress)}`}>
                            {building.progress}%
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 py-2">
                      暂无分项进度数据
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-4 text-gray-500">
                暂无详细数据
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
