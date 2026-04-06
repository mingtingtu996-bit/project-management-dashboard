// 版本冲突解决对话框组件
// 用于多人协作时的版本冲突处理

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, RefreshCw, ArrowRight, User } from 'lucide-react'
import type { Task, Project, Risk, Milestone } from '@/types'

type ConflictItem = Task | Project | Risk | Milestone

interface ConflictDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  localVersion: ConflictItem
  serverVersion: ConflictItem
  onKeepLocal: () => void
  onKeepServer: () => void
  onMerge: () => void
  itemType: 'task' | 'project' | 'risk' | 'milestone'
}

// 比较两个版本，返回差异
function getDifferences(local: ConflictItem, server: ConflictItem): string[] {
  const differences: string[] = []
  const allKeys = new Set([...Object.keys(local), ...Object.keys(server)])
  
  for (const key of allKeys) {
    if (key === 'version' || key === 'updated_at' || key === 'created_at') continue
    
    const localValue = (local as Record<string, unknown>)[key]
    const serverValue = (server as Record<string, unknown>)[key]
    
    if (JSON.stringify(localValue) !== JSON.stringify(serverValue)) {
      const label = key.replace(/_/g, ' ')
      differences.push(label)
    }
  }
  
  return differences
}

export function ConflictDialog({
  open,
  onOpenChange,
  localVersion,
  serverVersion,
  onKeepLocal,
  onKeepServer,
  onMerge,
  itemType,
}: ConflictDialogProps) {
  const differences = getDifferences(localVersion, serverVersion)
  
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '-'
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }
  
  const itemTypeLabels = {
    task: '任务',
    project: '项目',
    risk: '风险',
    milestone: '里程碑'
  }
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            版本冲突检测
          </DialogTitle>
          <DialogDescription>
            检测到{itemTypeLabels[itemType]}被其他用户修改过，请选择要保留的版本
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* 差异摘要 */}
          <div className="text-sm text-muted-foreground">
            差异字段：{differences.length > 0 ? differences.join('、') : '无'}
          </div>
          
          {/* 版本对比 */}
          <div className="grid grid-cols-2 gap-4">
            {/* 本地版本 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <User className="h-4 w-4" />
                  您的修改
                  <span className="text-xs text-muted-foreground ml-auto">
                    v{localVersion.version || 1}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {differences.slice(0, 5).map((field) => (
                  <div key={field} className="flex justify-between">
                    <span className="text-muted-foreground">{field}:</span>
                    <span className="font-medium truncate ml-2" title={formatValue((localVersion as Record<string, unknown>)[field])}>
                      {formatValue((localVersion as Record<string, unknown>)[field])}
                    </span>
                  </div>
                ))}
                {differences.length > 5 && (
                  <div className="text-xs text-muted-foreground">
                    ...还有 {differences.length - 5} 处差异
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* 服务器版本 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  服务器版本
                  <span className="text-xs text-muted-foreground ml-auto">
                    v{serverVersion.version || 1}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {differences.slice(0, 5).map((field) => (
                  <div key={field} className="flex justify-between">
                    <span className="text-muted-foreground">{field}:</span>
                    <span className="font-medium truncate ml-2" title={formatValue((serverVersion as Record<string, unknown>)[field])}>
                      {formatValue((serverVersion as Record<string, unknown>)[field])}
                    </span>
                  </div>
                ))}
                {differences.length > 5 && (
                  <div className="text-xs text-muted-foreground">
                    ...还有 {differences.length - 5} 处差异
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
        
        {/* 操作按钮 */}
        <div className="flex justify-between gap-2 pt-4">
          <div className="flex gap-2">
            <Button variant="outline" onClick={onKeepServer}>
              <RefreshCw className="mr-2 h-4 w-4" />
              使用服务器版本
            </Button>
            <Button variant="outline" onClick={onKeepLocal}>
              <User className="mr-2 h-4 w-4" />
              保留我的修改
            </Button>
          </div>
          <Button onClick={onMerge}>
            手动合并
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ConflictDialog
