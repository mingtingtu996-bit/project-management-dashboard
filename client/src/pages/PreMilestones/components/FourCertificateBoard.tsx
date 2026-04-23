import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, FileBadge2, BadgeAlert } from 'lucide-react'
import { StatusBadge } from '@/components/ui/status-badge'
import type { CertificateBoardItem, CertificateSharedRibbonItem } from '../types'
import {
  CERTIFICATE_ORDER,
  CERTIFICATE_STAGE_SEQUENCE,
  certificateStageBadge,
  getCertificateStatusThemeKey,
  mapCertificateStatusLabel,
} from '../constants'

interface FourCertificateBoardProps {
  certificates: CertificateBoardItem[]
  sharedItems: CertificateSharedRibbonItem[]
  selectedCertificateId?: string | null
  selectedWorkItemId?: string | null
  hoveredWorkItemId?: string | null
  onSelectCertificate: (certificateId: string) => void
  onSelectWorkItem: (workItemId: string) => void
  onOpenCertificateDetail: (certificateId: string) => void
  onHoverCertificate?: (certificateId: string | null) => void
  onClickBlockedTag?: () => void
}

const certificateIcons = {
  land_certificate: FileBadge2,
  land_use_planning_permit: FileBadge2,
  engineering_planning_permit: FileBadge2,
  construction_permit: FileBadge2,
} as const

