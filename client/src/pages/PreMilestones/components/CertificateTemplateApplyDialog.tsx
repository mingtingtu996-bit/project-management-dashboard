import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileBadge2,
  FileStack,
  GitBranch,
  ListChecks,
  MapPinned,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

import { CERTIFICATE_STAGE_SEQUENCE, getCertificateTypeLabel, mapCertificateStatusLabel } from '../constants'
import type {
  CertificateTemplateMaterialPackage,
  CertificateTemplatePreview,
  CertificateTemplatePreviewAction,
  CertificateTemplatePreviewDependency,
  CertificateTemplatePreviewWorkItem,
  LandAcquisitionMethodCode,
} from '../types'

interface CertificateTemplateApplyDialogProps {
  open: boolean
  preview: CertificateTemplatePreview | null
  loading?: boolean
  error?: string | null
  canEdit?: boolean
  selectedCertificateKeys: string[]
  selectedWorkItemCodes: string[]
  selectedDependencyCodes: string[]
  selectedLandAcquisitionMethodCode?: LandAcquisitionMethodCode | null
  applying: boolean
  onOpenChange: (open: boolean) => void
  onChangeLandAcquisitionMethod?: (code: LandAcquisitionMethodCode) => void
  onToggleCertificate?: (key: string, checked: boolean) => void
  onToggleWorkItem?: (code: string, checked: boolean) => void
  onToggleDependency?: (code: string, checked: boolean) => void
  onRetry?: () => void
  onConfirm: () => void
}

function actionLabel(action: CertificateTemplatePreviewAction) {
  if (action === 'will_skip_existing') return '已存在，不覆盖'
  if (action === 'needs_confirmation') return '暂不生成'
  return '将生成'
}

function actionBadgeVariant(action: CertificateTemplatePreviewAction) {
  if (action === 'will_skip_existing') return 'secondary' as const
  if (action === 'needs_confirmation') return 'destructive' as const
  return 'default' as const
}

function groupWorkItemsByStage(workItems: CertificateTemplatePreviewWorkItem[]) {
  return CERTIFICATE_STAGE_SEQUENCE.map((stage) => ({
    stage,
    items: workItems.filter((item) => item.itemStage === stage),
  })).filter((group) => group.items.length > 0)
}

function describeMainlineEndpoint(
  endpoint: CertificateTemplatePreviewDependency['predecessor'],
  preview: CertificateTemplatePreview,
) {
  if (endpoint.type === 'certificate') return getCertificateTypeLabel(endpoint.certificateType)
  const workItem = preview.workItems.find((item) => item.workItemCode === endpoint.workItemCode)
  const certificateLabels = workItem?.certificateTypes.map(getCertificateTypeLabel) ?? []
  if (certificateLabels.length === 1) return `${certificateLabels[0]}主干事项`
  if (certificateLabels.length > 1) return '多证共享主干事项'
  return '主干办理事项'
}

function dependencyKindSummaryLabel(kind: CertificateTemplatePreviewDependency['dependencyKind']) {
  return kind === 'hard' ? '硬前置，已纳入正式页面校验' : '配套依赖，已纳入正式页面校验'
}

function packageSourceLabel(source: CertificateTemplateMaterialPackage['source']) {
  if (source === 'city_override') return '城市增强'
  if (source === 'province_profile') return '地区补充'
  if (source === 'land_acquisition_method') return '取得方式'
  return '系统模板'
}

function summarizePackageSources(materialPackages: CertificateTemplateMaterialPackage[]) {
  return (['seed', 'land_acquisition_method', 'province_profile', 'city_override'] as const)
    .map((source) => ({
      source,
      count: materialPackages.filter((materialPackage) => materialPackage.source === source).length,
    }))
    .filter((item) => item.count > 0)
}

function provinceSourceLabel(source?: 'project_static_profile' | 'project_metadata' | 'project_location' | 'default') {
  if (source === 'project_static_profile') return '项目画像识别'
  if (source === 'project_metadata') return '项目资料指定'
  if (source === 'project_location') return '项目地址识别'
  return '全国通用默认'
}

function policyUpdateLabel(updateMode?: 'governed_seed_update') {
  if (updateMode === 'governed_seed_update') return '治理发布'
  return '系统模板'
}

