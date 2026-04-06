import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '@/hooks/useStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TaskListSkeleton } from '@/components/ui/page-skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { ArrowLeft, Plus, AlertTriangle, Shield, ShieldAlert, ShieldCheck, Trash2, Bell, RefreshCw } from 'lucide-react'
import { riskDb, generateId, taskDb } from '@/lib/localDb'
import { analyzeRisks, getRiskStatistics, generateRiskReport, type RiskAlert } from '@/lib/riskAlert'

// Risk类型（本地版本）
interface Risk {
  id: string
  project_id: string
  title: string
  description?: string
  level?: string
  status?: string
  probability?: number
  impact?: number
  mitigation?: string
  risk_category?: string
  created_at: string
  updated_at: string
}

// 风险类型配置
const RISK_CATEGORY_OPTIONS = [
  { value: 'progress', label: '进度风险' },
  { value: 'quality', label: '质量风险' },
  { value: 'cost', label: '成本风险' },
  { value: 'safety', label: '安全风险' },
  { value: 'contract', label: '合同风险' },
  { value: 'external', label: '外部风险' },
  { value: 'other', label: '其他' },
]

const RISK_CATEGORY_LABEL: Record<string, string> = {
  progress: '进度风险',
  quality: '质量风险',
  cost: '成本风险',
  safety: '安全风险',
  contract: '合同风险',
  external: '外部风险',
  other: '其他',
}

const riskLevelColors: Record<string, string> = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
}

const riskStatusColors: Record<string, string> = {
  identified: 'bg-blue-100 text-blue-800',
  monitoring: 'bg-purple-100 text-purple-800',
  mitigated: 'bg-green-100 text-green-800',
  occurred: 'bg-red-100 text-red-800',
}

