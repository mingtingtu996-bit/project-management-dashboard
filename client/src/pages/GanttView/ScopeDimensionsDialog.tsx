import { useEffect, useMemo, useState } from 'react'
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
import { apiDelete, apiGet, apiPost, apiPut, getApiErrorMessage, isAbortError } from '@/lib/apiClient'
import { cn } from '@/lib/utils'
import { Loader2, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react'

type ScopeDimensionKey = 'building' | 'specialty' | 'phase' | 'region'

type ScopeDimensionSection = {
  key: ScopeDimensionKey
  label: string
  description: string
  options: string[]
  selected: string[]
}

type ScopeDimensionRow = {
  id: string
  dimension_key: ScopeDimensionKey
  label: string
  code?: string | null
  is_active?: boolean | null
  sort_order?: number | null
  version?: number | null
}

type ScopeDimensionsResponse = {
  project_id: string | null
  sections: ScopeDimensionSection[]
  dictionary: Record<ScopeDimensionKey, string[]>
  rows: ScopeDimensionRow[]
}

const SCOPE_KEYS: ScopeDimensionKey[] = ['building', 'specialty', 'phase', 'region']

const SCOPE_META: Record<ScopeDimensionKey, { label: string; description: string }> = {
  building: { label: '建筑维度', description: '楼栋 / 建筑类型' },
  specialty: { label: '专业维度', description: '专项工程 / 专业分类' },
  phase: { label: '阶段维度', description: '项目阶段 / 里程碑阶段' },
  region: { label: '区域维度', description: '片区 / 标段 / 区域分区' },
}

function normalizeText(value: string) {
  return value.trim()
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean)))
}

function buildDraft(sections: ScopeDimensionSection[]) {
  const map = new Map<ScopeDimensionKey, ScopeDimensionSection>(sections.map((section) => [section.key, section]))
  return {
    building: map.get('building')?.selected ?? [],
    specialty: map.get('specialty')?.selected ?? [],
    phase: map.get('phase')?.selected ?? [],
    region: map.get('region')?.selected ?? [],
  }
}

function buildInputDraft() {
  return {
    building: '',
    specialty: '',
    phase: '',
    region: '',
  }
}

export interface ScopeDimensionsDialogProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ScopeDimensionsDialog({ projectId, open, onOpenChange }: ScopeDimensionsDialogProps) {
  const [sections, setSections] = useState<ScopeDimensionSection[]>([])
  const [rows, setRows] = useState<ScopeDimensionRow[]>([])
  const [draft, setDraft] = useState(() => buildDraft([]))
  const [inputs, setInputs] = useState(() => buildInputDraft())
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [rowDrafts, setRowDrafts] = useState<Record<string, { label: string; sort_order: string; is_active: boolean }>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sectionMap = useMemo(
    () => new Map<ScopeDimensionKey, ScopeDimensionSection>(sections.map((section) => [section.key, section])),
    [sections],
  )

  const loadScopeDimensions = async (signal?: AbortSignal) => {
    if (!projectId) return

    setLoading(true)
    setError(null)
    try {
      const response = await apiGet<ScopeDimensionsResponse>(`/api/scope-dimensions?projectId=${encodeURIComponent(projectId)}`, { signal })
      if (signal?.aborted) return
      const nextSections = Array.isArray(response?.sections) ? response.sections : []
      setSections(nextSections)
      setRows(Array.isArray(response?.rows) ? response.rows : [])
      setDraft(buildDraft(nextSections))
      setInputs(buildInputDraft())
      setEditingRowId(null)
      setRowDrafts({})
    } catch (fetchError) {
      if (isAbortError(fetchError) || signal?.aborted) return
      setError(getApiErrorMessage(fetchError, '范围维度加载失败'))
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    if (!open || !projectId) return

    const controller = new AbortController()
    void loadScopeDimensions(controller.signal)

    return () => {
      controller.abort()
    }
  }, [open, projectId])

  const handleToggle = (key: ScopeDimensionKey, value: string) => {
    const normalized = normalizeText(value)
    if (!normalized) return
    setDraft((current) => {
      const next = current[key] ?? []
      return {
        ...current,
        [key]: next.includes(normalized) ? next.filter((item) => item !== normalized) : [...next, normalized],
      }
    })
  }

