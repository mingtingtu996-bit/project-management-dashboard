import { useCallback, useEffect, useMemo, useState } from 'react'

import { getApiErrorMessage } from '@/lib/apiClient'
import {
  getWbsTemplateCatalogItem,
  listWbsTemplateCatalog,
  type WbsTemplateCatalogItem,
  type WbsTemplateCatalogResponse,
} from '@/services/wbsTemplateGenerationApi'

export interface UseTemplateLibraryOptions {
  enabled?: boolean
  includeNodes?: boolean
}

export function useTemplateLibrary(
  projectId: string | undefined,
  options: UseTemplateLibraryOptions = {},
) {
  const { enabled = true, includeNodes = false } = options
  const [catalog, setCatalog] = useState<WbsTemplateCatalogResponse | null>(null)
  const [templates, setTemplates] = useState<WbsTemplateCatalogItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingTemplateId, setLoadingTemplateId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadCatalog = useCallback(async () => {
    if (!projectId || !enabled) return null
    setLoading(true)
    setError(null)
    try {
      const nextCatalog = await listWbsTemplateCatalog({ includeNodes })
      const nextTemplates = nextCatalog.templates ?? []
      setCatalog(nextCatalog)
      setTemplates(nextTemplates)
      return nextCatalog
    } catch (caught) {
      setError(getApiErrorMessage(caught, '模板目录加载失败'))
      setCatalog(null)
      setTemplates([])
      return null
    } finally {
      setLoading(false)
    }
  }, [enabled, includeNodes, projectId])

  const ensureTemplateNodes = useCallback(async (templateId: string) => {
    if (!projectId || !enabled || !templateId) return null
    const current = templates.find((template) => template.id === templateId)
    if (current?.nodes && current.nodes.length > 0) return current

    setLoadingTemplateId(templateId)
    setError(null)
    try {
      const hydrated = await getWbsTemplateCatalogItem(templateId)
      setTemplates((currentTemplates) => currentTemplates.map((template) => (
        template.id === hydrated.id ? { ...template, ...hydrated } : template
      )))
      setCatalog((currentCatalog) => {
        if (!currentCatalog) return currentCatalog
        return {
          ...currentCatalog,
          templates: currentCatalog.templates.map((template) => (
            template.id === hydrated.id ? { ...template, ...hydrated } : template
          )),
          builtIn: currentCatalog.builtIn.templateId === hydrated.id
            ? { ...currentCatalog.builtIn, nodes: hydrated.nodes }
            : currentCatalog.builtIn,
        }
      })
      return hydrated
    } catch (caught) {
      setError(getApiErrorMessage(caught, '模板节点加载失败'))
      return null
    } finally {
      setLoadingTemplateId((current) => (current === templateId ? null : current))
    }
  }, [enabled, projectId, templates])

  useEffect(() => {
    let cancelled = false
    if (!projectId || !enabled) {
      setCatalog(null)
      setTemplates([])
      setError(null)
      setLoading(false)
      return undefined
    }

    setLoading(true)
    setError(null)
    listWbsTemplateCatalog({ includeNodes })
      .then((nextCatalog) => {
        if (cancelled) return
        setCatalog(nextCatalog)
        setTemplates(nextCatalog.templates ?? [])
      })
      .catch((caught) => {
        if (cancelled) return
        setCatalog(null)
        setTemplates([])
        setError(getApiErrorMessage(caught, '模板目录加载失败'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [enabled, includeNodes, projectId])

  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const template of templates) {
      const key = template.sourceStandard || template.source || 'other'
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return Array.from(counts.entries()).map(([key, count]) => ({ key, count }))
  }, [templates])

  return {
    catalog,
    templates,
    loading,
    loadingTemplateId,
    error,
    refetch: loadCatalog,
    ensureTemplateNodes,
    categories,
    defaultTemplates: templates.filter((template) => template.source === 'builtin_seed'),
    publicTemplates: templates,
  }
}

export default useTemplateLibrary
