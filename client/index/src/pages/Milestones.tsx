import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '@/hooks/useStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { ArrowLeft, Plus, Flag, Trash2, CheckCircle2, Clock, AlertCircle, Calendar, TrendingUp } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { milestoneDb, taskDb, generateId } from '@/lib/localDb'
import { MilestonesSkeleton } from '@/components/ui/page-skeleton'

// Milestone类型（本地版本）
interface Milestone {
  id: string
  project_id: string
  name: string
  description?: string
  target_date?: string
  status?: string
  created_at: string
  updated_at: string
}

export default function Milestones() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { milestones, setMilestones, addMilestone, updateMilestone, tasks, setTasks } = useStore()
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formData, setFormData] = useState({ name: '', description: '', target_date: '', status: 'pending', related_task_ids: [] as string[] })

  useEffect(() => { 
    if (id) {
      loadMilestones()
      // 加载任务数据
      const taskData = taskDb.getByProject(id)
      setTasks(taskData)
    }
  }, [id])

  // 计算里程碑进度
  const getMilestoneProgress = (milestone: Milestone): number => {
    const milestoneTasks = (tasks as any[]).filter(t => 
      (t.milestone_id === milestone.id || t.related_milestone === milestone.id) &&
      t.status === 'completed'
    )
    const totalMilestoneTasks = (tasks as any[]).filter(t => 
      t.milestone_id === milestone.id || t.related_milestone === milestone.id
    )
    if (totalMilestoneTasks.length === 0) return milestone.status === 'completed' ? 100 : 0
    return Math.round((milestoneTasks.length / totalMilestoneTasks.length) * 100)
  }

  // 获取里程碑到期状态
  const getMilestoneStatus = (milestone: Milestone): 'upcoming' | 'soon' | 'overdue' | 'completed' => {
    if (milestone.status === 'completed') return 'completed'
    if (!milestone.target_date) return 'upcoming'
    const today = new Date()
    const target = new Date(milestone.target_date)
    const daysUntil = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (daysUntil < 0) return 'overdue'
    if (daysUntil <= 7) return 'soon'
    return 'upcoming'
  }

  // 逾期优先排序：overdue 排最前，再按目标日期升序
  const sortedMilestones = useMemo(() => {
    return [...milestones].sort((a, b) => {
      const aOverdue = getMilestoneStatus(a) === 'overdue' ? 0 : 1
      const bOverdue = getMilestoneStatus(b) === 'overdue' ? 0 : 1
      if (aOverdue !== bOverdue) return aOverdue - bOverdue
      if (!a.target_date) return 1
      if (!b.target_date) return -1
      return new Date(a.target_date).getTime() - new Date(b.target_date).getTime()
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestones])

  const loadMilestones = () => {
    try {
      const data = milestoneDb.getByProject(id!)
      setMilestones(data)
    } catch (e) { 
      console.error('加载里程碑失败:', e)
      toast({ title: "加载失败", description: "请刷新页面重试", variant: "destructive" })
    }
    finally { setLoading(false) }
  }

  const handleSave = () => {
    if (!formData.name.trim() || !id) { toast({ title: "请输入标题", variant: "destructive" }); return }
    try {
      const newMilestone = {
        id: generateId(),
        name: formData.name,
        description: formData.description,
        target_date: formData.target_date,
        status: formData.status,
        project_id: id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      milestoneDb.create(newMilestone)
      addMilestone(newMilestone)
      toast({ title: "里程碑已添加" })
      setDialogOpen(false)
      setFormData({ name: '', description: '', target_date: '', status: 'pending' })
    } catch (e) { toast({ title: "保存失败", variant: "destructive" }) }
  }

  const handleComplete = (milestone: Milestone) => {
    const updated = milestoneDb.update(milestone.id, { status: 'completed', updated_at: new Date().toISOString() })
    if (updated) {
      updateMilestone(milestone.id, { status: 'completed' })
      toast({ title: "里程碑已完成" })
    }
  }

  const pending = milestones.filter((m: any) => m.status === 'pending')
  const completed = milestones.filter((m: any) => m.status === 'completed')
  
  // 统计
  const stats = useMemo(() => {
    const overdue = milestones.filter(m => m.status !== 'completed' && m.target_date && new Date(m.target_date) < new Date()).length
    const upcomingSoon = milestones.filter(m => {
      if (m.status === 'completed' || !m.target_date) return false
      const daysUntil = Math.ceil((new Date(m.target_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
      return daysUntil > 0 && daysUntil <= 7
    }).length
    return { pending: pending.length, completed: completed.length, overdue, upcomingSoon, total: milestones.length }
  }, [milestones, pending, completed])

  if (loading) return <div className="p-6"><MilestonesSkeleton /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate(`/projects/${id}`)}><ArrowLeft className="mr-2 h-4 w-4" />返回项目</Button>
          <h2 className="text-xl font-semibold">里程碑</h2>
        </div>
        <Button onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />添加里程碑</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">待完成</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-orange-600">{stats.pending}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">已完成</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">{stats.completed}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">即将到期</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-yellow-600">{stats.upcomingSoon}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">已逾期</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-red-600">{stats.overdue}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">完成率</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>里程碑列表</CardTitle></CardHeader>
        <CardContent>
          {milestones.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground"><Flag className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>暂无里程碑</p><Button className="mt-4" onClick={() => setDialogOpen(true)}>添加里程碑</Button></div>
          ) : (
            <div className="space-y-3">
              {(sortedMilestones as Milestone[]).map(m => {
                const progress = getMilestoneProgress(m)
                const status = getMilestoneStatus(m)
                return (
                <div key={m.id} className={`flex items-center gap-4 p-4 border rounded-lg ${
                  status === 'completed' ? 'bg-green-50 border-green-200' : 
                  status === 'overdue' ? 'bg-red-50 border-red-200' : 
                  status === 'soon' ? 'bg-yellow-50 border-yellow-200' : 
                  'hover:bg-accent/50'
                }`}>
                  <div className={`p-2 rounded-lg ${status === 'completed' ? 'bg-green-100' : status === 'overdue' ? 'bg-red-100' : status === 'soon' ? 'bg-yellow-100' : 'bg-blue-100'}`}>
                    {status === 'completed' ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : 
                     status === 'overdue' ? <AlertCircle className="h-5 w-5 text-red-600" /> :
                     status === 'soon' ? <Clock className="h-5 w-5 text-yellow-600" /> :
                     <Flag className="h-5 w-5 text-blue-600" />}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium flex items-center gap-2">
                      {m.name}
                      {status === 'overdue' && <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded">已逾期</span>}
                      {status === 'soon' && <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded">即将到期</span>}
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-4">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {m.target_date ? formatDate(m.target_date) : '未设置'}</span>
                      <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /> {progress}%</span>
                    </div>
                    {/* 进度条 */}
                    <div className="mt-2 w-32 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className={`h-full ${status === 'completed' ? 'bg-green-500' : status === 'overdue' ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  {status !== 'completed' && <Button variant="outline" size="sm" onClick={() => handleComplete(m)}>完成</Button>}
                  {status === 'completed' && <span className="text-sm text-green-600 font-medium">已完成</span>}
                </div>
              )})}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>添加里程碑</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>标题</Label><Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="里程碑名称" /></div>
            <div className="space-y-2"><Label>目标日期</Label><Input type="date" value={formData.target_date} onChange={e => setFormData({ ...formData, target_date: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button><Button onClick={handleSave}>保存</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
