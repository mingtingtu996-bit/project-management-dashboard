import type { ReactNode } from 'react'

import { Breadcrumb } from '@/components/Breadcrumb'
import { Button } from '@/components/ui/button'
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
  eyebrow?: string
  metrics?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}

export function PlanningPageShell({
  projectName,
  title,
  description,
  tabs,
  eyebrow = '计划编制',
  metrics,
  actions,
  children,
  className,
}: PlanningPageShellProps) {
  const titleParts = title.split('/').map((item) => item.trim()).filter(Boolean)
  const displayTitle = titleParts[titleParts.length - 1] ?? title

  return (
    <div data-testid="planning-shared-shell" className={cn('page-shell', className)}>
      <Breadcrumb
        items={[
          { label: projectName },
          ...titleParts.map((item) => ({ label: item })),
        ]}
      />

      <section className="surface-card overflow-hidden">
        <div className="space-y-8 p-5 sm:p-6">
          <div data-testid="planning-layer-l1" className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="eyebrow">{eyebrow}</div>
              <div className="space-y-1">
                <h1 className="shell-section-title break-keep">
                  {displayTitle}
                </h1>
                {description ? <p className="max-w-3xl text-sm leading-6 text-slate-500">{description}</p> : null}
              </div>
            </div>
            {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">{actions}</div> : null}
          </div>

          {metrics ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">{metrics}</div> : null}

          {tabs.length > 0 ? (
            <div data-testid="planning-page-tabs" className="flex flex-wrap items-end gap-6 border-b border-slate-100">
              {tabs.map((tab) => (
                <Button
                  key={tab.key}
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={tab.onClick}
                  className={cn(
                    'relative h-9 rounded-none px-0 pb-3 text-sm font-medium text-slate-500 hover:bg-transparent hover:text-slate-900',
                    tab.active &&
                      'text-blue-700 after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-full after:rounded-full after:bg-blue-600',
                  )}
                >
                  {tab.label}
                </Button>
              ))}
            </div>
          ) : null}

          <div>{children}</div>
        </div>
      </section>
    </div>
  )
}
