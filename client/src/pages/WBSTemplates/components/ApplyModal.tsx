import { useState, useEffect } from 'react'
import type { WbsTemplate, ApiResponse, WbsProject } from '../types'
import { API_BASE, withCredentials, getTypeColor } from '../utils'
import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/ui/loading-state'
import { Separator } from '@/components/ui/separator'
import { useLoadingButton } from '@/hooks/useLoadingButton'
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
  const [projectError, setProjectError] = useState('')

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
      setProjectError('此字段必填')
      return
    }
    setApplying(true)
    setError('')
    setProjectError('')
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

  const applyButton = useLoadingButton(handleApply)

  const validateProjectSelection = () => {
    if (selectedProjectId) {
      setProjectError('')
      return true
    }

    setProjectError('此字段必填')
    return false
  }

  const color = getTypeColor(template.template_type)

  return (
    <div
      className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-[4px] duration-200 fade-in-0"
      onClick={onClose}
    >
      <div
        className="w-[90%] max-w-[560px] animate-in rounded-2xl border border-slate-200 bg-white shadow-[var(--el-4)] duration-200 ease-bounce fade-in-0 zoom-in-95"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg ${color.bg} flex items-center justify-center`}>
              <TemplateIcon type={template.template_type} className="w-4 h-4" />
            </div>
              <div>
              <h2 className="font-semibold text-slate-800">生成项目基线草稿</h2>
              <p className="text-xs text-slate-400 mt-0.5">{template.name}</p>
            </div>
          </div>
          <Button variant="ghost" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors">
            <IconX />
          </Button>
        </div>
        <Separator />

        <div className="p-6 space-y-4">
          {/* 模板摘要 */}
          <div className="flex items-center gap-4 py-3 px-4 bg-slate-50 rounded-xl">
            <div className="text-center">
              <p className="text-lg font-bold text-slate-700">{template.node_count ?? '—'}</p>
              <p className="text-xs text-slate-400">任务节点</p>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div className="text-center">
              <p className="text-lg font-bold text-emerald-600">{template.reference_days ?? '—'}</p>
              <p className="text-xs text-slate-400">参考工期(天)</p>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div className="flex-1 text-xs text-slate-500 leading-relaxed">
              生成后会进入项目基线草稿页，不会直接写入任务表，后续可继续编辑、校核和确认。
            </div>
          </div>

          {/* 选择目标项目 */}
          <div>
            <div id="apply-project-label" className="mb-2 block text-sm font-medium text-slate-700">选择目标项目</div>
            {loading ? (
              <LoadingState
                label="目标项目加载中"
                className="min-h-28"
              />
            ) : projects.length === 0 ? (
              <div className="text-sm text-slate-400 py-3 text-center">暂无可用项目</div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto" role="radiogroup" aria-labelledby="apply-project-label">
                {projects.map(proj => {
                  const inputId = `project-select-${proj.id}`
                  return (
                  <label
                    key={proj.id}
                    htmlFor={inputId}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                      selectedProjectId === proj.id
                        ? 'border-blue-500 bg-blue-50'
                        : projectError
                          ? 'border-red-500 bg-red-50'
                        : 'border-slate-100 hover:border-blue-200 bg-white'
                    }`}
                  >
                    <input
                      id={inputId}
                      type="radio"
                      name="project-select"
                      checked={selectedProjectId === proj.id}
                      onChange={() => {
                        setSelectedProjectId(proj.id)
                        setProjectError('')
                      }}
                      onBlur={validateProjectSelection}
                      className="accent-blue-600"
                      aria-invalid={Boolean(projectError)}
                      aria-describedby={projectError ? 'apply-project-error' : undefined}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{proj.name}</p>
                      {proj.status && (
                        <p className="text-xs text-slate-400 mt-0.5">{proj.status}</p>
                      )}
                    </div>
                  </label>
                  )
                })}
              </div>
            )}
            {projectError ? (
              <p id="apply-project-error" className="text-sm text-red-600" role="alert">
                {projectError}
              </p>
            ) : null}
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
              onClick={() => void applyButton.run()}
              loading={applying || applyButton.loading}
              disabled={!selectedProjectId || loading || applyButton.loading}
              className="bg-blue-600 text-white shadow-sm hover:bg-blue-700"
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
