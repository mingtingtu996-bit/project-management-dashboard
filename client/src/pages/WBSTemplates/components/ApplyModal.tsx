import { useState, useEffect } from 'react'
import type { WbsTemplate, ApiResponse, WbsProject } from '../types'
import { API_BASE, withCredentials, getTypeColor } from '../utils'
import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/ui/loading-state'
import { IconX, IconUpload } from './WbsIcons'
import { TemplateIcon } from './TemplateIcon'

export function ApplyModal({
  template,
  onClose,
  onSuccess,
}: {
  template: WbsTemplate
  onClose: () => void
  onSuccess: (projectId: string, projectName: string) => void
}) {
  const [projects, setProjects] = useState<WbsProject[]>([])
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [error, setError] = useState<string>('')

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/projects`)
        const result: ApiResponse<WbsProject[]> = await res.json()
        if (result.success && result.data) {
          setProjects(result.data)
          if (result.data.length > 0) {
            setSelectedProjectId(result.data[0].id)
          }
        }
      } catch {
        setError('加载项目数据失败')
      } finally {
        setLoading(false)
      }
    }
    fetchProjects()
  }, [])

  const handleApply = async () => {
    if (!selectedProjectId) {
      setError('请选择目标项目')
      return
    }
    setApplying(true)
    setError('')
    try {
      const res = await fetch('/api/planning/wbs-templates/bootstrap/from-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: selectedProjectId, template_id: template.id }),
        ...withCredentials(),
      })
      const result: ApiResponse = await res.json()
      if (result.success) {
        const proj = projects.find(p => p.id === selectedProjectId)
        onSuccess(selectedProjectId, proj?.name || '目标项目')
      } else {
        setError(result.error?.message || '生成基线草稿失败，请重试')
      }
    } catch {
      setError('网络错误，请重试')
    } finally {
      setApplying(false)
    }
  }

  const color = getTypeColor(template.template_type)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(15,23,42,0.5)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[500px]"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg ${color.bg} flex items-center justify-center`}>
              <TemplateIcon type={template.template_type} className="w-4 h-4" />
            </div>
              <div>
              <h2 className="font-semibold text-gray-800">生成项目基线草稿</h2>
              <p className="text-xs text-gray-400 mt-0.5">{template.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors">
            <IconX />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* 模板摘要 */}
          <div className="flex items-center gap-4 py-3 px-4 bg-gray-50 rounded-xl">
            <div className="text-center">
              <p className="text-lg font-bold text-gray-700">{template.node_count ?? '—'}</p>
              <p className="text-xs text-gray-400">任务节点</p>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div className="text-center">
              <p className="text-lg font-bold text-emerald-600">{template.reference_days ?? '—'}</p>
              <p className="text-xs text-gray-400">参考工期(天)</p>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div className="flex-1 text-xs text-gray-500 leading-relaxed">
              生成后会进入项目基线草稿页，不会直接写入任务表，后续可继续编辑、校核和确认。
            </div>
          </div>

          {/* 选择目标项目 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">选择目标项目</label>
            {loading ? (
              <LoadingState
                label="目标项目加载中"
                className="min-h-28"
              />
            ) : projects.length === 0 ? (
              <div className="text-sm text-gray-400 py-3 text-center">暂无可用项目</div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {projects.map(proj => (
                  <label
                    key={proj.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                      selectedProjectId === proj.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-100 hover:border-blue-200 bg-white'
                    }`}
                    onClick={() => setSelectedProjectId(proj.id)}
                  >
                    <input
                      type="radio"
                      name="project-select"
                      checked={selectedProjectId === proj.id}
                      onChange={() => setSelectedProjectId(proj.id)}
                      className="accent-blue-600"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{proj.name}</p>
                      {proj.status && (
                        <p className="text-xs text-gray-400 mt-0.5">{proj.status}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* 按钮 */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={onClose} disabled={applying}>
              取消
            </Button>
            <Button
              onClick={handleApply}
              loading={applying}
              disabled={!selectedProjectId || loading}
              className="bg-blue-600 text-white shadow-blue-200 hover:bg-blue-700"
            >
              <IconUpload />
              生成草稿
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
