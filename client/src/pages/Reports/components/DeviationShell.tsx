import type { ReactNode } from 'react'

export function DeviationShell({ children }: { children: ReactNode }) {
  return (
    <section data-testid="deviation-shell" className="space-y-5">
      {children}
    </section>
  )
}
