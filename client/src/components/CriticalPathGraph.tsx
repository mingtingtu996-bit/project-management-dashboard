import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  ChevronRight,
  GitBranch,
  Minus,
  Pin,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import type { CriticalPathOverrideInput, CriticalPathOverrideRecord, CriticalPathSnapshot } from '@/lib/criticalPath'
import {
  CRITICAL_PATH_NODE_HEIGHT,
  CRITICAL_PATH_NODE_WIDTH,
  buildCriticalPathLayout,
  type CriticalPathLayoutLane,
  type CriticalPathLayoutNode,
} from '@/lib/buildCriticalPathLayout'
import { formatCriticalPathCount, USER_FACING_TERMS } from '@/lib/userFacingTerms'
import { cn } from '@/lib/utils'
import type { Task } from '@/pages/GanttViewTypes'

interface CriticalPathGraphProps {
  projectName?: string
  tasks: Task[]
  snapshot: CriticalPathSnapshot | null
  overrides: CriticalPathOverrideRecord[]
  focusTaskId?: string | null
  loading?: boolean
  error?: string | null
  actionLoading?: boolean
  onRefresh: () => void | Promise<void>
  onCreateOverride: (input: CriticalPathOverrideInput) => void | Promise<void>
  onDeleteOverride: (overrideId: string) => void | Promise<void>
}

function truncateLabel(value: string, max = 18) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function getTaskLabel(task?: Task | null, fallback = '') {
  if (!task) return fallback
  return task.title || task.name || fallback || task.id
}

function getSnapshotTaskClass(task?: CriticalPathSnapshot['tasks'][number] | null) {
  if (!task) return 'border-slate-200 bg-white text-slate-700'
  if (task.isManualInserted) return 'border-violet-200 bg-violet-50 text-violet-700'
  if (task.isManualAttention) return 'border-amber-200 bg-amber-50 text-amber-700'
  if (task.isAutoCritical) return 'border-rose-200 bg-rose-50 text-rose-700'
  return 'border-slate-200 bg-white text-slate-700'
}

function getNodePalette(node: CriticalPathLayoutNode) {
  if (node.isManualInserted) {
    return {
      fill: '#fff7ed',
      stroke: '#fb923c',
      tagFill: '#fed7aa',
      tagText: '#c2410c',
      title: '#9a3412',
      body: '#6b7280',
    }
  }
  if (node.isManualAttention) {
    return {
      fill: '#fffbeb',
      stroke: '#f59e0b',
      tagFill: '#fef3c7',
      tagText: '#b45309',
      title: '#92400e',
      body: '#6b7280',
    }
  }
  if (node.isAutoCritical || node.isPrimary) {
    return {
      fill: '#fff1f2',
      stroke: '#f43f5e',
      tagFill: '#ffe4e6',
      tagText: '#be123c',
      title: '#881337',
      body: '#6b7280',
    }
  }
  return {
    fill: '#ffffff',
    stroke: '#cbd5e1',
    tagFill: '#f1f5f9',
    tagText: '#475569',
    title: '#0f172a',
    body: '#64748b',
  }
}

function getLanePalette(lane: CriticalPathLayoutLane) {
  switch (lane.type) {
    case 'primary':
      return {
        fill: '#fff7ed',
        stroke: '#fdba74',
        labelFill: '#ffedd5',
        labelText: '#9a3412',
      }
    case 'alternate':
      return {
        fill: '#eff6ff',
        stroke: '#93c5fd',
        labelFill: '#dbeafe',
        labelText: '#1d4ed8',
      }
    case 'attention':
      return {
        fill: '#fefce8',
        stroke: '#facc15',
        labelFill: '#fef9c3',
        labelText: '#854d0e',
      }
    default:
      return {
        fill: '#f8fafc',
        stroke: '#cbd5e1',
        labelFill: '#e2e8f0',
        labelText: '#334155',
      }
  }
}

function getOverrideAnchorLabel(override: CriticalPathOverrideRecord) {
  if (override.mode === 'manual_attention') return '手动关注'

  switch (override.anchor_type || 'after') {
    case 'before':
      return '插入到前面'
    case 'between':
      return '插入到中间'
    default:
      return '插入到后面'
  }
}

