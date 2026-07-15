import { ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  fetchV14231PageConsumptionReadiness,
  type V14231PageConsumptionReadiness,
} from '@/services/v14231ReadinessApi'

type BoundaryState =
  | { status: 'loading'; readiness: null }
  | { status: 'ready'; readiness: V14231PageConsumptionReadiness }
  | { status: 'error'; readiness: V14231PageConsumptionReadiness }

export interface V14231PageReadinessBoundaryProps {
  pageKey: string
  className?: string
}

export function V14231PageReadinessBoundary({
  pageKey,
  className,
}: V14231PageReadinessBoundaryProps) {
  const [state, setState] = useState<BoundaryState>({ status: 'loading', readiness: null })

  useEffect(() => {
    let mounted = true

    setState({ status: 'loading', readiness: null })

    fetchV14231PageConsumptionReadiness(pageKey)
      .then((readiness) => {
        if (mounted) setState({ status: 'ready', readiness })
      })
      .catch(() => {
        if (mounted) setState({ status: 'error', readiness: buildFailClosedPageReadiness(pageKey) })
      })

    return () => {
      mounted = false
    }
  }, [pageKey])

  const readiness = state.readiness
  if (!readiness) return null

  const pageAvailable = readiness.pageAvailability === 'available'
  if (pageAvailable && readiness.actionReadiness === 'stable') return null

  const isError = state.status === 'error'

  return (
    <Alert
      data-testid="v14231-page-readiness-boundary"
      data-page-availability={readiness.pageAvailability}
      data-action-readiness={readiness.actionReadiness}
      className={className ?? 'border-amber-200 bg-amber-50/80 text-amber-950'}
    >
      <ShieldAlert className="h-4 w-4 text-amber-600" />
      <AlertDescription className="flex flex-col gap-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-amber-200 bg-white text-amber-800">
            C-13 {readiness.status}
          </Badge>
          <span className="font-medium">{readiness.page}</span>
          <span className="text-amber-800">
            {isError || !pageAvailable
              ? '页面暂不可用：未能读取 C-13 页面边界，已按 not-ready 处理。'
              : '页面可用；受控动作仍按当前门禁执行。'}
          </span>
        </div>
        <div className="leading-6 text-amber-900">
          {readiness.uiDegradationStrategy}
          {' '}
          {readiness.forbiddenActions}
        </div>
      </AlertDescription>
    </Alert>
  )
}

function buildFailClosedPageReadiness(pageKey: string): V14231PageConsumptionReadiness {
  return {
    kind: 'page',
    key: pageKey.trim() || 'unregistered-page',
    page: pageKey.trim() || '未登记页面',
    pageAvailability: 'unavailable',
    actionReadiness: 'gated',
    status: 'not-ready',
    currentStatusText: '`not-ready`',
    consumableCapabilities: '未能读取 C-13 页面消费台账',
    uiDegradationStrategy: '页面只能展示已有数据，不能形成主指标、主结论或稳定动作。',
    forbiddenActions: '不得触发自动处置、自动发布、自动问责、自动改计划或稳定动作。',
    sourcePlan: 'v1.4.23.1-A',
    sourceSection: '4.7.06',
    sourceRowRef: '4.7.06#unregistered',
    browserVerificationScripts: [],
    browserVerificationPolicy: '新增页面必须先补 4.7.06 行和对应浏览器主链路脚本映射',
    canUseAsPrimaryMetric: false,
    canUseAsPrimaryConclusion: false,
    canUseAsStableAction: false,
    requiresDisplayOnlyDegradation: true,
  }
}
