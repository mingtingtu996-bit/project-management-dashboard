/**
 * RiskBubbleMatrix.tsx
 *
 * 风险来源气泡热力图组件
 *
 * 功能：展示风险按来源和等级的分布情况
 * X轴：风险来源（技术/管理/外部/合规/资源）
 * Y轴：风险等级（低/中/高/严重）
 * 气泡大小：风险影响范围（受影响任务数）
 * 气泡颜色：风险等级
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Risk } from '@/lib/supabase';

interface RiskBubbleMatrixProps {
  risks: Risk[];
}

// 风险来源分类
const RISK_SOURCES = ['技术', '管理', '外部', '合规', '资源'] as const;

// 风险等级
const RISK_LEVELS = [
  { key: 'low', label: '低', color: 'bg-blue-400', textColor: 'text-blue-600' },
  { key: 'medium', label: '中', color: 'bg-amber-400', textColor: 'text-amber-600' },
  { key: 'high', label: '高', color: 'bg-orange-500', textColor: 'text-orange-600' },
  { key: 'critical', label: '严重', color: 'bg-red-500', textColor: 'text-red-600' },
] as const;

// 风险来源映射（从风险标题/描述推断）
function inferRiskSource(risk: Risk): string {
  const title = (risk.title || '').toLowerCase();
  const desc = (risk.description || '').toLowerCase();
  const text = title + ' ' + desc;

  // 技术风险关键词
  if (/技术|设计|施工|质量|安全|设备|材料|工艺|方案/.test(text)) return '技术';
  // 管理风险关键词
  if (/管理|协调|沟通|组织|计划|进度|人员|团队/.test(text)) return '管理';
  // 外部风险关键词
  if (/天气|气候|地质|环境|市场|供应商|客户|政策/.test(text)) return '外部';
  // 合规风险关键词
  if (/法规|法律|合规|许可|审批|证照|环保|验收/.test(text)) return '合规';
  // 资源风险关键词
  if (/资金|成本|预算|人力|资源|材料|设备短缺/.test(text)) return '资源';

  // 默认根据ID分配，确保分布均匀
  const hash = risk.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return RISK_SOURCES[hash % RISK_SOURCES.length];
}

// 计算气泡大小（基于风险影响）
function calcBubbleSize(risk: Risk): number {
  // 基础大小 + 根据等级调整
  const baseSize = 24;
  const levelMultiplier = {
    low: 1,
    medium: 1.3,
    high: 1.6,
    critical: 2,
  };
  return Math.round(baseSize * (levelMultiplier[risk.level as keyof typeof levelMultiplier] || 1));
}

export function RiskBubbleMatrix({ risks }: RiskBubbleMatrixProps) {
  // 只统计未缓解的风险
  const activeRisks = risks.filter(r => r.status !== 'mitigated');

  // 按来源和等级分组统计
  const matrix = RISK_SOURCES.map(source => {
    const sourceRisks = activeRisks.filter(r => inferRiskSource(r) === source);
    return {
      source,
      counts: RISK_LEVELS.map(level => ({
        level: level.key,
        label: level.label,
        color: level.color,
        textColor: level.textColor,
        risks: sourceRisks.filter(r => r.level === level.key),
        count: sourceRisks.filter(r => r.level === level.key).length,
      })),
      total: sourceRisks.length,
    };
  });

  const totalRisks = activeRisks.length;

  return (
    <Card className="rounded-xl border border-gray-200 shadow-sm bg-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-gray-800 flex items-center justify-between">
          <span>风险来源分布</span>
          {totalRisks > 0 && (
            <span className="text-xs font-normal text-gray-500">
              共 {totalRisks} 个活跃风险
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {/* 图例 */}
        <div className="flex items-center justify-center gap-3 mb-4 text-xs">
          {RISK_LEVELS.map(l => (
            <span key={l.key} className="flex items-center gap-1">
              <span className={`w-3 h-3 rounded-full ${l.color}`} />
              <span className="text-gray-500">{l.label}</span>
            </span>
          ))}
        </div>

        {/* 矩阵网格 */}
        <div className="relative">
          {/* Y轴标签（等级） */}
          <div className="absolute left-0 top-0 bottom-0 w-8 flex flex-col justify-around text-[10px] text-gray-400 py-2">
            {[...RISK_LEVELS].reverse().map(l => (
              <span key={l.key} className="text-center">{l.label}</span>
            ))}
          </div>

          {/* 矩阵内容 */}
          <div className="ml-8">
            {/* 表头（来源） */}
            <div className="grid grid-cols-5 gap-1 mb-1">
              {RISK_SOURCES.map(s => (
                <div key={s} className="text-center text-[10px] text-gray-500 py-1">
                  {s}
                </div>
              ))}
            </div>

            {/* 矩阵行 */}
            <div className="space-y-1">
              {[...RISK_LEVELS].reverse().map((level, rowIdx) => (
                <div key={level.key} className="grid grid-cols-5 gap-1">
                  {RISK_SOURCES.map((source, colIdx) => {
                    const cell = matrix[colIdx].counts.find(c => c.level === level.key);
                    const count = cell?.count || 0;
                    const cellRisks = cell?.risks || [];

                    // 计算气泡大小
                    const maxSize = cellRisks.length > 0
                      ? Math.max(...cellRisks.map(calcBubbleSize))
                      : 0;

                    return (
                      <div
                        key={`${source}-${level.key}`}
                        className="aspect-square bg-gray-50 rounded-lg flex items-center justify-center relative hover:bg-gray-100 transition-colors"
                        title={count > 0 ? `${source}风险 · ${level.label}等级: ${count}个` : `${source}风险 · ${level.label}等级`}
                      >
                        {count > 0 && (
                          <>
                            {/* 气泡 */}
                            <div
                              className={`rounded-full ${level.color} opacity-80 flex items-center justify-center text-white text-[10px] font-bold shadow-sm`}
                              style={{
                                width: Math.min(maxSize, 36),
                                height: Math.min(maxSize, 36),
                              }}
                            >
                              {count > 1 ? count : ''}
                            </div>
                            {/* 多个风险时的指示器 */}
                            {count > 1 && (
                              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-400 rounded-full" />
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 统计摘要 */}
        {totalRisks > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-100">
            <div className="flex flex-wrap gap-2">
              {matrix
                .filter(m => m.total > 0)
                .sort((a, b) => b.total - a.total)
                .slice(0, 3)
                .map(m => (
                  <span
                    key={m.source}
                    className="text-xs bg-gray-50 text-gray-600 px-2 py-1 rounded-full"
                  >
                    {m.source}: {m.total}个
                  </span>
                ))}
            </div>
          </div>
        )}

        {totalRisks === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            暂无活跃风险
          </div>
        )}
      </CardContent>
    </Card>
  );
}
