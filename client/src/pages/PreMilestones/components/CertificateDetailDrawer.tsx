import type { ReactNode } from 'react'
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { useDialogFocusRestore } from '@/hooks/useDialogFocusRestore'
import { CertificateDependencyMatrix } from './CertificateDependencyMatrix'
import type {
  CertificateDetailResponse,
  CertificateLinkedIssue,
  CertificateLinkedRisk,
  CertificateLinkedWarning,
} from '../types'
import {
  getCertificateStatusThemeKey,
  mapCertificateStatusLabel,
  certificateStageBadge,
} from '../constants'

interface CertificateDetailDrawerProps {
  open: boolean
  detail: CertificateDetailResponse | null
  onClose: () => void
  onSelectCertificate: (certificateId: string) => void
  onSelectWorkItem: (workItemId: string) => void
  onEscalateIssue: (workItemId?: string | null) => void | Promise<void>
  onEscalateRisk: (workItemId?: string | null) => void | Promise<void>
  escalatingIssue?: boolean
  escalatingRisk?: boolean
  selectedCertificateId?: string | null
  selectedWorkItemId?: string | null
  projectId?: string | null
}

const WARNING_LEVEL_LABEL: Record<CertificateLinkedWarning['warning_level'], string> = {
  info: '提示',
  warning: '关注',
  critical: '严重',
}

const RECORD_TYPE_LABEL: Record<string, string> = {
  status_change: '状态变更',
  supplement_required: '补正记录',
  condition_satisfied: '条件满足',
  blocked: '阻塞记录',
  unblocked: '解除阻塞',
  note: '跟进记录',
}

const ISSUE_SEVERITY_LABEL: Record<CertificateLinkedIssue['severity'], string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '严重',
}

const ISSUE_STATUS_LABEL: Record<CertificateLinkedIssue['status'], string> = {
  open: '待处理',
  investigating: '处理中',
  resolved: '已解决',
  closed: '已关闭',
}

const RISK_LEVEL_LABEL: Record<CertificateLinkedRisk['level'], string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '严重',
}

const RISK_STATUS_LABEL: Record<CertificateLinkedRisk['status'], string> = {
  identified: '已识别',
  mitigating: '处理中',
  closed: '已关闭',
}

function joinFooter(parts: Array<string | null | undefined>) {
  return parts.filter((value): value is string => Boolean(value && String(value).trim())).join(' · ')
}

function LinkedCard({
  title,
  description,
  footer,
  badges,
}: {
  title: string
  description?: string | null
  footer?: string | null
  badges?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-slate-900">{title}</div>
          {description ? <div className="mt-1 text-xs leading-5 text-slate-600">{description}</div> : null}
          {footer ? <div className="mt-1 text-xs text-slate-400">{footer}</div> : null}
        </div>
        {badges ? <div className="flex flex-wrap gap-2">{badges}</div> : null}
      </div>
    </div>
  )
}

