import { Fragment, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Edit3, Eye, Plus, AlertTriangle, Search } from 'lucide-react'
import type { CertificateBoardItem, CertificateSharedRibbonItem, CertificateWorkItem } from '../types'
import {
  CERTIFICATE_STAGE_SEQUENCE,
  certificateStageBadge,
  createEmptyWorkItemForm,
  mapCertificateStatusLabel,
} from '../constants'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'

interface CertificateLedgerProps {
  items: CertificateWorkItem[]
  certificates: CertificateBoardItem[]
  sharedItems: CertificateSharedRibbonItem[]
  selectedWorkItemId?: string | null
  filterByWorkItemId?: string | null
  quickFilter?: 'all' | 'blocked' | 'overdue' | 'supplement'
  onQuickFilterChange?: (value: 'all' | 'blocked' | 'overdue' | 'supplement') => void
  typeFilter?: string
  onTypeFilterChange?: (value: string) => void
  onSelectWorkItem: (workItemId: string) => void
  onOpenDetail: (certificateId: string, workItemId?: string) => void
  onAddItem: (prefill?: ReturnType<typeof createEmptyWorkItemForm>) => void
  onEditItem: (item: CertificateWorkItem) => void
  canEdit?: boolean
  onEscalateIssue?: (workItemId: string) => void
  onEscalateRisk?: (workItemId: string) => void
}

function resolveCertificateNames(
  item: CertificateWorkItem,
  certificates: CertificateBoardItem[],
  sharedItems: CertificateSharedRibbonItem[]
) {
  const certificateIds = item.certificate_ids ?? []
  if (certificateIds.length > 0) {
    return certificates.filter((certificate) => certificateIds.includes(certificate.id)).map((certificate) => certificate.certificate_name)
  }

  const shared = sharedItems.find((entry) => entry.work_item_id === item.id)
  if (shared) return shared.certificate_names

  return ['待关联证件']
}

function getLedgerStatusTone(status?: string | null) {
  const normalized = String(status ?? 'pending')
  if (['issued', 'approved', 'completed'].includes(normalized)) return { dot: 'bg-emerald-500', text: 'text-emerald-700' }
  if (['preparing_documents', 'internal_review', 'external_submission', 'in_progress', 'submitted'].includes(normalized)) return { dot: 'bg-blue-600', text: 'text-blue-700' }
  if (['supplement_required', 'blocked', 'expired'].includes(normalized)) return { dot: 'bg-amber-500', text: 'text-amber-700' }
  if (['voided', 'cancelled'].includes(normalized)) return { dot: 'bg-slate-400', text: 'text-slate-600' }
  return { dot: 'bg-slate-300', text: 'text-slate-600' }
}

const CERTIFICATE_LEDGER_COLUMN_WIDTHS = {
  item: 260,
  certificates: 220,
  stage: 140,
  status: 150,
  plannedDate: 132,
  actualDate: 132,
  authority: 180,
  supplement: 96,
  blocked: 96,
  actions: 320,
} as const

const CERTIFICATE_LEDGER_MIN_WIDTH = Object.values(CERTIFICATE_LEDGER_COLUMN_WIDTHS).reduce((sum, width) => sum + width, 0)

