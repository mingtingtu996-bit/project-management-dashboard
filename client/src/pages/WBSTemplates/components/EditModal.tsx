import { useState } from 'react'
import type { WbsTemplate, ApiResponse } from '../types'
import { API_BASE, withCredentials } from '../utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useParams } from 'react-router-dom'
import { IconX } from './WbsIcons'

export function EditModal({
  template,
  onClose,
  onSuccess,
}: {
  template: WbsTemplate
  onClose: () => void
  onSuccess?: () => void
}) {
  const { id: projectId = '' } = useParams<{ id: string }>()
  const [name, setName] = useState(template.name)
  const [templateType, setTemplateType] = useState(template.template_type || '住宅')
  const [description, setDescription] = useState(template.description || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!name.trim()) {
      setError('请填写模板名称')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/wbs-templates/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          name: name.trim(),
          template_type: templateType,
          description: description.trim(),
        }),
        ...withCredentials(),
      })
      const result: ApiResponse = await res.json()
      if (result.success) {
        onSuccess?.()
        onClose()
      } else {
        setError(result.error?.message || '保存失败，请重试')
      }
    } catch {
      setError('网络错误，请重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-[4px] duration-200 fade-in-0"
      onClick={onClose}
    >
      <div
        className="w-[90%] max-w-[560px] animate-in rounded-2xl border border-slate-200 bg-white shadow-[var(--el-4)] duration-200 ease-bounce fade-in-0 zoom-in-95"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4">
          <h2 className="font-semibold text-slate-800">编辑模板</h2>
          <Button variant="ghost"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-600 transition-colors"
          >
            <IconX />
          </Button>
        </div>
        <Separator />
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">模板名称 *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例：18层住宅标准施工工序"
              className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">模板类型</label>
            <select
              value={templateType}
              onChange={e => setTemplateType(e.target.value)}
              className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {['住宅', '商业', '工业', '公共建筑'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">模板描述</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="简要描述该模板的适用场景..."
              className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>
        <Separator />
        <div className="flex justify-end gap-3 px-6 py-4">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={!name.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
          >
            保存
          </Button>
        </div>
      </div>
    </div>
  )
}
