import { useState } from 'react'
import { useStore } from '@/hooks/useStore'
import { Breadcrumb } from '@/components/Breadcrumb'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { User, Wifi, WifiOff, Moon, Sun, Monitor, Download, Upload, FileSpreadsheet } from 'lucide-react'
import { exportTasksToExcel, exportRisksToExcel, exportMilestonesToExcel, importTasksFromExcel, downloadTaskTemplate, exportToJSON, exportAllData } from '@/lib/dataExport'

export default function Settings() {
  const { currentUser, connectionMode, setConnectionMode, currentProject } = useStore()
  const [displayName, setDisplayName] = useState(currentUser?.display_name || '')
  const [theme, setTheme] = useState('light')

  const handleSaveName = async () => {
    toast({ title: "设置已保存" })
  }

  // 导出任务为Excel
  const handleExportTasks = async () => {
    if (!currentProject) {
      toast({ title: "请先选择一个项目", variant: "destructive" })
      return
    }
    try {
      exportTasksToExcel(currentProject.id)
      toast({ title: "任务导出成功" })
    } catch (e) {
      toast({ title: "导出失败", description: String(e), variant: "destructive" })
    }
  }

  // 导出风险为Excel
  const handleExportRisks = async () => {
    if (!currentProject) {
      toast({ title: "请先选择一个项目", variant: "destructive" })
      return
    }
    try {
      exportRisksToExcel(currentProject.id)
      toast({ title: "风险导出成功" })
    } catch (e) {
      toast({ title: "导出失败", description: String(e), variant: "destructive" })
    }
  }

  // 导出里程碑为Excel
  const handleExportMilestones = async () => {
    if (!currentProject) {
      toast({ title: "请先选择一个项目", variant: "destructive" })
      return
    }
    try {
      exportMilestonesToExcel(currentProject.id)
      toast({ title: "里程碑导出成功" })
    } catch (e) {
      toast({ title: "导出失败", description: String(e), variant: "destructive" })
    }
  }

  // 导出JSON备份
  const handleExportJSON = () => {
    try {
      const data = exportAllData()
      exportToJSON(data)
      toast({ title: "JSON备份导出成功" })
    } catch (e) {
      toast({ title: "导出失败", description: String(e), variant: "destructive" })
    }
  }

  // 导入任务
  const handleImportTasks = async () => {
    if (!currentProject) {
      toast({ title: "请先选择一个项目", variant: "destructive" })
      return
    }
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xlsx,.xls'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const result = await importTasksFromExcel(file, currentProject.id)
        if (result.success) {
          toast({ title: `导入成功，共导入 ${result.imported.tasks} 个任务` })
        } else {
          toast({ title: "导入部分成功", description: result.errors.join(', '), variant: "destructive" })
        }
      } catch (e) {
        toast({ title: "导入失败", description: String(e), variant: "destructive" })
      }
    }
    input.click()
  }

  // 下载模板
  const handleDownloadTemplate = () => {
    downloadTaskTemplate()
    toast({ title: "模板下载成功" })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* 面包屑导航 */}
      <Breadcrumb items={[
        ...(currentProject ? [{ label: currentProject.name, href: `/projects/${currentProject.id}` }] : []),
        { label: '设置' },
      ]} showHome={!currentProject} />
      <div>
        <h2 className="text-2xl font-bold">设置</h2>
        <p className="text-muted-foreground">管理您的个人设置</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" />个人资料</CardTitle>
          <CardDescription>管理您的显示名称</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>显示名称</Label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="输入您的名称" />
          </div>
          <Button onClick={handleSaveName}>保存</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">{connectionMode === 'websocket' ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}同步模式</CardTitle>
          <CardDescription>选择实时同步或轮询模式</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button variant={connectionMode === 'websocket' ? 'default' : 'outline'} onClick={() => setConnectionMode('websocket')}>
              <Wifi className="mr-2 h-4 w-4" />实时推送
            </Button>
            <Button variant={connectionMode === 'polling' ? 'default' : 'outline'} onClick={() => setConnectionMode('polling')}>
              <WifiOff className="mr-2 h-4 w-4" />轮询模式
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {connectionMode === 'websocket' ? '实时推送延迟低，但有连接数限制' : '轮询模式更稳定，适合网络环境复杂的场景'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Moon className="h-5 w-5" />外观</CardTitle>
          <CardDescription>选择主题模式</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button variant={theme === 'light' ? 'default' : 'outline'} onClick={() => setTheme('light')}><Sun className="mr-2 h-4 w-4" />浅色</Button>
            <Button variant={theme === 'dark' ? 'default' : 'outline'} onClick={() => setTheme('dark')}><Moon className="mr-2 h-4 w-4" />深色</Button>
            <Button variant={theme === 'system' ? 'default' : 'outline'} onClick={() => setTheme('system')}><Monitor className="mr-2 h-4 w-4" />跟随系统</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" />数据导入导出</CardTitle>
          <CardDescription>导入导出项目数据</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Excel导出</Label>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleExportTasks}>
                <Download className="mr-2 h-4 w-4" />导出任务
              </Button>
              <Button variant="outline" onClick={handleExportRisks}>
                <Download className="mr-2 h-4 w-4" />导出风险
              </Button>
              <Button variant="outline" onClick={handleExportMilestones}>
                <Download className="mr-2 h-4 w-4" />导出里程碑
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>数据备份</Label>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleExportJSON}>
                <Download className="mr-2 h-4 w-4" />导出JSON备份
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Excel导入</Label>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleImportTasks}>
                <Upload className="mr-2 h-4 w-4" />导入任务
              </Button>
              <Button variant="outline" onClick={handleDownloadTemplate}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />下载模板
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              导入任务前请先选择一个项目，然后下载模板按格式填写
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