function describeOverrideTarget(override: CriticalPathOverrideRecord, tasks: Task[]): string {
  const taskMap = new Map(tasks.map((task) => [task.id, task]))
  const current = taskMap.get(override.task_id)
  const left = override.left_task_id ? taskMap.get(override.left_task_id) : null
  const right = override.right_task_id ? taskMap.get(override.right_task_id) : null

  const currentLabel = getTaskLabel(current, override.task_id)
  const leftLabel = left ? getTaskLabel(left, override.left_task_id || '') : override.left_task_id || ''
  const rightLabel = right ? getTaskLabel(right, override.right_task_id || '') : override.right_task_id || ''

  if (override.mode === 'manual_attention') {
    return currentLabel
  }

  if (override.anchor_type === 'before') {
    return `${currentLabel} 之前于 ${rightLabel || '未知任务'}`
  }

  if (override.anchor_type === 'after') {
    return `${currentLabel} 之后于 ${leftLabel || '未知任务'}`
  }

  if (override.anchor_type === 'between') {
    return `${currentLabel} 介于 ${leftLabel || '未知任务'} 和 ${rightLabel || '未知任务'}`
  }

  return currentLabel
}

type FocusGraph = {
  taskIds: Set<string>
  edgeIds: Set<string>
  upstreamCount: number
  downstreamCount: number
}

function buildFocusGraph(snapshotEdges: CriticalPathSnapshot['edges'], centerTaskId: string | null): FocusGraph {
  if (!centerTaskId) {
    return {
      taskIds: new Set(),
      edgeIds: new Set(),
      upstreamCount: 0,
      downstreamCount: 0,
    }
  }

  const taskIds = new Set<string>([centerTaskId])
  const edgeIds = new Set<string>()
  const upstreamTaskIds = new Set<string>()
  const downstreamTaskIds = new Set<string>()

  const incomingByTaskId = new Map<string, CriticalPathSnapshot['edges']>()
  const outgoingByTaskId = new Map<string, CriticalPathSnapshot['edges']>()

  snapshotEdges.forEach((edge) => {
    incomingByTaskId.set(edge.toTaskId, [...(incomingByTaskId.get(edge.toTaskId) ?? []), edge])
    outgoingByTaskId.set(edge.fromTaskId, [...(outgoingByTaskId.get(edge.fromTaskId) ?? []), edge])
  })

  const walk = (
    seeds: string[],
    direction: 'incoming' | 'outgoing',
    bucket: Set<string>,
  ) => {
    const queue = [...seeds]
    const visited = new Set(queue)

    while (queue.length > 0) {
      const currentTaskId = queue.shift()!
      const relatedEdges = direction === 'incoming'
        ? incomingByTaskId.get(currentTaskId) ?? []
        : outgoingByTaskId.get(currentTaskId) ?? []

      relatedEdges.forEach((edge) => {
        edgeIds.add(edge.id)
        const nextTaskId = direction === 'incoming' ? edge.fromTaskId : edge.toTaskId
        if (nextTaskId === centerTaskId) return
        bucket.add(nextTaskId)
        taskIds.add(nextTaskId)
        if (!visited.has(nextTaskId)) {
          visited.add(nextTaskId)
          queue.push(nextTaskId)
        }
      })
    }
  }

  walk([centerTaskId], 'incoming', upstreamTaskIds)
  walk([centerTaskId], 'outgoing', downstreamTaskIds)

  return {
    taskIds,
    edgeIds,
    upstreamCount: upstreamTaskIds.size,
    downstreamCount: downstreamTaskIds.size,
  }
}

function sanitizeFileStem(value: string) {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(objectUrl)
}

function serializeGraphSvg(svg: SVGSVGElement) {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  return new XMLSerializer().serializeToString(clone)
}