export default function RiskManagement() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { risks, setRisks, addRisk, updateRisk, deleteRisk, tasks, setTasks } = useStore()
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRisk, setEditingRisk] = useState<Risk | null>(null)
  const [autoAlerts, setAutoAlerts] = useState<RiskAlert[]>([])

  // 自动风险检测
  useEffect(() => {
    if (id && tasks.length > 0) {
      const criticalTaskIds: string[] = [] // 可从CPM计算获取
      const alerts = analyzeRisks(tasks as any, criticalTaskIds)
      setAutoAlerts(alerts)
    }
  }, [id, tasks])

  // 风险统计
  const riskStats = useMemo(() => {
    return getRiskStatistics(autoAlerts)
  }, [autoAlerts])

  // 手动触发风险检测
  const runRiskAnalysis = () => {
    if (tasks.length > 0) {
      const alerts = analyzeRisks(tasks as any, [])
      setAutoAlerts(alerts)
      toast({ title: `风险检测完成，发现${alerts.length}项风险` })
    } else {
      toast({ title: "请先添加任务", variant: "destructive" })
    }
  }
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    level: 'medium',
    status: 'identified',
    probability: 50,
    impact: 50,
    mitigation: '',
    risk_category: 'progress',
  })

  useEffect(() => {
    if (id) {
      loadRisks()
      // 加载任务数据用于风险分析
      const taskData = taskDb.getByProject(id)
      setTasks(taskData)
    }
  }, [id])

  const loadRisks = () => {
    try {
      const data = riskDb.getByProject(id!)
      setRisks(data)
    } catch (error) {
      console.error('加载风险失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveRisk = () => {
    if (!formData.title.trim() || !id) {
      toast({ title: "请输入风险名称", variant: "destructive" })
      return
    }

    try {
      const riskData = {
        ...formData,
        project_id: id,
        updated_at: new Date().toISOString(),
      }

      if (editingRisk) {
        const updated = riskDb.update(editingRisk.id, riskData)
        if (updated) {
          updateRisk(editingRisk.id, riskData)
          toast({ title: "风险已更新" })
        }
      } else {
        const newRisk = {
          ...riskData,
          id: generateId(),
          created_at: new Date().toISOString(),
        }
        riskDb.create(newRisk)
        addRisk(newRisk)
        toast({ title: "风险已添加" })
      }

      setDialogOpen(false)
      resetForm()
    } catch (error) {
      console.error('保存风险失败:', error)
      toast({ title: "保存失败", variant: "destructive" })
    }
  }

  const handleDeleteRisk = (riskId: string) => {
    if (!confirm('确定要删除这个风险吗？')) return

    try {
      riskDb.delete(riskId)
      deleteRisk(riskId)
      toast({ title: "风险已删除" })
    } catch (error) {
      console.error('删除风险失败:', error)
      toast({ title: "删除失败", variant: "destructive" })
    }
  }

  const openEditDialog = (risk?: Risk) => {
    if (risk) {
      setEditingRisk(risk)
      setFormData({
        title: risk.title,
        description: risk.description || '',
        level: risk.level || 'medium',
        status: risk.status || 'identified',
        probability: risk.probability || 50,
        impact: risk.impact || 50,
        mitigation: risk.mitigation || '',
        risk_category: risk.risk_category || 'progress',
      })
    } else {
      resetForm()
    }
    setDialogOpen(true)
  }

  const resetForm = () => {
    setEditingRisk(null)
    setFormData({
      title: '',
      description: '',
      level: 'medium',
      status: 'identified',
      probability: 50,
      impact: 50,
      mitigation: '',
      risk_category: 'progress',
    })
  }

  // 计算风险分数
  const calculateRiskScore = (probability: number, impact: number) => {
    return (probability * impact) / 100
  }

  if (loading) {
    return (
      <div className="p-6">
        <TaskListSkeleton />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate(`/projects/${id}`)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回项目
          </Button>
          <h2 className="text-xl font-semibold">风险管理</h2>
        </div>
        <Button onClick={() => openEditDialog()}>
          <Plus className="mr-2 h-4 w-4" />
          添加风险
        </Button>
      </div>

      {/* 风险统计 - 同时统计手动添加和自动检测的风险 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">总风险数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{risks.length + autoAlerts.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">高风险</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {risks.filter((r: any) => r.level === 'high' || r.level === 'critical').length + 
               autoAlerts.filter((a: any) => a.severity === 'critical' || a.severity === 'high').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">监控中</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {risks.filter((r: any) => r.status === 'monitoring').length + 
               autoAlerts.filter((a: any) => a.severity === 'high').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">已缓解</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {risks.filter((r: any) => r.status === 'mitigated').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 风险检测控制面板 */}
      <Card className={autoAlerts.length > 0 ? "border-red-200 bg-red-50" : "border-gray-200"}>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`text-3xl font-bold ${autoAlerts.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                {autoAlerts.length}
              </div>
              <div>
                <div className="font-medium">自动检测到{autoAlerts.length > 0 ? '项风险' : '暂无风险'}</div>
                <div className="text-sm text-muted-foreground">
                  {autoAlerts.filter(a => a.severity === 'critical').length > 0 && 
                    `${autoAlerts.filter(a => a.severity === 'critical').length}项严重风险需关注`}
                </div>
              </div>
            </div>
            <Button 
              variant={autoAlerts.length > 0 ? "destructive" : "default"} 
              size="lg"
              onClick={runRiskAnalysis}
              className="gap-2"
            >
              <RefreshCw className={`h-5 w-5 ${autoAlerts.length > 0 ? '' : 'animate-spin'}`} />
              {autoAlerts.length > 0 ? '重新检测风险' : '开始风险检测'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 自动风险预警面板 */}
      {autoAlerts.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-orange-800 flex items-center gap-2">
                <Bell className="h-5 w-5" />
                自动风险预警
              </CardTitle>
              <Button variant="outline" size="sm" onClick={runRiskAnalysis}>
                <RefreshCw className="h-4 w-4 mr-1" />
                重新检测
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {autoAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3 rounded-lg border ${
                    alert.severity === 'critical' ? 'bg-red-100 border-red-300' :
                    alert.severity === 'high' ? 'bg-orange-100 border-orange-300' :
                    alert.severity === 'medium' ? 'bg-yellow-100 border-yellow-300' :
                    'bg-green-100 border-green-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-sm">{alert.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{alert.description}</p>
                      {alert.建议 && (
                        <p className="text-xs mt-1 font-medium text-blue-600">{alert.建议}</p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      alert.severity === 'critical' ? 'bg-red-500 text-white' :
                      alert.severity === 'high' ? 'bg-orange-500 text-white' :
                      alert.severity === 'medium' ? 'bg-yellow-500 text-white' :
                      'bg-green-500 text-white'
                    }`}>
                      {alert.severity === 'critical' ? '严重' :
                       alert.severity === 'high' ? '高' :
                       alert.severity === 'medium' ? '中' : '低'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 风险列表 */}
      <Card>
        <CardHeader>
          <CardTitle>风险列表</CardTitle>
        </CardHeader>
        <CardContent>
          {risks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>暂无风险</p>
              <Button className="mt-4" onClick={() => openEditDialog()}>
                添加第一个风险
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {(risks as Risk[]).map(risk => {
                const riskScore = calculateRiskScore(risk.probability || 0, risk.impact || 0)
                return (
                  <div
                    key={risk.id}
                    className="flex items-start gap-4 p-4 border rounded-lg hover:bg-accent/50"
                  >
                    <div className={`p-2 rounded-lg ${risk.level === 'critical' ? 'bg-red-100' : risk.level === 'high' ? 'bg-orange-100' : risk.level === 'medium' ? 'bg-yellow-100' : 'bg-green-100'}`}>
                      {risk.level === 'critical' || risk.level === 'high' ? (
                        <ShieldAlert className="h-5 w-5 text-red-600" />
                      ) : (
                        <Shield className="h-5 w-5 text-green-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{risk.title}</span>
                        {risk.risk_category && risk.risk_category !== 'other' && (
                          <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                            {RISK_CATEGORY_LABEL[risk.risk_category] || risk.risk_category}
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded text-xs ${riskLevelColors[risk.level || 'medium']}`}>
                          {risk.level === 'critical' ? '严重' : risk.level === 'high' ? '高' : risk.level === 'medium' ? '中' : '低'}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs ${riskStatusColors[risk.status || 'identified']}`}>
                          {risk.status === 'identified' ? '已识别' : risk.status === 'monitoring' ? '监控中' : risk.status === 'mitigated' ? '已缓解' : '已发生'}
                        </span>
                      </div>
                      {risk.description && (
                        <p className="text-sm text-muted-foreground mb-2">{risk.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>发生概率: {risk.probability || 0}%</span>
                        <span>影响程度: {risk.impact || 0}%</span>
                        <span>风险分数: {riskScore}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(risk)}>
                        编辑
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteRisk(risk.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 风险编辑对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRisk ? '编辑风险' : '添加风险'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>风险描述 <span className="text-red-500">*</span></Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value, title: e.target.value })}
                placeholder="简要描述风险内容"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>风险类型</Label>
                <Select value={formData.risk_category} onValueChange={(val: any) => setFormData({ ...formData, risk_category: val })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RISK_CATEGORY_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>风险等级</Label>
                <Select value={formData.level} onValueChange={(val: any) => setFormData({ ...formData, level: val })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">低</SelectItem>
                    <SelectItem value="medium">中</SelectItem>
                    <SelectItem value="high">高</SelectItem>
                    <SelectItem value="critical">严重</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveRisk}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
