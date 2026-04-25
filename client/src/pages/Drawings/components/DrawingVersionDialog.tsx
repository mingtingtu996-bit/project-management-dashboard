import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckSquare, ExternalLink, FileCheck2, ListTodo, Upload } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'

import { DRAWING_REVIEW_MODE_LABELS } from '../constants'
import type { DrawingPackageCard, DrawingVersionImpactItem, DrawingVersionView } from '../types'

const IMPACT_TYPE_CONFIG: Record<DrawingVersionImpactItem['type'], { icon: typeof ListTodo; label: string; className: string }> = {
  task: { icon: ListTodo, label: '关联任务', className: 'bg-blue-50 border-blue-200 text-blue-700' },
  acceptance: { icon: CheckSquare, label: '验收计划', className: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  certificate: { icon: FileCheck2, label: '证照', className: 'bg-amber-50 border-amber-200 text-amber-700' },
}

function buildImpactLink(item: DrawingVersionImpactItem, projectId: string): string {
  if (item.type === 'task') return `/projects/${projectId}/gantt?taskId=${item.id}`
  if (item.type === 'acceptance') return `/projects/${projectId}/acceptance`
  return `/projects/${projectId}/pre-milestones`
}

function suggestNextVersionNo(seed: string) {
  const normalized = seed.trim()
  if (!normalized || normalized === '未设置') return '1.0'
  const match = normalized.match(/^(\d+)(?:\.(\d+))?$/)
  if (!match) return normalized
  const major = Number(match[1] ?? '1')
  const minor = Number(match[2] ?? '0')
  return `${major}.${minor + 1}`
}

export interface DrawingVersionCreateDraft {
  drawingName: string
  drawingCode: string
  versionNo: string
  changeReason: string
  isCurrentVersion: boolean
}

function buildCreateDraft(packageCard: DrawingPackageCard | null, versions: DrawingVersionView[]): DrawingVersionCreateDraft {
  const currentVersion = versions.find((version) => version.isCurrentVersion) ?? versions[0] ?? null
  return {
    drawingName: currentVersion?.drawingName ?? packageCard?.packageName ?? '',
    drawingCode: '',
    versionNo: suggestNextVersionNo(currentVersion?.versionNo ?? packageCard?.currentVersionNo ?? '1.0'),
    changeReason: '',
    isCurrentVersion: true,
  }
}

export function DrawingVersionDialog({
  open,
  packageCard,
  versions,
  projectId,
  onOpenChange,
  onSetCurrentVersion,
  onCreateVersion,
}: {
  open: boolean
  packageCard: DrawingPackageCard | null
  versions: DrawingVersionView[]
  projectId?: string
  onOpenChange: (open: boolean) => void
  onSetCurrentVersion: (versionId: string) => void
  onCreateVersion?: (draft: DrawingVersionCreateDraft) => Promise<boolean | void> | boolean | void
}) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const initialDraft = useMemo(() => buildCreateDraft(packageCard, versions), [packageCard, versions])
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [createMode, setCreateMode] = useState(false)
  const [createDraft, setCreateDraft] = useState<DrawingVersionCreateDraft>(initialDraft)
  const [createError, setCreateError] = useState<string | null>(null)
  const [creatingVersion, setCreatingVersion] = useState(false)
  const selectedVersion = versions.find((v) => v.versionId === selectedVersionId) ?? null
  const toggleSelectedVersion = (versionId: string) => {
    setSelectedVersionId((current) => (current === versionId ? null : versionId))
  }

  useEffect(() => {
    if (!open) return
    setSelectedVersionId((current) => {
      if (current && versions.some((version) => version.versionId === current)) {
        return current
      }
      return versions.find((version) => version.isCurrentVersion)?.versionId ?? versions[0]?.versionId ?? null
    })
  }, [open, versions])

  useEffect(() => {
    if (!open || createMode) return
    setCreateDraft(initialDraft)
    setCreateError(null)
  }, [createMode, initialDraft, open])

  const handleCreateVersion = async () => {
    const normalizedDraft = {
      drawingName: createDraft.drawingName.trim(),
      drawingCode: createDraft.drawingCode.trim(),
      versionNo: createDraft.versionNo.trim(),
      changeReason: createDraft.changeReason.trim(),
      isCurrentVersion: createDraft.isCurrentVersion,
    }

    if (!normalizedDraft.drawingName) {
      setCreateError('图纸名称不能为空')
      return
    }

    if (!normalizedDraft.versionNo) {
      setCreateError('版本号不能为空')
      return
    }

    setCreateError(null)
    setCreatingVersion(true)
    try {
      const result = await onCreateVersion?.(normalizedDraft)
      if (result === false) return
      setCreateMode(false)
      setCreateDraft(buildCreateDraft(packageCard, versions))
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : '新版本创建失败，请稍后重试。')
    } finally {
      setCreatingVersion(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl border-slate-200">
        <DialogHeader>
          <DialogTitle className="text-slate-900">
            {packageCard?.packageName ? `${packageCard.packageName} 版本窗口` : '版本变更窗口'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {packageCard && (
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="rounded-full px-2.5 py-1 text-xs">
                {packageCard.packageCode}
              </Badge>
              <Badge variant="outline" className="rounded-full px-2.5 py-1 text-xs">
                {packageCard.disciplineType}
              </Badge>
              <Badge variant="outline" className="rounded-full px-2.5 py-1 text-xs">
                {DRAWING_REVIEW_MODE_LABELS[packageCard.reviewMode]}
              </Badge>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-[1fr_280px]">
            <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
              {versions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                  暂无版本记录。
                </div>
              ) : (
                versions.map((version) => (
                  <div
                    key={version.versionId}
                    data-testid={`drawing-version-row-${version.versionId}`}
                    className={`flex w-full items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${selectedVersionId === version.versionId ? 'border-blue-300 bg-blue-50' : 'border-slate-100 bg-slate-50 hover:bg-slate-100'}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSelectedVersion(version.versionId)}
                      className="flex min-w-0 flex-1 items-start text-left"
                      aria-pressed={selectedVersionId === version.versionId}
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium text-slate-900">v{version.versionNo}</div>
                          {version.isCurrentVersion && (
                            <Badge className="rounded-full px-2.5 py-1 text-xs">当前有效版</Badge>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">{version.drawingName}</div>
                        {version.changeReason && <div className="text-sm leading-6 text-slate-600">{version.changeReason}</div>}
                        <div className="text-xs text-slate-400">
                          {version.createdBy}
                          {version.createdAt ? ` · ${version.createdAt}` : ''}
                        </div>
                      </div>
                    </button>

                    {!version.isCurrentVersion ? (
                      <Button size="sm" variant="outline" onClick={() => onSetCurrentVersion(version.versionId)}>
                        设为当前有效版
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4" data-testid="drawing-version-detail-panel">
              {createMode ? (
                <div className="space-y-3" data-testid="drawing-version-create-form">
                  <div className="text-sm font-semibold text-slate-900">新增版本</div>
                  <div className="space-y-2">
                    <Label htmlFor="drawing-version-create-name">图纸名称</Label>
                    <Input
                      id="drawing-version-create-name"
                      data-testid="drawing-version-create-name"
                      value={createDraft.drawingName}
                      onChange={(event) => setCreateDraft((current) => ({ ...current, drawingName: event.target.value }))}
                      placeholder="例如：主体结构施工图"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="drawing-version-create-code">图号</Label>
                      <Input
                        id="drawing-version-create-code"
                        data-testid="drawing-version-create-code"
                        value={createDraft.drawingCode}
                        onChange={(event) => setCreateDraft((current) => ({ ...current, drawingCode: event.target.value }))}
                        placeholder="例如：JG-001"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="drawing-version-create-version">版本号</Label>
                      <Input
                        id="drawing-version-create-version"
                        data-testid="drawing-version-create-version"
                        value={createDraft.versionNo}
                        onChange={(event) => setCreateDraft((current) => ({ ...current, versionNo: event.target.value }))}
                        placeholder="例如：3.1"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="drawing-version-create-reason">变更备注</Label>
                    <Textarea
                      id="drawing-version-create-reason"
                      data-testid="drawing-version-create-reason"
                      value={createDraft.changeReason}
                      onChange={(event) => setCreateDraft((current) => ({ ...current, changeReason: event.target.value }))}
                      placeholder="例如：补充梁板节点"
                      rows={4}
                    />
                  </div>
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={createDraft.isCurrentVersion}
                      onChange={(event) => setCreateDraft((current) => ({ ...current, isCurrentVersion: event.target.checked }))}
                      data-testid="drawing-version-create-current"
                    />
                    创建后直接设为当前有效版
                  </label>
                  <div className="rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
                    提交后会写入版本快照，并同步刷新图纸包详情、台账和版本窗口。
                  </div>
                  {createError ? (
                    <p className="text-xs text-red-600" data-testid="drawing-version-create-error">
                      {createError}
                    </p>
                  ) : null}
                </div>
              ) : selectedVersion ? (
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-slate-900">版本详情</div>
                  <div className="space-y-2 text-sm text-slate-700">
                    <div><span className="text-xs text-slate-500">版本号</span><div>v{selectedVersion.versionNo}</div></div>
                    <div><span className="text-xs text-slate-500">图纸名称</span><div className="truncate">{selectedVersion.drawingName}</div></div>
                    {selectedVersion.changeReason && (
                      <div><span className="text-xs text-slate-500">变更原因</span><div className="leading-5">{selectedVersion.changeReason}</div></div>
                    )}
                    <div><span className="text-xs text-slate-500">创建人</span><div>{selectedVersion.createdBy || '—'}</div></div>
                    <div><span className="text-xs text-slate-500">创建时间</span><div>{selectedVersion.createdAt || '—'}</div></div>
                    <div><span className="text-xs text-slate-500">状态</span><div>{selectedVersion.isCurrentVersion ? '当前有效版' : '历史版本'}</div></div>
                  </div>

                  {selectedVersion.impactedItems && selectedVersion.impactedItems.length > 0 && (
                    <div className="pt-2">
                      <div className="mb-2 text-xs font-semibold text-slate-700">影响对象</div>
                      <div className="space-y-1.5">
                        {selectedVersion.impactedItems.map((item) => {
                          const cfg = IMPACT_TYPE_CONFIG[item.type]
                          const Icon = cfg.icon
                          const canNavigate = Boolean(projectId)
                          return (
                            <button
                              key={item.id}
                              type="button"
                              disabled={!canNavigate}
                              onClick={() => {
                                if (projectId) {
                                  navigate(buildImpactLink(item, projectId))
                                  onOpenChange(false)
                                }
                              }}
                              className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs text-left ${cfg.className} ${canNavigate ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                              data-testid={`version-impact-item-${item.id}`}
                            >
                              <Icon className="h-3.5 w-3.5 shrink-0" />
                              <span className="font-medium">{cfg.label}</span>
                              <span className="truncate text-slate-600">{item.name}</span>
                              {item.status && (
                                <span className="ml-auto shrink-0 opacity-70">{item.status}</span>
                              )}
                              {canNavigate && <ExternalLink className="ml-auto h-3 w-3 shrink-0 opacity-50" />}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-full min-h-[120px] items-center justify-center text-sm text-slate-500">
                  未选择版本
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          {createMode ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setCreateMode(false)
                  setCreateDraft(initialDraft)
                  setCreateError(null)
                }}
              >
                取消新增
              </Button>
              <Button
                onClick={() => void handleCreateVersion()}
                loading={creatingVersion}
                data-testid="drawing-version-create-submit"
              >
                保存版本
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              data-testid="drawing-version-upload-btn"
              onClick={() => {
                setCreateMode(true)
                setCreateDraft(initialDraft)
                setCreateError(null)
              }}
            >
              <Upload className="mr-2 h-4 w-4" />
              上传新版本
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
