import { useCallback } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import { PlanningModelingWorkbenchDialog, type PlanningModelingWorkbenchMode } from './PlanningModelingWorkbenchDialog'

function readModelingWorkbenchMode(value: string | null): PlanningModelingWorkbenchMode {
  return value === 'adjust' ? 'adjust' : 'generate'
}

export default function PlanningModelingWorkbenchRoute() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const mode = readModelingWorkbenchMode(new URLSearchParams(location.search).get('modelingWorkbench'))

  const closeModelingWorkbenchOnly = useCallback(() => {
    if (!id) return
    const nextSearch = new URLSearchParams(location.search)
    nextSearch.delete('modelingWorkbench')
    const query = nextSearch.toString()
    navigate(`/projects/${encodeURIComponent(id)}/gantt${query ? `?${query}` : ''}`)
  }, [id, location.search, navigate])

  const handleGenerated = useCallback((projectId: string, targetParams: string) => {
    const nextSearch = new URLSearchParams()
    nextSearch.set('wizard_generated', 'true')
    if (targetParams) {
      const targetSearch = new URLSearchParams(targetParams.replace(/^&/, ''))
      targetSearch.forEach((value, key) => nextSearch.set(key, value))
    }
    navigate(`/projects/${encodeURIComponent(projectId)}/gantt?${nextSearch.toString()}`)
  }, [navigate])

  return (
    <PlanningModelingWorkbenchDialog
      open
      mode={mode}
      projectId={id || ''}
      onOpenChange={(open) => {
        if (!open) closeModelingWorkbenchOnly()
      }}
      onGenerated={handleGenerated}
    />
  )
}
