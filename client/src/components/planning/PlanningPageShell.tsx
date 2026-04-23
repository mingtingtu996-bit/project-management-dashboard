import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface PlanningPageTab {
  key: string
  label: string
  active?: boolean
  onClick: () => void
}

interface PlanningPageShellProps {
  projectName: string
  title: string
  description: string
  tabs: PlanningPageTab[]
  actions?: ReactNode
  children: ReactNode
  className?: string
}

export function PlanningPageShell({
  projectName,
  title,
  description,
  tabs,
  actions,
  children,
  className,
}: PlanningPageShellProps) {
  return (
    <div data-testid="planning-shared-shell" className={cn('space-y-4 px-4 py-5 sm:px-6 lg:px-8', className)}>
      <Card variant="detail" className="overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500" />
        <CardContent className="space-y-5 p-0">
          <div
            data-testid="planning-layer-l1"
            className="border-b border-slate-100 bg-white px-5 py-5 sm:px-6"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {projectName}
                  </Badge>
                  <span className="text-xs uppercase tracking-[0.24em] text-slate-500">planning workspace</span>
                </div>
                <div className="space-y-1">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
                  <p className="max-w-3xl text-sm leading-6 text-slate-500">{description}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">{actions}</div>
            </div>
          </div>

          <div className="px-5 pb-5 pt-4 sm:px-6">
            <div data-testid="planning-page-tabs" className="flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <Button
                  key={tab.key}
                  type="button"
                  size="sm"
                  variant={tab.active ? 'default' : 'outline'}
                  onClick={tab.onClick}
                  className={cn(
                    'rounded-full px-4',
                    tab.active ? 'shadow-md shadow-cyan-500/20' : 'bg-white'
                  )}
                >
                  {tab.label}
                </Button>
              ))}
            </div>

            <div className="mt-5">{children}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