export function CriticalPathGraph(props: CriticalPathGraphProps) {
  const taskMap = useMemo(() => new Map(props.tasks.map((task) => [task.id, task])), [props.tasks])
  const snapshotTaskMap = useMemo(
    () => new Map((props.snapshot?.tasks ?? []).map((task) => [task.taskId, task])),
    [props.snapshot],
  )
  const layout = useMemo(
    () => buildCriticalPathLayout({ snapshot: props.snapshot, tasks: props.tasks }),
    [props.snapshot, props.tasks],
  )

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [reasonDraft, setReasonDraft] = useState('来自关键路径视图')
  const [insertAnchorType, setInsertAnchorType] = useState<'before' | 'after' | 'between'>('after')
  const [insertLeftTaskId, setInsertLeftTaskId] = useState('')
  const [insertRightTaskId, setInsertRightTaskId] = useState('')
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [expandedAlternateChainIds, setExpandedAlternateChainIds] = useState<string[]>([])
  const svgRef = useRef<SVGSVGElement | null>(null)
  const graphViewportRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (selectedTaskId && taskMap.has(selectedTaskId)) return
    const nextSelected =
      props.snapshot?.primaryChain?.taskIds?.[0] ||
      props.snapshot?.displayTaskIds?.[0] ||
      props.tasks[0]?.id ||
      null
    setSelectedTaskId(nextSelected)
  }, [props.snapshot, props.tasks, selectedTaskId, taskMap])

  useEffect(() => {
    if (!props.focusTaskId) return
    if (!taskMap.has(props.focusTaskId)) return
    setSelectedTaskId(props.focusTaskId)
  }, [props.focusTaskId, taskMap])

  useEffect(() => {
    setExpandedAlternateChainIds((current) =>
      current.filter((chainId) => props.snapshot?.alternateChains.some((chain) => chain.id === chainId)),
    )
  }, [props.snapshot])

  const selectedTask = selectedTaskId ? taskMap.get(selectedTaskId) ?? null : null
  const selectedSnapshotTask = selectedTaskId ? snapshotTaskMap.get(selectedTaskId) ?? null : null
  const selectedOverride = props.overrides.find((override) => override.task_id === selectedTaskId) ?? null
  const primaryChain = props.snapshot?.primaryChain ?? null
  const snapshotEdges = props.snapshot?.edges ?? []
  const selectedIncomingEdges = selectedTaskId
    ? snapshotEdges.filter((edge) => edge.toTaskId === selectedTaskId)
    : []
  const selectedOutgoingEdges = selectedTaskId
    ? snapshotEdges.filter((edge) => edge.fromTaskId === selectedTaskId)
    : []
  const selectedFocusGraph = useMemo(
    () => buildFocusGraph(snapshotEdges, selectedTaskId),
    [selectedTaskId, snapshotEdges],
  )
  const hoveredFocusGraph = useMemo(
    () => buildFocusGraph(snapshotEdges, hoveredTaskId),
    [hoveredTaskId, snapshotEdges],
  )
  const activeFocusGraph = hoveredTaskId ? hoveredFocusGraph : selectedFocusGraph
  const hasActiveFocus = activeFocusGraph.taskIds.size > 0

  const anchorTaskIds = useMemo(() => {
    const preferredIds = [
      ...(props.snapshot?.primaryChain?.taskIds ?? []),
      ...(props.snapshot?.displayTaskIds ?? []),
      ...props.tasks.map((task) => task.id),
    ]

    return Array.from(new Set(preferredIds)).filter((taskId) => Boolean(taskId) && taskId !== selectedTaskId)
  }, [props.snapshot, props.tasks, selectedTaskId])

  useEffect(() => {
    const [firstAnchorId, secondAnchorId] = anchorTaskIds

    setInsertLeftTaskId((current) => {
      if (current && current !== selectedTaskId && anchorTaskIds.includes(current)) return current
      return firstAnchorId ?? ''
    })
    setInsertRightTaskId((current) => {
      if (current && current !== selectedTaskId && anchorTaskIds.includes(current)) return current
      return secondAnchorId ?? firstAnchorId ?? ''
    })

    if (insertAnchorType === 'between' && anchorTaskIds.length < 2) {
      setInsertAnchorType(firstAnchorId ? 'after' : 'before')
    }
  }, [anchorTaskIds, insertAnchorType, selectedTaskId])

  const canCreateInsert =
    Boolean(selectedTaskId) &&
    !selectedOverride &&
    (insertAnchorType === 'before'
      ? Boolean(insertRightTaskId)
      : insertAnchorType === 'after'
        ? Boolean(insertLeftTaskId)
        : Boolean(insertLeftTaskId) && Boolean(insertRightTaskId))

  const renderEdgeLabel = (fromTaskId: string, toTaskId: string) => {
    const fromTask = taskMap.get(fromTaskId)
    const toTask = taskMap.get(toTaskId)
    return `${getTaskLabel(fromTask, fromTaskId)} -> ${getTaskLabel(toTask, toTaskId)}`
  }

  const centerOnTask = useCallback((taskId: string | null, behavior: ScrollBehavior = 'smooth') => {
    if (!taskId) return
    const viewport = graphViewportRef.current
    const node = layout.nodes.find((candidate) => candidate.taskId === taskId)
    if (!viewport || !node) return

    const targetLeft = Math.max(0, (node.x + node.width / 2) * zoom - viewport.clientWidth / 2)
    const targetTop = Math.max(0, (node.y + node.height / 2) * zoom - viewport.clientHeight / 2)

    if (typeof viewport.scrollTo === 'function') {
      viewport.scrollTo({
        left: targetLeft,
        top: targetTop,
        behavior,
      })
      return
    }

    viewport.scrollLeft = targetLeft
    viewport.scrollTop = targetTop
  }, [layout.nodes, zoom])

  useEffect(() => {
    if (!selectedTaskId) return
    const timer = window.setTimeout(() => {
      centerOnTask(selectedTaskId, 'auto')
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [centerOnTask, selectedTaskId])

  const exportFileStem = useMemo(() => {
    const projectStem = sanitizeFileStem(props.projectName || props.snapshot?.projectId || 'critical-path')
    return projectStem || 'critical-path'
  }, [props.projectName, props.snapshot?.projectId])

  const handleExportSvg = useCallback(() => {
    const svg = svgRef.current
    if (!svg) return

    const markup = serializeGraphSvg(svg)
    triggerBlobDownload(
      new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }),
      `${exportFileStem}-critical-path.svg`,
    )
  }, [exportFileStem])

  const handleExportPng = useCallback(async () => {
    const svg = svgRef.current
    if (!svg) return

    const svgMarkup = serializeGraphSvg(svg)
    const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
    const svgUrl = URL.createObjectURL(svgBlob)

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const nextImage = new Image()
        nextImage.onload = () => resolve(nextImage)
        nextImage.onerror = () => reject(new Error('关键路径 PNG 导出失败'))
        nextImage.src = svgUrl
      })

      const canvas = document.createElement('canvas')
      const scale = 2
      canvas.width = Math.ceil(layout.canvasWidth * scale)
      canvas.height = Math.ceil(layout.canvasHeight * scale)

      const context = canvas.getContext('2d')
      if (!context) return

      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.scale(scale, scale)
      context.drawImage(image, 0, 0, layout.canvasWidth, layout.canvasHeight)

      const pngBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) {
            resolve(result)
            return
          }
          reject(new Error('关键路径 PNG 导出失败'))
        }, 'image/png')
      })

      triggerBlobDownload(pngBlob, `${exportFileStem}-critical-path.png`)
    } finally {
      URL.revokeObjectURL(svgUrl)
    }
  }, [exportFileStem, layout.canvasHeight, layout.canvasWidth])

  const renderTaskChip = (taskId: string, index?: number, chainLabel?: string) => {
    const task = taskMap.get(taskId)
    const snapshotTask = snapshotTaskMap.get(taskId)
    const selected = selectedTaskId === taskId
    const emphasized = !hasActiveFocus || activeFocusGraph.taskIds.has(taskId)

    return (
      <button
        key={taskId}
        type="button"
        onClick={() => setSelectedTaskId(taskId)}
        onMouseEnter={() => setHoveredTaskId(taskId)}
        onMouseLeave={() => setHoveredTaskId((current) => (current === taskId ? null : current))}
        onFocus={() => setHoveredTaskId(taskId)}
        onBlur={() => setHoveredTaskId((current) => (current === taskId ? null : current))}
        className={cn(
          'group flex min-w-[180px] flex-1 items-center justify-between gap-2 rounded-2xl border px-3 py-2 text-left shadow-sm transition-all hover:-translate-y-[1px] hover:shadow-md',
          getSnapshotTaskClass(snapshotTask),
          !emphasized && 'opacity-45',
          selected && 'ring-2 ring-blue-400 ring-offset-2',
        )}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {typeof index === 'number' && (
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-slate-500">
                {index + 1}
              </span>
            )}
            <span className="truncate text-sm font-medium">{getTaskLabel(task, taskId)}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {snapshotTask?.isAutoCritical && (
              <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                自动
              </Badge>
            )}
            {snapshotTask?.isManualAttention && (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                关注
              </Badge>
            )}
            {snapshotTask?.isManualInserted && (
              <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
                插链
              </Badge>
            )}
            {chainLabel && <Badge variant="secondary">{chainLabel}</Badge>}
          </div>
        </div>
        <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-300" />
      </button>
    )
  }

  return (
    <div data-testid="critical-path-graph" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-blue-600" />
            <h3 className="text-base font-semibold text-slate-900">关键路径图谱</h3>
            {props.loading && <Badge variant="outline">刷新中</Badge>}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-600">
            <Badge variant="outline">项目: {props.projectName || '当前项目'}</Badge>
            <Badge variant="secondary">
              {formatCriticalPathCount(primaryChain?.taskIds.length ?? props.snapshot?.displayTaskIds.length ?? 0)}
            </Badge>
            <Badge variant="secondary">备选 {props.snapshot?.alternateChains.length ?? 0} 条</Badge>
            <Badge variant="secondary">关注 {props.snapshot?.manualAttentionTaskIds.length ?? 0} 项</Badge>
            <Badge variant="secondary">插链 {props.snapshot?.manualInsertedTaskIds.length ?? 0} 项</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void props.onRefresh()} disabled={props.loading || props.actionLoading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新快照
          </Button>
        </div>
      </div>

      {props.error && (
        <Card className="border-amber-200 bg-amber-50 shadow-sm">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">关键路径快照暂不可用</div>
              <div className="mt-1 text-xs leading-5 text-amber-800">{props.error}</div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.95fr]">
        <div className="space-y-4">
          <Card variant="detail">
            <CardHeader className="space-y-2 border-b border-slate-100 pb-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-sm">DAG 图谱</CardTitle>
                {primaryChain && <Badge variant="outline">{primaryChain.displayLabel}</Badge>}
              </div>
              <div className="text-xs text-slate-500">
                以后端快照的主链、备选链和关系边为真值，按 DAG 方式展示节点位置与依赖方向。
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              {layout.nodes.length ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">主链节点</Badge>
                      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">备选链</Badge>
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">手动关注</Badge>
                      <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">手动插链</Badge>
                      {selectedTaskId && (
                        <>
                          <Badge variant="secondary">上游 {selectedFocusGraph.upstreamCount} 项</Badge>
                          <Badge variant="secondary">下游 {selectedFocusGraph.downstreamCount} 项</Badge>
                        </>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setZoom((current) => Math.max(0.7, Number((current - 0.1).toFixed(2))))}
                        disabled={zoom <= 0.7}
                        data-testid="critical-path-zoom-out"
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Badge variant="outline" data-testid="critical-path-zoom-level">{Math.round(zoom * 100)}%</Badge>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setZoom((current) => Math.min(1.9, Number((current + 0.1).toFixed(2))))}
                        disabled={zoom >= 1.9}
                        data-testid="critical-path-zoom-in"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => centerOnTask(selectedTaskId)}
                        disabled={!selectedTaskId}
                        data-testid="critical-path-center-selected"
                      >
                        居中当前任务
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleExportSvg}
                        disabled={!layout.nodes.length}
                        data-testid="critical-path-export-svg"
                      >
                        导出 SVG
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleExportPng()}
                        disabled={!layout.nodes.length}
                        data-testid="critical-path-export-png"
                      >
                        导出 PNG
                      </Button>
                    </div>
                  </div>
                  <div
                    ref={graphViewportRef}
                    data-testid="critical-path-svg-viewport"
                    className="max-h-[680px] overflow-auto rounded-3xl border border-slate-200 bg-slate-950/[0.02] p-3"
                  >
                    <div
                      style={{
                        width: layout.canvasWidth * zoom,
                        height: layout.canvasHeight * zoom,
                      }}
                    >
                    <svg
                      ref={svgRef}
                      data-testid="critical-path-svg"
                      width={layout.canvasWidth}
                      height={layout.canvasHeight}
                      viewBox={`0 0 ${layout.canvasWidth} ${layout.canvasHeight}`}
                      className="block"
                      role="img"
                      aria-label="关键路径 DAG 图谱"
                      style={{
                        transform: `scale(${zoom})`,
                        transformOrigin: 'top left',
                      }}
                    >
                      <defs>
                        <marker id="critical-path-arrow-primary" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
                          <path d="M 0 0 L 10 5 L 0 10 z" fill="#f43f5e" />
                        </marker>
                        <marker id="critical-path-arrow-secondary" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
                          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                        </marker>
                        <marker id="critical-path-arrow-manual" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
                          <path d="M 0 0 L 10 5 L 0 10 z" fill="#fb923c" />
                        </marker>
                      </defs>

                      {layout.lanes.map((lane) => {
                        const palette = getLanePalette(lane)
                        return (
                          <g key={lane.id} data-testid={`critical-path-lane-${lane.id}`}>
                            <rect
                              x={12}
                              y={lane.top}
                              width={layout.canvasWidth - 24}
                              height={lane.height}
                              rx={20}
                              fill={palette.fill}
                              stroke={palette.stroke}
                              strokeDasharray={lane.type === 'other' ? '6 6' : undefined}
                            />
                            <rect
                              x={24}
                              y={lane.top + 8}
                              width={Math.max(120, lane.label.length * 16)}
                              height={22}
                              rx={11}
                              fill={palette.labelFill}
                            />
                            <text x={36} y={lane.top + 23} fontSize="12" fontWeight="700" fill={palette.labelText}>
                              {lane.label}
                            </text>
                          </g>
                        )
                      })}

                      {layout.edges.map((edge) => (
                        <path
                          key={edge.id}
                          data-testid={`critical-path-svg-edge-${edge.id}`}
                          d={edge.path}
                          fill="none"
                          stroke={edge.source === 'manual_link' ? '#fb923c' : edge.isPrimary ? '#f43f5e' : '#94a3b8'}
                          strokeWidth={edge.source === 'manual_link' ? 2.4 : edge.isPrimary ? 2.6 : 1.8}
                          strokeDasharray={edge.source === 'manual_link' ? '7 5' : undefined}
                          markerEnd={`url(#${edge.source === 'manual_link' ? 'critical-path-arrow-manual' : edge.isPrimary ? 'critical-path-arrow-primary' : 'critical-path-arrow-secondary'})`}
                          opacity={hasActiveFocus ? (activeFocusGraph.edgeIds.has(edge.id) ? 0.98 : 0.12) : 0.92}
                        />
                      ))}

                      {layout.nodes.map((node) => {
                        const palette = getNodePalette(node)
                        const selected = node.taskId === selectedTaskId
                        const emphasized = !hasActiveFocus || activeFocusGraph.taskIds.has(node.taskId)
                        return (
                          <g
                            key={node.taskId}
                            data-testid={`critical-path-svg-node-${node.taskId}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedTaskId(node.taskId)}
                            onMouseEnter={() => setHoveredTaskId(node.taskId)}
                            onMouseLeave={() => setHoveredTaskId((current) => (current === node.taskId ? null : current))}
                            onFocus={() => setHoveredTaskId(node.taskId)}
                            onBlur={() => setHoveredTaskId((current) => (current === node.taskId ? null : current))}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                setSelectedTaskId(node.taskId)
                              }
                            }}
                            style={{ cursor: 'pointer', opacity: emphasized ? 1 : 0.26 }}
                          >
                            <rect
                              x={node.x}
                              y={node.y}
                              width={node.width}
                              height={node.height}
                              rx={22}
                              fill={palette.fill}
                              stroke={selected ? '#2563eb' : emphasized ? palette.stroke : '#cbd5e1'}
                              strokeWidth={selected ? 3 : emphasized ? 2.1 : 1.4}
                              filter={
                                selected
                                  ? 'drop-shadow(0 12px 20px rgba(37,99,235,0.18))'
                                  : emphasized
                                    ? 'drop-shadow(0 10px 18px rgba(15,23,42,0.10))'
                                    : 'drop-shadow(0 4px 8px rgba(15,23,42,0.04))'
                              }
                            />
                            <text x={node.x + 16} y={node.y + 24} fontSize="12" fontWeight="800" fill={palette.title}>
                              {truncateLabel(node.title, 18)}
                            </text>
                            <text x={node.x + 16} y={node.y + 46} fontSize="11" fill={palette.body}>
                              {truncateLabel(node.subtitle, 26)}
                            </text>
                            <text x={node.x + 16} y={node.y + 68} fontSize="10" fontWeight="700" fill={palette.body}>
                              {node.badges.length ? node.badges.join(' · ') : node.isPrimary ? USER_FACING_TERMS.criticalPath : '快照节点'}
                            </text>
                            <text x={node.x + 16} y={node.y + 82} fontSize="10" fill={palette.body}>
                              {node.chainIndex != null ? `链位次 ${node.chainIndex + 1}` : `节点宽 ${CRITICAL_PATH_NODE_WIDTH}px`}
                            </text>
                            {node.isPrimary && (
                              <rect
                                x={node.x + node.width - 68}
                                y={node.y + 12}
                                width={52}
                                height={20}
                                rx={10}
                                fill={palette.tagFill}
                              />
                            )}
                            {node.isPrimary && (
                              <text
                                x={node.x + node.width - 42}
                                y={node.y + 26}
                                textAnchor="middle"
                                fontSize="10"
                                fontWeight="700"
                                fill={palette.tagText}
                              >
                                主链
                              </text>
                            )}
                          </g>
                        )
                      })}
                    </svg>
                    </div>
                  </div>

                  {primaryChain ? (
                    <div className="space-y-2">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">主链顺序回放</div>
                      <div className="flex flex-wrap items-stretch gap-2" data-testid="critical-path-primary-chain">
                        {primaryChain.taskIds.map((taskId, index) => renderTaskChip(taskId, index, USER_FACING_TERMS.criticalPath))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  当前没有可展示的关键路径节点。
                </div>
              )}
            </CardContent>
          </Card>

          <Card variant="detail">
            <CardHeader className="space-y-2 border-b border-slate-100 pb-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-sm">关系边</CardTitle>
                <Badge variant="outline">{snapshotEdges.length} 条</Badge>
              </div>
              <div className="text-xs text-slate-500">
                这里展示关键路径依赖和手动插链关系，方便直接核对任务之间的前后约束。
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4" data-testid="critical-path-edge-list">
              {snapshotEdges.length ? (
                <div className="grid gap-2 md:grid-cols-2">
                  {snapshotEdges.map((edge) => {
                    const selected = edge.fromTaskId === selectedTaskId || edge.toTaskId === selectedTaskId
                    return (
                      <div
                        key={edge.id}
                        className={cn(
                          'rounded-2xl border px-3 py-2 text-sm transition-colors',
                          selected ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white text-slate-700',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{renderEdgeLabel(edge.fromTaskId, edge.toTaskId)}</span>
                          <Badge variant={edge.isPrimary ? 'secondary' : 'outline'}>
                            {edge.source === 'manual_link' ? '插链' : edge.isPrimary ? USER_FACING_TERMS.criticalPath : '依赖'}
                          </Badge>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  当前快照没有可展示的关系边。
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card variant="detail">
              <CardHeader className="border-b border-slate-100 pb-4">
                <CardTitle className="text-sm">备选链</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                {props.snapshot?.alternateChains.length ? (
                  props.snapshot.alternateChains.map((chain) => (
                    <div
                      key={chain.id}
                      className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3"
                      data-testid={`critical-path-alternate-chain-${chain.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          className="flex min-w-0 items-center gap-2 text-left"
                          onClick={() =>
                            setExpandedAlternateChainIds((current) =>
                              current.includes(chain.id)
                                ? current.filter((chainId) => chainId !== chain.id)
                                : [...current, chain.id],
                            )
                          }
                          data-testid={`critical-path-alternate-toggle-${chain.id}`}
                        >
                          <ChevronRight
                            className={cn(
                              'h-4 w-4 flex-shrink-0 text-slate-400 transition-transform',
                              expandedAlternateChainIds.includes(chain.id) && 'rotate-90',
                            )}
                          />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-slate-900">{chain.displayLabel}</div>
                            <div className="text-xs text-slate-500">
                              默认折叠 · {formatCriticalPathCount(chain.taskIds.length)} · 工期 {chain.totalDurationDays} 天
                            </div>
                          </div>
                        </button>
                        <Badge variant="secondary">{chain.source}</Badge>
                      </div>
                      {expandedAlternateChainIds.includes(chain.id) ? (
                        <div className="flex flex-wrap gap-2" data-testid={`critical-path-alternate-content-${chain.id}`}>
                          {chain.taskIds.map((taskId, index) => renderTaskChip(taskId, index, '备选'))}
                        </div>
                      ) : (
                        <div
                          className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500"
                          data-testid={`critical-path-alternate-collapsed-${chain.id}`}
                        >
                          已折叠，点击标题展开查看链路节点。
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    暂无备选链。
                  </div>
                )}
              </CardContent>
            </Card>

            <Card variant="detail">
              <CardHeader className="border-b border-slate-100 pb-4">
                <CardTitle className="text-sm">手动关注</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                {props.snapshot?.manualAttentionTaskIds.length ? (
                  <div className="flex flex-wrap gap-2" data-testid="critical-path-manual-attention">
                    {props.snapshot.manualAttentionTaskIds.map((taskId) => renderTaskChip(taskId, undefined, '关注'))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    目前没有手动关注项。可在下方选中任务节点后，点击“手动关注”将其纳入重点跟踪范围。
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card variant="detail">
            <CardHeader className="border-b border-slate-100 pb-4">
              <CardTitle className="text-sm">覆盖记录</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4" data-testid="critical-path-override-list">
              {props.overrides.length ? (
                props.overrides.map((override) => (
                  <div key={override.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={override.mode === 'manual_attention' ? 'secondary' : 'outline'}>
                            {override.mode === 'manual_attention' ? '手动关注' : getOverrideAnchorLabel(override)}
                          </Badge>
                          <span className="text-sm font-medium text-slate-900">{describeOverrideTarget(override, props.tasks)}</span>
                        </div>
                        <div className="text-xs text-slate-500">{override.reason || '无备注'}</div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void props.onDeleteOverride(override.id)}
                        disabled={props.actionLoading}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        删除
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  暂无覆盖记录。
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card variant="detail">
            <CardHeader className="border-b border-slate-100 pb-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-sm">交互承载位</CardTitle>
                <Badge variant="outline">{selectedTask ? '已选中任务' : '待选择'}</Badge>
              </div>
              <div className="text-xs text-slate-500">选择任意节点后，可直接发起手动关注或插链操作。</div>
            </CardHeader>
            <CardContent className="space-y-4 p-4" data-testid="critical-path-action-panel">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">当前任务</div>
                <div className="mt-2 text-sm font-semibold text-slate-900">
                  {selectedTask ? getTaskLabel(selectedTask, selectedTask.id) : '未选择'}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {selectedSnapshotTask
                    ? `浮动 ${selectedSnapshotTask.floatDays} 天 · 工期 ${selectedSnapshotTask.durationDays} 天`
                    : '当前节点尚未在快照中匹配。'}
                </div>
                {selectedOverride && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="secondary">{selectedOverride.mode === 'manual_attention' ? '已关注' : '已插链'}</Badge>
                    <Badge variant="outline">{selectedOverride.anchor_type || '旧版'}</Badge>
                  </div>
                )}
                {selectedTaskId && (
                  <div className="mt-3 grid gap-2 text-xs text-slate-500">
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                      上游关系 {selectedIncomingEdges.length > 0 ? selectedIncomingEdges.map((edge) => renderEdgeLabel(edge.fromTaskId, edge.toTaskId)).join('；') : '无'}
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                      下游关系 {selectedOutgoingEdges.length > 0 ? selectedOutgoingEdges.map((edge) => renderEdgeLabel(edge.fromTaskId, edge.toTaskId)).join('；') : '无'}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <Textarea
                  value={reasonDraft}
                  onChange={(event) => setReasonDraft(event.target.value)}
                  placeholder="填写备注"
                  className="min-h-24 rounded-2xl border-slate-200 bg-white"
                />
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">插链设置</div>
                  {anchorTaskIds.length > 0 ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <label className="space-y-1 text-xs text-slate-500">
                        <span>插链方式</span>
                        <select
                          value={insertAnchorType}
                          onChange={(event) => setInsertAnchorType(event.target.value as 'before' | 'after' | 'between')}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400"
                          data-testid="critical-path-anchor-type"
                        >
                          <option value="before">插到前面</option>
                          <option value="after">插到后面</option>
                          <option value="between" disabled={anchorTaskIds.length < 2}>
                            插到中间
                          </option>
                        </select>
                      </label>

                      {(insertAnchorType === 'after' || insertAnchorType === 'between') && (
                        <label className="space-y-1 text-xs text-slate-500">
                          <span>左锚点</span>
                          <select
                            value={insertLeftTaskId}
                            onChange={(event) => setInsertLeftTaskId(event.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400"
                            data-testid="critical-path-left-anchor"
                          >
                            {anchorTaskIds.map((taskId) => (
                              <option key={taskId} value={taskId}>
                                {getTaskLabel(taskMap.get(taskId), taskId)}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      {(insertAnchorType === 'before' || insertAnchorType === 'between') && (
                        <label className="space-y-1 text-xs text-slate-500">
                          <span>右锚点</span>
                          <select
                            value={insertRightTaskId}
                            onChange={(event) => setInsertRightTaskId(event.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400"
                            data-testid="critical-path-right-anchor"
                          >
                            {anchorTaskIds.map((taskId) => (
                              <option key={taskId} value={taskId}>
                                {getTaskLabel(taskMap.get(taskId), taskId)}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white p-3 text-xs text-slate-500">
                      当前没有可用锚点，暂时只能设置手动关注。
                    </div>
                  )}
                  <div className="mt-3 text-xs text-slate-500">
                    插链会把当前选中任务作为覆盖对象，锚点任务从现有关键路径或显示链里选择。
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (!selectedTaskId) return
                      void props.onCreateOverride({
                        taskId: selectedTaskId,
                        mode: 'manual_attention',
                        reason: reasonDraft.trim() || '来自关键路径视图',
                      })
                    }}
                    disabled={!selectedTaskId || Boolean(selectedOverride) || props.actionLoading}
                    data-testid="critical-path-create-attention"
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    手动关注
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (!selectedTaskId) return
                      void props.onCreateOverride({
                        taskId: selectedTaskId,
                        mode: 'manual_insert',
                        anchorType: insertAnchorType,
                        leftTaskId: insertAnchorType === 'before' ? null : insertLeftTaskId || null,
                        rightTaskId: insertAnchorType === 'after' ? null : insertRightTaskId || null,
                        reason: reasonDraft.trim() || '来自关键路径视图',
                      })
                    }}
                    disabled={!canCreateInsert || props.actionLoading}
                    data-testid="critical-path-create-insert"
                  >
                    <Pin className={cn('mr-2 h-4 w-4', insertAnchorType === 'before' && 'rotate-180')} />
                    保存插链
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-slate-500">当前选中任务会作为插链对象提交，服务端会继续校验锚点类型和锚点合法性。</div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setReasonDraft('来自关键路径视图')}>
                    重置备注
                  </Button>
                </div>
              </div>

              {selectedOverride && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-3 text-sm text-slate-600">
                  当前选中任务已经存在覆盖记录，如需修改请先删除旧记录再重新提交。
                </div>
              )}
            </CardContent>
          </Card>

          <Card variant="detail">
            <CardHeader className="border-b border-slate-100 pb-4">
              <CardTitle className="text-sm">视图说明</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4 text-sm text-slate-600">
              <p>关键路径以后端快照中的主链、备选链和关系边为真值，图中所有坐标均由 DAG 布局器生成。</p>
              <p>同一泳道代表同一条链或同一类人工干预，边的箭头表示依赖方向，虚线代表手动插链。</p>
              <p>点击任意节点即可切换当前操作对象，右侧面板会同步更新。</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
