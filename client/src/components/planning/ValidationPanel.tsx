import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PlanningValidationIssue } from '@/hooks/usePlanningStore'
import { AlertTriangle, Info, ShieldAlert } from 'lucide-react'

interface ValidationPanelProps {
  title: string
  issues: PlanningValidationIssue[]
  emptyLabel?: string
}

const icons = {
  error: ShieldAlert,
  warning: AlertTriangle,
  info: Info,
} as const

export function ValidationPanel({ title, issues, emptyLabel = '当前没有待处理的校核项' }: ValidationPanelProps) {
  const counts = {
    error: issues.filter((item) => item.level === 'error').length,
    warning: issues.filter((item) => item.level === 'warning').length,
    info: issues.filter((item) => item.level === 'info').length,
  }

  return (
    <Card className="border-slate-200">
      <CardHeader className="space-y-3 border-b border-slate-100 bg-slate-50/80">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-lg">{title}</CardTitle>
          <div className="flex gap-2">
            <Badge variant="destructive">{counts.error} 错误</Badge>
            <Badge variant="secondary">{counts.warning} 警告</Badge>
            <Badge variant="outline">{counts.info} 提示</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {issues.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            {emptyLabel}
          </div>
        ) : (
          issues.map((issue) => {
            const Icon = icons[issue.level]
            return (
              <Alert key={issue.id} variant={issue.level === 'error' ? 'destructive' : 'default'}>
                <Icon className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-slate-900">{issue.title}</div>
                    {issue.detail ? <div className="text-sm text-slate-600">{issue.detail}</div> : null}
                  </div>
                </AlertDescription>
              </Alert>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
