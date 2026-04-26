import {
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Clock,
  FileText,
  MapPin,
} from 'lucide-react'
import type { CertificateBoardSummary } from '../types'

interface LifecycleSummaryCardsProps {
  summary: Pick<
    CertificateBoardSummary,
    'completedCount' | 'totalCount' | 'blockingCertificateType' | 'expectedReadyDate' | 'overdueCount' | 'supplementCount' | 'weeklyActionCount'
  >
  onClickBlockingCertificate?: () => void
  onClickExpectedReadyDate?: () => void
  onClickOverdue?: () => void
}

export function LifecycleSummaryCards({ summary, onClickBlockingCertificate, onClickExpectedReadyDate, onClickOverdue }: LifecycleSummaryCardsProps) {
  const items = [
    {
      label: '四证完成',
      value: summary.completedCount,
      icon: <CheckCircle className="w-5 h-5 text-emerald-600" />,
      bg: 'bg-emerald-50',
      border: 'border-emerald-100',
      textColor: 'text-emerald-700',
      numColor: 'text-emerald-600',
    },
    {
      label: '当前卡点',
      value: summary.blockingCertificateType || '无',
      icon: <Clock className="w-5 h-5 text-blue-600" />,
      bg: 'bg-blue-50',
      border: 'border-blue-100',
      textColor: 'text-blue-700',
      numColor: 'text-blue-600',
      isText: true,
      onClick: onClickBlockingCertificate,
    },
    {
      label: '预计开工条件',
      value: summary.expectedReadyDate || '待补全',
      icon: <MapPin className="w-5 h-5 text-indigo-600" />,
      bg: 'bg-indigo-50',
      border: 'border-indigo-100',
      textColor: 'text-indigo-700',
      numColor: 'text-indigo-600',
      isText: true,
      onClick: onClickExpectedReadyDate,
    },
    {
      label: '逾期事项',
      value: summary.overdueCount,
      icon: <FileText className="w-5 h-5 text-amber-600" />,
      bg: 'bg-amber-50',
      border: 'border-amber-100',
      textColor: 'text-amber-700',
      numColor: 'text-amber-600',
      onClick: onClickOverdue,
    },
    {
      label: '待补正压力',
      value: summary.supplementCount,
      icon: <AlertTriangle className="w-5 h-5 text-red-500" />,
      bg: 'bg-red-50',
      border: 'border-red-100',
      textColor: 'text-red-700',
      numColor: 'text-red-600',
    },
    {
      label: '本周推进',
      value: summary.weeklyActionCount,
      icon: <BarChart3 className="w-5 h-5 text-violet-600" />,
      bg: 'bg-violet-50',
      border: 'border-violet-100',
      textColor: 'text-violet-700',
      numColor: 'text-violet-600',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      {items.map((item) => {
        const Tag = item.onClick ? 'button' : 'div'
        return (
          <Tag
            key={item.label}
            type={item.onClick ? 'button' : undefined}
            onClick={item.onClick}
            className={`${item.bg} border ${item.border} rounded-xl p-4 flex items-center gap-4 shadow-sm${item.onClick ? ' cursor-pointer hover:opacity-80 transition-opacity text-left w-full' : ''}`}
          >
            <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center border ${item.border}`}>
              {item.icon}
            </div>
            <div className="min-w-0">
              <div className={`text-2xl font-bold ${item.numColor} truncate`}>
                {String(item.value)}
              </div>
              <div className={`text-xs font-medium ${item.textColor}`}>{item.label}</div>
            </div>
          </Tag>
        )
      })}
    </div>
  )
}
