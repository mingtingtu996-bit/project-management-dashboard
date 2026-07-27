// v1.4.22.1 §10.8: Custom business type aggregator + system example project admin
import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, PlusCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'

interface CustomBusinessTypeRow {
  name: string; parent_type: string; usage_count: number
}
interface ExampleProjectRow {
  id: string; name: string; business_type: string; total_area: number; location: string; description: string
}

export default function CustomBusinessTypeAdmin() {
  const { toast } = useToast()
  const [customTypes, setCustomTypes] = useState<CustomBusinessTypeRow[]>([])
  const [examples, setExamples] = useState<ExampleProjectRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ctRes, exRes] = await Promise.all([
        fetch('/api/admin/custom-business-types'),
        fetch('/api/system/example-projects'),
      ])
      const ct = await ctRes.json()
      const ex = await exRes.json()
      if (ct.success) setCustomTypes(ct.data as CustomBusinessTypeRow[])
      if (ex.success) setExamples(ex.data as ExampleProjectRow[])
    } catch { toast({ title: '加载失败', variant: 'destructive' }) }
    finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load])

  const handlePromote = async (slug: string, formalCode: string, label: string) => {
    try {
      await fetch(`/api/admin/custom-business-types/${slug}/promote`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formalCode, label }),
      })
      toast({ title: `已升级 ${label} 为正式业态候选` })
      load()
    } catch { toast({ title: '升级失败', variant: 'destructive' }) }
  }

  if (loading) {
    return <div className="page-shell bg-slate-50/80 min-h-screen flex items-center justify-center"><p className="text-slate-500">加载中...</p></div>
  }

  return (
    <div className="page-shell bg-slate-50/80 min-h-screen py-8">
      <div className="max-w-4xl mx-auto px-6 space-y-8">
        <h1 className="text-lg font-semibold text-slate-900">业态与示例项目管理</h1>

        {/* Custom business types */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-slate-800">自定义业态使用统计</h2>
          {customTypes.length === 0 ? (
            <p className="text-sm text-slate-400">暂无用户自定义业态。</p>
          ) : (
            <div className="space-y-2">
              {customTypes.map((ct, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white">
                  <div>
                    <span className="text-sm font-medium text-slate-900">{ct.name}</span>
                    <span className="text-xs text-slate-500 ml-2">母业态：{ct.parent_type}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 tabular-nums">使用 {ct.usage_count} 次</span>
                    <Button unstyled onClick={() => handlePromote(ct.name, ct.name.toLowerCase().replace(/\s+/g, '_'), ct.name)}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 outline-none">
                      <TrendingUp className="h-3 w-3" /> 升级为正式业态
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* System example projects */}
        <section className="space-y-4 border-t border-slate-200 pt-6">
          <h2 className="text-base font-semibold text-slate-800">系统示例项目</h2>
          {examples.length === 0 ? (
            <p className="text-sm text-slate-400">暂无系统示例项目。在项目详情中可标记为示例。</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {examples.map(ex => (
                <div key={ex.id} className="p-4 rounded-xl border border-slate-200 bg-white space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{ex.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{ex.business_type}</span>
                  </div>
                  <p className="text-xs text-slate-500">{ex.location} · {ex.total_area?.toLocaleString() ?? '-'} m²</p>
                  {ex.description && <p className="text-xs text-slate-400">{ex.description}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
