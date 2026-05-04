import {
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Clock,
  FileText,
  MapPin,
} from 'lucide-react'

import { MetricCard } from '@/components/ui/metric-card'

import type { CertificateBoardSummary } from '../types'

interface LifecycleMetricGridProps {
  summary: Pick<
    CertificateBoardSummary,
    'completedCount' | 'totalCount' | 'blockingCertificateType' | 'expectedReadyDate' | 'overdueCount' | 'supplementCount' | 'weeklyActionCount'
  >
  onClickBlockingCertificate?: () => void
  onClickExpectedReadyDate?: () => void
  onClickOverdue?: () => void
}

export function LifecycleMetricGrid({
  summary,
  onClickBlockingCertificate,
  onClickExpectedReadyDate,
  onClickOverdue,
}: LifecycleMetricGridProps) {
  const items = [
    {
      eyebrow: 'DONE',
      label: '四证完成',
      value: summary.completedCount,
      hint: `总计 ${summary.totalCount}`,
      icon: <CheckCircle className="h-5 w-5" />,
      tone: 'success' as const,
    },
    {
      eyebrow: 'BLOCK',
      label: '当前卡点',
      value: summary.blockingCertificateType || '无',
      hint: '阻断开工条件的当前证照',
      icon: <Clock className="h-5 w-5" />,
      tone: summary.blockingCertificateType ? ('warning' as const) : ('slate' as const),
      onClick: onClickBlockingCertificate,
    },
    {
      eyebrow: 'READY',
      label: '预计开工条件',
      value: summary.expectedReadyDate || '待补全',
      hint: '按当前四证链路推算',
      icon: <MapPin className="h-5 w-5" />,
      tone: summary.expectedReadyDate ? ('primary' as const) : ('warning' as const),
      onClick: onClickExpectedReadyDate,
    },
    {
      eyebrow: 'OVERDUE',
      label: '逾期事项',
      value: summary.overdueCount,
      hint: '证照节点当前逾期数量',
      icon: <FileText className="h-5 w-5" />,
      tone: summary.overdueCount > 0 ? ('danger' as const) : ('slate' as const),
      onClick: onClickOverdue,
    },
    {
      eyebrow: 'SUPPLY',
      label: '待补正压力',
      value: summary.supplementCount,
      hint: '需补正或补充资料事项',
      icon: <AlertTriangle className="h-5 w-5" />,
      tone: summary.supplementCount > 0 ? ('danger' as const) : ('slate' as const),
    },
    {
      eyebrow: 'WEEK',
      label: '本周推进',
      value: summary.weeklyActionCount,
      hint: '本周新增推进记录',
      icon: <BarChart3 className="h-5 w-5" />,
      tone: 'primary' as const,
    },
  ]

  return (
    <div className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <MetricCard
          key={item.label}
          eyebrow={item.eyebrow}
          title={item.label}
          value={item.value}
          hint={item.hint}
          icon={item.icon}
          tone={item.tone}
          onClick={item.onClick}
        />
      ))}
    </div>
  )
}
