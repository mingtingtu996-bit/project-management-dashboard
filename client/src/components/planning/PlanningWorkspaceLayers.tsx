import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface PlanningWorkspaceLayersProps {
  summary: ReactNode
  sectionHeader?: ReactNode
  main: ReactNode
  aside?: ReactNode
  className?: string
  mainClassName?: string
  asideClassName?: string
}

export function PlanningWorkspaceLayers({
  summary,
  sectionHeader,
  main,
  aside,
  className,
  mainClassName,
  asideClassName,
}: PlanningWorkspaceLayersProps) {
  return (
    <div data-testid="planning-layered-workspace" className={cn('space-y-4', className)}>
      <section data-testid="planning-layer-l2" className="space-y-4">
        {summary}
      </section>

      {sectionHeader ? (
        <section data-testid="planning-layer-l3" className="space-y-4">
          {sectionHeader}
        </section>
      ) : null}

      <div
        className={cn(
          'grid gap-4',
          aside ? 'xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,420px)]' : 'grid-cols-1',
        )}
      >
        <section data-testid="planning-layer-l4" className={cn('min-w-0 space-y-4', mainClassName)}>
          {main}
        </section>

        {aside ? (
          <aside data-testid="planning-layer-l5" className={cn('space-y-4', asideClassName)}>
            {aside}
          </aside>
        ) : null}
      </div>
    </div>
  )
}

export default PlanningWorkspaceLayers