export function CertificateTemplateApplyDialog({
  open,
  preview,
  loading = false,
  error = null,
  selectedCertificateKeys,
  selectedWorkItemCodes,
  selectedDependencyCodes,
  selectedLandAcquisitionMethodCode,
  applying,
  onOpenChange,
  onChangeLandAcquisitionMethod,
  onRetry,
  onConfirm,
}: CertificateTemplateApplyDialogProps) {
  const selectedCount =
    selectedCertificateKeys.length + selectedWorkItemCodes.length + selectedDependencyCodes.length
  const currentMethodCode = selectedLandAcquisitionMethodCode ?? preview?.landAcquisition.selectedMethodCode ?? null
  const selectedMethod = preview?.landAcquisition.methods.find((method) => method.methodCode === currentMethodCode)
  const materialPackages = preview?.materialPackages ?? []
  const materialPackageSourceCounts = summarizePackageSources(materialPackages)
  const workItemGroups = preview ? groupWorkItemsByStage(preview.workItems) : []
  const provinceRuleSource = preview?.provinceRuleSource
  const provinceName = preview?.provinceProfile?.provinceName ?? provinceRuleSource?.appliedProfileName ?? '全国通用'
  const regionOverrideName = preview?.cityOverride?.cityName
  const regionSourceName = preview?.cityOverride ? `${provinceName} + ${regionOverrideName}` : provinceName
  const regionPolicySources = [
    ...(preview?.provinceProfile?.policySources ?? []),
    ...(preview?.cityOverride?.policySources ?? []),
  ]
  const skippedItems = preview
    ? [
        ...preview.certificates
          .filter((item) => item.action !== 'will_create')
          .map((item) => ({
            key: item.key,
            title: item.certificateName,
            action: item.action,
            reason: item.action === 'will_skip_existing'
              ? '项目已有同类事实，系统模板不会覆盖。'
              : '本次不自动生成，可在台账中单独调整。',
          })),
        ...preview.workItems
          .filter((item) => item.action !== 'will_create')
          .map((item) => ({
            key: item.workItemCode,
            title: item.itemName,
            action: item.action,
            reason: item.action === 'will_skip_existing'
              ? '项目已有办理事项，系统模板不会重复创建。'
              : '本次不自动生成，可在台账中单独调整。',
          })),
        ...preview.dependencies
          .filter((item) => item.action !== 'will_create')
          .map((item) => ({
            key: item.dependencyCode,
            title: item.dependencyCode,
            action: item.action,
            reason: item.action === 'will_skip_existing'
              ? '依赖关系已存在或端点均为已有项目事实。'
              : '本次不自动生成，可在台账中单独调整。',
          })),
      ]
    : []

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !applying && onOpenChange(nextOpen)}>
      <DialogContent className="max-w-[var(--dialog-lg-width)]">
        <DialogHeader>
          <DialogTitle>模板应用明细</DialogTitle>
          <DialogDescription>
            按系统模板补齐缺失的四证、办理事项和依赖关系，已有项目事实不会被覆盖。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[68vh] space-y-5 overflow-y-auto pr-1">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{error}</span>
                {onRetry ? (
                  <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                    <RefreshCw className="h-4 w-4" />
                    重新加载
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <MetricHeader icon={<FileStack className="h-3.5 w-3.5" />} label="本次应用" />
              <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{selectedCount}</div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <MetricHeader icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="可生成项" tone="emerald" />
              <div className="mt-2 text-2xl font-semibold tabular-nums text-emerald-900">
                {(preview?.summary.certificateCreateCount ?? 0) +
                  (preview?.summary.workItemCreateCount ?? 0) +
                  (preview?.summary.dependencyCreateCount ?? 0)}
              </div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <MetricHeader icon={<ShieldCheck className="h-3.5 w-3.5" />} label="不覆盖项" tone="amber" />
              <div className="mt-2 text-2xl font-semibold tabular-nums text-amber-900">
                {preview?.summary.skippedExistingCount ?? 0}
              </div>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
              <MetricHeader icon={<GitBranch className="h-3.5 w-3.5" />} label="关键依赖" tone="blue" />
              <div className="mt-2 text-2xl font-semibold tabular-nums text-blue-900">
                {preview?.dependencies.length ?? 0}
              </div>
            </div>
          </div>

          {loading && !preview ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              系统模板预览加载中...
            </div>
          ) : null}

          {preview ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-blue-600" />
                  应用前检查
                </div>
                <Badge variant="outline">{preview.seedVersion}</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <InfoTile
                  icon={<MapPinned className="h-3.5 w-3.5" />}
                  label="识别地区"
                  value={provinceRuleSource?.recognizedProvinceName ?? preview.provinceProfile?.provinceName ?? '全国通用'}
                  hint={provinceSourceLabel(provinceRuleSource?.source ?? preview.provinceProfile?.source)}
                />
                <InfoTile
                  icon={<PackageCheck className="h-3.5 w-3.5" />}
                  label="适用资料包"
                  value={regionSourceName}
                  hint={selectedMethod?.methodName ?? '默认取得方式'}
                />
                <InfoTile
                  icon={<FileStack className="h-3.5 w-3.5" />}
                  label="政策来源"
                  value={provinceRuleSource?.sourceCheckedAt ?? preview.provinceProfile?.policySources[0]?.checkedAt ?? '待治理'}
                  hint={regionPolicySources[0]?.sourceName ?? '通用四证模板'}
                />
                <InfoTile
                  icon={<CalendarClock className="h-3.5 w-3.5" />}
                  label="治理更新"
                  value={provinceRuleSource?.nextReviewDueAt ?? '按版本复核'}
                  hint={policyUpdateLabel(provinceRuleSource?.updateMode)}
                />
              </div>
            </div>
          ) : null}

          {preview ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">土地取得方式</div>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    用于确认正式页面里的土地资料路径；模板应用层只确认四证主干纲要。
                  </p>
                </div>
                {preview.provinceProfile ? (
                  <div className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                    <span className="font-medium text-slate-900">{preview.provinceProfile.provinceName}</span>
                    <span className="ml-2">Profile {preview.provinceProfile.profileVersion}</span>
                  </div>
                ) : null}
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-4">
                {preview.landAcquisition.methods.map((method) => {
                  const active = method.methodCode === currentMethodCode
                  return (
                    <Button
                      key={method.methodCode}
                      type="button"
                      variant={active ? 'default' : 'outline'}
                      className={cn(
                        'h-auto justify-start whitespace-normal rounded-xl px-3 py-2 text-left',
                        active ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-white',
                      )}
                      disabled={loading || applying}
                      onClick={() => onChangeLandAcquisitionMethod?.(method.methodCode)}
                    >
                      <span className="flex flex-col items-start gap-1">
                        <span className="text-sm font-semibold">{method.methodName}</span>
                        <span className={cn('text-xs leading-5', active ? 'text-slate-200' : 'text-slate-500')}>
                          {method.recommendedFor[0] ?? '应用后在正式页面展开资料路径'}
                        </span>
                      </span>
                    </Button>
                  )
                })}
              </div>

              {selectedMethod ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                    <div className="text-xs font-semibold text-slate-900">适用场景</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedMethod.recommendedFor.map((item) => (
                        <Badge key={item} variant="outline">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                    <div className="text-xs font-semibold text-slate-900">正式页展开</div>
                    <div className="mt-2 text-xs leading-5 text-slate-600">
                      已匹配 {selectedMethod.workItemCodes.length} 个资料节点，套用后在证照详情页核验资料、部门和成果复用。
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {preview?.provinceProfile ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <MapPinned className="h-4 w-4 text-blue-600" />
                    <div className="text-sm font-semibold text-slate-900">地区规则来源</div>
                    <Badge variant="outline">
                      {regionSourceName} Profile {preview.provinceProfile.profileVersion}
                    </Badge>
                    {preview.cityOverride ? <Badge variant="secondary">城市增强</Badge> : null}
                    <Badge variant="secondary">{provinceSourceLabel(preview.provinceProfile.source)}</Badge>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-600">
                    系统按项目地区带入已发布资料口径，本次预览合成通用模板、土地取得方式、地区资料包；已有项目事实仍不会被覆盖。
                  </p>
                </div>
                <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:w-[360px]">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="font-medium text-slate-900">省份资料包</div>
                    <div className="mt-1 tabular-nums">{preview.provinceProfile.provinceName}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="font-medium text-slate-900">城市增强包</div>
                    <div className="mt-1 tabular-nums">{preview.cityOverride?.cityName ?? '未配置'}</div>
                  </div>
                </div>
              </div>

              {regionPolicySources.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {regionPolicySources.map((source) => (
                    <Badge key={`${source.sourceName}:${source.checkedAt}`} variant="secondary">
                      {source.sourceName} / {source.checkedAt}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {materialPackages.length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <FileStack className="h-4 w-4 text-slate-500" />
                    资料包摘要
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    已按通用模板、取得方式和地区规则完成合成；资料清单进入正式页面后再展开校验。
                  </p>
                </div>
                <Badge variant="outline">{materialPackages.length} 组已合成</Badge>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {materialPackageSourceCounts.map((summary) => (
                  <div key={summary.source} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="text-xs font-medium text-slate-500">{packageSourceLabel(summary.source)}</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{summary.count} 组</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
              <div>
                <div className="text-sm font-medium text-slate-900">应用边界</div>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  系统只会新增当前项目缺失的主干项；已存在或已编辑的数据不会被覆盖，资料细节在正式页面继续微调。
                </p>
              </div>
            </div>
          </div>

          {preview ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.25fr)]">
              <div className="space-y-4">
                <div>
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <FileBadge2 className="h-4 w-4 text-slate-500" />
                    四证主干纲要
                  </div>
                  <div className="grid gap-2">
                    {preview.certificates.map((certificate) => (
                      <div key={certificate.key} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold text-slate-900">{certificate.certificateName}</h3>
                          <Badge variant={actionBadgeVariant(certificate.action)}>
                            {actionLabel(certificate.action)}
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                          <span>阶段：{certificate.defaultStage}</span>
                          <span>状态：{mapCertificateStatusLabel(certificate.defaultStatus)}</span>
                          <span>主管：{certificate.approvingAuthority}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <GitBranch className="h-4 w-4 text-slate-500" />
                    关键依赖
                  </div>
                  <div className="grid gap-2">
                    {preview.dependencies.slice(0, 8).map((dependency) => (
                      <div key={dependency.dependencyCode} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-slate-900">
                            {describeMainlineEndpoint(dependency.predecessor, preview)} {' -> '}{' '}
                            {describeMainlineEndpoint(dependency.successor, preview)}
                          </div>
                          <Badge variant={actionBadgeVariant(dependency.action)}>{actionLabel(dependency.action)}</Badge>
                        </div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">
                          {dependencyKindSummaryLabel(dependency.dependencyKind)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <ListChecks className="h-4 w-4 text-slate-500" />
                    主干办理事项
                  </div>
                  <div className="text-xs text-slate-500">按阶段确认数量，资料明细在正式页展开</div>
                </div>
                <div className="space-y-3">
                  {workItemGroups.map((group) => {
                    const sharedCount = group.items.filter((item) => item.isShared).length
                    const blockingCount = group.items.filter((item) => item.criticality === 'blocking').length
                    const certificateTypeLabels = [
                      ...new Set(group.items.flatMap((item) => item.certificateTypes.map(getCertificateTypeLabel))),
                    ]

                    return (
                      <div key={group.stage} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-slate-900">{group.stage}</div>
                          <Badge variant="outline">{group.items.length} 项</Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant="secondary">共享 {sharedCount}</Badge>
                          <Badge variant={blockingCount > 0 ? 'destructive' : 'outline'}>阻塞 {blockingCount}</Badge>
                          {certificateTypeLabels.slice(0, 4).map((label) => (
                            <Badge key={label} variant="outline">
                              {label}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {skippedItems.length > 0 ? (
            <div className="space-y-3">
              <div className="text-sm font-medium text-slate-900">不生成项</div>
              <div className="max-h-56 space-y-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                {skippedItems.map((item) => (
                  <div key={`${item.key}:${item.action}`} className="rounded-lg bg-white px-3 py-2 ring-1 ring-inset ring-slate-200/70">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 text-sm font-medium text-slate-900">{item.title}</div>
                      <Badge variant={actionBadgeVariant(item.action)}>{actionLabel(item.action)}</Badge>
                    </div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">{item.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <Separator />

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={applying} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" loading={applying} disabled={!preview || selectedCount === 0} onClick={onConfirm}>
            确认应用
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MetricHeader({
  icon,
  label,
  tone = 'slate',
}: {
  icon: React.ReactNode
  label: string
  tone?: 'slate' | 'emerald' | 'amber' | 'blue'
}) {
  const toneClass = {
    slate: 'text-slate-500',
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    blue: 'text-blue-700',
  }[tone]

  return (
    <div className={cn('flex items-center gap-2 text-xs font-medium', toneClass)}>
      {icon}
      {label}
    </div>
  )
}

function InfoTile({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-900">{value}</div>
      <div className="mt-1 truncate text-xs text-slate-500">{hint}</div>
    </div>
  )
}
