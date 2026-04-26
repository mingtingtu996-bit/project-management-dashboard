import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Edit3, Eye, Plus, AlertTriangle, Search } from 'lucide-react'
import { StatusBadge } from '@/components/ui/status-badge'
import type { CertificateBoardItem, CertificateSharedRibbonItem, CertificateWorkItem } from '../types'
import {
  CERTIFICATE_ORDER,
  certificateStageBadge,
  createEmptyWorkItemForm,
  getCertificateStatusThemeKey,
  mapCertificateStatusLabel,
} from '../constants'

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
  return (
    <div data-testid="pre-milestones-ledger" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">办理台账</h3>
          <p className="mt-1 text-xs text-slate-500">
            {canEdit ? '台账是主编辑入口，支持新增、编辑与进入详情抽屉。' : '当前为只读模式，仅支持查看详情。'}
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => onAddItem(createEmptyWorkItemForm())}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            新增办理事项
          </button>
        ) : null}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {(['all', 'blocked', 'overdue', 'supplement'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setQuickFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${quickFilter === f ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'}`}
          >
            {f === 'all' ? '全部' : f === 'blocked' ? '仅看阻塞' : f === 'overdue' ? '仅看逾期' : '仅看待补正'}
          </button>
        ))}
      </div>

      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索事项名称、证书名称..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:outline-none"
            data-testid="certificate-ledger-search"
          />
        </div>
        {stages.length > 0 && (
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none"
            data-testid="certificate-ledger-stage-filter"
          >
            <option value="all">全部阶段</option>
            {stages.map((stage) => (
              <option key={stage} value={stage}>{stage}</option>
            ))}
          </select>
        )}
        {certificateTypes.length > 0 && (
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none"
            data-testid="certificate-ledger-type-filter"
          >
            <option value="all">全部证件类型</option>
            {[...new Map(certificateTypes.map((c) => [c.type, c])).values()].map((c) => (
              <option key={c.type} value={c.type}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
          当前没有办理事项，先新增一条共享或单证事项。
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
          没有符合搜索条件的办理事项。
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2">
            <caption className="sr-only">前期证照办理台账</caption>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-3 py-2 font-medium">办理事项</th>
                <th scope="col" className="px-3 py-2 font-medium">所属证件</th>
                <th scope="col" className="px-3 py-2 font-medium">当前阶段</th>
                <th scope="col" className="px-3 py-2 font-medium">当前状态</th>
                <th scope="col" className="px-3 py-2 font-medium">计划完成日期</th>
                <th scope="col" className="px-3 py-2 font-medium">实际完成日期</th>
                <th scope="col" className="px-3 py-2 font-medium">审批部门</th>
                <th scope="col" className="px-3 py-2 font-medium">是否补正</th>
                <th scope="col" className="px-3 py-2 font-medium">是否阻塞</th>
                <th scope="col" className="px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const isActive = selectedWorkItemId === item.id
                const certificateNames = resolveCertificateNames(item, certificates, sharedItems)
                const shared = (item.certificate_ids ?? []).length > 1 || sharedItems.some((entry) => entry.work_item_id === item.id)
                const linkedIssueId = item.linked_issue_id?.trim() || null
                const linkedRiskId = item.linked_risk_id?.trim() || null

                return (
                  <tr
                    key={item.id}
                    data-testid={`pre-milestones-ledger-row-${item.id}`}
                    className={`rounded-2xl border shadow-sm transition-colors ${
                      isActive ? 'border-blue-300 bg-blue-50/70' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <td className="px-3 py-4">
                      <button
                        type="button"
                        onClick={() => onSelectWorkItem(item.id)}
                        className="text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">{item.item_name}</span>
                          {shared && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">共享</span>
                          )}
                          {item.is_blocked && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                              <AlertTriangle className="h-3 w-3" />
                              阻塞
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{item.next_action || '待补充下一动作'}</div>
                      </button>
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {certificateNames.map((name) => (
                          <span key={name} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                            {name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-medium ${certificateStageBadge(item.item_stage)}`}>
                        {item.item_stage}
                      </span>
                    </td>
                    <td className="px-3 py-4">
                      <div className="space-y-2">
                        <StatusBadge status={getCertificateStatusThemeKey(item.status)} fallbackLabel={mapCertificateStatusLabel(item.status)} className="text-[11px]">
                          {mapCertificateStatusLabel(item.status)}
                        </StatusBadge>
                        <div className="flex flex-wrap gap-1.5 text-[11px]">
                          {linkedIssueId ? (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">已关联问题</span>
                          ) : null}
                          {linkedRiskId ? (
                            <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">已关联风险</span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 text-sm text-slate-600">{item.planned_finish_date || '待补充'}</td>
                    <td className="px-3 py-4 text-sm text-slate-600">{item.actual_finish_date || '—'}</td>
                    <td className="px-3 py-4 text-sm text-slate-600">{item.approving_authority || '待补充'}</td>
                    <td className="px-3 py-4 text-sm text-slate-600">{item.status === 'supplement_required' ? '是' : '否'}</td>
                    <td className="px-3 py-4 text-sm text-slate-600">{item.is_blocked ? '是' : '否'}</td>
                    <td className="px-3 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {certificateNames.length > 0 && certificateNames[0] !== '待关联证件' && (
                          <button
                            type="button"
                            onClick={() => {
                              const certificate = certificates.find((entry) => entry.certificate_name === certificateNames[0])
                              if (certificate) onOpenDetail(certificate.id, item.id)
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            查看详情
                          </button>
                        )}
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => onEditItem(item)}
                            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            编辑
                          </button>
                        ) : null}
                        {linkedIssueId ? (
                          <button
                            type="button"
                            onClick={() => navigate(`/projects/${item.project_id}/risks?stream=issues&issueId=${encodeURIComponent(linkedIssueId)}`)}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            查看关联问题
                          </button>
                        ) : canEdit && onEscalateIssue ? (
                          <button
                            type="button"
                            onClick={() => onEscalateIssue(item.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            升级为问题
                          </button>
                        ) : null}
                        {linkedRiskId ? (
                          <button
                            type="button"
                            onClick={() => navigate(`/projects/${item.project_id}/risks?stream=risks&riskId=${encodeURIComponent(linkedRiskId)}`)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            查看关联风险
                          </button>
                        ) : canEdit && onEscalateRisk ? (
                          <button
                            type="button"
                            onClick={() => onEscalateRisk(item.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            升级为风险
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
