import type {
  WbsReferenceDaysInferenceNode,
  WbsReferenceDaysInferenceReport,
  WbsTemplateReferenceDayFeedbackNode,
} from '../types/planning.js'

function cloneNodes(nodes: unknown): unknown {
  return JSON.parse(JSON.stringify(nodes))
}

export function inferWbsReferenceDays(params: {
  templateId: string
  templateName: string
  feedbackNodes: WbsTemplateReferenceDayFeedbackNode[]
  templateData: unknown
}): WbsReferenceDaysInferenceReport {
  const feedbackByPath = new Map(params.feedbackNodes.map((node) => [node.path, node]))
  let updatedCount = 0

  const apply = (value: any, path = ''): any => {
    if (!Array.isArray(value)) return value

    return value.map((node: any, index: number) => {
      const title = String(node.title ?? node.name ?? '未命名节点').trim() || '未命名节点'
      const nodePath = path ? `${path}/${index}:${title.toLowerCase()}` : `${index}:${title.toLowerCase()}`
      const feedback = feedbackByPath.get(nodePath)
      const children = apply(node.children ?? [], nodePath)
      const next = {
        ...node,
        title,
        reference_days: node.reference_days ?? node.duration ?? null,
        children,
      }

      if (feedback && feedback.suggested_reference_days !== null && feedback.suggested_reference_days !== undefined) {
        next.reference_days = feedback.suggested_reference_days
        updatedCount += 1
      }

      return next
    })
  }

  const inferredTemplateData = apply(cloneNodes(params.templateData))

  const nodes: WbsReferenceDaysInferenceNode[] = params.feedbackNodes.map((node) => ({
    ...node,
    applied: node.suggested_reference_days !== null && node.suggested_reference_days !== undefined,
  }))

  return {
    template_id: params.templateId,
    template_name: params.templateName,
    updated_count: updatedCount,
    nodes,
    inferred_template_data: inferredTemplateData,
  }
}

export function sumSuggestedReferenceDays(nodes: any): number | null {
  if (!Array.isArray(nodes)) return null

  const walk = (items: any[]): number => {
    let total = 0
    for (const item of items) {
      const children = Array.isArray(item.children) ? item.children : []
      if (children.length > 0) {
        total += walk(children)
      } else {
        const value = Number(item.reference_days ?? item.duration ?? 0)
        if (Number.isFinite(value) && value > 0) {
          total += value
        }
      }
    }
    return total
  }

  const total = walk(nodes)
  return total > 0 ? total : null
}
