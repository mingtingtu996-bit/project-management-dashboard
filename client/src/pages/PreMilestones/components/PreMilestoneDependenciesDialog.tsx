import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CertificateBoardItem, CertificateDependencyKind } from '../types'

type PreMilestoneDependencyGraphNode = {
  id: string
  name: string
  milestone_type?: string | null
  status?: string | null
  dependencies: Array<{
    id: string
    source_milestone_id: string
    target_milestone_id: string
    dependency_kind?: CertificateDependencyKind | string | null
    notes?: string | null
    target_milestone?: {
      id: string
      name: string
      milestone_type?: string | null
      status?: string | null
    } | null
  }>
}

interface DependencyEntry {
  id: string
  sourceId: string
  sourceLabel: string
  targetId: string
  targetLabel: string
  dependencyKind: CertificateDependencyKind | string | null
  notes?: string | null
}

interface PreMilestoneDependenciesDialogProps {
  open: boolean
  projectId?: string | null
  certificates: CertificateBoardItem[]
  currentCertificateId?: string | null
  onClose: () => void
}

function resolveCertificateLabel(certificates: CertificateBoardItem[], certificateId: string) {
  return certificates.find((certificate) => certificate.id === certificateId)?.certificate_name || certificateId
}

function flattenGraph(rows: PreMilestoneDependencyGraphNode[], certificates: CertificateBoardItem[]): DependencyEntry[] {
  return rows.flatMap((row) => row.dependencies.map((dependency) => ({
    id: dependency.id,
    sourceId: dependency.source_milestone_id || row.id,
    sourceLabel: resolveCertificateLabel(certificates, dependency.source_milestone_id || row.id),
    targetId: dependency.target_milestone_id,
    targetLabel: dependency.target_milestone?.name || resolveCertificateLabel(certificates, dependency.target_milestone_id),
    dependencyKind: dependency.dependency_kind ?? 'hard',
    notes: dependency.notes ?? null,
  })))
}

function buildSelectOptions(certificates: CertificateBoardItem[]) {
  return certificates.map((certificate) => ({
    id: certificate.id,
    label: certificate.certificate_name,
  }))
}

export function PreMilestoneDependenciesDialog({
  open,
  projectId,
  certificates,
  currentCertificateId,
  onClose,
}: PreMilestoneDependenciesDialogProps) {
  const [graphRows, setGraphRows] = useState<PreMilestoneDependencyGraphNode[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sourceId, setSourceId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [dependencyKind, setDependencyKind] = useState<CertificateDependencyKind>('hard')
  const [notes, setNotes] = useState('')

  const certificateOptions = useMemo(() => buildSelectOptions(certificates), [certificates])
  const dependencyEntries = useMemo(() => flattenGraph(graphRows, certificates), [graphRows, certificates])

  const loadGraph = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const response = await fetch(`/api/pre-milestone-dependencies/project/${encodeURIComponent(projectId)}`, {
        cache: 'no-store',
      })
      const result = await response.json() as { success: boolean; data?: PreMilestoneDependencyGraphNode[] }
      if (result.success && Array.isArray(result.data)) {
        setGraphRows(result.data)
      } else {
        setGraphRows([])
      }
    } catch (error) {
      console.error('Failed to load pre-milestone dependencies', error)
      setGraphRows([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (!open) return
    void loadGraph()
  }, [loadGraph, open])

  useEffect(() => {
    if (!open) return
    const defaultSource = currentCertificateId || certificates[0]?.id || ''
    const defaultTarget = certificates.find((certificate) => certificate.id !== defaultSource)?.id || certificates[1]?.id || ''
    setSourceId(defaultSource)
    setTargetId(defaultTarget)
    setDependencyKind('hard')
    setNotes('')
  }, [open, currentCertificateId, certificates])

  const handleCreate = async () => {
    if (!projectId || !sourceId || !targetId) return
    setSaving(true)
    try {
      const response = await fetch('/api/pre-milestone-dependencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          source_milestone_id: sourceId,
          target_milestone_id: targetId,
          dependency_kind: dependencyKind,
          notes: notes.trim() || null,
        }),
      })
      const result = await response.json() as { success: boolean }
      if (result.success) {
        setNotes('')
        await loadGraph()
      }
    } catch (error) {
      console.error('Failed to create pre-milestone dependency', error)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (dependencyId: string) => {
    if (!projectId) return
    try {
      const response = await fetch(`/api/pre-milestone-dependencies/${encodeURIComponent(dependencyId)}`, {
        method: 'DELETE',
      })
      const result = await response.json() as { success: boolean }
      if (result.success) {
        await loadGraph()
      }
    } catch (error) {
      console.error('Failed to delete pre-milestone dependency', error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            前置证照依赖管理
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            管理项目内证照之间的前置关系，支持新增和删除。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h4 className="text-sm font-semibold text-slate-900">新增前置依赖</h4>
            <div className="mt-4 space-y-3">
              <div>
                <Label>前置证照</Label>
                <Select value={sourceId} onValueChange={setSourceId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="选择前置证照" />
                  </SelectTrigger>
                  <SelectContent>
                    {certificateOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>后置证照</Label>
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="选择后置证照" />
                  </SelectTrigger>
                  <SelectContent>
                    {certificateOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>依赖强度</Label>
                <Select value={dependencyKind} onValueChange={(value) => setDependencyKind(value as CertificateDependencyKind)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="选择依赖强度" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hard">强依赖</SelectItem>
                    <SelectItem value="soft">软依赖</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>备注</Label>
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="可选"
                  className="mt-1 min-h-20"
                />
              </div>
              <Button
                type="button"
                onClick={handleCreate}
                disabled={saving || !sourceId || !targetId || sourceId === targetId}
                className="w-full"
              >
                新增依赖
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">依赖列表</h4>
                <p className="mt-1 text-xs text-slate-500">当前项目内已存在的前置依赖。</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {dependencyEntries.length} 条
              </span>
            </div>
            <div className="mt-4 grid gap-2">
              {loading ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  正在加载依赖图...
                </div>
              ) : dependencyEntries.length > 0 ? dependencyEntries.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900">
                        {entry.sourceLabel}
                        <span className="mx-2 text-slate-400">→</span>
                        {entry.targetLabel}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {entry.sourceId} → {entry.targetId}
                        {entry.notes ? ` · ${entry.notes}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${entry.dependencyKind === 'soft' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
                        {entry.dependencyKind === 'soft' ? '软依赖' : '强依赖'}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleDelete(entry.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label="删除前置依赖"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  暂无前置依赖记录。
                </div>
              )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
