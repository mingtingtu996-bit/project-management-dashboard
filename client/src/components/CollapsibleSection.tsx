import { useState, type ReactNode } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

interface Props {
  title: string
  defaultOpen?: boolean
  children: ReactNode
  count?: number
}

export function CollapsibleSection({ title, defaultOpen = true, children, count }: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger className="group flex w-full cursor-pointer items-center justify-between py-2">
        <h3 className="text-lg font-semibold text-slate-900">
          {title}
          {count != null && (
            <span className="ml-2 text-sm font-normal text-slate-400">({count})</span>
          )}
        </h3>
        <ChevronDown
          className={cn(
            'h-5 w-5 text-slate-400 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </Collapsible.Trigger>
      <Collapsible.Content className="overflow-hidden data-[state=closed]:animate-collapse-up data-[state=open]:animate-expand-down">
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