export function FourCertificateBoard({
  certificates,
  sharedItems,
  selectedCertificateId,
  selectedWorkItemId,
  hoveredWorkItemId,
  onSelectCertificate,
  onSelectWorkItem,
  onOpenCertificateDetail,
  onHoverCertificate,
  onClickBlockedTag,
}: FourCertificateBoardProps) {
  return (
    <div data-testid="pre-milestones-board" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">四证推进看板</h3>
          <p className="text-xs text-slate-500 mt-1">四行固定展示，状态统一用“报审中 / 报批中”口径</p>
        </div>
        <div className="text-xs text-slate-500">点击证件或共享事项可联动高亮</div>
      </div>

      <div className="grid gap-3">
        {CERTIFICATE_ORDER.map((entry, index) => {
          const certificate = certificates.find((item) => item.certificate_type === entry.id)
          const Icon = certificateIcons[entry.id]
          const relatedSharedItems = sharedItems.filter((item) =>
            certificate?.shared_work_item_ids.includes(item.work_item_id) ||
            item.certificate_types.includes(entry.id)
          )
          const active = selectedCertificateId === certificate?.id
          const hasBlockedSharedItem = relatedSharedItems.some((item) => item.block_reason)
          // #2: highlight this card when hovered work item belongs to it
          const hoveredWorkItemBelongsHere = hoveredWorkItemId
            ? relatedSharedItems.some((item) => item.work_item_id === hoveredWorkItemId)
            : false
          // dim this card when another card owns the hovered work item
          const dimmedByHover = Boolean(hoveredWorkItemId && !hoveredWorkItemBelongsHere && !active)

          return (
            <div
              key={entry.id}
              data-testid={certificate ? `pre-milestones-certificate-${certificate.id}` : `pre-milestones-certificate-${entry.id}`}
              role="button"
              tabIndex={0}
              onMouseEnter={() => certificate && onHoverCertificate?.(certificate.id)}
              onMouseLeave={() => onHoverCertificate?.(null)}
              onClick={() => {
                if (certificate) {
                  onSelectCertificate(certificate.id)
                  onOpenCertificateDetail(certificate.id)
                }
              }}
              onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && certificate) {
                  event.preventDefault()
                  onSelectCertificate(certificate.id)
                  onOpenCertificateDetail(certificate.id)
                }
              }}
              style={dimmedByHover ? { opacity: 0.4 } : undefined}
              className={`w-full rounded-2xl border p-4 text-left transition-all ${
                active
                  ? 'border-blue-300 bg-blue-50 shadow-md'
                  : hoveredWorkItemBelongsHere
                    ? 'border-indigo-300 bg-indigo-50 shadow-md'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
              }`}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl ${certificateStageBadge(certificate?.current_stage || '资料准备')}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="truncate text-sm font-semibold text-slate-900">{entry.label}</h4>
                      <StatusBadge status={getCertificateStatusThemeKey(certificate?.status || 'pending')} fallbackLabel={mapCertificateStatusLabel(certificate?.status)} className="px-2 py-0.5 text-[11px]">
                        {mapCertificateStatusLabel(certificate?.status)}
                      </StatusBadge>
                      {certificate?.is_blocked && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onClickBlockedTag?.() }}
                          className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-200"
                          title="点击跳转到台账阻塞项"
                          data-testid="certificate-blocked-tag"
                        >
                          <BadgeAlert className="h-3 w-3" />
                          阻塞
                        </button>
                      )}
                      {hasBlockedSharedItem && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onClickBlockedTag?.() }}
                          className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700 hover:bg-rose-200"
                          title="点击跳转到台账阻塞项"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          共享事项阻塞
                        </button>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      当前阶段：{certificate?.current_stage || '资料准备'} · 审批部门：{certificate?.approving_authority || '待补全'}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      下一动作：{certificate?.next_action || '待补充'}
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <div className="flex min-w-max items-center gap-2 pb-1">
                  {CERTIFICATE_STAGE_SEQUENCE.map((stage, stageIndex) => {
                    const currentIndex = certificate
                      ? CERTIFICATE_STAGE_SEQUENCE.indexOf(certificate.current_stage as typeof CERTIFICATE_STAGE_SEQUENCE[number])
                      : 0
                    const activeStage = currentIndex >= stageIndex
                    return (
                      <span
                        key={stage}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                          activeStage ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {activeStage ? <CheckCircle2 className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
                        {stage}
                      </span>
                    )
                  })}
                  </div>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <div className="grid min-w-[480px] gap-2 sm:min-w-0 lg:grid-cols-4">
                {CERTIFICATE_STAGE_SEQUENCE.map((stage, stageIndex) => {
                  const currentIndex = certificate
                    ? CERTIFICATE_STAGE_SEQUENCE.indexOf(certificate.current_stage as typeof CERTIFICATE_STAGE_SEQUENCE[number])
                    : 0
                  const isCurrent = currentIndex === stageIndex
                  const isDone = currentIndex > stageIndex || certificate?.status === 'issued'
                  return (
                    <div
                      key={stage}
                      className={`rounded-xl border px-3 py-2 text-xs ${
                        isCurrent
                          ? 'border-blue-300 bg-blue-50 text-blue-800'
                          : isDone
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-slate-50 text-slate-500'
                      }`}
                    >
                      <div className="font-medium">{stage}</div>
                      <div className="mt-1">{certificate?.current_stage === stage ? '当前阶段' : certificate?.status === 'issued' ? '已完成' : CERTIFICATE_STAGE_SEQUENCE[currentIndex] ? '前序推进中' : '待启动'}</div>
                    </div>
                  )
                })}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {relatedSharedItems.length > 0 ? (
                  relatedSharedItems.map((item) => {
                    const isActive = selectedWorkItemId === item.work_item_id
                    const isHovered = hoveredWorkItemId === item.work_item_id
                    return (
                      <button
                        key={item.work_item_id}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          onSelectWorkItem(item.work_item_id)
                        }}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          isActive
                            ? 'border-blue-300 bg-blue-100 text-blue-700'
                            : isHovered
                              ? 'border-indigo-300 bg-indigo-100 text-indigo-700'
                              : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {item.item_name}
                      </button>
                    )
                  })
                ) : (
                  <span className="text-xs text-slate-400">暂无共享事项</span>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                <span>审批部门：{certificate?.approving_authority || '待补全'}</span>
                <span className="inline-flex items-center gap-1 text-blue-600">
                  查看详情
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
