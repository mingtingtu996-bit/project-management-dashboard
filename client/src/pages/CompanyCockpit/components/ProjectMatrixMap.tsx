import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type MatrixItem = {
  id: string
  name: string
  healthScore: number
  progress: number
  attentionCount: number
}

interface ProjectMatrixMapProps {
  items: MatrixItem[]
}

function bubbleTone(score: number) {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-blue-500'
  if (score >= 40) return 'bg-amber-400'
  return 'bg-red-500'
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function ProjectMatrixMap({ items }: ProjectMatrixMapProps) {
  return (
    <Card className="rounded-[24px] border border-slate-100 bg-slate-50 shadow-none">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="text-base font-semibold text-slate-900">项目矩阵地图</CardTitle>
        <p className="text-xs leading-5 text-slate-500">横轴看总体进度，纵轴看健康度，把项目放回公司层面的统一坐标中。</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
            暂无项目矩阵数据
          </div>
        ) : (
          <>
            <div className="relative h-[300px] rounded-2xl border border-white bg-white">
              {/* Grid lines */}
              <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-200" />
              <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-slate-200" />

              {/* Quadrant labels */}
              <div className="absolute left-[25%] top-[25%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-600">
                高健康·低进度
              </div>
              <div className="absolute left-[75%] top-[25%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-600">
                高健康·高进度
              </div>
              <div className="absolute left-[25%] top-[75%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-50 px-2 py-0.5 text-[10px] text-red-600">
                低健康·低进度
              </div>
              <div className="absolute left-[75%] top-[75%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-600">
                低健康·高进度
              </div>

              {/* Axis labels */}
              <div className="absolute left-2 top-2 text-[10px] text-slate-400">健康↑高</div>
              <div className="absolute bottom-2 left-2 text-[10px] text-slate-400">健康↓低</div>
              <div className="absolute bottom-2 left-2 right-2 flex justify-between text-[10px] text-slate-400">
                <span className="ml-12">进度 0%</span>
                <span>进度 100%</span>
              </div>

              {items.map((item) => {
                const left = clamp(item.progress, 2, 98)
                const top = clamp(100 - item.healthScore, 2, 98)
                const size = 18 + Math.min(item.attentionCount, 6) * 4

                return (
                  <div
                    key={item.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${left}%`, top: `${top}%` }}
                    title={`${item.name} · 进度 ${item.progress}% · 健康 ${item.healthScore} · 关注 ${item.attentionCount}`}
                  >
                    <div
                      className={`flex items-center justify-center rounded-full text-[10px] font-semibold text-white shadow-lg ring-2 ring-white ${bubbleTone(item.healthScore)}`}
                      style={{ width: `${size}px`, height: `${size}px` }}
                    >
                      {item.attentionCount > 0 ? item.attentionCount : ''}
                    </div>
                    <div className="mt-1 max-w-[80px] truncate text-center text-[10px] text-slate-600">{item.name}</div>
                  </div>
                )
              })}
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-slate-100 px-3 py-1">气泡大小 = 关注项数量</span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-600">绿 = 健康 80+</span>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-600">蓝 = 60-79</span>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-600">黄 = 40-59</span>
              <span className="rounded-full bg-red-50 px-3 py-1 text-red-600">红 = 预警</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
