import { AlertTriangle, Info, ShieldAlert } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ValidationIssue } from '@/hooks/usePlanningValidation'

interface PlanningValidationStripProps {
  issues: ValidationIssue[]
  blockCount: number
  confirmCount: number
  hintCount?: number
  testId?: string
  onLocateIssue?: (issue: ValidationIssue) => void
}

const issueIcons = {
  block_save: ShieldAlert,
  confirm: AlertTriangle,
  hint: Info,
} as const

function getIssueLabel(issue: ValidationIssue) {
  const prefix = issue.severity === 'block_save' ? '阻断' : issue.severity === 'confirm' ? '确认' : '提示'
  return `${prefix} · ${issue.message}`
}

export function PlanningValidationStrip({
  issues,
  blockCount,
  confirmCount,
  hintCount = 0,
  testId = 'planning-validation-strip',
  onLocateIssue,
}: PlanningValidationStripProps) {
  if (issues.length === 0) return null

  const firstIssues = issues.slice(0, 5)
  const hiddenCount = Math.max(0, issues.length - firstIssues.length)
  const hasBlockers = blockCount > 0

  return (
    <Alert
      data-testid={testId}
      className={hasBlockers ? 'border-amber-200 bg-amber-50/80 text-amber-950' : 'border-blue-100 bg-blue-50/70 text-blue-950'}
    >
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">表格校核</span>
              <Badge variant={hasBlockers ? 'destructive' : 'secondary'}>{blockCount} 阻断</Badge>
              <Badge variant="outline" className="bg-white">{confirmCount} 确认</Badge>
              {hintCount > 0 ? <Badge variant="outline" className="bg-white">{hintCount} 提示</Badge> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {firstIssues.map((issue) => {
                const Icon = issueIcons[issue.severity]
                return (
                  <Button
                    key={`${issue.rowId}:${issue.field}:${issue.message}`}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-auto min-h-8 max-w-full justify-start gap-1.5 bg-white px-2 py-1 text-left text-xs"
                    onClick={() => onLocateIssue?.(issue)}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{getIssueLabel(issue)}</span>
                  </Button>
                )
              })}
              {hiddenCount > 0 ? (
                <Badge variant="outline" className="bg-white">
                  还有 {hiddenCount} 条问题
                </Badge>
              ) : null}
            </div>
          </div>
          {hasBlockers ? (
            <p className="max-w-sm text-xs leading-5 text-amber-800">
              保存前需要先处理阻断项；点击问题可定位到对应行和字段。
            </p>
          ) : null}
        </div>
      </AlertDescription>
    </Alert>
  )
}
