import { useState, useEffect } from 'react'
import type { WbsTemplate, ApiResponse, WbsProject } from '../types'
import { API_BASE, withCredentials, getTypeColor } from '../utils'
import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/ui/loading-state'
import { IconX, IconInfo, IconUpload } from './WbsIcons'
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
  // F2: 追加/覆盖模式
  const [applyMode, setApplyMode] = useState<'append' | 'overwrite'>('append')
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false)

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
    if (applyMode === 'overwrite' && !overwriteConfirmed) {
      setError('请勾选确认框后再继续')
      return
    }
    setApplying(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/wbs-templates/${template.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selectedProjectId, overwrite: applyMode === 'overwrite' }),
        ...withCredentials(),
      })
      const result: ApiResponse = await res.json()
      if (result.success) {
        const proj = projects.find(p => p.id === selectedProjectId)
        onSuccess(selectedProjectId, proj?.name || '目标项目')
      } else {
        setError(result.error?.message || '应用失败，请重试')
      }
    } catch {
      setError('网络错误，请重试')
    } finally {
      setApplying(false)
    }
  }

  // 切换模式时重置确认状态
  const handleModeChange = (mode: 'append' | 'overwrite') => {
    setApplyMode(mode)
    setOverwriteConfirmed(false)
    setError('')
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
              <h2 className="font-semibold text-gray-800">应用 WBS 模板</h2>
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
              应用后可在任务列表中自由编辑：修改名称、调整层级、增删节点、设置依赖关系
            </div>
          </div>

          {/* F2: 应用模式选择 */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">应用方式</p>
            <div className="grid grid-cols-2 gap-2">
              <label
                onClick={() => handleModeChange('append')}
                className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${applyMode === 'append' ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-blue-200'}`}
              >
                <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 transition-colors ${applyMode === 'append' ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                  {applyMode === 'append' && <div className="w-full h-full flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-white" /></div>}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">追加</p>
                </div>
              </label>
              <label
                onClick={() => handleModeChange('overwrite')}
                className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${applyMode === 'overwrite' ? 'border-red-400 bg-red-50' : 'border-gray-100 hover:border-red-200'}`}
              >
                <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 transition-colors ${applyMode === 'overwrite' ? 'border-red-500 bg-red-500' : 'border-gray-300'}`}>
                  {applyMode === 'overwrite' && <div className="w-full h-full flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-white" /></div>}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">覆盖</p>
                </div>
              </label>
            </div>
          </div>

          {/* F2: 覆盖模式红色警告 + 确认复选框 */}
          {applyMode === 'overwrite' && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-red-700">⚠️ 危险操作：将删除所有现有任务</p>
                  <p className="text-xs text-red-600 mt-1 leading-relaxed">
                    覆盖模式会<strong>永久删除</strong>该项目中的所有现有任务（包括进度、条件、阻碍等关联数据），然后创建模板中的任务结构。此操作<strong>不可撤销</strong>。
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  checked={overwriteConfirmed}
                  onChange={e => setOverwriteConfirmed(e.target.checked)}
                  className="w-4 h-4 rounded border-red-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-sm text-red-700 group-hover:text-red-800">
                  我了解风险，确认删除所有现有任务并应用模板
                </span>
              </label>
            </div>
          )}

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
                        ? (applyMode === 'overwrite' ? 'border-red-400 bg-red-50' : 'border-blue-500 bg-blue-50')
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

          {/* 追加模式注意事项 */}
          {applyMode === 'append' && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-2">
              <IconInfo className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">应用将在所选项目中创建模板中的任务结构。已有任务不会被删除，新任务会追加到现有任务列表末尾。</p>
            </div>
          )}

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
              disabled={!selectedProjectId || loading || (applyMode === 'overwrite' && !overwriteConfirmed)}
              className={applyMode === 'overwrite' ? 'bg-red-600 hover:bg-red-700 shadow-red-200 text-white' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200 text-white'}
            >
              <IconUpload />
              {applyMode === 'overwrite' ? '覆盖并应用' : '确认应用'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
