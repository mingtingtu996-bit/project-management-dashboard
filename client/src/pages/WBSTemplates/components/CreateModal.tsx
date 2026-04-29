import { useState } from 'react'
import type { ApiResponse } from '../types'
import { API_BASE, withCredentials } from '../utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useLoadingButton } from '@/hooks/useLoadingButton'
import { useParams } from 'react-router-dom'
import { IconX, IconChevronRight, IconUpload } from './WbsIcons'

export function CreateModal({ onClose, onSuccess }: { onClose: () => void; onSuccess?: () => void }) {
  const { id: projectId = '' } = useParams<{ id: string }>()
  const [createType, setCreateType] = useState<'manual' | 'excel' | 'fromProject'>('manual')
  const [step, setStep] = useState<1 | 2>(1)
  const [creating, setCreating] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateType, setTemplateType] = useState('住宅')
  const [createError, setCreateError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  // Excel 导入
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [excelUploading, setExcelUploading] = useState(false)

  const CARD_TYPES = [
    {
      key: 'manual' as const,
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      title: '新建空白模板',
      desc: '',
      badge: '完全自定义',
      badgeColor: 'bg-slate-100 text-slate-500',
    },
    {
      key: 'excel' as const,
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
      ),
      title: '导入 Excel 模板',
      desc: '',
      badge: '快速导入',
      badgeColor: 'bg-emerald-50 text-emerald-600',
    },
    {
      key: 'fromProject' as const,
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      ),
      title: '从现有项目生成',
      desc: '',
      badge: '快速复用',
      badgeColor: 'bg-blue-50 text-blue-600',
    },
  ]

  const handleNext = () => {
    setCreateError('')
    if (createType === 'excel' && !excelFile) {
      setCreateError('请先选择 Excel 文件')
      return
    }
    if (createType === 'fromProject') {
      setCreateError('从现有项目生成功能即将上线，请先使用「新建空白模板」方式')
      return
    }
    setStep(2)
  }

  const handleExcelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      setCreateError('仅支持 .xlsx / .xls / .csv 格式')
      return
    }
    setExcelFile(file)
    setCreateError('')
    setFieldErrors((current) => {
      const next = { ...current }
      delete next.excelFile
      return next
    })
    // 从文件名推断模板名
    const baseName = file.name.replace(/\.(xlsx|xls|csv)$/i, '')
    if (!templateName) setTemplateName(baseName)
  }

  const handleCreate = async () => {
    if (!validateRequired('templateName', templateName)) {
      return
    }
    setCreating(true)
    setCreateError('')

    try {
      if (createType === 'excel' && excelFile) {
        // Excel 导入：multipart/form-data
        setExcelUploading(true)
        const formData = new FormData()
        formData.append('file', excelFile)
        formData.append('name', templateName.trim())
        formData.append('template_type', templateType)
        formData.append('project_id', projectId)
        const res = await fetch(`${API_BASE}/api/wbs-templates/import-excel`, {
          method: 'POST',
          body: formData,
          ...withCredentials(),
        })
        const result: ApiResponse = await res.json()
        if (result.success) {
          onSuccess?.()
          onClose()
        } else {
          setCreateError(result.error?.message || '导入失败，请检查文件格式')
        }
        setExcelUploading(false)
      } else {
        // 手动新建
        const res = await fetch(`${API_BASE}/api/wbs-templates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: projectId,
            name: templateName.trim(),
            template_type: templateType,
            description: '',
            template_data: [],
            is_default: true, // 新建默认为草稿
          }),
          ...withCredentials(),
        })
        const result: ApiResponse = await res.json()
        if (result.success) {
          onSuccess?.()
          onClose()
        } else {
          setCreateError(result.error?.message || '创建失败，请重试')
        }
      }
    } catch {
      setCreateError('网络错误，请重试')
    } finally {
      setCreating(false)
      setExcelUploading(false)
    }
  }

  const clearFieldError = (field: string) => {
    setFieldErrors((current) => {
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const validateRequired = (field: string, value: string) => {
    if (value.trim()) {
      clearFieldError(field)
      return true
    }

    setFieldErrors((current) => ({ ...current, [field]: '此字段必填' }))
    return false
  }

  const createButton = useLoadingButton(handleCreate)

  return (
    <div
      className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-[4px] duration-200 fade-in-0"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-[90%] max-w-[720px] animate-in overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[var(--el-4)] duration-200 ease-bounce fade-in-0 zoom-in-95"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4">
          <h2 className="font-semibold text-slate-800">新建 WBS 模板</h2>
          <Button variant="ghost" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors">
            <IconX />
          </Button>
        </div>
        <Separator />

        <div className="p-6">
          {/* 步骤指示器 */}
          <div className="flex items-center gap-0 mb-8">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>1</div>
              <span className={`text-sm font-medium transition-colors ${step >= 1 ? 'text-blue-600' : 'text-slate-400'}`}>选择创建方式</span>
            </div>
            <div className="flex-1 h-px bg-slate-200 mx-3" />
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>2</div>
              <span className={`text-sm font-medium transition-colors ${step >= 2 ? 'text-blue-600' : 'text-slate-400'}`}>基本信息</span>
            </div>
          </div>

          {step === 1 && (
            <>
              <p className="text-sm font-medium text-slate-700 mb-4">选择模板创建方式</p>
              {/* F1: 横排三张卡片 */}
              <div className="grid grid-cols-3 gap-3">
                {CARD_TYPES.map(card => (
                  <div
                    key={card.key}
                    onClick={() => setCreateType(card.key)}
                    className={`relative flex flex-col items-center text-center gap-3 p-5 rounded-xl border-2 cursor-pointer transition-all duration-150 ${
                      createType === card.key
                        ? 'border-blue-500 bg-blue-50 shadow-sm'
                        : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center transition-colors ${createType === card.key ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                      {card.icon}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800 mb-1">{card.title}</p>
                      {card.desc ? <p className="text-xs text-slate-500 leading-relaxed">{card.desc}</p> : null}
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${card.badgeColor}`}>
                      {card.badge}
                    </span>
                    {/* 选中指示器 */}
                    {createType === card.key && (
                      <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Excel 文件选择区（仅 excel 模式） */}
              {createType === 'excel' && (
                <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  <label htmlFor="wbs-template-excel-file" className="flex flex-col items-center gap-2 cursor-pointer">
                    <IconUpload className="w-6 h-6 text-slate-400" />
                    <span className="text-sm text-slate-500">
                      {excelFile ? (
                        <span className="text-emerald-600 font-medium">✓ {excelFile.name}</span>
                      ) : (
                        'Excel 文件'
                      )}
                    </span>
                    <input id="wbs-template-excel-file" type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelFileChange} />
                  </label>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label htmlFor="wbs-template-name" className="block text-xs text-slate-500 mb-1">模板名称 *</label>
                <input
                  id="wbs-template-name"
                  type="text"
                  value={templateName}
                  onChange={e => {
                    setTemplateName(e.target.value)
                    if (fieldErrors.templateName) clearFieldError('templateName')
                  }}
                  onBlur={() => validateRequired('templateName', templateName)}
                  aria-invalid={Boolean(fieldErrors.templateName)}
                  aria-describedby={fieldErrors.templateName ? 'wbs-template-name-error' : undefined}
                  placeholder="例：18层住宅标准施工工序"
                  className={`w-full text-sm px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${fieldErrors.templateName ? 'border-red-500' : 'border-slate-200'}`}
                  autoFocus
                />
                {fieldErrors.templateName ? (
                  <p id="wbs-template-name-error" className="text-sm text-red-600" role="alert">
                    {fieldErrors.templateName}
                  </p>
                ) : null}
              </div>
              <div>
                <label htmlFor="wbs-template-type" className="block text-xs text-slate-500 mb-1">模板类型</label>
                <select
                  id="wbs-template-type"
                  value={templateType}
                  onChange={e => setTemplateType(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {['住宅', '商业', '工业', '公共建筑'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              {createType === 'excel' && excelFile && (
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs text-emerald-700">将从 <strong>{excelFile.name}</strong> 解析任务结构</span>
                </div>
              )}
            </div>
          )}

          {/* 错误提示 */}
          {createError && (
            <p className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">{createError}</p>
          )}

          {/* 底部按钮 */}
          <div className="flex justify-between mt-6">
            <Button variant="ghost" onClick={step === 2 ? () => setStep(1) : onClose} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">
              {step === 2 ? '返回' : '取消'}
            </Button>
            {step === 1 ? (
              <Button
                onClick={handleNext}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
              >
                下一步
                <IconChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={() => void createButton.run()}
                loading={creating || excelUploading || createButton.loading}
                disabled={!templateName.trim() || createButton.loading}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
              >
                创建模板
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
