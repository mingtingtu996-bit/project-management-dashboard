import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useStore } from '@/hooks/useStore'
import { useProjectInit } from '@/hooks/useProjectInit'
import { DashboardApiService, type ProjectSummary } from '@/services/dashboardApi'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ReportsSkeleton } from '@/components/ui/page-skeleton'
import {
  GanttChart,
  AlertTriangle,
  Flag,
  BarChart3,
  Users,
  Plus,
  ArrowLeft,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import OnlineMembers from '@/components/OnlineMembers'

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isLoaded, isLoading } = useProjectInit()
  const { currentProject, tasks, risks, milestones } = useStore()
  const [summary, setSummary] = useState<ProjectSummary | null>(null)
  const [showWbsReport, setShowWbsReport] = useState(false)

  useEffect(() => {
    let active = true

    const loadSummary = async () => {
      if (!currentProject?.id) {
        setSummary(null)
        return
      }

      try {
        const nextSummary = await DashboardApiService.getProjectSummary(currentProject.id)
        if (active) setSummary(nextSummary)
      } catch {
        if (active) setSummary(null)
      }
    }

    loadSummary()
    return () => {
      active = false
    }
  }, [currentProject?.id])

  const loading = isLoading || !isLoaded

  // 璁＄畻缁熻鏁版嵁
  const totalTasks = summary?.totalTasks ?? tasks.length
  const completedTasks = summary?.completedTaskCount ?? tasks.filter((t) => t.status === 'completed').length
  const inProgressTasks = summary?.inProgressTaskCount ?? tasks.filter((t) => t.status === 'in_progress').length
  const highRisks = summary?.activeRiskCount ?? risks.filter((r) => r.level === 'high' || r.level === 'critical').length
  const upcomingMilestones = milestones.filter((m) => m.status === 'pending')
  const completionRate = summary?.overallProgress ?? (totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0)


  // WBS瀹屾垚搴﹀脊绐楁暟鎹?
  const wbsReportRows = tasks.map(t => {
    const statusLabel = t.status === 'completed' ? '宸插畬鎴? : t.status === 'in_progress' ? '杩涜涓? : '鏈紑濮?
    const isOverdue = !!(t.end_date && t.status !== 'completed' && new Date(t.end_date) < new Date())
    return { name: t.title || (t as any).name, phase: (t as any).phase || '-', status: statusLabel, progress: t.progress ?? 0, endDate: t.end_date, isOverdue }
  })

  if (loading) {
    return (
      <div className="p-6">
        <ReportsSkeleton />
      </div>
    )
  }

  if (!currentProject) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">椤圭洰涓嶅瓨鍦?/p>
        <Button className="mt-4" onClick={() => navigate('/projects')}>
          杩斿洖椤圭洰鍒楄〃
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 page-enter">
      {/* 杩斿洖鎸夐挳 */}
      <Button variant="ghost" onClick={() => navigate('/projects')} className="-ml-4">
        <ArrowLeft className="mr-2 h-4 w-4" />
        杩斿洖椤圭洰鍒楄〃
      </Button>

      {/* 椤圭洰淇℃伅 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">{currentProject.name}</h1>
          {currentProject.description && (
            <p className="text-muted-foreground mt-1">{currentProject.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => setShowWbsReport(true)}>
            <BarChart3 className="mr-2 h-4 w-4" />
            鏌ョ湅WBS姒傝
          </Button>
          <div className="w-64">
            <OnlineMembers projectId={id!} />
          </div>
        </div>
      </div>

      {/* 缁熻姒傝 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">浠诲姟瀹屾垚鐜?/CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completionRate}%</div>
            <p className="text-xs text-muted-foreground">
              {completedTasks}/{totalTasks} 浠诲姟
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">杩涜涓?/CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{inProgressTasks}</div>
            <p className="text-xs text-muted-foreground">姝ｅ湪鎵ц</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">楂橀闄?/CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{highRisks}</div>
            <p className="text-xs text-muted-foreground">闇€鍏虫敞</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">寰呭畬鎴愰噷绋嬬</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{upcomingMilestones.length}</div>
            <p className="text-xs text-muted-foreground">鍗冲皢鍒版湡</p>
          </CardContent>
        </Card>
      </div>

      {/* 蹇嵎鎿嶄綔 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Link to={`/projects/${id}/gantt`}>
          <Card className="hover:shadow-md transition-all cursor-pointer hover:-translate-y-1">
            <CardContent className="pt-6 text-center">
              <GanttChart className="h-8 w-8 mx-auto mb-2 text-primary" />
              <span className="text-sm font-medium">鐢樼壒鍥?/span>
            </CardContent>
          </Card>
        </Link>

        <Link to={`/projects/${id}/risks`}>
          <Card className="hover:shadow-md transition-all cursor-pointer hover:-translate-y-1">
            <CardContent className="pt-6 text-center">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-primary" />
              <span className="text-sm font-medium">椋庨櫓绠＄悊</span>
            </CardContent>
          </Card>
        </Link>

        <Link to={`/projects/${id}/milestones`}>
          <Card className="hover:shadow-md transition-all cursor-pointer hover:-translate-y-1">
            <CardContent className="pt-6 text-center">
              <Flag className="h-8 w-8 mx-auto mb-2 text-primary" />
              <span className="text-sm font-medium">閲岀▼纰?/span>
            </CardContent>
          </Card>
        </Link>

        <Link to={`/projects/${id}/reports`}>
          <Card className="hover:shadow-md transition-all cursor-pointer hover:-translate-y-1">
            <CardContent className="pt-6 text-center">
              <BarChart3 className="h-8 w-8 mx-auto mb-2 text-primary" />
              <span className="text-sm font-medium">鎶ヨ〃</span>
            </CardContent>
          </Card>
        </Link>

        <Link to={`/projects/${id}/team`}>
          <Card className="hover:shadow-md transition-all cursor-pointer hover:-translate-y-1">
            <CardContent className="pt-6 text-center">
              <Users className="h-8 w-8 mx-auto mb-2 text-primary" />
              <span className="text-sm font-medium">鍥㈤槦</span>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* 浠诲姟鍒楄〃棰勮 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>鏈€杩戜换鍔?/CardTitle>
            <Link to={`/projects/${id}/gantt`}>
              <Button variant="ghost" size="sm">
                鏌ョ湅鍏ㄩ儴
                <ArrowLeft className="ml-2 h-4 w-4 rotate-180" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              鏆傛棤浠诲姟锛?Link to={`/projects/${id}/gantt`} className="text-primary hover:underline">鍘绘坊鍔?/Link>
            </p>
          ) : (
            <div className="space-y-2">
              {tasks.slice(0, 5).map(task => (
                <div key={task.id} className="flex items-center justify-between p-2 rounded-md hover:bg-accent">
                  <div className="flex items-center gap-3">
                    {task.status === 'completed' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : task.status === 'in_progress' ? (
                      <Clock className="h-4 w-4 text-blue-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-gray-400" />
                    )}
                    <span>{task.title}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {task.progress || 0}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* WBS瀹屾垚搴﹀脊绐?*/}
      <Dialog open={showWbsReport} onOpenChange={setShowWbsReport}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />WBS瀹屾垚搴︽瑙?/DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-600">{totalTasks}</div>
                <div className="text-xs text-muted-foreground mt-1">鎬讳换鍔℃暟</div>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-600">{completedTasks}</div>
                <div className="text-xs text-muted-foreground mt-1">宸插畬鎴?/div>
              </div>
              <div className="bg-yellow-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-yellow-600">{inProgressTasks}</div>
                <div className="text-xs text-muted-foreground mt-1">杩涜涓?/div>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-purple-600">{completionRate}%</div>
                <div className="text-xs text-muted-foreground mt-1">瀹屾垚鐜?/div>
              </div>
            </div>
            {wbsReportRows.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">鏆傛棤浠诲姟鏁版嵁</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-50 text-left">
                    <th className="px-3 py-2 font-medium">浠诲姟鍚嶇О</th>
                    <th className="px-3 py-2 font-medium">闃舵</th>
                    <th className="px-3 py-2 font-medium">鐘舵€?/th>
                    <th className="px-3 py-2 font-medium">杩涘害</th>
                    <th className="px-3 py-2 font-medium">鎴鏃ユ湡</th>
                    <th className="px-3 py-2 font-medium">閫炬湡</th>
                  </tr></thead>
                  <tbody>{wbsReportRows.map((r, i) => (
                    <tr key={i} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.phase}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${r.status === '宸插畬鎴? ? 'bg-emerald-100 text-emerald-700' : r.status === '杩涜涓? ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${r.progress}%` }} />
                          </div>
                          <span>{r.progress}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.endDate ? formatDate(r.endDate) : '-'}</td>
                      <td className="px-3 py-2">{r.isOverdue ? <span className="text-xs text-red-600">鏄?/span> : <span className="text-xs text-gray-400">鍚?/span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowWbsReport(false)}>鍏抽棴</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}