  const handleAddCustom = (key: ScopeDimensionKey) => {
    const value = normalizeText(inputs[key])
    if (!value) return
    setDraft((current) => ({
      ...current,
      [key]: unique([...(current[key] ?? []), value]),
    }))
    setInputs((current) => ({ ...current, [key]: '' }))
    void apiPost(`/api/scope-dimensions`, {
      dimension_key: key,
      label: value,
      is_active: true,
    })
      .then(() => loadScopeDimensions())
      .catch((addError) => {
        setError(getApiErrorMessage(addError, '新增范围维度失败'))
      })
  }

  const handleRemove = (key: ScopeDimensionKey, value: string) => {
    setDraft((current) => ({
      ...current,
      [key]: (current[key] ?? []).filter((item) => item !== value),
    }))
  }

  const handleSave = async () => {
    if (!projectId) return

    setSaving(true)
    setError(null)
    try {
      const payload = {
        sections: {
          building: unique(draft.building ?? []),
          specialty: unique(draft.specialty ?? []),
          phase: unique(draft.phase ?? []),
          region: unique(draft.region ?? []),
        },
      }
      const response = await apiPut<ScopeDimensionsResponse>(`/api/scope-dimensions/${projectId}`, payload)
      const nextSections = Array.isArray(response?.sections) ? response.sections : []
      setSections(nextSections)
      setRows(Array.isArray(response?.rows) ? response.rows : [])
      setDraft(buildDraft(nextSections))
      setInputs(buildInputDraft())
      onOpenChange(false)
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, '范围维度保存失败'))
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setDraft(buildDraft(sections))
    setInputs(buildInputDraft())
  }

  const startEditRow = (row: ScopeDimensionRow) => {
    setEditingRowId(row.id)
    setRowDrafts((current) => ({
      ...current,
      [row.id]: {
        label: row.label,
        sort_order: String(row.sort_order ?? ''),
        is_active: row.is_active !== false,
      },
    }))
  }

  const cancelEditRow = (rowId: string) => {
    setEditingRowId((current) => (current === rowId ? null : current))
  }

  const saveDictionaryRow = async (row: ScopeDimensionRow) => {
    const draftRow = rowDrafts[row.id]
    if (!draftRow) return
    setSaving(true)
    setError(null)
    try {
      await apiPut(`/api/scope-dimensions/rows/${row.id}`, {
        label: normalizeText(draftRow.label),
        sort_order: Number.isFinite(Number(draftRow.sort_order)) ? Number(draftRow.sort_order) : row.sort_order,
        is_active: draftRow.is_active,
      })
      await loadScopeDimensions()
    } catch (rowError) {
      setError(getApiErrorMessage(rowError, '字典条目保存失败'))
    } finally {
      setSaving(false)
    }
  }

  const deleteDictionaryRow = async (row: ScopeDimensionRow) => {
    setSaving(true)
    setError(null)
    try {
      await apiDelete(`/api/scope-dimensions/${row.id}`)
      await loadScopeDimensions()
    } catch (rowError) {
      setError(getApiErrorMessage(rowError, '字典条目删除失败'))
    } finally {
      setSaving(false)
    }
  }

  const rowListByKey = useMemo(() => {
    const grouped = new Map<ScopeDimensionKey, ScopeDimensionRow[]>()
    SCOPE_KEYS.forEach((key) => grouped.set(key, []))
    rows.forEach((row) => {
      const list = grouped.get(row.dimension_key)
      if (list) {
        list.push(row)
      }
    })
    grouped.forEach((list, key) => {
      list.sort((left, right) => {
        const leftOrder = Number(left.sort_order ?? 0)
        const rightOrder = Number(right.sort_order ?? 0)
        if (leftOrder !== rightOrder) return leftOrder - rightOrder
        return String(left.label).localeCompare(String(right.label), 'zh-CN')
      })
      grouped.set(key, list)
    })
    return grouped
  }, [rows])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden" data-testid="gantt-scope-dimensions-dialog">
        <DialogHeader>
          <DialogTitle>范围维度</DialogTitle>
          <DialogDescription className="sr-only">维护项目的范围维度绑定</DialogDescription>
          <div className="text-xs text-muted-foreground">编辑当前项目的建筑、专业、阶段和区域维度。</div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在加载范围维度...
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {SCOPE_KEYS.map((key) => {
                const section = sectionMap.get(key)
                const selected = draft[key] ?? []
                const options = unique([...(section?.options ?? []), ...selected])

                return (
                  <div key={key} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div>
                      <div className="text-sm font-medium text-slate-900">{section?.label || SCOPE_META[key].label}</div>
                      <div className="text-xs text-slate-500">{section?.description || SCOPE_META[key].description}</div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {selected.length > 0 ? (
                        selected.map((value) => (
                          <button
                            key={`${key}-${value}`}
                            type="button"
                            onClick={() => handleRemove(key, value)}
                            className="group inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100"
                            title="点击移除"
                          >
                            <span>{value}</span>
                            <X className="h-3 w-3 opacity-60 transition-opacity group-hover:opacity-100" />
                          </button>
                        ))
                      ) : (
                        <span className="text-sm text-slate-400">未配置</span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Input
                        value={inputs[key]}
                        onChange={(event) => setInputs((current) => ({ ...current, [key]: event.target.value }))}
                        placeholder={`补录 ${section?.label || SCOPE_META[key].label}`}
                        className="h-9"
                      />
                      <Button type="button" variant="outline" className="h-9 px-3" onClick={() => handleAddCustom(key)}>
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        添加
                      </Button>
                    </div>

                    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>字典条目</span>
                        <span>{(rowListByKey.get(key) ?? []).length} 项</span>
                      </div>
                      <div className="space-y-2">
                        {(rowListByKey.get(key) ?? []).length > 0 ? (rowListByKey.get(key) ?? []).map((row) => {
                          const isEditing = editingRowId === row.id
                          const draftRow = rowDrafts[row.id] ?? {
                            label: row.label,
                            sort_order: String(row.sort_order ?? ''),
                            is_active: row.is_active !== false,
                          }

                          return isEditing ? (
                            <div key={row.id} className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
                              <div className="grid gap-2 sm:grid-cols-[1fr_92px_84px]">
                                <Input
                                  value={draftRow.label}
                                  onChange={(event) =>
                                    setRowDrafts((current) => ({
                                      ...current,
                                      [row.id]: { ...draftRow, label: event.target.value },
                                    }))
                                  }
                                  className="h-9 bg-white"
                                  placeholder="字典名称"
                                />
                                <Input
                                  type="number"
                                  value={draftRow.sort_order}
                                  onChange={(event) =>
                                    setRowDrafts((current) => ({
                                      ...current,
                                      [row.id]: { ...draftRow, sort_order: event.target.value },
                                    }))
                                  }
                                  className="h-9 bg-white"
                                  placeholder="顺序"
                                />
                                <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600">
                                  <input
                                    type="checkbox"
                                    checked={draftRow.is_active}
                                    onChange={(event) =>
                                      setRowDrafts((current) => ({
                                        ...current,
                                        [row.id]: { ...draftRow, is_active: event.target.checked },
                                      }))
                                    }
                                  />
                                  启用
                                </label>
                              </div>
                              <div className="flex items-center justify-end gap-2">
                                <Button type="button" variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={() => cancelEditRow(row.id)} disabled={saving}>
                                  取消
                                </Button>
                                <Button type="button" size="sm" className="h-8 px-3 text-xs" onClick={() => void saveDictionaryRow(row)} disabled={saving}>
                                  <Save className="mr-1 h-3.5 w-3.5" />
                                  保存
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                              <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="truncate text-sm font-medium text-slate-900">{row.label}</span>
                                  <Badge variant={row.is_active === false ? 'outline' : 'secondary'}>
                                    {row.is_active === false ? '停用' : '启用'}
                                  </Badge>
                                  <span className="text-xs text-slate-400">顺序 {row.sort_order ?? 0}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => startEditRow(row)} disabled={saving}>
                                  编辑
                                </Button>
                                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-600 hover:text-red-700" onClick={() => void deleteDictionaryRow(row)} disabled={saving}>
                                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                                  删除
                                </Button>
                              </div>
                            </div>
                          )
                        }) : (
                          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-400">
                            暂无字典条目
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                      {options.length > 0 ? options.map((value) => {
                        const active = selected.includes(value)
                        return (
                          <button
                            key={`${key}-${value}-option`}
                            type="button"
                            onClick={() => handleToggle(key, value)}
                            className={cn(
                              'rounded-full border px-3 py-1 text-xs transition-colors',
                              active
                                ? 'border-blue-300 bg-blue-50 text-blue-700'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                            )}
                          >
                            {active ? '已选' : '可选'} {value}
                          </button>
                        )
                      }) : (
                        <span className="text-xs text-slate-400">暂无可选项</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <DialogFooter className="border-t bg-background pt-4 gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={handleReset} disabled={loading || saving}>
            <RefreshCw className="mr-2 h-4 w-4" />
            重置
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={loading || saving}>
            {saving ? '保存中' : '保存范围'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