export function CertificateLedger({
  items,
  certificates,
  sharedItems,
  selectedWorkItemId,
  filterByWorkItemId,
  quickFilter: controlledQuickFilter,
  onQuickFilterChange,
  typeFilter: controlledTypeFilter,
  onTypeFilterChange,
  onSelectWorkItem,
  onOpenDetail,
  onAddItem,
  onEditItem,
  canEdit = true,
  onEscalateIssue,
  onEscalateRisk,
}: CertificateLedgerProps) {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [internalTypeFilter, setInternalTypeFilter] = useState<string>('all')
  const [internalQuickFilter, setInternalQuickFilter] = useState<'all' | 'blocked' | 'overdue' | 'supplement'>('all')
  const typeFilter = controlledTypeFilter ?? internalTypeFilter
  const setTypeFilter = (v: string) => { onTypeFilterChange ? onTypeFilterChange(v) : setInternalTypeFilter(v) }
  const quickFilter = controlledQuickFilter ?? internalQuickFilter
  const setQuickFilter = (v: 'all' | 'blocked' | 'overdue' | 'supplement') => { onQuickFilterChange ? onQuickFilterChange(v) : setInternalQuickFilter(v) }
  const stages = useMemo(() => {
    const all = new Set(items.map((item) => item.item_stage).filter(Boolean))
    return Array.from(all)
  }, [items])
  const certificateTypes = useMemo(() => {
    return certificates.filter((c) => c.certificate_type).map((c) => ({ id: c.id, type: c.certificate_type, name: c.certificate_name }))
  }, [certificates])
  const filteredItems = useMemo(() => {
    let result = items
    if (filterByWorkItemId) {
      result = result.filter((item) => item.id === filterByWorkItemId)
    }
    if (stageFilter !== 'all') {
      result = result.filter((item) => item.item_stage === stageFilter)
    }
    if (typeFilter !== 'all') {
      const certIdsForType = certificates.filter((c) => c.certificate_type === typeFilter).map((c) => c.id)
      result = result.filter((item) => (item.certificate_ids ?? []).some((id) => certIdsForType.includes(id)))
    }
    if (quickFilter === 'blocked') result = result.filter((item) => item.is_blocked || item.status === 'blocked')
    else if (quickFilter === 'overdue') result = result.filter((item) => item.planned_finish_date && new Date(item.planned_finish_date) < new Date() && !['completed', 'cancelled'].includes(String(item.status)))
    else if (quickFilter === 'supplement') result = result.filter((item) => item.status === 'supplement_required')
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((item) =>
        item.item_name?.toLowerCase().includes(q) ||
        item.notes?.toLowerCase().includes(q) ||
        resolveCertificateNames(item, certificates, sharedItems).some((name) => name.toLowerCase().includes(q))
      )
    }
    return result
  }, [items, searchQuery, stageFilter, typeFilter, quickFilter, filterByWorkItemId, certificates, sharedItems])
  const groupedItems = useMemo(() => {
    const stageMap = new Map<string, CertificateWorkItem[]>()
    filteredItems.forEach((item) => {
      const stage = item.item_stage || '未分组'
      stageMap.set(stage, [...(stageMap.get(stage) ?? []), item])
    })

    const orderedStages = [
      ...CERTIFICATE_STAGE_SEQUENCE,
      ...Array.from(stageMap.keys()).filter((stage) => !CERTIFICATE_STAGE_SEQUENCE.includes(stage as typeof CERTIFICATE_STAGE_SEQUENCE[number])).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    ]

    return orderedStages
      .map((stage) => ({ stage, items: stageMap.get(stage) ?? [] }))
      .filter((group) => group.items.length > 0)
  }, [filteredItems])

  return (
    <div data-testid="pre-milestones-ledger" className="rounded-xl border border-slate-100 bg-white p-4 shadow-[var(--el-1)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">办理台账</h3>
          <p className="mt-1 text-xs text-slate-500">
            {canEdit ? '台账是主编辑入口，支持新增、编辑与进入详情抽屉。' : '当前为只读模式，仅支持查看详情。'}
          </p>
        </div>
        {canEdit ? (
          <Button variant="ghost"
            type="button"
            onClick={() => onAddItem(createEmptyWorkItemForm())}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            新增办理事项
          </Button>
        ) : null}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {(['all', 'blocked', 'overdue', 'supplement'] as const).map((f) => (
          <Button variant="ghost"
            key={f}
            type="button"
            onClick={() => setQuickFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${quickFilter === f ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'}`}
          >
            {f === 'all' ? '全部' : f === 'blocked' ? '仅看阻塞' : f === 'overdue' ? '仅看逾期' : '仅看待补正'}
          </Button>
        ))}
      </div>

      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            aria-label="搜索证照事项"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索事项名称、证书名称..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm text-slate-900 placeholder-slate-400 focus-visible:border-blue-400 focus-visible:outline-none"
            data-testid="certificate-ledger-search"
          />
        </div>
        {stages.length > 0 && (
          <Select
            value={stageFilter}
            onValueChange={setStageFilter}
          >
            <SelectTrigger
              aria-label="证照阶段筛选"
              className="h-10 min-w-32 rounded-xl border-slate-200 bg-slate-50 text-sm text-slate-900"
              data-testid="certificate-ledger-stage-filter"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部阶段</SelectItem>
              {stages.map((stage) => (
                <SelectItem key={stage} value={stage}>{stage}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {certificateTypes.length > 0 && (
          <Select
            value={typeFilter}
            onValueChange={setTypeFilter}
          >
            <SelectTrigger
              aria-label="证件类型筛选"
              className="h-10 min-w-40 rounded-xl border-slate-200 bg-slate-50 text-sm text-slate-900"
              data-testid="certificate-ledger-type-filter"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部证件类型</SelectItem>
              {[...new Map(certificateTypes.map((c) => [c.type, c])).values()].map((c) => (
                <SelectItem key={c.type} value={c.type}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="暂无办理事项"
          description="先新增一条共享或单证事项，台账会在这里形成可追踪清单。"
          className="rounded-xl empty-state-frame border-slate-200 bg-slate-50 py-10"
        />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          variant="filter"
          title="没有符合条件的办理事项"
          description="调整搜索词、阶段或快捷筛选后再查看。"
          className="rounded-xl empty-state-frame border-slate-200 bg-slate-50 py-10"
        />
      ) : (
        <div className="overflow-x-auto">
          <Table className="w-full table-fixed border-collapse" style={{ minWidth: CERTIFICATE_LEDGER_MIN_WIDTH }}>
            <TableCaption className="sr-only">前期证照办理台账</TableCaption>
            <TableHeader className="sticky top-0 z-10 bg-white text-left text-xs uppercase tracking-wide text-slate-500">
              <TableRow className="py-3">
                <TableHead scope="col" className="px-3 py-2 font-medium" style={{ width: CERTIFICATE_LEDGER_COLUMN_WIDTHS.item }}>办理事项</TableHead>
                <TableHead scope="col" className="px-3 py-2 font-medium" style={{ width: CERTIFICATE_LEDGER_COLUMN_WIDTHS.certificates }}>所属证件</TableHead>
                <TableHead scope="col" className="px-3 py-2 font-medium" style={{ width: CERTIFICATE_LEDGER_COLUMN_WIDTHS.stage }}>当前阶段</TableHead>
                <TableHead scope="col" className="px-3 py-2 font-medium" style={{ width: CERTIFICATE_LEDGER_COLUMN_WIDTHS.status }}>当前状态</TableHead>
                <TableHead scope="col" className="px-3 py-2 text-right font-medium tabular-nums" style={{ width: CERTIFICATE_LEDGER_COLUMN_WIDTHS.plannedDate }}>计划完成</TableHead>
                <TableHead scope="col" className="px-3 py-2 text-right font-medium tabular-nums" style={{ width: CERTIFICATE_LEDGER_COLUMN_WIDTHS.actualDate }}>实际完成</TableHead>
                <TableHead scope="col" className="px-3 py-2 font-medium" style={{ width: CERTIFICATE_LEDGER_COLUMN_WIDTHS.authority }}>审批部门</TableHead>
                <TableHead scope="col" className="px-3 py-2 text-center font-medium" style={{ width: CERTIFICATE_LEDGER_COLUMN_WIDTHS.supplement }}>补正</TableHead>
                <TableHead scope="col" className="px-3 py-2 text-center font-medium" style={{ width: CERTIFICATE_LEDGER_COLUMN_WIDTHS.blocked }}>阻塞</TableHead>
                <TableHead scope="col" className="px-3 py-2 font-medium" style={{ width: CERTIFICATE_LEDGER_COLUMN_WIDTHS.actions }}>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupedItems.map((group) => (
                <Fragment key={group.stage}>
                  <TableRow className="bg-slate-100/80">
                    <TableCell colSpan={10} className="px-3 py-2 text-xs font-semibold text-slate-700">
                      {group.stage} <span className="ml-2 font-normal tabular-nums text-slate-500">{group.items.length} 项</span>
                    </TableCell>
                  </TableRow>
                  {group.items.map((item, index) => {
                    const isActive = selectedWorkItemId === item.id
                    const certificateNames = resolveCertificateNames(item, certificates, sharedItems)
                    const shared = (item.certificate_ids ?? []).length > 1 || sharedItems.some((entry) => entry.work_item_id === item.id)
                    const linkedIssueId = item.linked_issue_id?.trim() || null
                    const linkedRiskId = item.linked_risk_id?.trim() || null
                    const statusTone = getLedgerStatusTone(item.status)

                    return (
                      <TableRow
                        key={item.id}
                        data-testid={`pre-milestones-ledger-row-${item.id}`}
                        className={cn(
                          'group py-3 transition-colors hover:bg-slate-100/60',
                          index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50',
                          isActive && 'bg-blue-50/70 hover:bg-blue-50',
                        )}
                      >
                    <TableCell className="max-w-0 px-3 py-4" style={{ width: CERTIFICATE_LEDGER_COLUMN_WIDTHS.item }}>
                      <Button variant="ghost"
                        type="button"
                        onClick={() => onSelectWorkItem(item.id)}
                        className="h-auto w-full min-w-0 justify-start px-0 py-0 text-left hover:bg-transparent"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium text-slate-900" title={item.item_name}>{item.item_name}</span>
                          {shared && (
                            <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">共享</span>
                          )}
                          {item.is_blocked && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              阻塞
                            </span>
                          )}
                          </div>
                          <div className="truncate text-xs text-slate-500" title={item.next_action || '待补充下一动作'}>{item.next_action || '待补充下一动作'}</div>
                        </div>
                      </Button>
                    </TableCell>
                    <TableCell className="px-3 py-4" style={{ width: CERTIFICATE_LEDGER_COLUMN_WIDTHS.certificates }}>
                      <div className="flex flex-wrap gap-1.5">
                        {certificateNames.map((name) => (
                          <span key={name} className="max-w-full truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600" title={name}>
                            {name}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-4" style={{ width: CERTIFICATE_LEDGER_COLUMN_WIDTHS.stage }}>
                      <span className={`inline-flex max-w-full truncate rounded-full px-2 py-1 text-xs font-medium ${certificateStageBadge(item.item_stage)}`} title={item.item_stage}>
                        {item.item_stage}
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-4" style={{ width: CERTIFICATE_LEDGER_COLUMN_WIDTHS.status }}>
                      <div className="space-y-2">
                        <span className={cn('inline-flex items-center gap-2 text-xs font-medium', statusTone.text)}>
                          <span className={cn('h-2 w-2 rounded-full', statusTone.dot)} />
                          {mapCertificateStatusLabel(item.status)}
                        </span>
                        <div className="flex flex-wrap gap-1.5 text-xs">
                          {linkedIssueId ? (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">已关联问题</span>
                          ) : null}
                          {linkedRiskId ? (
                            <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">已关联风险</span>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-4 text-right text-sm tabular-nums text-slate-600" style={{ width: CERTIFICATE_LEDGER_COLUMN_WIDTHS.plannedDate }}>{item.planned_finish_date || '待补充'}</TableCell>
                    <TableCell className="px-3 py-4 text-right text-sm tabular-nums text-slate-600" style={{ width: CERTIFICATE_LEDGER_COLUMN_WIDTHS.actualDate }}>{item.actual_finish_date || '—'}</TableCell>
                    <TableCell className="truncate px-3 py-4 text-sm text-slate-600" style={{ width: CERTIFICATE_LEDGER_COLUMN_WIDTHS.authority }} title={item.approving_authority || '待补充'}>{item.approving_authority || '待补充'}</TableCell>
                    <TableCell className="px-3 py-4 text-center text-sm text-slate-600" style={{ width: CERTIFICATE_LEDGER_COLUMN_WIDTHS.supplement }}>{item.status === 'supplement_required' ? '是' : '否'}</TableCell>
                    <TableCell className="px-3 py-4 text-center text-sm text-slate-600" style={{ width: CERTIFICATE_LEDGER_COLUMN_WIDTHS.blocked }}>{item.is_blocked ? '是' : '否'}</TableCell>
                    <TableCell className="px-3 py-4" style={{ width: CERTIFICATE_LEDGER_COLUMN_WIDTHS.actions }}>
                      <div className={cn('flex flex-wrap items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100', isActive && 'opacity-100')}>
                        {certificateNames.length > 0 && certificateNames[0] !== '待关联证件' && (
                          <Button variant="ghost"
                            type="button"
                            onClick={() => {
                              const certificate = certificates.find((entry) => entry.certificate_name === certificateNames[0])
                              if (certificate) onOpenDetail(certificate.id, item.id)
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            查看详情
                          </Button>
                        )}
                        {canEdit ? (
                          <Button variant="ghost"
                            type="button"
                            onClick={() => onEditItem(item)}
                            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            编辑
                          </Button>
                        ) : null}
                        {linkedIssueId ? (
                          <Button variant="ghost"
                            type="button"
                            onClick={() => navigate(`/projects/${item.project_id}/risks?stream=issues&issueId=${encodeURIComponent(linkedIssueId)}`)}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            查看关联问题
                          </Button>
                        ) : canEdit && onEscalateIssue ? (
                          <Button variant="ghost"
                            type="button"
                            onClick={() => onEscalateIssue(item.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            升级为问题
                          </Button>
                        ) : null}
                        {linkedRiskId ? (
                          <Button variant="ghost"
                            type="button"
                            onClick={() => navigate(`/projects/${item.project_id}/risks?stream=risks&riskId=${encodeURIComponent(linkedRiskId)}`)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            查看关联风险
                          </Button>
                        ) : canEdit && onEscalateRisk ? (
                          <Button variant="ghost"
                            type="button"
                            onClick={() => onEscalateRisk(item.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            升级为风险
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                      </TableRow>
                    )
                  })}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
