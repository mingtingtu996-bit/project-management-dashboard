import type {
  PreviewNode,
  TemplateStatus,
  WbsNode,
  WbsTemplate,
} from './types'
import { safeJsonParse } from '@/lib/browserStorage'

/**
 * WBSTemplates 工具函数
 */

export const API_BASE = ''

export const TYPE_COLOR_MAP: Record<string, { bg: string; text: string; tagBg: string; tagText: string; icon: string }> = {
  '住宅': { bg: 'bg-blue-100', text: 'text-blue-600', tagBg: 'bg-blue-50', tagText: 'text-blue-600', icon: 'home' },
  '商业': { bg: 'bg-purple-100', text: 'text-purple-600', tagBg: 'bg-purple-50', tagText: 'text-purple-600', icon: 'building' },
  '工业': { bg: 'bg-amber-100', text: 'text-amber-600', tagBg: 'bg-amber-50', tagText: 'text-amber-600', icon: 'grid' },
  '公共建筑': { bg: 'bg-emerald-100', text: 'text-emerald-600', tagBg: 'bg-emerald-50', tagText: 'text-emerald-600', icon: 'landmark' },
}

export function getTypeColor(type?: string) {
  return TYPE_COLOR_MAP[type || ''] || TYPE_COLOR_MAP['住宅']
}

export function getTemplateStatus(
  template: Pick<WbsTemplate, 'status' | 'is_default' | 'is_active'>,
): TemplateStatus {
  return template.status ?? (template.is_default ? 'draft' : (template.is_active ? 'published' : 'disabled'))
}

export function getTemplateNodes(
  template: Pick<WbsTemplate, 'template_data' | 'wbs_nodes'>,
): WbsNode[] {
  const rawData = template.template_data ?? template.wbs_nodes ?? []

  if (Array.isArray(rawData)) {
    return rawData
  }

  if (Array.isArray(rawData?.wbs_nodes)) {
    return rawData.wbs_nodes
  }

  if (Array.isArray(rawData?.nodes)) {
    return rawData.nodes
  }

  return []
}

export function getTemplateNodeCount(
  template: Pick<WbsTemplate, 'node_count' | 'template_data' | 'wbs_nodes'>,
) {
  return template.node_count ?? getTemplateNodes(template).length
}

export function searchNodesDeep(nodes: WbsNode[], query: string): boolean {
  if (!nodes.length) {
    return false
  }

  return nodes.some((node) => {
    const nodeName = node.name?.toLowerCase() ?? ''
    if (nodeName.includes(query)) {
      return true
    }

    return Array.isArray(node.children) && searchNodesDeep(node.children, query)
  })
}

export function flattenPreviewNodes(
  nodes: WbsNode[],
  level = 0,
  parentPath = '',
): PreviewNode[] {
  if (!Array.isArray(nodes)) {
    return []
  }

  const result: PreviewNode[] = []

  nodes.forEach((node, index) => {
    const nodeName = node.name || '未命名'
    const id = `${parentPath}${index}`
    const path = parentPath ? `${parentPath} / ${nodeName}` : nodeName

    result.push({
      id,
      name: nodeName,
      reference_days: node.reference_days,
      is_milestone: node.is_milestone,
      description: node.description,
      children: node.children,
      level,
      path,
    })

    if (Array.isArray(node.children) && node.children.length > 0) {
      result.push(...flattenPreviewNodes(node.children, level + 1, path))
    }
  })

  return result
}

export function collectExpandedPreviewNodeIds(
  nodes: WbsNode[],
  parentPath = '',
): Set<string> {
  const ids = new Set<string>()

  const collect = (currentNodes: WbsNode[], currentParentPath = '') => {
    currentNodes.forEach((node, index) => {
      const nodeName = node.name || '未命名'
      const id = `${currentParentPath}${index}`
      ids.add(id)

      if (Array.isArray(node.children) && node.children.length > 0) {
        const nextParentPath = `${currentParentPath ? `${currentParentPath} / ` : ''}${nodeName}`
        collect(node.children, nextParentPath)
      }
    })
  }

  collect(nodes, parentPath)
  return ids
}

export const withCredentials = (options: RequestInit = {}): RequestInit => ({
  ...options,
  credentials: 'include',
})

function readImportedTemplates(data: unknown) {
  if (Array.isArray(data)) {
    return data
  }

  if (data && typeof data === 'object' && 'data' in data) {
    const payload = (data as { data?: unknown }).data
    return Array.isArray(payload) ? payload : []
  }

  return []
}

export function formatDate(dateStr: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const handleExportJSON = async (templateId?: string) => {
  try {
    const params = templateId ? `?ids=${templateId}` : ''
    const res = await fetch(`${API_BASE}/api/wbs-templates/export-json${params}`)
    const result = await res.json()
    if (result.success && result.data) {
      const json = JSON.stringify(result.data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `wbs-templates-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
    }
  } catch {
    // ignore
  }
}

export const handleImportJSON = async (
  event: React.ChangeEvent<HTMLInputElement>,
  onSuccess?: () => void,
) => {
  const file = event.target.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const data = safeJsonParse<unknown>(text, [], 'wbs-template-import')
    const templates = readImportedTemplates(data)

    const res = await fetch(`${API_BASE}/api/wbs-templates/import-json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templates }),
      ...withCredentials(),
    })

    const result = await res.json()
    if (result.success) {
      onSuccess?.()
    }
  } catch {
    // ignore
  }

  event.target.value = ''
}
