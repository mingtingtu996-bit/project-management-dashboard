import { Dispatch, SetStateAction } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { CertificateBoardItem, CertificateWorkItem, CertificateWorkItemFormData } from '../types'
import { CERTIFICATE_ORDER, CERTIFICATE_STAGE_SEQUENCE } from '../constants'

interface CertificateWorkItemDialogProps {
  open: boolean
  mode: 'create' | 'edit'
  formData: CertificateWorkItemFormData
  setFormData: Dispatch<SetStateAction<CertificateWorkItemFormData>>
  certificates: CertificateBoardItem[]
  onClose: () => void
  onSave: () => void
  onToggleCertificate: (certificateId: string) => void
  editingItem?: CertificateWorkItem | null
}

export function CertificateWorkItemDialog({
  open,
  mode,
  formData,
  setFormData,
  certificates,
  onClose,
  onSave,
  onToggleCertificate,
  editingItem,
}: CertificateWorkItemDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '新增办理事项' : '编辑办理事项'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-slate-700">办理事项</span>
            <input
              value={formData.item_name}
              onChange={(event) => setFormData((previous) => ({ ...previous, item_name: event.target.value }))}
              className="rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              placeholder="例如：共享资料收集"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-slate-700">事项编码</span>
            <input
              value={formData.item_code}
              onChange={(event) => setFormData((previous) => ({ ...previous, item_code: event.target.value }))}
              className="rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              placeholder="可选"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-slate-700">当前阶段</span>
            <select
              value={formData.item_stage}
              onChange={(event) => setFormData((previous) => ({ ...previous, item_stage: event.target.value as CertificateWorkItemFormData['item_stage'] }))}
              className="rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            >
              {CERTIFICATE_STAGE_SEQUENCE.map((stage) => (
                <option key={stage} value={stage}>{stage}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-slate-700">当前状态</span>
            <select
              value={formData.status}
              onChange={(event) => setFormData((previous) => ({ ...previous, status: event.target.value }))}
              className="rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            >
              <option value="pending">待启动</option>
              <option value="preparing_documents">资料准备中</option>
              <option value="internal_review">报审中</option>
              <option value="external_submission">报批中</option>
              <option value="supplement_required">待补正</option>
              <option value="approved">已批复</option>
              <option value="issued">已领证</option>
              <option value="expired">已失效</option>
              <option value="voided">已作废</option>
            </select>
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-slate-700">计划完成日期</span>
            <input
              type="date"
              value={formData.planned_finish_date}
              onChange={(event) => setFormData((previous) => ({ ...previous, planned_finish_date: event.target.value }))}
              className="rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-slate-700">实际完成日期</span>
            <input
              type="date"
              value={formData.actual_finish_date}
              onChange={(event) => setFormData((previous) => ({ ...previous, actual_finish_date: event.target.value }))}
              className="rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-slate-700">审批部门</span>
            <input
              value={formData.approving_authority}
              onChange={(event) => setFormData((previous) => ({ ...previous, approving_authority: event.target.value }))}
              className="rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              placeholder="例如：规划局"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-slate-700">下一动作</span>
            <input
              value={formData.next_action}
              onChange={(event) => setFormData((previous) => ({ ...previous, next_action: event.target.value }))}
              className="rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              placeholder="例如：补齐盖章资料"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-slate-700">下一动作截止</span>
            <input
              type="date"
              value={formData.next_action_due_date}
              onChange={(event) => setFormData((previous) => ({ ...previous, next_action_due_date: event.target.value }))}
              className="rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label className="grid gap-2 text-sm md:col-span-2">
            <span className="font-medium text-slate-700">阻塞原因</span>
            <textarea
              value={formData.block_reason}
              onChange={(event) => setFormData((previous) => ({ ...previous, block_reason: event.target.value }))}
              className="min-h-20 rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              placeholder="阻塞来源"
            />
          </label>

          <label className="grid gap-2 text-sm md:col-span-2">
            <span className="font-medium text-slate-700">备注</span>
            <textarea
              value={formData.notes}
              onChange={(event) => setFormData((previous) => ({ ...previous, notes: event.target.value }))}
              className="min-h-20 rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              placeholder="跟进备注"
            />
          </label>

          <div className="md:col-span-2 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-medium text-slate-700">关联证件</div>
            <div className="flex flex-wrap gap-2">
              {CERTIFICATE_ORDER.map((entry) => {
                const matchingCertificate = certificates.find((item) => item.certificate_type === entry.id)
                const certificateId = matchingCertificate?.id ?? null
                const active = certificateId ? formData.certificate_ids.includes(certificateId) : false
                const disabled = !certificateId
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => certificateId && onToggleCertificate(certificateId)}
                    disabled={disabled}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      disabled
                        ? 'cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400'
                        : active
                        ? 'border-blue-300 bg-blue-100 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {entry.label}
                  </button>
                )
              })}
            </div>
            <div className="text-xs text-slate-500">可多选，多个证件共享同一事项时会在看板与条带中联动高亮。</div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={onSave}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
