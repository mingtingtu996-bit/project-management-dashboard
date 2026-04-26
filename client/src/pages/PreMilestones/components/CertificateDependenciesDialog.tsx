import { useEffect, useMemo, useState } from 'react'
import { Link2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type {
  CertificateBoardItem,
  CertificateDependency,
  CertificateDependencyKind,
  CertificateDependencyTargetType,
  CertificateWorkItem,
} from '../types'

interface DependencyPayload {
  predecessor_type: CertificateDependencyTargetType
  predecessor_id: string
  successor_type: CertificateDependencyTargetType
  successor_id: string
  dependency_kind: CertificateDependencyKind
  notes?: string | null
}

interface CertificateDependenciesDialogProps {
  open: boolean
  currentCertificateId?: string | null
  currentCertificateName?: string | null
  selectedWorkItemId?: string | null
  certificates: CertificateBoardItem[]
  workItems: CertificateWorkItem[]
  dependencies: CertificateDependency[]
  onClose: () => void
  onCreateDependency: (payload: DependencyPayload) => Promise<void> | void
  onDeleteDependency: (dependencyId: string) => Promise<void> | void
}

function resolveCertificateName(certificates: CertificateBoardItem[], certificateId: string) {
  return certificates.find((certificate) => certificate.id === certificateId)?.certificate_name || certificateId
}

function resolveWorkItemName(workItems: CertificateWorkItem[], workItemId: string) {
  return workItems.find((item) => item.id === workItemId)?.item_name || workItemId
}

function buildCandidateLabel(
  type: CertificateDependencyTargetType,
  id: string,
  certificates: CertificateBoardItem[],
  workItems: CertificateWorkItem[],
) {
  return type === 'certificate'
    ? resolveCertificateName(certificates, id)
    : resolveWorkItemName(workItems, id)
}

export function CertificateDependenciesDialog({
  open,
  currentCertificateId,
  currentCertificateName,
  selectedWorkItemId,
  certificates,
  workItems,
  dependencies,
  onClose,
  onCreateDependency,
  onDeleteDependency,
}: CertificateDependenciesDialogProps) {
  const [predecessorType, setPredecessorType] = useState<CertificateDependencyTargetType>('certificate')
  const [predecessorId, setPredecessorId] = useState('')
  const [successorType, setSuccessorType] = useState<CertificateDependencyTargetType>('work_item')
  const [successorId, setSuccessorId] = useState('')
  const [dependencyKind, setDependencyKind] = useState<CertificateDependencyKind>('hard')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const certificateOptions = useMemo(
    () => certificates.map((certificate) => ({ id: certificate.id, label: certificate.certificate_name })),
    [certificates],
  )
  const workItemOptions = useMemo(
    () => workItems.map((item) => ({ id: item.id, label: item.item_name })),
    [workItems],
  )

  useEffect(() => {
    if (!open) return
    setPredecessorType('certificate')
    setPredecessorId(currentCertificateId || certificates[0]?.id || '')
    setSuccessorType(selectedWorkItemId ? 'work_item' : 'certificate')
    setSuccessorId(
      selectedWorkItemId ||
      certificates.find((certificate) => certificate.id !== currentCertificateId)?.id ||
      certificates[0]?.id ||
      workItems[0]?.id ||
      '',
    )
    setDependencyKind('hard')
    setNotes('')
  }, [open, currentCertificateId, certificates, selectedWorkItemId, workItems])

  const predecessorOptions = predecessorType === 'certificate' ? certificateOptions : workItemOptions
  const successorOptions = successorType === 'certificate' ? certificateOptions : workItemOptions

  const handleSubmit = async () => {
    if (!predecessorId || !successorId) return
    setSaving(true)
    try {
      await onCreateDependency({
        predecessor_type: predecessorType,
        predecessor_id: predecessorId,
        successor_type: successorType,
        successor_id: successorId,
        dependency_kind: dependencyKind,
        notes: notes.trim() || null,
      })
      setNotes('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            证照依赖管理
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            维护当前证照与办理事项之间的显式依赖关系。
            当前证照：{currentCertificateName || currentCertificateId || '待选择'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h4 className="text-sm font-semibold text-slate-900">新增依赖</h4>
            <div className="mt-4 space-y-3">
              <div>
                <Label>前驱类型</Label>
                <Select value={predecessorType} onValueChange={(value) => setPredecessorType(value as CertificateDependencyTargetType)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="选择前驱类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="certificate">证照</SelectItem>
                    <SelectItem value="work_item">办理事项</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>前驱对象</Label>
                <Select value={predecessorId} onValueChange={setPredecessorId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="选择前驱对象" />
                  </SelectTrigger>
                  <SelectContent>
                    {predecessorOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>后继类型</Label>
                <Select value={successorType} onValueChange={(value) => setSuccessorType(value as CertificateDependencyTargetType)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="选择后继类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="certificate">证照</SelectItem>
                    <SelectItem value="work_item">办理事项</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>后继对象</Label>
                <Select value={successorId} onValueChange={setSuccessorId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="选择后继对象" />
                  </SelectTrigger>
                  <SelectContent>
                    {successorOptions.map((option) => (
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
                onClick={handleSubmit}
                disabled={saving || !predecessorId || !successorId}
                className="w-full"
              >
                新增依赖
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">已有依赖</h4>
                <p className="mt-1 text-xs text-slate-500">可直接删除无效依赖关系。</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {dependencies.length} 条
              </span>
            </div>
            <div className="mt-4 grid gap-2">
              {dependencies.length > 0 ? dependencies.map((dependency) => {
                const predecessorLabel = buildCandidateLabel(
                  dependency.predecessor_type,
                  dependency.predecessor_id,
                  certificates,
                  workItems,
                )
                const successorLabel = buildCandidateLabel(
                  dependency.successor_type,
                  dependency.successor_id,
                  certificates,
                  workItems,
                )
                return (
                  <div key={dependency.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900">
                          {predecessorLabel}
                          <span className="mx-2 text-slate-400">→</span>
                          {successorLabel}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {dependency.predecessor_type} → {dependency.successor_type}
                          {dependency.notes ? ` · ${dependency.notes}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${dependency.dependency_kind === 'soft' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
                          {dependency.dependency_kind === 'soft' ? '软依赖' : '强依赖'}
                        </span>
                        <button
                          type="button"
                          onClick={() => void onDeleteDependency(dependency.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="删除依赖"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              }) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  暂无依赖记录。
                </div>
              )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