function LinkedSection({
  title,
  count,
  testId,
  actionHref,
  actionLabel,
  emptyText,
  children,
}: {
  title: string
  count: number
  testId: string
  actionHref?: string | null
  actionLabel?: string
  emptyText: string
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
          <p className="mt-1 text-xs text-slate-500">{emptyText}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{count} 条</span>
          {actionHref ? (
            <Button asChild variant="outline" size="sm">
              <Link to={actionHref}>{actionLabel || '前往风险与问题'}</Link>
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-3 grid gap-2">{children}</div>
    </section>
  )
}

export function CertificateDetailDrawer({
  open,
  detail,
  onClose,
  onSelectCertificate,
  onSelectWorkItem,
  onEscalateIssue,
  onEscalateRisk,
  escalatingIssue = false,
  escalatingRisk = false,
  selectedCertificateId,
  selectedWorkItemId,
  projectId,
}: CertificateDetailDrawerProps) {
  useDialogFocusRestore(open)
  const workItemsSectionRef = useRef<HTMLDivElement>(null)
  const riskHubHref = projectId ? `/projects/${projectId}/risks` : null
  const linkedWarnings = detail?.linkedWarnings || []
  const linkedIssues = detail?.linkedIssues || []
  const linkedRisks = detail?.linkedRisks || []
  const selectedWorkItem = detail?.workItems.find((item) => item.id === selectedWorkItemId) || null
  const escalationTargetLabel = selectedWorkItem?.item_name || detail?.certificate.certificate_name || '当前证照'
  const escalationTargetHint = selectedWorkItem
    ? '当前会把选中的办理事项软链接到问题 / 风险主链。'
    : '当前会把证照卡点软链接到问题 / 风险主链。'

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <div
        role="dialog"
        aria-modal="true"
        data-testid="certificate-detail-drawer"
        className={`fixed inset-y-0 right-0 z-50 flex w-[52rem] max-w-full flex-col bg-white shadow-2xl transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">证照详情</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              查看证照当前阶段、共享事项、依赖关系，以及关联的预警、风险和问题。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
        {!detail ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-sm text-slate-500">
            暂无详情数据。
          </div>
        ) : (
          <div className="grid gap-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{detail.certificate.certificate_name}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge status={getCertificateStatusThemeKey(detail.certificate.status)} fallbackLabel={mapCertificateStatusLabel(detail.certificate.status)} className="px-2 py-1 text-xs">
                      {mapCertificateStatusLabel(detail.certificate.status)}
                    </StatusBadge>
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${certificateStageBadge(detail.certificate.current_stage)}`}>
                      {detail.certificate.current_stage}
                    </span>
                  </div>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <div>审批部门：{detail.certificate.approving_authority || '待补充'}</div>
                  <div className="mt-1">更新时间：{detail.certificate.latest_record_at || '待补充'}</div>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-sm text-slate-600">
                <div className="rounded-xl bg-slate-50 p-3">计划完成：{detail.certificate.planned_finish_date || '待补充'}</div>
                <div className="rounded-xl bg-slate-50 p-3">实际完成：{detail.certificate.actual_finish_date || '待补充'}</div>
                <div className="rounded-xl bg-slate-50 p-3">下一动作：{detail.certificate.next_action || '待补充'}</div>
                <div className="rounded-xl bg-slate-50 p-3">阻塞原因：{detail.certificate.block_reason || '无'}</div>
                {detail.certificate.document_no && (
                  <div className="rounded-xl bg-slate-50 p-3">证件文号：{detail.certificate.document_no}</div>
                )}
                {detail.certificate.issuing_authority && (
                  <div className="rounded-xl bg-slate-50 p-3">发证机关：{detail.certificate.issuing_authority}</div>
                )}
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
              <div className="grid gap-4">
                <div ref={workItemsSectionRef} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">共享事项与依赖</h4>
                      <p className="mt-1 text-xs text-slate-500">展示当前证件受到哪些事项影响，以及这些事项还会影响哪些证件。</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => workItemsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>查看共享事项</Button>
                      <Button variant="outline" size="sm" onClick={onClose}>关闭</Button>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    {detail.workItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectWorkItem(item.id)}
                        className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                          selectedWorkItemId === item.id ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-900">{item.item_name}</span>
                          <span className="text-xs text-slate-500">{item.item_stage}</span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {item.next_action || '待补充下一动作'} · {item.is_shared ? '共享事项' : '单证事项'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <CertificateDependencyMatrix
                  rows={detail.dependencyMatrix}
                  selectedCertificateId={selectedCertificateId}
                  selectedWorkItemId={selectedWorkItemId}
                  onSelectCertificate={onSelectCertificate}
                  onSelectWorkItem={onSelectWorkItem}
                />
              </div>

              <div className="grid gap-4">
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">升级处置</h4>
                      <p className="mt-1 text-xs text-slate-500">
                        当前对象：{escalationTargetLabel}。{escalationTargetHint}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={escalatingIssue}
                        onClick={() => void onEscalateIssue(selectedWorkItem?.id || null)}
                      >
                        {escalatingIssue ? '升级中...' : '升级为问题'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={escalatingRisk}
                        onClick={() => void onEscalateRisk(selectedWorkItem?.id || null)}
                      >
                        {escalatingRisk ? '升级中...' : '升级为风险'}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                    只复用共享 `issues / risks` 主链，通过 `source_entity` 做软链接，不在前期证照域内新增平行状态链。
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h4 className="text-sm font-semibold text-slate-900">状态记录</h4>
                  <div className="mt-3 grid gap-2">
                    {detail.records.map((record) => (
                      <div key={record.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-900">
                            {RECORD_TYPE_LABEL[record.record_type] ?? record.record_type}
                          </span>
                          <span className="text-xs text-slate-500">{record.recorded_at}</span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {record.from_status || '起点'} → {record.to_status || '未变更'}
                        </div>
                        {record.content ? <div className="mt-1 text-xs text-slate-600">{record.content}</div> : null}
                      </div>
                    ))}
                    {detail.records.length === 0 && (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                        暂无状态记录。
                      </div>
                    )}
                  </div>
                </section>

                <LinkedSection
                  title="联动预警"
                  count={linkedWarnings.length}
                  testId="linked-warnings"
                  actionHref={riskHubHref}
                  actionLabel="前往风险与问题"
                  emptyText="仅展示当前证照命中的预警，不进入共享底座真值层。"
                >
                  {linkedWarnings.length > 0 ? (
                    linkedWarnings.map((item) => (
                      <LinkedCard
                        key={item.id}
                        title={item.title}
                        description={item.description}
                        footer={joinFooter([
                          `任务 ${item.task_id || '未关联'}`,
                          item.is_acknowledged ? '已确认' : '未确认',
                        ])}
                        badges={<StatusBadge status={item.warning_level} className="px-2 py-0.5 text-[11px]">{WARNING_LEVEL_LABEL[item.warning_level]}</StatusBadge>}
                      />
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">暂无联动预警。</div>
                  )}
                </LinkedSection>

                <LinkedSection
                  title="联动问题"
                  count={linkedIssues.length}
                  testId="linked-issues"
                  actionHref={riskHubHref}
                  actionLabel="前往风险与问题"
                  emptyText="仅展示当前证照命中的问题，不进入共享底座真值层。"
                >
                  {linkedIssues.length > 0 ? (
                    linkedIssues.map((item) => (
                      <LinkedCard
                        key={item.id}
                        title={item.title}
                        description={item.description}
                        footer={joinFooter([
                          item.task_id ? `任务 ${item.task_id}` : '未关联任务',
                          item.chain_id ? `链路 ${item.chain_id}` : null,
                          item.source_id ? `来源 ${item.source_id}` : null,
                        ])}
                        badges={
                          <>
                            <StatusBadge status={item.severity} className="px-2 py-0.5 text-[11px]">
                              {ISSUE_SEVERITY_LABEL[item.severity]}
                            </StatusBadge>
                            <StatusBadge status={item.status} className="px-2 py-0.5 text-[11px]">
                              {ISSUE_STATUS_LABEL[item.status]}
                            </StatusBadge>
                          </>
                        }
                      />
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">暂无联动问题。</div>
                  )}
                </LinkedSection>

                <LinkedSection
                  title="联动风险"
                  count={linkedRisks.length}
                  testId="linked-risks"
                  actionHref={riskHubHref}
                  actionLabel="前往风险与问题"
                  emptyText="仅展示当前证照命中的风险，不进入共享底座真值层。"
                >
                  {linkedRisks.length > 0 ? (
                    linkedRisks.map((item) => (
                      <LinkedCard
                        key={item.id}
                        title={item.title}
                        description={item.description}
                        footer={joinFooter([
                          item.task_id ? `任务 ${item.task_id}` : '未关联任务',
                          item.linked_issue_id ? `联动问题 ${item.linked_issue_id}` : null,
                          item.chain_id ? `链路 ${item.chain_id}` : null,
                        ])}
                        badges={
                          <>
                            <StatusBadge status={item.level} className="px-2 py-0.5 text-[11px]">
                              {RISK_LEVEL_LABEL[item.level]}
                            </StatusBadge>
                            <StatusBadge
                              status={item.status === 'closed' ? 'closed' : item.status === 'mitigating' ? 'in_progress' : 'open'}
                              fallbackLabel={RISK_STATUS_LABEL[item.status]}
                              className="px-2 py-0.5 text-[11px]"
                            >
                              {RISK_STATUS_LABEL[item.status]}
                            </StatusBadge>
                          </>
                        }
                      />
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">暂无联动风险。</div>
                  )}
                </LinkedSection>
              </div>
            </section>
          </div>
        )}
        </div>
      </div>
    </>
  )
}
